"use client";

import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  Download,
  FileText,
  GitBranch,
  LoaderCircle,
  Menu,
  RotateCcw,
  Sparkles,
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

type View = "overview" | "events" | "postmortem";
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
  { id: "events", label: "Log events", icon: FileText },
  { id: "postmortem", label: "Postmortem", icon: GitBranch },
];

const severityLabels: Record<IncidentAnalysis["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function relativeTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC",
  });
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

## Timeline
${analysis.causalChain.map((item) => `- **${item.title}:** ${item.detail}`).join("\n")}

## What went well / contributing factors
${analysis.contributingFactors.map((item) => `- ${item}`).join("\n")}

## Evidence
${analysis.evidence.map((item) => `- ${item}`).join("\n")}

## Hypotheses to validate
${analysis.inferences.map((item) => `- ${item}`).join("\n")}

## Action items
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
      setError("Add at least one non-empty log line to start an analysis.");
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
          : "Analysis failed. Please try again.";
        throw new Error(message);
      }
      const parsed = AnalysisResponseSchema.safeParse(result);
      if (!parsed.success) throw new Error("The analysis service returned an invalid response.");
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
        ? "AI analysis complete. Evidence and hypotheses are shown separately."
        : parsed.data.storage === "postgresql"
          ? "Demo analysis complete and saved to PostgreSQL."
          : "Deterministic demo analysis complete. No API key required.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to analyze these logs.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 500_000) {
      setError("That file is over 500 KB. Upload a smaller log file.");
      return;
    }
    if (!/\.(log|txt|json|ndjson)$/i.test(file.name)) {
      setError("Choose a .log, .txt, .json, or .ndjson file.");
      return;
    }
    try {
      const contents = await file.text();
      setLogs(contents);
      setError("");
      setNotice(`${file.name} loaded. Run analysis to inspect its events.`);
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
    setNotice("");
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
    setNotice(`Loaded saved incident from ${new Date(incident.createdAt).toLocaleString()}.`);
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
    setNotice("Postmortem exported as Markdown.");
  }

  async function copyPostmortem() {
    try {
      await navigator.clipboard.writeText(postmortemMarkdown(analysis));
      setNotice("Postmortem copied to clipboard.");
    } catch {
      setError("Clipboard access is unavailable. Export the Markdown file instead.");
    }
  }

  const nodeEvents = analysis.causalChain.find((node) => node.id === selectedNode);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="wordmark sidebar-brand"><span className="brand-icon"><BarChart3 size={16} /></span>trace<span>lens</span></Link>
        <div className="workspace-picker"><span className="workspace-avatar">A</span><span><b>Acme Engineering</b><small>Free workspace</small></span><ChevronDown size={14} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace">
          <Link className="side-link" href="/dashboard"><Activity size={16} /><span>Incidents</span><span className="side-count">{incidents.length + 1}</span></Link>
          <a className="side-link muted" href="#analysis"><BarChart3 size={16} /><span>Log explorer</span></a>
          <a className="side-link muted" href="#analysis"><Zap size={16} /><span>Integrations</span><span className="soon-tag">SOON</span></a>
        </nav>
        <div className="nav-caption incident-caption">CURRENT INCIDENT <span>INC-2481</span></div>
        <nav className="side-nav incident-nav" aria-label="Incident views">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={`side-link${view === id ? " active" : ""}`}><Icon size={16} /><span>{label}</span></button>)}
        </nav>
        {incidents.length > 0 && <><div className="nav-caption saved-caption">SAVED INCIDENTS</div><nav className="side-nav saved-nav" aria-label="Saved incidents">{incidents.slice(0, 5).map((incident) => <button className="saved-incident-link" key={incident.id} onClick={() => openStoredIncident(incident)} title={incident.title}><span className={`saved-incident-dot ${incident.severity}`} /><span>{incident.title}</span></button>)}</nav></>}
        <div className="sidebar-bottom"><div className="usage-card"><span className="usage-icon"><Sparkles size={15} /></span><b>Demo workspace</b><p>Explore the full incident workflow with realistic sample data.</p><button onClick={resetDemo}>Reset sample <RotateCcw size={12} /></button></div><div className="profile-row"><span className="profile-avatar">JD</span><span><b>Jamie Developer</b><small>Local session</small></span><Menu size={15} /></div></div>
      </aside>

      <section className="workspace-main">
        <header className="topbar"><div className="breadcrumb"><span>Incidents</span><span className="crumb-divider">/</span><b>INC-2481</b><span className="severity-pill"><i />{severityLabels[analysis.severity]}</span></div><div className="topbar-actions"><span className={`mode-pill ${analysis.mode === "ai" ? "ai-mode" : ""}`}><span />{analysis.mode === "ai" ? "AI ANALYSIS" : "DEMO MODE"}</span><button className="icon-button" aria-label="Download postmortem" onClick={() => void exportPostmortem()}><Download size={16} /></button><span className="header-avatar">JD</span></div></header>

        <div className="workspace-content" id="analysis">
          <div className="page-heading"><div><div className="eyebrow"><span className="status-dot" /> INCIDENT · DETECTED JUST NOW</div><h1>{analysis.title}</h1><p>Root cause analysis from <b>{analysis.events.length} log events</b><span> · </span>{analysis.timeRange}</p></div><div className="heading-actions"><button className="button-quiet" onClick={resetDemo}><RotateCcw size={14} /> Reset demo</button><button className="button-primary analyze-button" onClick={() => void runAnalysis()} disabled={isAnalyzing}><Sparkles size={15} />{isAnalyzing ? "Analyzing…" : "Analyze logs"}</button></div></div>

          <section className={`log-input-card${isDragging ? " dragging" : ""}`} aria-label="Log input">
            <div className="input-card-heading"><div><div className="input-card-title"><span className="input-icon"><Code2 size={16} /></span>Analyze your logs <span className="input-hint">Paste or upload · up to 500 KB</span></div><p>Raw application logs are parsed locally before analysis.</p></div><button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload file</button><input ref={fileInput} type="file" accept=".log,.txt,.json,.ndjson" hidden onChange={handleFileChange} /></div>
            <textarea aria-label="Paste application logs" value={logs} onChange={(event) => setLogs(event.target.value)} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} spellCheck={false} placeholder={"2025-06-14T12:04:01Z ERROR [api] request failed …"} />
            <div className="input-card-footer"><span><span className="privacy-dot" />{logs.split(/\r?\n/).filter(Boolean).length} lines <span>·</span> {new Blob([logs]).size.toLocaleString()} bytes <span>·</span> {analysis.mode === "demo" ? "No API key needed" : "Sent to configured AI provider"}</span><div><button className="text-button" onClick={() => { setLogs(""); setError(""); setNotice(""); }}>Clear</button><button className="text-button" onClick={() => { setLogs(DEMO_LOGS); setError(""); setNotice("Sample incident logs loaded."); }}>Load sample logs</button></div></div>
          </section>

          {error && <div className="alert-message error-message" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
          {notice && !error && <div className="alert-message success-message" role="status"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={14} /></button></div>}
          {isAnalyzing && <div className="analysis-progress" role="status"><LoaderCircle size={15} className="spin" /> Parsing events and correlating the failure chain…</div>}

          <div className="summary-grid"><article className="summary-card"><span className="summary-icon red-icon"><AlertCircle size={16} /></span><div><div className="summary-label">SEVERITY</div><div className="summary-value">{severityLabels[analysis.severity]} <span className="summary-dot red-dot" /></div></div><span className="summary-side">INCIDENT</span></article><article className="summary-card"><span className="summary-icon purple-icon"><GitBranch size={16} /></span><div><div className="summary-label">ROOT CAUSE CONFIDENCE</div><div className="summary-value">{Math.round(analysis.rootCause.confidence * 100)}<small>%</small></div></div><span className="confidence-track"><i style={{ width: `${analysis.rootCause.confidence * 100}%` }} /></span></article><article className="summary-card"><span className="summary-icon blue-icon"><Clock3 size={16} /></span><div><div className="summary-label">INCIDENT WINDOW</div><div className="summary-value">{analysis.timeRange.split(" – ")[0] ?? "—"}</div></div><span className="summary-side">UTC</span></article><article className="summary-card"><span className="summary-icon amber-icon"><BarChart3 size={16} /></span><div><div className="summary-label">ERROR CLUSTERS</div><div className="summary-value">{analysis.clusters.length}<small> correlated</small></div></div><span className="summary-side">{analysis.events.filter((event) => event.level === "ERROR").length} ERRORS</span></article></div>

          <div className="view-tabs" role="tablist" aria-label="Incident details">{NAV_ITEMS.map(({ id, label, icon: Icon }) => <button role="tab" aria-selected={view === id} className={`view-tab${view === id ? " selected" : ""}`} key={id} onClick={() => setView(id)}><Icon size={15} />{label}{id === "events" && <span>{analysis.events.length}</span>}</button>)}</div>

          {view === "overview" && <div className="overview-layout">
            <div className="overview-primary">
              <section className="panel root-cause-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon red-title-icon"><AlertCircle size={15} /></span>Likely root cause</div><p>Ranked by evidence in your logs</p></div><span className="confidence-badge"><CircleDot size={12} /> {Math.round(analysis.rootCause.confidence * 100)}% confidence</span></div><div className="root-cause-content"><h2>{analysis.rootCause.title}</h2><p>{analysis.rootCause.explanation}</p><div className="evidence-chips">{analysis.rootCause.evidenceIds.map((id) => { const event = analysis.events.find((item) => item.id === id); return event ? <button key={id} onClick={() => { setView("events"); setSelectedCluster(null); }}><span className="chip-dot" />{relativeTime(event.timestamp)} · {event.service}<ArrowUpRight size={11} /></button> : null; })}</div></div></section>

              <section className="panel graph-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon purple-title-icon"><GitBranch size={15} /></span>Root-cause chain</div><p>Follow the cascade from trigger to impact</p></div><span className="graph-legend"><i className="legend-cause" />Trigger <i className="legend-impact" />Impact</span></div><div className="causal-graph">{analysis.causalChain.length ? analysis.causalChain.map((node, index) => <div className="graph-step" key={node.id}><button onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)} className={`graph-node ${node.kind}${selectedNode === node.id ? " graph-node-selected" : ""}`}><span className="graph-node-marker">{node.kind === "cause" ? <AlertCircle size={13} /> : node.kind === "impact" ? <BarChart3 size={13} /> : <Activity size={13} />}</span><span className="graph-node-copy"><strong>{node.title}</strong><small>{node.detail}</small><span className="node-event-count">{node.evidenceIds.length} linked evidence signal{node.evidenceIds.length === 1 ? "" : "s"}</span></span><ArrowUpRight size={14} className="node-arrow" /></button>{index < analysis.causalChain.length - 1 && <div className="graph-edge"><span /><ArrowDown size={12} /></div>}</div>) : <EmptyState title="Not enough events to build a chain" detail="Add timestamped logs and run the analysis again." />}</div>{nodeEvents && <div className="selected-node-detail"><span><Check size={13} /> Selected node</span><strong>{nodeEvents.title}</strong><button onClick={() => { setSelectedCluster(null); setView("events"); }}>View linked evidence <ArrowRight size={12} /></button></div>}<div className="graph-note"><span>ⓘ</span> Direction reflects correlation, not proof of causation. Validate hypotheses against traces.</div></section>

              <section className="panel timeline-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon blue-title-icon"><Clock3 size={15} /></span>Incident timeline</div><p>{analysis.events.length} parsed events · chronological order</p></div><button className="panel-action" onClick={() => setView("events")}>All events <ArrowRight size={13} /></button></div><div className="timeline-chart" aria-label="Errors over time">{analysis.events.slice(0, 16).map((event, index) => <button key={event.id} aria-label={`${event.level} ${event.service} at ${relativeTime(event.timestamp)}`} title={`${relativeTime(event.timestamp)} · ${event.level} · ${event.service}`} onClick={() => { setSelectedCluster(null); setView("events"); }} className={`timeline-bar ${event.level.toLowerCase()}`} style={{ height: `${14 + (event.level === "ERROR" ? 20 : event.level === "WARN" ? 13 : 6) + ((index * 13) % 31)}px` }} />)}</div><div className="timeline-axis"><span>{analysis.events.length ? relativeTime(analysis.events[0].timestamp) : "—"}</span><span>TIME (UTC)</span><span>{analysis.events.length ? relativeTime(analysis.events[analysis.events.length - 1].timestamp) : "—"}</span></div><div className="timeline-legend"><span><i className="legend-error" />Error</span><span><i className="legend-warning" />Warning</span><span><i className="legend-info" />Info</span></div></section>

              <section className="panel cluster-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon amber-title-icon"><LayersIcon /></span>Error clusters</div><p>Recurring patterns grouped across services</p></div><span className="cluster-total">{analysis.clusters.length} GROUPS</span></div>{analysis.clusters.length ? <div className="cluster-list">{analysis.clusters.map((cluster) => <button key={cluster.id} className={`cluster-row${selectedCluster === cluster.id ? " cluster-selected" : ""}`} onClick={() => { setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id); setView("events"); }}><span className={`cluster-marker ${cluster.severity}`} /><span className="cluster-name"><b>{cluster.label}</b><small>{cluster.summary}</small></span><span className="cluster-count">{cluster.count} <small>events</small></span><span className={`mini-severity ${cluster.severity}`}>{severityLabels[cluster.severity]}</span><ArrowRight size={13} className="cluster-arrow" /></button>)}</div> : <EmptyState title="No recurring error clusters" detail="Try logs containing errors or warnings." />}</section>

              <EvidencePanel analysis={analysis} />
            </div>

            <aside className="overview-aside"><section className="panel impact-panel"><div className="panel-title"><span className="panel-title-icon amber-title-icon"><Activity size={15} /></span>Potential impact</div><p>{analysis.impact}</p><div className="impact-divider" /><div className="aside-overline">AFFECTED SERVICES</div><div className="service-tags">{analysis.affectedServices.map((service) => <span key={service}><span />{service}</span>)}</div></section><section className="panel fixes-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon green-title-icon"><Zap size={15} /></span>Recommended fixes</div><p>Prioritized next steps</p></div></div><div className="fix-list">{analysis.fixes.map((fix, index) => <article className="fix-item" key={`${fix.title}-${index}`}><span className={`fix-priority ${fix.priority}`}>{fix.priority === "now" ? "NOW" : fix.priority === "next" ? "NEXT" : "LATER"}</span><b>{fix.title}</b><p>{fix.description}</p>{fix.code && <code>{fix.code}</code>}</article>)}</div></section><section className="aside-cta"><span><FileText size={16} /></span><div><b>Share a postmortem</b><p>Turn findings into an actionable incident report.</p><button onClick={() => setView("postmortem")}>Review report <ArrowRight size={12} /></button></div></section></aside>
          </div>}

          {view === "events" && <section className="panel events-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon blue-title-icon"><FileText size={15} /></span>Parsed log events</div><p>Normalized timestamps, severity, and service from your input</p></div><select className="level-select" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} aria-label="Filter event level"><option value="ALL">All levels</option><option value="ERROR">Errors</option><option value="WARN">Warnings</option><option value="INFO">Info</option><option value="DEBUG">Debug</option></select></div><div className="event-filters">{analysis.clusters.map((cluster) => <button className={`filter-chip${selectedCluster === cluster.id ? " filter-active" : ""}`} key={cluster.id} onClick={() => setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id)}>{cluster.label}<span>{cluster.count}</span></button>)}</div>{visibleEvents.length ? <div className="event-list">{visibleEvents.map((event) => <EventRow key={event.id} event={event} onSelect={() => setSelectedCluster(null)} />)}</div> : <EmptyState title="No matching log events" detail="Clear your cluster or severity filters to see events." />}<div className="event-footer">Showing {visibleEvents.length} of {analysis.events.length} normalized events<span> · UTC</span></div></section>}

          {view === "postmortem" && <PostmortemView analysis={analysis} onExport={() => void exportPostmortem()} onCopy={() => void copyPostmortem()} />}

          <footer className="workspace-footer"><span><span className="footer-live-dot" />{analysis.mode === "ai" ? "AI-powered analysis" : "Deterministic analysis · works offline"}</span><span>Evidence first <i>·</i> Inference clearly labeled</span><span>{analysis.events.length} events processed</span></footer>
        </div>
      </section>
    </main>
  );
}

