"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Download,
  FileText,
  GitBranch,
  HelpCircle,
  Info,
  Layers,
  LoaderCircle,
  Menu,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { z } from "zod";
import {
  analyzeDeterministically,
  DEMO_LOGS,
  IncidentAnalysisSchema,
  type IncidentAnalysis,
  type LogEvent,
} from "@/lib/analysis";
import { IncidentReplay } from "./incident-replay";

type View = "overview" | "replay" | "events" | "postmortem";
type AnalysisResponse = IncidentAnalysis & {
  mode?: "demo" | "ai";
  storage?: "ephemeral" | "postgresql";
  incidentId?: string;
};

const HistoryResponseSchema = z.object({
  incidents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    source: z.enum(["demo", "ai"]),
    createdAt: z.string().datetime(),
    analysis: IncidentAnalysisSchema,
  })),
});

const AnalysisResponseSchema = z.object({
  analysis: IncidentAnalysisSchema,
  mode: z.enum(["demo", "ai"]),
  storage: z.enum(["ephemeral", "postgresql"]),
  incidentId: z.string().optional(),
});

type StoredIncident = z.infer<typeof HistoryResponseSchema>["incidents"][number];

const NAV_ITEMS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "replay", label: "Incident replay", icon: Play },
  { id: "events", label: "Log events", icon: FileText },
  { id: "postmortem", label: "Postmortem report", icon: GitBranch },
];

const severityLabels: Record<IncidentAnalysis["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const GLOSSARY: Record<string, string> = {
  pool: "Database connection pool: a cache of database connections kept ready for reuse to avoid connection setup overhead.",
  confidence: "Calculated from matching event timestamps, service dependencies, and causal propagation patterns in the logs.",
  clusters: "Groups of similar recurring errors aggregated across services to spot patterns quickly.",
  window: "The time elapsed between the earliest recorded warning and the latest error event in the submitted log batch.",
  retries: "Retry amplification: automated retry loops that multiply requests and worsen downstream bottlenecks.",
  "5xx": "HTTP 5xx server errors: indicate internal service failure, timeouts, or unhandled exceptions.",
  workers: "Background job workers: asynchronous process queues handling tasks outside the primary HTTP request path.",
};

function relativeTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  } catch {
    return timestamp;
  }
}