function LayersIcon() {
  return <GitBranch size={15} />;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div><Activity size={17} /></div><b>{title}</b><p>{detail}</p></div>;
}

function EvidencePanel({ analysis }: { analysis: IncidentAnalysis }) {
  return <section className="panel evidence-panel"><div className="panel-heading"><div><div className="panel-title"><span className="panel-title-icon green-title-icon"><Check size={15} /></span>Evidence &amp; inference</div><p>Observed signals are separated from hypotheses</p></div></div><div className="evidence-grid"><div className="evidence-column"><div className="evidence-heading"><span className="observed-mark"><Check size={11} /></span><b>OBSERVED IN LOGS</b><span>{analysis.evidence.length}</span></div>{analysis.evidence.map((item, index) => <p key={index}><i />{item}</p>)}</div><div className="evidence-column inference-column"><div className="evidence-heading"><span className="inference-mark">∴</span><b>AI INFERENCE</b><span>{analysis.inferences.length}</span></div>{analysis.inferences.map((item, index) => <p key={index}><i />{item}</p>)}</div></div></section>;
}

function EventRow({ event, onSelect }: { event: LogEvent; onSelect: () => void }) {
  return <button className="event-row" onClick={onSelect}><span className="event-time">{relativeTime(event.timestamp)}</span><span className={`event-level ${event.level.toLowerCase()}`}>{event.level}</span><span className="event-service">{event.service}</span><span className="event-message">{event.message}</span><ArrowUpRight size={13} className="event-arrow" /></button>;
}