function HelpTooltip({ term, text }: { term: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const explanation = text ?? GLOSSARY[term.toLowerCase()] ?? "Learn more about this term";

  return (
    <span
      className="tooltip-container"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="tooltip-trigger"
        aria-label={`What is ${term}?`}
        onClick={() => setOpen(!open)}
      >
        <HelpCircle size={12} />
      </button>
      {open && (
        <span className="tooltip-box" role="tooltip">
          {explanation}
        </span>
      )}
    </span>
  );
}

function postmortemMarkdown(analysis: IncidentAnalysis): string {
  return `# Incident postmortem: ${analysis.title}

**Severity:** ${severityLabels[analysis.severity]}
**Window:** ${analysis.timeRange}
**Confidence:** ${Math.round(analysis.rootCause.confidence * 100)}%

## Summary
${analysis.summary}

## Root cause
${analysis.rootCause.explanation}

## Impact
${analysis.impact}

## Incident timeline & cascade
${analysis.causalChain.map((item, idx) => `Step ${idx + 1}. **${item.title}:** ${item.detail}`).join("\n")}

## Contributing factors
${analysis.contributingFactors.map((item) => `- ${item}`).join("\n")}

## Verified evidence from logs
${analysis.evidence.map((item) => `- ${item}`).join("\n")}

## AI hypotheses to validate
${analysis.inferences.map((item) => `- ${item}`).join("\n")}

## Recommended action items
${analysis.fixes.map((item) => `- [ ] **${item.priority.toUpperCase()} — ${item.title}:** ${item.description}`).join("\n")}

## Prevention
${analysis.prevention.map((item) => `- ${item}`).join("\n")}
`;
}

export default function Dashboard() {
  const [logs, setLogs] = useState(DEMO_LOGS);
  const [analysis, setAnalysis] = useState<AnalysisResponse>(() => ({
    ...analyzeDeterministically(DEMO_LOGS),
    mode: "demo",
    storage: "ephemeral",
  }));
  const [incidents, setIncidents] = useState<StoredIncident[]>([]);
  const [view, setView] = useState<View>("overview");
  const [showReplay, setShowReplay] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadIncidentHistory() {
      try {
        const response = await fetch("/api/incidents", { signal: controller.signal });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Incident history could not be loaded.";
          throw new Error(message);
        }
        const parsed = HistoryResponseSchema.safeParse(result);
        if (!parsed.success) throw new Error("Incident history returned an invalid response.");
        setIncidents(parsed.data.incidents);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Incident history could not be loaded.");
        }
      }
    }
    void loadIncidentHistory();
    return () => controller.abort();
  }, []);

  const visibleEvents = useMemo(() => analysis.events.filter((event) => {
    const matchesLevel = levelFilter === "ALL" || event.level === levelFilter;
    const selected = analysis.clusters.find((cluster) => cluster.id === selectedCluster);
    return matchesLevel && (!selected || selected.eventIds.includes(event.id));
  }), [analysis, levelFilter, selectedCluster]);

  async function runAnalysis(nextLogs = logs) {
    if (!nextLogs.trim()) {
      setError("Please paste or upload at least one log line to start analysis.");
      return;
    }
    setError("");
    setNotice("");
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: nextLogs }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Analysis failed. Please verify your log format.";
        throw new Error(message);
      }
      const parsed = AnalysisResponseSchema.safeParse(result);
      if (!parsed.success) throw new Error("The analysis service returned an unexpected response format.");
      const savedAnalysis: AnalysisResponse = {
        ...parsed.data.analysis,
        mode: parsed.data.mode,
        storage: parsed.data.storage,
        incidentId: parsed.data.incidentId,
      };
      setAnalysis(savedAnalysis);
      if (parsed.data.incidentId) {
        setIncidents((previous) => [
          {
            id: parsed.data.incidentId!,
            title: parsed.data.analysis.title,
            severity: parsed.data.analysis.severity,
            source: parsed.data.mode,
            createdAt: new Date().toISOString(),
            analysis: parsed.data.analysis,
          },
          ...previous.filter((incident) => incident.id !== parsed.data.incidentId).slice(0, 9),
        ]);
      }
      setView("overview");
      setSelectedCluster(null);
      setSelectedNode(null);
      setNotice(parsed.data.mode === "ai"
        ? "AI analysis complete. Directly observed signals and hypotheses are clearly separated."
        : parsed.data.storage === "postgresql"
          ? "Analysis complete and saved to PostgreSQL history."
          : "Deterministic analysis complete. Everything ran locally without external calls.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to analyze these logs.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 500_000) {
      setError("File is over 500 KB. Please upload a smaller log excerpt.");
      return;
    }
    if (!/\.(log|txt|json|ndjson)$/i.test(file.name)) {
      setError("Please select a valid .log, .txt, .json, or .ndjson file.");
      return;
    }
    try {
      const contents = await file.text();
      setLogs(contents);
      setError("");
      setNotice(`Loaded ${file.name}. Click "Analyze logs" to inspect.`);
    } catch {
      setError("The selected file could not be read.");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void readFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  function resetDemo() {
    setLogs(DEMO_LOGS);
    setAnalysis({ ...analyzeDeterministically(DEMO_LOGS), mode: "demo" });
    setView("overview");
    setSelectedNode(null);
    setSelectedCluster(null);
    setError("");
    setNotice("Sample incident loaded.");
  }

  function openStoredIncident(incident: StoredIncident) {
    setAnalysis({
      ...incident.analysis,
      mode: incident.source,
      storage: "postgresql",
      incidentId: incident.id,
    });
    setLogs("");
    setView("overview");
    setSelectedNode(null);
    setSelectedCluster(null);
    setError("");
    setNotice(`Loaded saved incident from ${new Date(incident.createdAt).toLocaleDateString()}.`);
  }

  async function exportPostmortem() {
    const markdown = postmortemMarkdown(analysis);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tracelens-postmortem-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Postmortem report exported as Markdown.");
  }

  async function copyPostmortem() {
    try {
      await navigator.clipboard.writeText(postmortemMarkdown(analysis));
      setNotice("Postmortem copied to clipboard.");
    } catch {
      setError("Clipboard access unavailable. You can export the Markdown file directly.");
    }
  }

  const nodeEvents = analysis.causalChain.find((node) => node.id === selectedNode);

  return (
    <main className="app-shell">
      {/* Friendly Sidebar */}
      <aside className="sidebar">
        <Link href="/" className="wordmark sidebar-brand">
          <span className="brand-icon"><BarChart3 size={16} /></span>
          trace<span>lens</span>
        </Link>
        
        <div className="workspace-picker">
          <span className="workspace-avatar">A</span>
          <span>
            <b>Acme Engineering</b>
            <small>Active workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>

        <div className="nav-caption">NAVIGATION</div>
        <nav className="side-nav" aria-label="Workspace">
          <Link className="side-link active" href="/dashboard">
            <Activity size={15} />
            <span>Incidents</span>
            <span className="side-count">{incidents.length + 1}</span>
          </Link>
          <a className="side-link muted" href="#analysis">
            <FileText size={15} />
            <span>Log explorer</span>
          </a>
          <a className="side-link muted" href="#analysis">
            <Zap size={15} />
            <span>Integrations</span>
            <span className="soon-tag">SOON</span>
          </a>
        </nav>

        <div className="nav-caption">INCIDENT VIEWS</div>
        <nav className="side-nav" aria-label="Incident views">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`side-link${view === id ? " active" : ""}`}
            >
              <Icon size={15} />
              <span>{label}</span>
              {id === "events" && <span className="side-count">{analysis.events.length}</span>}
            </button>
          ))}
        </nav>

        {incidents.length > 0 && (
          <>
            <div className="nav-caption">RECENT INCIDENTS</div>
            <nav className="side-nav saved-nav" aria-label="Saved incidents">
              {incidents.slice(0, 5).map((incident) => (
                <button
                  className="saved-incident-link"
                  key={incident.id}
                  onClick={() => openStoredIncident(incident)}
                  title={incident.title}
                >
                  <span className={`saved-incident-dot ${incident.severity}`} />
                  <span>{incident.title}</span>
                </button>
              ))}
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="usage-card">
            <span className="usage-icon"><Sparkles size={14} /></span>
            <b>Interactive demo</b>
            <p>Exploring with realistic multi-service outage logs. Runs offline without an API key.</p>
            <button onClick={resetDemo}>
              Reset demo data <RotateCcw size={12} />
            </button>
          </div>
          <div className="profile-row">
            <span className="profile-avatar">JD</span>
            <span>
              <b>Jamie Developer</b>
              <small>Local developer</small>
            </span>
            <Menu size={14} />
          </div>
        </div>
      </aside>

      {/* Main Workspace Section */}
      <section className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Incidents</span>
            <span className="crumb-divider">/</span>
            <b>{analysis.title}</b>
            <span className={`severity-pill ${analysis.severity}`}>
              <i />
              {severityLabels[analysis.severity]}
            </span>
          </div>

          <div className="topbar-actions">
            <span className={`mode-pill ${analysis.mode === "ai" ? "ai-mode" : ""}`}>
              <span />
              {analysis.mode === "ai" ? "AI ANALYZED" : "DETERMINISTIC"}
            </span>
            <button
              className="icon-button"
              aria-label="Download postmortem report"
              title="Download postmortem markdown"
              onClick={() => void exportPostmortem()}
            >
              <Download size={15} />
            </button>
            <span className="header-avatar" title="Signed in as Jamie">JD</span>
          </div>
        </header>

        <div className="workspace-content" id="analysis">
          {/* Calm page heading */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="status-dot" /> Incident Diagnosis
              </div>
              <h1>{analysis.title}</h1>
              <p>
                Synthesized from <b>{analysis.events.length} parsed log events</b>
                <span> · </span>
                Incident timeframe: {analysis.timeRange}
              </p>
            </div>

            <div className="heading-actions">
              <button className="button-secondary" onClick={resetDemo} title="Reload default sample logs">
                <RotateCcw size={14} /> Reset sample
              </button>
              <button
                className="button-primary"
                onClick={() => void runAnalysis()}
                disabled={isAnalyzing}
              >
                <Sparkles size={15} />
                {isAnalyzing ? "Analyzing logs…" : "Analyze logs"}
              </button>
            </div>
          </div>

          {/* 5-SECOND UNDERSTANDING: 3-STEP INCIDENT SUMMARY CARD */}
          <section className="quick-story-container" aria-label="Incident summary in 3 steps">
            <div className="quick-story-header">
              <div className="quick-story-title">
                <Sparkles size={16} className="text-indigo-400" />
                <span>Incident Story at a Glance</span>
                <span className="quick-story-badge">3-Step Breakdown</span>
              </div>
              <span className="quick-story-hint">
                Understood in seconds · What happened, why, and what to do next
              </span>
            </div>

            <div className="quick-story-grid">
              {/* Step 1: What happened */}
              <article className="story-card">
                <div className="story-card-step">
                  <span className="step-pill step-1">1. What happened</span>
                  <HelpTooltip term="5xx" text="High rates of HTTP 500/503 errors and timed out client requests." />
                </div>
                <h3 className="story-card-title">{analysis.impact.split(".")[0] ?? "Service degradation observed"}</h3>
                <p className="story-card-desc">
                  {analysis.summary}
                </p>
                <div className="story-card-footer">
                  <span>Affects {analysis.affectedServices.length} services</span>
                  <button className="story-card-cta" onClick={() => setView("events")}>
                    Inspect events <ArrowRight size={12} />
                  </button>
                </div>
              </article>

              {/* Step 2: Likely cause */}
              <article className="story-card">
                <div className="story-card-step">
                  <span className="step-pill step-2">2. Likely cause</span>
                  <span className="confidence-badge">
                    <CircleDot size={12} /> {Math.round(analysis.rootCause.confidence * 100)}% match
                  </span>
                </div>
                <h3 className="story-card-title">{analysis.rootCause.title}</h3>
                <p className="story-card-desc">
                  {analysis.rootCause.explanation}
                </p>
                <div className="story-card-footer">
                  <span>Based on {analysis.evidence.length} log observations</span>
                  <button className="story-card-cta" onClick={() => setView("overview")}>
                    See chain <ArrowRight size={12} />
                  </button>
                </div>
              </article>

              {/* Step 3: Recommended action */}
              <article className="story-card">
                <div className="story-card-step">
                  <span className="step-pill step-3">3. Recommended action</span>
                  <HelpTooltip term="retries" text="Throttling retries stops traffic amplification so databases can recover." />
                </div>
                <h3 className="story-card-title">
                  {analysis.fixes[0]?.title ?? "Mitigate bottleneck"}
                </h3>
                <p className="story-card-desc">
                  {analysis.fixes[0]?.description ?? "Inspect connection limits and implement backoff."}
                </p>
                <div className="story-card-footer">
                  <span className="text-emerald-400 font-medium">Priority: Urgent</span>
                  <button className="story-card-cta" onClick={() => setView("postmortem")}>
                    View fix plan <ArrowRight size={12} />
                  </button>
                </div>
              </article>
            </div>
          </section>

          {/* PROMINENT "▶ REPLAY INCIDENT" ACTION BANNER */}
          <div className="replay-hero-banner">
            <div className="replay-hero-info">
              <div className="replay-hero-title">
                <Play size={16} className="text-indigo-400" />
                <span>Signature Feature: Interactive Incident Replay &amp; What If?</span>
                <span className="quick-story-badge">Signature Feature</span>
              </div>
              <p>
                Turn this incident into an interactive video-style timeline. Scrub through seconds,
                watch the blast radius expand, or test simulated counterfactual interventions.
              </p>
            </div>
            <button
              className="replay-hero-cta"
              onClick={() => {
                setShowReplay(true);
                if (view !== "overview") {
                  setView("replay");
                }
                const replayEl = document.getElementById("incident-replay");
                replayEl?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Play size={15} fill="currentColor" /> Replay incident
            </button>
          </div>

          {/* INCIDENT REPLAY CENTERPIECE (Rendered on Overview as the visual centerpiece) */}
          {view === "overview" && showReplay && (
            <IncidentReplay
              analysis={analysis}
              onInspectEvent={() => {
                setSelectedCluster(null);
                setView("events");
              }}
            />
          )}

          {/* Friendly Log Input Card */}
          <section className={`log-input-card${isDragging ? " dragging" : ""}`} aria-label="Log input">
            <div className="input-card-heading">
              <div>
                <div className="input-card-title">
                  <span className="input-icon"><Terminal size={15} /></span>
                  Paste or drop your application logs
                  <span className="input-hint">Up to 500 KB · .log, .txt, .json, .ndjson</span>
                </div>
                <p>Logs are parsed locally in your session. Sensitive keys remain private.</p>
              </div>
              <button className="upload-button" onClick={() => fileInput.current?.click()}>
                <Upload size={13} /> Select file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".log,.txt,.json,.ndjson"
                hidden
                onChange={handleFileChange}
              />
            </div>

            <textarea
              aria-label="Paste application logs here"
              value={logs}
              onChange={(event) => setLogs(event.target.value)}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              spellCheck={false}
              placeholder="Paste raw log lines or JSON logs here…"
            />

            <div className="input-card-footer">
              <span>
                <span className="privacy-dot" />
                <b>{logs.split(/\r?\n/).filter(Boolean).length}</b> lines
                <span>·</span>
                {new Blob([logs]).size.toLocaleString()} bytes
                <span>·</span>
                {analysis.mode === "demo" ? "Deterministic offline engine" : "Configured AI provider"}
              </span>
              <div>
                <button
                  className="text-button"
                  onClick={() => { setLogs(""); setError(""); setNotice(""); }}
                >
                  Clear logs
                </button>
                <button
                  className="text-button"
                  onClick={() => { setLogs(DEMO_LOGS); setError(""); setNotice("Sample logs reloaded."); }}
                >
                  Load sample
                </button>
              </div>
            </div>
          </section>

          {/* Alerts */}
          {error && (
            <div className="alert-message error-message" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}

          {notice && !error && (
            <div className="alert-message success-message" role="status">
              <Check size={16} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                <X size={14} />
              </button>
            </div>
          )}

          {isAnalyzing && (
            <div className="analysis-progress" role="status">
              <LoaderCircle size={16} className="spin" />
              Parsing log records, correlating error clusters, and drafting root-cause chain…
            </div>
          )}

          {/* Metrics summary cards */}
          <div className="summary-grid">
            <article className="summary-card">
              <span className="summary-icon indigo-icon">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="summary-label">
                  Incident Severity
                  <HelpTooltip term="5xx" text="Severity level calculated from error rates and affected services." />
                </div>
                <div className="summary-value">
                  {severityLabels[analysis.severity]}
                </div>
              </div>
              <span className="summary-side">EVALUATED</span>
            </article>

            <article className="summary-card">
              <span className="summary-icon sky-icon">
                <GitBranch size={18} />
              </span>
              <div>
                <div className="summary-label">
                  Root Cause Match
                  <HelpTooltip term="confidence" />
                </div>
                <div className="summary-value">
                  {Math.round(analysis.rootCause.confidence * 100)}
                  <small>% confidence</small>
                </div>
              </div>
              <span className="confidence-track">
                <i style={{ width: `${analysis.rootCause.confidence * 100}%` }} />
              </span>
            </article>

            <article className="summary-card">
              <span className="summary-icon emerald-icon">
                <Clock3 size={18} />
              </span>
              <div>
                <div className="summary-label">
                  Time Window
                  <HelpTooltip term="window" />
                </div>
                <div className="summary-value">
                  {analysis.timeRange.split(" – ")[0] ?? "—"}
                </div>
              </div>
              <span className="summary-side">UTC</span>
            </article>

            <article className="summary-card">
              <span className="summary-icon amber-icon">
                <Layers size={18} />
              </span>
              <div>
                <div className="summary-label">
                  Error Groups
                  <HelpTooltip term="clusters" />
                </div>
                <div className="summary-value">
                  {analysis.clusters.length}
                  <small> clusters</small>
                </div>
              </div>
              <span className="summary-side">
                {analysis.events.filter((e) => e.level === "ERROR").length} ERRORS
              </span>
            </article>
          </div>

          {/* Main Navigation Tabs */}
          <div className="view-tabs" role="tablist" aria-label="Incident views">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                role="tab"
                aria-selected={view === id}
                className={`view-tab${view === id ? " selected" : ""}`}
                key={id}
                onClick={() => setView(id)}
              >
                <Icon size={16} />
                {label}
                {id === "events" && <span>{analysis.events.length}</span>}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {view === "overview" && (
            <div className="overview-layout">
              <div className="overview-primary">
                {/* Identified Root Cause Panel */}
                <section className="panel root-cause-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="panel-title">
                        <span className="panel-title-icon indigo-title-icon">
                          <Sparkles size={15} />
                        </span>
                        Primary root cause
                      </div>
                      <p>Ranked by direct evidence found in your application logs</p>
                    </div>
                    <span className="confidence-badge">
                      <CircleDot size={12} /> {Math.round(analysis.rootCause.confidence * 100)}% confidence
                    </span>
                  </div>

                  <div className="root-cause-content">
                    <h2>{analysis.rootCause.title}</h2>
                    <p>{analysis.rootCause.explanation}</p>

                    <div className="evidence-chips">
                      {analysis.rootCause.evidenceIds.map((id) => {
                        const event = analysis.events.find((item) => item.id === id);
                        return event ? (
                          <button
                            key={id}
                            onClick={() => {
                              setView("events");
                              setSelectedCluster(null);
                            }}
                            title={`Inspect log line: ${event.message}`}
                          >
                            <span className="chip-dot" />
                            {relativeTime(event.timestamp)} · {event.service}
                            <ArrowUpRight size={12} />
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                </section>

                {/* FRIENDLY VISUAL INCIDENT STORY (ROOT-CAUSE CHAIN) */}
                <section className="panel graph-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="panel-title">
                        <span className="panel-title-icon sky-title-icon">
                          <GitBranch size={15} />
                        </span>
                        How the incident unfolded
                      </div>
                      <p>Step-by-step failure cascade from initial trigger to user impact</p>
                    </div>
                    <span className="graph-legend">
                      <span><i className="legend-node legend-cause" /> Origin</span>
                      <span><i className="legend-node legend-symptom" /> Propagation</span>
                      <span><i className="legend-node legend-impact" /> User impact</span>
                    </span>
                  </div>

                  <div className="causal-graph">
                    {analysis.causalChain.length ? (
                      analysis.causalChain.map((node, index) => {
                        const isSelected = selectedNode === node.id;
                        const stageLabel =
                          node.kind === "cause"
                            ? "Initial Trigger"
                            : node.kind === "impact"
                            ? "Customer Impact"
                            : "Downstream Propagation";

                        return (
                          <div className="flow-step-wrapper" key={node.id}>
                            <button
                              onClick={() => setSelectedNode(isSelected ? null : node.id)}
                              className={`flow-step-card ${isSelected ? "selected" : ""}`}
                              aria-expanded={isSelected}
                            >
                              <div className={`flow-step-badge ${node.kind}`}>
                                <span className="font-mono text-xs font-bold">0{index + 1}</span>
                              </div>

                              <div className="flow-step-content">
                                <div className="flow-step-header">
                                  <span className="flow-step-title">{node.title}</span>
                                  <span className={`flow-stage-tag ${node.kind}`}>{stageLabel}</span>
                                </div>
                                <p className="flow-step-detail">{node.detail}</p>
                                <div className="flow-step-meta">
                                  <span>
                                    <FileText size={11} /> {node.evidenceIds.length} linked event
                                    {node.evidenceIds.length === 1 ? "" : "s"}
                                  </span>
                                  <span>Click to view linked events</span>
                                </div>
                              </div>

                              <ArrowUpRight size={15} className="text-slate-400 flex-none" />
                            </button>

                            {index < analysis.causalChain.length - 1 && (
                              <div className="flow-connector">
                                <div className="flow-connector-line" />
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState
                        title="Not enough log events for a flow"
                        detail="Add timestamped logs and click analyze to map the incident sequence."
                      />
                    )}
                  </div>

                  {nodeEvents && (
                    <div className="selected-node-detail">
                      <span>
                        <Check size={14} className="text-emerald-400" /> Selected stage:
                      </span>
                      <strong>{nodeEvents.title}</strong>
                      <button
                        onClick={() => {
                          setSelectedCluster(null);
                          setView("events");
                        }}
                      >
                        Inspect {nodeEvents.evidenceIds.length} linked logs <ArrowRight size={13} />
                      </button>
                    </div>
                  )}

                  <div className="graph-note">
                    <Info size={14} />
                    <span>Sequence ordering correlates events by time and service signals. Verify against traces.</span>
                  </div>
                </section>

                {/* Timeline Chart */}
                <section className="panel timeline-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="panel-title">
                        <span className="panel-title-icon emerald-title-icon">
                          <Clock3 size={15} />
                        </span>
                        Incident event distribution
                      </div>
                      <p>{analysis.events.length} parsed events plotted in chronological sequence</p>
                    </div>
                    <button className="panel-action" onClick={() => setView("events")}>
                      View all logs <ArrowRight size={13} />
                    </button>
                  </div>

                  <div className="timeline-chart" aria-label="Error distribution over time">
                    {analysis.events.slice(0, 16).map((event, index) => (
                      <button
                        key={event.id}
                        aria-label={`${event.level} ${event.service} at ${relativeTime(event.timestamp)}`}
                        title={`${relativeTime(event.timestamp)} · ${event.level} · ${event.service}`}
                        onClick={() => {
                          setSelectedCluster(null);
                          setView("events");
                        }}
                        className={`timeline-bar ${event.level.toLowerCase()}`}
                        style={{
                          height: `${18 + (event.level === "ERROR" ? 28 : event.level === "WARN" ? 18 : 8) + ((index * 7) % 24)}px`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="timeline-axis">
                    <span>{analysis.events.length ? relativeTime(analysis.events[0].timestamp) : "—"}</span>
                    <span>TIME AXIS (UTC)</span>
                    <span>{analysis.events.length ? relativeTime(analysis.events[analysis.events.length - 1].timestamp) : "—"}</span>
                  </div>

                  <div className="timeline-legend">
                    <span><i className="legend-error" /> Error</span>
                    <span><i className="legend-warning" /> Warning</span>
                    <span><i className="legend-info" /> Information</span>
                  </div>
                </section>

                {/* Error Clusters */}
                <section className="panel cluster-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="panel-title">
                        <span className="panel-title-icon amber-title-icon">
                          <Layers size={15} />
                        </span>
                        Recurring error patterns
                      </div>
                      <p>Aggregated message patterns across services to avoid repetitive alert fatigue</p>
                    </div>
                    <span className="cluster-total">{analysis.clusters.length} GROUPS</span>
                  </div>

                  {analysis.clusters.length ? (
                    <div className="cluster-list">
                      {analysis.clusters.map((cluster) => (
                        <button
                          key={cluster.id}
                          className={`cluster-row${selectedCluster === cluster.id ? " cluster-selected" : ""}`}
                          onClick={() => {
                            setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id);
                            setView("events");
                          }}
                        >
                          <span className={`cluster-marker ${cluster.severity}`} />
                          <span className="cluster-name">
                            <b>{cluster.label}</b>
                            <small>{cluster.summary}</small>
                          </span>
                          <span className="cluster-count">
                            {cluster.count} <small>events</small>
                          </span>
                          <span className={`mini-severity ${cluster.severity}`}>
                            {severityLabels[cluster.severity]}
                          </span>
                          <ArrowRight size={14} className="cluster-arrow" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No recurring error patterns"
                      detail="No clusters detected in the current log selection."
                    />
                  )}
                </section>

                {/* Evidence & Explanatory AI Insights */}
                <EvidencePanel analysis={analysis} />
              </div>

              {/* Aside: Impact & Recommended Fixes */}
              <aside className="overview-aside">
                {/* Impact panel */}
                <section className="panel impact-panel">
                  <div className="panel-title">
                    <span className="panel-title-icon amber-title-icon">
                      <Activity size={15} />
                    </span>
                    Observed blast radius
                  </div>
                  <p>{analysis.impact}</p>

                  <div className="impact-divider" />
                  <div className="aside-overline">AFFECTED SERVICES</div>
                  <div className="service-tags">
                    {analysis.affectedServices.map((service) => (
                      <span key={service}>
                        <span />
                        {service}
                      </span>
                    ))}
                  </div>
                </section>

                {/* Recommended Fixes */}
                <section className="panel fixes-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="panel-title">
                        <span className="panel-title-icon emerald-title-icon">
                          <Zap size={15} />
                        </span>
                        Recommended fixes
                      </div>
                      <p>Prioritized steps to resolve the outage</p>
                    </div>
                  </div>

                  <div className="fix-list">
                    {analysis.fixes.map((fix, index) => (
                      <article className="fix-item" key={`${fix.title}-${index}`}>
                        <span className={`fix-priority ${fix.priority}`}>
                          {fix.priority === "now" ? "IMMEDIATE" : fix.priority === "next" ? "NEXT STEP" : "FOLLOW UP"}
                        </span>
                        <b>{fix.title}</b>
                        <p>{fix.description}</p>
                        {fix.code && <code>{fix.code}</code>}
                      </article>
                    ))}
                  </div>
                </section>

                {/* Share Postmortem CTA */}
                <section className="aside-cta">
                  <span>
                    <FileText size={17} />
                  </span>
                  <div>
                    <b>Export postmortem</b>
                    <p>Generate a polished Markdown postmortem report for your team.</p>
                    <button onClick={() => setView("postmortem")}>
                      View report draft <ArrowRight size={13} />
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          )}

          {/* Dedicated Replay View Tab */}
          {view === "replay" && (
            <div className="mt-4">
              <IncidentReplay
                analysis={analysis}
                onInspectEvent={() => {
                  setSelectedCluster(null);
                  setView("events");
                }}
              />
            </div>
          )}

          {/* Events Tab */}
          {view === "events" && (
            <section className="panel events-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title">
                    <span className="panel-title-icon sky-title-icon">
                      <FileText size={15} />
                    </span>
                    Normalized log events
                  </div>
                  <p>Clean parsed timestamps, service tags, and normalized error levels</p>
                </div>
                <select
                  className="level-select"
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                  aria-label="Filter events by log level"
                >
                  <option value="ALL">All log levels</option>
                  <option value="ERROR">Errors only</option>
                  <option value="WARN">Warnings only</option>
                  <option value="INFO">Info messages</option>
                  <option value="DEBUG">Debug events</option>
                </select>
              </div>

              <div className="event-filters">
                {analysis.clusters.map((cluster) => (
                  <button
                    className={`filter-chip${selectedCluster === cluster.id ? " filter-active" : ""}`}
                    key={cluster.id}
                    onClick={() => setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id)}
                  >
                    {cluster.label}
                    <span>{cluster.count}</span>
                  </button>
                ))}
              </div>

              {visibleEvents.length ? (
                <div className="event-list">
                  {visibleEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onSelect={() => setSelectedCluster(null)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No matching events found"
                  detail="Adjust or clear your log level or cluster filter to see events."
                />
              )}

              <div className="event-footer">
                Showing {visibleEvents.length} of {analysis.events.length} parsed events · UTC
              </div>
            </section>
          )}

          {/* Postmortem Report Tab */}
          {view === "postmortem" && (
            <PostmortemView
              analysis={analysis}
              onExport={() => void exportPostmortem()}
              onCopy={() => void copyPostmortem()}
            />
          )}

          {/* Friendly Footer */}
          <footer className="workspace-footer">
            <span>
              <span className="footer-live-dot" />
              {analysis.mode === "ai"
                ? "AI-assisted incident intelligence"
                : "Deterministic engine · 100% private & works offline"}
            </span>
            <span>
              Direct evidence prioritized <i>·</i> Hypotheses clearly labeled
            </span>
            <span>{analysis.events.length} events processed</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div><Activity size={18} /></div>
      <b>{title}</b>
      <p>{detail}</p>
    </div>
  );
}

function EvidencePanel({ analysis }: { analysis: IncidentAnalysis }) {
  return (
    <section className="panel evidence-panel">
      <div className="panel-heading">
        <div>
          <div className="panel-title">
            <span className="panel-title-icon emerald-title-icon">
              <Check size={15} />
            </span>
            Direct evidence &amp; AI reasoning
          </div>
          <p>
            Observed signals from logs are separated from AI hypotheses so you know what is verified
          </p>
        </div>
      </div>

      <div className="evidence-grid">
        <div className="evidence-column">
          <div className="evidence-heading observed-heading">
            <span className="observed-mark"><Check size={12} /></span>
            <b>VERIFIED FROM LOGS</b>
            <span>{analysis.evidence.length} signals</span>
          </div>
          <p className="evidence-explainer">
            Directly observed facts extracted from timestamps, error messages, and metrics.
          </p>
          {analysis.evidence.map((item, index) => (
            <p key={index}>
              <i />
              {item}
            </p>
          ))}
        </div>

        <div className="evidence-column inference-column">
          <div className="evidence-heading inference-heading-title">
            <span className="inference-mark"><Sparkles size={12} /></span>
            <b>AI HYPOTHESES &amp; DEDUCTIONS</b>
            <span>{analysis.inferences.length} hypotheses</span>
          </div>
          <p className="evidence-explainer">
            Reasoned explanations to guide your troubleshooting. Always verify against telemetry.
          </p>
          {analysis.inferences.map((item, index) => (
            <p key={index}>
              <i />
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function EventRow({ event, onSelect }: { event: LogEvent; onSelect: () => void }) {
  return (
    <button className="event-row" onClick={onSelect} title={event.raw}>
      <span className="event-time">{relativeTime(event.timestamp)}</span>
      <span className={`event-level ${event.level.toLowerCase()}`}>{event.level}</span>
      <span className="event-service">{event.service}</span>
      <span className="event-message">{event.message}</span>
      <ArrowUpRight size={14} className="event-arrow" />
    </button>
  );
}

function PostmortemView({
  analysis,
  onExport,
  onCopy,
}: {
  analysis: IncidentAnalysis;
  onExport: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="postmortem-view">
      <div className="postmortem-toolbar">
        <div>
          <div className="panel-title">
            <span className="panel-title-icon indigo-title-icon">
              <FileText size={15} />
            </span>
            Incident Postmortem Draft
          </div>
          <p>
            Structured draft ready for review and sharing with engineering teams
          </p>
        </div>
        <div>
          <button className="button-secondary" onClick={onCopy}>
            Copy Markdown
          </button>
          <button className="button-primary" onClick={onExport}>
            <Download size={14} /> Export .md
          </button>
        </div>
      </div>

      <article className="postmortem-document">
        <div className="document-kicker">
          INCIDENT POSTMORTEM <span>·</span> GENERATED FROM {analysis.events.length} LOG EVENTS
        </div>
        <h1>{analysis.title}</h1>

        <div className="document-meta">
          <span className={`mini-severity ${analysis.severity}`}>
            {severityLabels[analysis.severity]}
          </span>
          <span>
            <Clock3 size={14} /> {analysis.timeRange}
          </span>
          <span>
            <CircleDot size={14} /> {Math.round(analysis.rootCause.confidence * 100)}% confidence
          </span>
        </div>

        <div className="document-rule" />

        <h2>1. Executive Summary</h2>
        <p>{analysis.summary}</p>

        <h2>2. Root Cause Analysis</h2>
        <p>{analysis.rootCause.explanation}</p>

        <h2>3. Blast Radius &amp; Impact</h2>
        <p>{analysis.impact}</p>

        <h2>4. Sequence of Events</h2>
        <div className="document-timeline">
          {analysis.causalChain.map((item, index) => (
            <div key={item.id}>
              <span className={`document-dot ${item.kind}`} />
              <span>
                <b>Step {index + 1}: {item.title}</b>
                <small>{item.detail}</small>
              </span>
            </div>
          ))}
        </div>

        <h2>5. Verified Evidence (From Logs)</h2>
        <ul>
          {analysis.evidence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>

        <h2>6. AI Hypotheses to Validate</h2>
        <ul>
          {analysis.inferences.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>

        <h2>7. Action Items &amp; Mitigations</h2>
        <div className="document-actions">
          {analysis.fixes.map((fix, index) => (
            <div key={index}>
              <span className={`fix-priority ${fix.priority}`}>{fix.priority.toUpperCase()}</span>
              <span>
                <b>{fix.title}</b>
                <small>{fix.description}</small>
              </span>
            </div>
          ))}
        </div>

        <h2>8. Prevention &amp; Hardening</h2>
        <ul>
          {analysis.prevention.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>

        <div className="document-disclaimer">
          <Info size={16} />
          <span>
            This postmortem is a collaborative AI-assisted draft. Review customer impact, metrics,
            and hypothesis validity against production APM before publishing externally.
          </span>
        </div>
      </article>
    </section>
  );
}