function PostmortemView({ analysis, onExport, onCopy }: { analysis: IncidentAnalysis; onExport: () => void; onCopy: () => void }) {
  return <section className="postmortem-view"><div className="postmortem-toolbar"><div><div className="panel-title"><span className="panel-title-icon purple-title-icon"><FileText size={15} /></span>Incident postmortem</div><p>Drafted from this analysis. Review before sharing externally.</p></div><div><button className="button-quiet" onClick={onCopy}>Copy Markdown</button><button className="button-primary" onClick={onExport}><Download size={14} /> Export .md</button></div></div><article className="postmortem-document"><div className="document-kicker">INCIDENT REPORT <span>·</span> GENERATED FROM {analysis.events.length} LOG EVENTS</div><h1>{analysis.title}</h1><div className="document-meta"><span className={`mini-severity ${analysis.severity}`}>{severityLabels[analysis.severity]}</span><span><Clock3 size={13} />{analysis.timeRange}</span><span><CircleDot size={13} />{Math.round(analysis.rootCause.confidence * 100)}% confidence</span></div><div className="document-rule" /><h2>Summary</h2><p>{analysis.summary}</p><h2>Root cause</h2><p>{analysis.rootCause.explanation}</p><h2>Impact</h2><p>{analysis.impact}</p><h2>Timeline</h2><div className="document-timeline">{analysis.causalChain.map((item) => <div key={item.id}><span className={`document-dot ${item.kind}`} /><span><b>{item.title}</b><small>{item.detail}</small></span></div>)}</div><h2>Evidence</h2><ul>{analysis.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul><h2>Hypotheses to validate</h2><ul className="hypothesis-list">{analysis.inferences.map((item, index) => <li key={index}>{item}</li>)}</ul><h2>Action items</h2><div className="document-actions">{analysis.fixes.map((fix, index) => <div key={index}><span className={`fix-priority ${fix.priority}`}>{fix.priority.toUpperCase()}</span><span><b>{fix.title}</b><small>{fix.description}</small></span></div>)}</div><h2>Prevention</h2><ul>{analysis.prevention.map((item, index) => <li key={index}>{item}</li>)}</ul><div className="document-disclaimer"><AlertCircle size={14} /> AI-generated draft. Verify impact, customer counts, and causal hypotheses against production data before publishing.</div></article></section>;
}
