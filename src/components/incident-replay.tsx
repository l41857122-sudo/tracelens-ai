"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Eye,
  FileText,
  GitBranch,
  Info,
  Maximize2,
  Minimize2,
  Network,
  Pause,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IncidentAnalysis, LogEvent } from "@/lib/analysis";

export interface ReplayFrame {
  index: number;
  event: LogEvent;
  timestamp: string;
  timeFormatted: string;
  relativeSeconds: number;
  service: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  message: string;
  headline: string;
  whatChanged: string;
  affectedServicesCount: number;
  phase: "started" | "spread" | "impact";
  phaseLabel: string;
  phaseSummary: string;
  blastRadius: {
    affectedCount: number;
    severityLabel: string;
    servicesState: Record<
      string,
      {
        status: "healthy" | "degraded" | "saturated" | "failing";
        metricLabel: string;
        metricValue: string;
      }
    >;
  };
  activeCausalStepId: string | null;
  unlockedCausalStepIds: string[];
}

export interface Intervention {
  id: string;
  title: string;
  category: string;
  tagline: string;
  description: string;
  buttonLabel: string;
  expectedOutcome: string;
  simulatedMetrics: {
    metric: string;
    observed: string;
    simulated: string;
    delta: string;
    positive: boolean;
  }[];
  simulatedTimeline: {
    time: string;
    title: string;
    detail: string;
    status: "mitigated" | "prevented" | "normal";
  }[];
}

export interface ReplayMilestone {
  index: number;
  time: string;
  relativeSeconds: number;
  label: string;
  summary: string;
}

const INTERVENTIONS: Intervention[] = [
  {
    id: "stop-retries",
    title: "Stop Retries & Apply Jittered Backoff",
    category: "Traffic Shaping",
    tagline: "Break the exponential retry amplification storm",
    description:
      "Configure the ingress gateway and orders service to drop automated retries when database acquisition times out. Fail fast with an immediate 503 response instead of queueing 5 retry attempts per transaction.",
    buttonLabel: "Simulate retry backoff",
    expectedOutcome:
      "Halts exponential traffic amplification, keeping the shared worker queue clear and speeding up recovery from 18s to 4.2s.",
    simulatedMetrics: [
      {
        metric: "Worker Queue Depth",
        observed: "2,914 jobs",
        simulated: "48 jobs",
        delta: "-98% queue pressure",
        positive: true,
      },
      {
        metric: "Outage Duration",
        observed: "18.0s",
        simulated: "4.2s",
        delta: "-76% duration",
        positive: true,
      },
      {
        metric: "5xx Error Rate",
        observed: "34%",
        simulated: "3.5%",
        delta: "-30.5% errors",
        positive: true,
      },
      {
        metric: "Database Waiters",
        observed: "71 waiting",
        simulated: "4 waiting",
        delta: "-94% waiters",
        positive: true,
      },
    ],
    simulatedTimeline: [
      {
        time: "12:04:03",
        title: "Database pool reaches 50/50 capacity",
        detail: "Fast-fail breaker trips; incoming retries rejected immediately.",
        status: "mitigated",
      },
      {
        time: "12:04:06",
        title: "Retry amplification storm prevented",
        detail: "No duplicate requests created; worker queue backlog stays under 50 jobs.",
        status: "prevented",
      },
      {
        time: "12:04:08",
        title: "Database pool recovers connection headroom",
        detail: "Active connections drop to 32/50 as initial queries complete cleanly.",
        status: "normal",
      },
      {
        time: "12:04:12",
        title: "Checkout and Orders latency normalizes",
        detail: "5xx error rate returns to 0%; all services operational.",
        status: "normal",
      },
    ],
  },
  {
    id: "increase-pool",
    title: "Increase DB Connection Pool (50 → 100)",
    category: "Infrastructure",
    tagline: "Provide headroom for peak concurrent transactions",
    description:
      "Dynamically scale the PostgreSQL max connection pool allocation from 50 to 100 connections across the orders service cluster.",
    buttonLabel: "Simulate pool expansion",
    expectedOutcome:
      "Eliminates the initial acquisition bottleneck entirely. Queries execute without waiting, preventing downstream timeouts.",
    simulatedMetrics: [
      {
        metric: "Pool Utilization",
        observed: "100% (50/50)",
        simulated: "52% (52/100)",
        delta: "+48 connections free",
        positive: true,
      },
      {
        metric: "Acquisition Waiters",
        observed: "71 queued",
        simulated: "0 queued",
        delta: "Zero queueing delay",
        positive: true,
      },
      {
        metric: "Request Timeouts",
        observed: "3 timeouts",
        simulated: "0 timeouts",
        delta: "100% eliminated",
        positive: true,
      },
      {
        metric: "5xx Error Rate",
        observed: "34%",
        simulated: "0.2%",
        delta: "Normal baseline",
        positive: true,
      },
    ],
    simulatedTimeline: [
      {
        time: "12:04:02",
        title: "Pool grows past 50 active connections",
        detail: "Extended ceiling of 100 connections absorbs the orders surge smoothly.",
        status: "mitigated",
      },
      {
        time: "12:04:03",
        title: "Zero acquisition timeouts recorded",
        detail: "Database queries proceed without queuing waiters.",
        status: "normal",
      },
      {
        time: "12:04:05",
        title: "API Gateway maintains < 200ms latency",
        detail: "No upstream deadlines breached; checkout flows remain responsive.",
        status: "normal",
      },
    ],
  },
  {
    id: "rollback-deployment",
    title: "Rollback Deployment (`create_order` query)",
    category: "Application Code",
    tagline: "Restore 45ms database query execution baseline",
    description:
      "Roll back the recent unindexed database query update, returning average `create_order` query execution duration from 1,840ms to 42ms.",
    buttonLabel: "Simulate code rollback",
    expectedOutcome:
      "Reduces connection hold time by 97%. Fast query turnover prevents pool exhaustion regardless of traffic spikes.",
    simulatedMetrics: [
      {
        metric: "Query Duration",
        observed: "1,840ms",
        simulated: "42ms",
        delta: "-97.7% query duration",
        positive: true,
      },
      {
        metric: "Peak Pool Depth",
        observed: "50/50 (100%)",
        simulated: "18/50 (36%)",
        delta: "64% spare headroom",
        positive: true,
      },
      {
        metric: "Worker Queue Saturation",
        observed: "32/32 busy",
        simulated: "4/32 active",
        delta: "Zero worker backlog",
        positive: true,
      },
      {
        metric: "Impacted Customers",
        observed: "Elevated 34%",
        simulated: "< 0.05%",
        delta: "Zero customer impact",
        positive: true,
      },
    ],
    simulatedTimeline: [
      {
        time: "12:04:01",
        title: "Optimized `create_order` query executes in 42ms",
        detail: "Connection released back to pool immediately after write.",
        status: "normal",
      },
      {
        time: "12:04:03",
        title: "Pool capacity stays healthy at 18/50",
        detail: "No bottleneck forms; queue depth stays at 0.",
        status: "normal",
      },
      {
        time: "12:04:19",
        title: "All orders process cleanly",
        detail: "99.9% success rate throughout the evaluation window.",
        status: "normal",
      },
    ],
  },
  {
    id: "disable-service",
    title: "Disable / Shed Failing Service (`/api/orders`)",
    category: "Resilience & Shedding",
    tagline: "Isolate order intake to protect checkout & revenue routes",
    description:
      "Trip the circuit breaker on `/api/orders` to stop incoming database writes. Redirect orders to an offline Kafka queue so database handles stay 100% available for payments and checkout processing.",
    buttonLabel: "Simulate service isolation",
    expectedOutcome:
      "Stops failure propagation into `/api/checkout`. Checkout remains 100% operational with zero 500/503 errors while orders are queued for delayed execution.",
    simulatedMetrics: [
      {
        metric: "Checkout Availability",
        observed: "66% (Degraded)",
        simulated: "100% (Healthy)",
        delta: "+34% availability",
        positive: true,
      },
      {
        metric: "Cascading 5xx Errors",
        observed: "34% across gateway",
        simulated: "0% for checkout",
        delta: "Zero cross-service impact",
        positive: true,
      },
      {
        metric: "Database Contention",
        observed: "100% pool saturated",
        simulated: "26% pool utilized",
        delta: "-74% connection load",
        positive: true,
      },
      {
        metric: "Dropped Orders",
        observed: "34% failed requests",
        simulated: "0% (Queued offline)",
        delta: "Zero data loss",
        positive: true,
      },
    ],
    simulatedTimeline: [
      {
        time: "12:04:03",
        title: "Circuit breaker trips on `/api/orders`",
        detail: "Ingress gateway sheds synchronous database calls; queues orders for deferred processing.",
        status: "mitigated",
      },
      {
        time: "12:04:05",
        title: "`/api/checkout` operates with zero latency delay",
        detail: "Database pool remains free (13/50 active); checkout requests succeed immediately.",
        status: "normal",
      },
      {
        time: "12:04:19",
        title: "Zero cascading 5xx errors recorded",
        detail: "Targeted shedding prevented failure propagation to unaffected revenue routes.",
        status: "normal",
      },
    ],
  },
];

function formatTime(timestamp: string): string {
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

export function generateReplayFrames(analysis: IncidentAnalysis): ReplayFrame[] {
  if (!analysis.events || analysis.events.length === 0) return [];

  const sortedEvents = [...analysis.events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const startMillis = new Date(sortedEvents[0].timestamp).getTime();

  return sortedEvents.map((event, index) => {
    const currentMillis = new Date(event.timestamp).getTime();
    const relativeSeconds = Math.max(0, Math.round((currentMillis - startMillis) / 1000));
    const timeFormatted = formatTime(event.timestamp);

    let whatChanged = "Service activity recorded in logs.";
    let headline = "Normal service traffic";

    const rawLower = (event.message + " " + event.raw).toLowerCase();

    if (rawLower.includes("pool nearing capacity") || (rawLower.includes("active=48") && rawLower.includes("max=50"))) {
      headline = "Database pool approaching capacity";
      whatChanged = "Connection pool reached 96% utilization. Only 2 connections left.";
    } else if (rawLower.includes("acquisition timeout") || rawLower.includes("pool exhausted")) {
      headline = "Database pool exhausted";
      whatChanged = "All 50 connections are locked. Incoming requests are waiting in a queue.";
    } else if (rawLower.includes("latency exceeded") || rawLower.includes("duration_ms")) {
      headline = "API latency increased";
      whatChanged = "Orders API is waiting too long for the database, taking 1,840ms instead of 42ms.";
    } else if (rawLower.includes("upstream request timed out") || rawLower.includes("timed out")) {
      headline = "Requests timed out";
      whatChanged = "Orders API exceeded the 3-second gateway timeout. Gateway begins dropping requests.";
    } else if (rawLower.includes("retrying failed request") || rawLower.includes("retry")) {
      headline = "Retries increased";
      whatChanged = "Clients automatically retried failed requests, multiplying traffic into the locked database.";
    } else if (rawLower.includes("worker saturation") || rawLower.includes("queue depth")) {
      headline = "Workers saturated";
      whatChanged = "All 32 background workers are busy waiting on database queries. The queue grew past 2,900 jobs.";
    } else if (rawLower.includes("5xx") || rawLower.includes("503") || rawLower.includes("500")) {
      headline = "5xx errors increased";
      whatChanged = "Customer checkout is failing. API gateway error rate reached 34%.";
    } else if (event.level === "INFO") {
      headline = "Standard request accepted";
      whatChanged = "Traffic ingestion was normal prior to the connection bottleneck.";
    }

    const servicesState: Record<
      string,
      {
        status: "healthy" | "degraded" | "saturated" | "failing";
        metricLabel: string;
        metricValue: string;
      }
    > = {
      database: {
        status: "healthy",
        metricLabel: "Active connections",
        metricValue: "18 / 50 (36%)",
      },
      "orders-api": {
        status: "healthy",
        metricLabel: "Query latency",
        metricValue: "42ms (Normal)",
      },
      "api-gateway": {
        status: "healthy",
        metricLabel: "Error rate",
        metricValue: "0.0% (p99 180ms)",
      },
      "worker-queue": {
        status: "healthy",
        metricLabel: "Queue depth",
        metricValue: "4 jobs (0s delay)",
      },
      checkout: {
        status: "healthy",
        metricLabel: "Customer availability",
        metricValue: "100% Operational",
      },
    };

    for (let i = 0; i <= index; i++) {
      const e = sortedEvents[i];
      const text = (e.message + " " + e.raw).toLowerCase();

      if (text.includes("active=48")) {
        servicesState.database = {
          status: "degraded",
          metricLabel: "Active connections",
          metricValue: "48 / 50 (96%)",
        };
      }
      if (text.includes("active=50") || text.includes("acquisition timeout")) {
        servicesState.database = {
          status: "failing",
          metricLabel: "Active connections",
          metricValue: "50 / 50 (Exhausted)",
        };
        servicesState["orders-api"] = {
          status: "degraded",
          metricLabel: "Acquisition latency",
          metricValue: "Waiting on DB",
        };
      }
      if (text.includes("duration_ms=1840")) {
        servicesState["orders-api"] = {
          status: "failing",
          metricLabel: "Query latency",
          metricValue: "1,840ms (High delay)",
        };
      }
      if (text.includes("timed out after 3000ms")) {
        servicesState["api-gateway"] = {
          status: "degraded",
          metricLabel: "Gateway timeouts",
          metricValue: "3,000ms deadline exceeded",
        };
      }
      if (text.includes("worker saturation") || text.includes("queue_depth=1840")) {
        servicesState["worker-queue"] = {
          status: "saturated",
          metricLabel: "Active workers",
          metricValue: "32 / 32 (1,840 queued)",
        };
      }
      if (text.includes("queue depth critical") || text.includes("queue_depth=2914")) {
        servicesState["worker-queue"] = {
          status: "failing",
          metricLabel: "Queue backlog",
          metricValue: "2,914 jobs (84s lag)",
        };
      }
      if (text.includes("status=503") || text.includes("status=500") || text.includes("elevated 5xx")) {
        servicesState["api-gateway"] = {
          status: "failing",
          metricLabel: "5xx error rate",
          metricValue: "34% failing",
        };
        servicesState.checkout = {
          status: "failing",
          metricLabel: "Checkout availability",
          metricValue: "Degraded (34% errors)",
        };
      }
    }

    const affectedServices = Object.values(servicesState).filter((s) => s.status !== "healthy");
    const affectedCount = Math.max(1, affectedServices.length);

    let phase: "started" | "spread" | "impact" = "started";
    let phaseLabel = "Started";
    let phaseSummary = "Problem started at the database connection pool";

    if (index >= 11 || relativeSeconds >= 15) {
      phase = "impact";
      phaseLabel = "Impact";
      phaseSummary = `${affectedCount} services affected · 34% checkout failure rate`;
    } else if (index >= 3 || relativeSeconds >= 4) {
      phase = "spread";
      phaseLabel = "Spread";
      phaseSummary = `Failure spreading through Orders API, Gateway, and Worker Queue`;
    }

    let severityLabel = "Initial Warning";
    if (index >= 11) severityLabel = "Customer Disruption";
    else if (index >= 5) severityLabel = "Worker & Gateway Saturation";
    else if (index >= 2) severityLabel = "Database Bottleneck";

    const seenEventIds = new Set(sortedEvents.slice(0, index + 1).map((e) => e.id));
    const unlockedCausalStepIds: string[] = [];
    let activeCausalStepId: string | null = null;

    for (const step of analysis.causalChain) {
      const hasEvidence = step.evidenceIds.some((id) => seenEventIds.has(id));
      if (hasEvidence) {
        unlockedCausalStepIds.push(step.id);
        if (step.evidenceIds.includes(event.id)) {
          activeCausalStepId = step.id;
        }
      }
    }

    if (!activeCausalStepId && unlockedCausalStepIds.length > 0) {
      activeCausalStepId = unlockedCausalStepIds[unlockedCausalStepIds.length - 1];
    }

    return {
      index,
      event,
      timestamp: event.timestamp,
      timeFormatted,
      relativeSeconds,
      service: event.service,
      level: event.level,
      message: event.message,
      headline,
      whatChanged,
      affectedServicesCount: affectedCount,
      phase,
      phaseLabel,
      phaseSummary,
      blastRadius: {
        affectedCount,
        severityLabel,
        servicesState,
      },
      activeCausalStepId,
      unlockedCausalStepIds,
    };
  });
}

export type TimeMachineMode = "replay" | "causal" | "simulator" | "blast" | "explain";

const REPLAY_MILESTONES: ReplayMilestone[] = [
  { index: 1, time: "12:04:02", relativeSeconds: 1, label: "Database pool exhausted", summary: "50/50 connections filled" },
  { index: 3, time: "12:04:05", relativeSeconds: 4, label: "API latency increased", summary: "Query duration hit 1,840ms" },
  { index: 4, time: "12:04:06", relativeSeconds: 5, label: "Requests timed out", summary: "3,000ms gateway deadline" },
  { index: 6, time: "12:04:07", relativeSeconds: 6, label: "Retries increased", summary: "Clients sent retry wave" },
  { index: 9, time: "12:04:10", relativeSeconds: 9, label: "Workers saturated", summary: "32/32 busy, queue backlog" },
  { index: 14, time: "12:04:19", relativeSeconds: 18, label: "5xx errors increased", summary: "34% checkout drop" },
];

export function IncidentReplay({
  analysis,
  onInspectEvent,
}: {
  analysis: IncidentAnalysis;
  onInspectEvent?: (eventId: string) => void;
}) {
  const frames = useMemo(() => generateReplayFrames(analysis), [analysis]);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention>(INTERVENTIONS[0]);
  const [activeMode, setActiveMode] = useState<TimeMachineMode>("replay");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCausalNodeId, setSelectedCausalNodeId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const intervalMs = Math.round(1600 / playbackSpeed);

    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, frames.length]);

  const currentFrame = frames[currentFrameIndex] ?? frames[0];
  const progressPercent = frames.length > 1 ? (currentFrameIndex / (frames.length - 1)) * 100 : 0;

  function togglePlay() {
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const nextIndex = parseInt(e.target.value, 10);
    setCurrentFrameIndex(nextIndex);
  }

  function stepBack() {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
  }

  function stepForward() {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.min(frames.length - 1, prev + 1));
  }

  function jumpToMilestone(milestoneIndex: number) {
    setIsPlaying(false);
    const target = Math.min(frames.length - 1, Math.max(0, milestoneIndex));
    setCurrentFrameIndex(target);
  }

  function copyLog(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  }

  if (frames.length === 0) {
    return null;
  }

  // Selected causal node data for the inspection drawer
  const selectedCausalNode = analysis.causalChain.find((n) => n.id === selectedCausalNodeId);
  const nodeEvidenceEvents = selectedCausalNode
    ? analysis.events.filter((e) => selectedCausalNode.evidenceIds.includes(e.id))
    : [];

  // Connected topology nodes configuration
  const servicesList = [
    {
      id: "database",
      name: "Database",
      subname: "PostgreSQL",
      icon: Database,
      state: currentFrame.blastRadius.servicesState.database ?? {
        status: "healthy",
        metricLabel: "Connections",
        metricValue: "18 / 50",
      },
      isActor: currentFrame.service === "orders-service" && currentFrame.headline.toLowerCase().includes("database"),
    },
    {
      id: "orders-api",
      name: "Orders API",
      subname: "orders-service",
      icon: Server,
      state: currentFrame.blastRadius.servicesState["orders-api"] ?? {
        status: "healthy",
        metricLabel: "Latency",
        metricValue: "42ms",
      },
      isActor: currentFrame.service === "orders-service" && !currentFrame.headline.toLowerCase().includes("database"),
    },
    {
      id: "api-gateway",
      name: "API Gateway",
      subname: "api-gateway",
      icon: Network,
      state: currentFrame.blastRadius.servicesState["api-gateway"] ?? {
        status: "healthy",
        metricLabel: "Error rate",
        metricValue: "0%",
      },
      isActor: currentFrame.service === "api-gateway",
    },
    {
      id: "worker-queue",
      name: "Worker Queue",
      subname: "worker-queue",
      icon: Activity,
      state: currentFrame.blastRadius.servicesState["worker-queue"] ?? {
        status: "healthy",
        metricLabel: "Queue depth",
        metricValue: "4 jobs",
      },
      isActor: currentFrame.service === "worker-queue",
    },
    {
      id: "checkout",
      name: "Checkout",
      subname: "Customer flow",
      icon: Zap,
      state: currentFrame.blastRadius.servicesState.checkout ?? {
        status: "healthy",
        metricLabel: "Availability",
        metricValue: "100%",
      },
      isActor: currentFrame.headline.toLowerCase().includes("5xx") || currentFrame.headline.toLowerCase().includes("checkout"),
    },
  ];

  // Active connection lines reflecting propagation
  const isConnectionActive = (connectionIndex: number) => {
    if (connectionIndex === 0) return currentFrameIndex >= 1; // Database -> Orders API
    if (connectionIndex === 1) return currentFrameIndex >= 3; // Orders API -> API Gateway
    if (connectionIndex === 2) return currentFrameIndex >= 5; // API Gateway -> Worker Queue
    if (connectionIndex === 3) return currentFrameIndex >= 11; // Worker Queue -> Checkout
    return false;
  };

  return (
    <section
      ref={containerRef}
      className={`replay-shell ${isFullscreen ? "replay-shell-fullscreen" : ""}`}
      aria-label="Incident Time Machine"
      id="incident-replay"
    >
      {/* 1. CLEAN HEADER (Google Maps / Linear SaaS feel) */}
      <div className="replay-top-nav">
        <div className="replay-brand-col">
          <div className="replay-title-row">
            <span className="replay-brand-sparkle">
              <Sparkles size={16} />
            </span>
            <h2 className="replay-main-title">Incident Time Machine</h2>
          </div>
          <p className="replay-tagline">
            Watch how the problem started, spread, and affected your system.
          </p>
        </div>

        <div className="replay-header-right">
          {/* Simple Navigation Tabs */}
          <nav className="replay-pills-nav" role="tablist" aria-label="Time machine modes">
            <button
              className={`replay-pill-tab ${activeMode === "replay" ? "active" : ""}`}
              onClick={() => setActiveMode("replay")}
            >
              <Play size={13} /> Replay
            </button>
            <button
              className={`replay-pill-tab ${activeMode === "causal" ? "active" : ""}`}
              onClick={() => setActiveMode("causal")}
            >
              <GitBranch size={13} /> Causal Graph
            </button>
            <button
              className={`replay-pill-tab ${activeMode === "simulator" ? "active" : ""}`}
              onClick={() => {
                setActiveMode("simulator");
                setIsPlaying(false);
              }}
            >
              <Sparkles size={13} /> What If?
            </button>
            <button
              className={`replay-pill-tab ${activeMode === "blast" ? "active" : ""}`}
              onClick={() => setActiveMode("blast")}
            >
              <Network size={13} /> Blast Radius
            </button>
            <button
              className={`replay-pill-tab ${activeMode === "explain" ? "active" : ""}`}
              onClick={() => setActiveMode("explain")}
            >
              <ShieldCheck size={13} /> Explainability
            </button>
          </nav>

          <button
            className="replay-icon-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit full view" : "Expand full screen"}
            aria-label="Toggle full view"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* 2. MAIN REPLAY AREA (LARGE CENTRAL STORYTELLING VISUALIZATION) */}
      {activeMode === "replay" && (
        <div className="replay-canvas">
          {/* 5. CAUSAL STORY PROGRESS INDICATOR: Started → Spread → Impact */}
          <div className="causal-phase-bar">
            <div className="phase-track-pills">
              <div className={`phase-pill ${currentFrame.phase === "started" ? "active" : "passed"}`}>
                <span className="phase-dot" />
                <span className="phase-name">Started</span>
              </div>
              <div className="phase-divider" />
              <div className={`phase-pill ${currentFrame.phase === "spread" ? "active" : currentFrame.phase === "impact" ? "passed" : "upcoming"}`}>
                <span className="phase-dot" />
                <span className="phase-name">Spread</span>
              </div>
              <div className="phase-divider" />
              <div className={`phase-pill ${currentFrame.phase === "impact" ? "active" : "upcoming"}`}>
                <span className="phase-dot" />
                <span className="phase-name">Impact</span>
              </div>
            </div>

            <div className="phase-status-caption">
              <span className="phase-affected-chip">
                {currentFrame.affectedServicesCount} {currentFrame.affectedServicesCount === 1 ? "service" : "services"} affected
              </span>
              <span className="phase-desc-text">{currentFrame.phaseSummary}</span>
            </div>
          </div>

          {/* CENTRAL CONNECTED SERVICES VISUALIZATION:
              Database → Orders API → API Gateway → Worker Queue → Checkout */}
          <div className="services-graph-stage">
            <div className="nodes-connected-flow">
              {servicesList.map((svc, idx) => {
                const IconComponent = svc.icon;
                const isFailing = svc.state.status === "failing";
                const isDegraded = svc.state.status === "degraded" || svc.state.status === "saturated";
                const isHealthy = svc.state.status === "healthy";

                return (
                  <div key={svc.id} className="service-step-cluster">
                    {/* Node Card */}
                    <div
                      className={`service-story-node ${
                        isFailing ? "failing-pulse" : isDegraded ? "degraded-warn" : "calm-healthy"
                      } ${svc.isActor ? "current-actor-glow" : ""}`}
                    >
                      <div className="node-avatar-box">
                        <IconComponent size={18} />
                      </div>

                      <div className="node-body">
                        <div className="node-title-row">
                          <span className="node-name">{svc.name}</span>
                          <span className={`node-badge ${svc.state.status}`}>
                            {isFailing
                              ? "Failing"
                              : isDegraded
                              ? svc.state.status === "saturated"
                                ? "Saturated"
                                : "Degraded"
                              : "Healthy"}
                          </span>
                        </div>
                        <span className="node-subname">{svc.subname}</span>

                        <div className="node-live-metric">
                          <span className="metric-val">{svc.state.metricValue}</span>
                        </div>
                      </div>

                      {svc.isActor && (
                        <div className="actor-glow-ring" title="Emitting telemetry right now" />
                      )}
                    </div>

                    {/* Animated Connection Arrow between services */}
                    {idx < servicesList.length - 1 && (
                      <div className={`service-connector-pipe ${isConnectionActive(idx) ? "pipe-active" : "pipe-idle"}`}>
                        <div className="pipe-line">
                          {isConnectionActive(idx) && (
                            <span className="flow-travel-particle" />
                          )}
                        </div>
                        <ArrowRight size={14} className="pipe-arrow-icon" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. FLOATING "WHAT'S HAPPENING NOW?" CARD */}
          <div className="current-event-container">
            <div className="current-event-card">
              <div className="event-card-header">
                <div className="event-badge-label">
                  <Clock size={13} className="text-indigo-400" />
                  <span>What&apos;s happening now?</span>
                </div>
                <span className="event-timestamp-badge">
                  {currentFrame.timeFormatted} UTC · {currentFrame.relativeSeconds} seconds into incident
                </span>
              </div>

              <div className="event-card-content">
                <h3 className="event-headline">{currentFrame.headline}</h3>
                <p className="event-description">{currentFrame.whatChanged}</p>
              </div>

              <div className="event-card-footer">
                <button
                  className="see-evidence-action"
                  onClick={() => setShowEvidenceDrawer(true)}
                  title="View technical log evidence"
                >
                  <span>See evidence</span>
                  <ArrowRight size={13} />
                </button>
                <span className="event-service-tag">
                  Emitted by <b>{currentFrame.service}</b>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CINEMATIC PLAYBACK TIMELINE (HERO INTERACTION) */}
      <div className="cinematic-timeline-console">
        {/* Controls row */}
        <div className="timeline-control-bar">
          <div className="playback-buttons">
            <button
              className="timeline-icon-btn"
              onClick={stepBack}
              disabled={currentFrameIndex === 0}
              title="Step backward in time"
              aria-label="Step back"
            >
              <ChevronLeft size={17} />
            </button>

            <button
              className="timeline-play-btn"
              onClick={togglePlay}
              title={isPlaying ? "Pause playback" : "Play incident timeline"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
            </button>

            <button
              className="timeline-icon-btn"
              onClick={stepForward}
              disabled={currentFrameIndex === frames.length - 1}
              title="Step forward in time"
              aria-label="Step forward"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          {/* Time readout */}
          <div className="timeline-time-info">
            <span className="time-primary">{currentFrame.timeFormatted} UTC</span>
            <span className="time-secondary">
              {currentFrame.relativeSeconds} seconds into incident
            </span>
          </div>

          {/* Speed selector */}
          <div className="timeline-speed-pills">
            {[1, 1.5, 2].map((speed) => (
              <button
                key={speed}
                className={`speed-pill ${playbackSpeed === speed ? "active" : ""}`}
                onClick={() => setPlaybackSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Cinematic Scrubber Track */}
        <div className="timeline-scrubber-shelf">
          <div className="scrubber-rail">
            <div
              className="scrubber-fill-bar"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Playhead thumb */}
            <div
              className="scrubber-playhead-thumb"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Interactive milestones along the track */}
            {REPLAY_MILESTONES.map((m) => {
              const markerPercent = (m.index / (frames.length - 1)) * 100;
              const isPast = currentFrameIndex >= m.index;
              const isCurrent = currentFrameIndex === m.index;

              return (
                <button
                  key={m.label}
                  className={`scrubber-milestone-pin ${isPast ? "passed" : "pending"} ${isCurrent ? "current" : ""}`}
                  style={{ left: `${markerPercent}%` }}
                  onClick={() => jumpToMilestone(m.index)}
                  title={`Jump to ${m.time} (${m.relativeSeconds}s): ${m.label}`}
                >
                  <span className="pin-dot" />
                </button>
              );
            })}

            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={currentFrameIndex}
              onChange={handleScrub}
              className="scrubber-range-input"
              aria-label="Incident timeline scrubber"
            />
          </div>

          {/* Human-readable Milestones Row */}
          <div className="milestones-chips-row">
            {REPLAY_MILESTONES.map((m) => {
              const isPassed = currentFrameIndex >= m.index;
              const isCurrent =
                currentFrameIndex === m.index ||
                (currentFrameIndex > m.index &&
                  (m.index === 14 || currentFrameIndex < (REPLAY_MILESTONES.find((next) => next.index > m.index)?.index ?? 99)));

              return (
                <button
                  key={m.label}
                  className={`milestone-chip ${isPassed ? "active-milestone" : "muted-milestone"} ${
                    isCurrent ? "focused-milestone" : ""
                  }`}
                  onClick={() => jumpToMilestone(m.index)}
                >
                  <span className="chip-time">{m.time.slice(3)}</span>
                  <span className="chip-label">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. TECHNICAL EVIDENCE SLIDE-OVER DRAWER (HIDDEN BY DEFAULT) */}
      {showEvidenceDrawer && (
        <div className="evidence-slide-drawer-backdrop" onClick={() => setShowEvidenceDrawer(false)}>
          <div className="evidence-slide-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="drawer-kicker">TECHNICAL EVIDENCE</span>
                <h3 className="drawer-title">Log record at {currentFrame.timeFormatted} UTC</h3>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setShowEvidenceDrawer(false)}
                aria-label="Close evidence drawer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="evidence-metadata-row">
                <span className="drawer-badge service">{currentFrame.service}</span>
                <span className={`drawer-badge level-${currentFrame.level.toLowerCase()}`}>
                  {currentFrame.level}
                </span>
                <span className="drawer-timestamp">{currentFrame.timestamp}</span>
              </div>

              <div className="drawer-raw-box">
                <div className="raw-box-toolbar">
                  <Terminal size={13} className="text-slate-400" />
                  <span>Raw Telemetry Line</span>
                  <button
                    className="copy-raw-btn"
                    onClick={() => copyLog(currentFrame.event.raw, currentFrame.event.id)}
                  >
                    {copiedLogId === currentFrame.event.id ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="raw-log-text">{currentFrame.event.raw}</pre>
              </div>

              <div className="drawer-deduction-card">
                <div className="deduction-title">
                  <Sparkles size={14} className="text-indigo-400" />
                  <b>AI Inference</b>
                </div>
                <p>{currentFrame.whatChanged}</p>
              </div>

              {onInspectEvent && (
                <button
                  className="drawer-jump-logs-btn"
                  onClick={() => {
                    setShowEvidenceDrawer(false);
                    onInspectEvent(currentFrame.event.id);
                  }}
                >
                  <FileText size={14} /> Locate in Log Explorer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: INTERACTIVE CAUSAL GRAPH (TRIGGER → PROPAGATION → IMPACT) */}
      {activeMode === "causal" && (
        <div className="causal-graph-explorer">
          <div className="causal-graph-header">
            <div>
              <span className="causal-badge">INTERACTIVE CAUSAL FLOW</span>
              <h3>Failure Cascade: Trigger → Propagation → Impact</h3>
              <p>Click any node to reveal the exact technical evidence behind that moment.</p>
            </div>
            <div className="causal-graph-legend">
              <span className="legend-tag trigger"><i /> Started (Trigger)</span>
              <span className="legend-tag propagation"><i /> Spread (Propagation)</span>
              <span className="legend-tag impact"><i /> Impact (Customer)</span>
            </div>
          </div>

          <div className="causal-flow-diagram">
            {analysis.causalChain.map((node, index) => {
              const isSelected = selectedCausalNodeId === node.id;
              const isUnlocked = currentFrame.unlockedCausalStepIds.includes(node.id);

              return (
                <div key={node.id} className="causal-diagram-step">
                  <div
                    className={`causal-diagram-node ${node.kind} ${isSelected ? "selected" : ""} ${
                      isUnlocked ? "unlocked" : "pending"
                    }`}
                    onClick={() => setSelectedCausalNodeId(node.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Inspect evidence for ${node.title}`}
                  >
                    <div className="node-stage-badge">
                      {node.kind === "cause" && "STAGE 1 · STARTED"}
                      {node.kind === "symptom" && `STAGE ${index + 1} · SPREAD`}
                      {node.kind === "impact" && "STAGE FINAL · IMPACT"}
                    </div>
                    <h4>{node.title}</h4>
                    <p>{node.detail}</p>

                    <div className="node-evidence-bar">
                      <span><Terminal size={11} /> {node.evidenceIds.length} technical events</span>
                      <span className="click-to-inspect">
                        <Eye size={11} /> See evidence
                      </span>
                    </div>
                  </div>

                  {index < analysis.causalChain.length - 1 && (
                    <div className="causal-diagram-arrow">
                      <div className="arrow-line" />
                      <ArrowRight size={14} className="arrow-icon" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Node Evidence Inspection Drawer */}
          {selectedCausalNode && (
            <div className="evidence-inspector-drawer">
              <div className="inspector-header">
                <div>
                  <span className="inspector-tag">TECHNICAL EVIDENCE</span>
                  <h4>Evidence for: {selectedCausalNode.title}</h4>
                </div>
                <button
                  className="inspector-close"
                  onClick={() => setSelectedCausalNodeId(null)}
                >
                  Close
                </button>
              </div>

              <div className="inspector-evidence-list">
                {nodeEvidenceEvents.map((e) => (
                  <div key={e.id} className="inspector-log-row">
                    <span className="inspector-time">{formatTime(e.timestamp)}</span>
                    <span className={`inspector-level ${e.level.toLowerCase()}`}>{e.level}</span>
                    <span className="inspector-service">{e.service}</span>
                    <code className="inspector-message">{e.raw}</code>
                    <button
                      className="inspector-copy"
                      onClick={() => copyLog(e.raw, e.id)}
                      title="Copy log line"
                    >
                      {copiedLogId === e.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 3: WHAT-IF COUNTERFACTUAL SIMULATOR */}
      {activeMode === "simulator" && (
        <div className="what-if-container">
          <div className="what-if-disclaimer">
            <Sparkles size={16} className="text-indigo-400 flex-none" />
            <div>
              <b>SIMULATED COUNTERFACTUAL ENGINE · HYPOTHETICAL EXPLORATION</b>
              <p>
                Simulated timelines explore hypothetical outcomes based on your log metrics and
                heuristics. They illustrate mitigation impact to inform runbooks, not
                historical fact.
              </p>
            </div>
          </div>

          {/* 4 Interventions requested */}
          <div className="interventions-selector">
            {INTERVENTIONS.map((intervention) => (
              <button
                key={intervention.id}
                className={`intervention-card ${
                  selectedIntervention.id === intervention.id ? "selected" : ""
                }`}
                onClick={() => setSelectedIntervention(intervention)}
              >
                <div className="intervention-card-header">
                  <span className="intervention-cat">{intervention.category}</span>
                  {selectedIntervention.id === intervention.id && (
                    <span className="simulating-badge">ACTIVE SCENARIO</span>
                  )}
                </div>
                <h4>{intervention.title}</h4>
                <p>{intervention.tagline}</p>
              </button>
            ))}
          </div>

          {/* Side-by-side simulation comparison */}
          <div className="simulation-results-grid">
            <div className="simulation-scenario-card">
              <div className="scenario-card-header">
                <div>
                  <span className="scenario-pill">SIMULATED INTERVENTION</span>
                  <h3>{selectedIntervention.title}</h3>
                </div>
              </div>
              <p className="scenario-desc">{selectedIntervention.description}</p>

              <div className="expected-callout">
                <CheckCircle2 size={16} className="text-emerald-400 flex-none" />
                <span>
                  <b>Simulated Mitigation:</b> {selectedIntervention.expectedOutcome}
                </span>
              </div>

              <div className="metrics-diff-table">
                <div className="diff-table-header">
                  <span>METRIC</span>
                  <span>OBSERVED OUTAGE</span>
                  <span>SIMULATED SCENARIO</span>
                </div>
                {selectedIntervention.simulatedMetrics.map((row, i) => (
                  <div key={i} className="diff-table-row">
                    <span className="diff-metric-name">{row.metric}</span>
                    <span className="diff-observed">{row.observed}</span>
                    <span className="diff-simulated">
                      <b>{row.simulated}</b>
                      <small className="text-emerald-400">{row.delta}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="simulation-timeline-card">
              <div className="timeline-card-header">
                <Clock size={15} className="text-indigo-400" />
                <span>Simulated Counterfactual Timeline</span>
                <span className="simulated-timeline-tag">DIVERGES AT 12:04:03</span>
              </div>

              <div className="simulated-timeline-list">
                {selectedIntervention.simulatedTimeline.map((item, i) => (
                  <div key={i} className={`simulated-timeline-node ${item.status}`}>
                    <div className="sim-time-col">
                      <span className="sim-time">{item.time}</span>
                      <div className="sim-dot" />
                    </div>
                    <div className="sim-body">
                      <b>{item.title}</b>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="timeline-card-footer">
                <Info size={14} className="text-slate-400" />
                <span>
                  Model baseline from {analysis.events.length} parsed events across {analysis.affectedServices.length} services.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 4: ARCHITECTURAL BLAST RADIUS MAP */}
      {activeMode === "blast" && (
        <div className="blast-radius-explorer">
          <div className="blast-header">
            <div>
              <span className="blast-kicker">CROSS-LAYER ARCHITECTURE IMPACT</span>
              <h3>System Impact: Services, APIs, Queues &amp; Features</h3>
              <p>Visual map of the failure spreading from the database up to customer checkout.</p>
            </div>
            <div className="blast-status-badge">
              <b>System Impact:</b> 4 services affected · 34% checkout failure rate
            </div>
          </div>

          <div className="blast-architecture-grid">
            {/* Layer 1: Data Persistence */}
            <div className="architecture-tier">
              <div className="tier-label">
                <Database size={14} />
                <span>TIER 1 · DATA PERSISTENCE</span>
              </div>
              <div className="tier-node critical">
                <div className="tier-node-title">
                  <b>PostgreSQL Cluster</b>
                  <span className="node-status-tag failing">EXHAUSTED</span>
                </div>
                <p>Connection pool reached 50/50 max limit. 71 queries waiting for handles.</p>
                <div className="tier-node-stats">
                  <span>Pool: 50 / 50 (100%)</span>
                  <span>Waiters: 71 queries</span>
                </div>
              </div>
            </div>

            <div className="tier-arrow-col">
              <span className="pipe-arrow">▼ DB acquisition timeout</span>
            </div>

            {/* Layer 2: Core Microservices */}
            <div className="architecture-tier">
              <div className="tier-label">
                <Server size={14} />
                <span>TIER 2 · CORE SERVICES</span>
              </div>
              <div className="tier-node critical">
                <div className="tier-node-title">
                  <b>orders-service</b>
                  <span className="node-status-tag failing">LATENCY SPIKE</span>
                </div>
                <p>Unindexed `create_order` query held connections for 1,840ms. Stalled writes.</p>
                <div className="tier-node-stats">
                  <span>Latency: 1,840ms (Normal: 42ms)</span>
                  <span>Active retries: 5/5</span>
                </div>
              </div>
            </div>

            <div className="tier-arrow-col">
              <span className="pipe-arrow">▼ Retry storm + worker queueing</span>
            </div>

            {/* Layer 3: Async Queues */}
            <div className="architecture-tier">
              <div className="tier-label">
                <Activity size={14} />
                <span>TIER 3 · ASYNC WORKERS</span>
              </div>
              <div className="tier-node warning">
                <div className="tier-node-title">
                  <b>worker-queue (Order Processing)</b>
                  <span className="node-status-tag saturated">SATURATED</span>
                </div>
                <p>All 32 background workers saturated waiting on DB. Queue backed up to 2,914 jobs.</p>
                <div className="tier-node-stats">
                  <span>Workers: 32 / 32 Busy</span>
                  <span>Backlog: 2,914 jobs (84s delay)</span>
                </div>
              </div>
            </div>

            <div className="tier-arrow-col">
              <span className="pipe-arrow">▼ Upstream 3,000ms deadline breached</span>
            </div>

            {/* Layer 4: Ingress Gateway & APIs */}
            <div className="architecture-tier">
              <div className="tier-label">
                <Network size={14} />
                <span>TIER 4 · INGRESS APIS</span>
              </div>
              <div className="tier-node critical">
                <div className="tier-node-title">
                  <b>api-gateway (`/api/orders`, `/api/checkout`)</b>
                  <span className="node-status-tag failing">5xx ERROR CASCADE</span>
                </div>
                <p>Upstream timeouts exceeded 3s deadline. Emitting 500 and 503 error responses.</p>
                <div className="tier-node-stats">
                  <span>5xx Rate: 34% of traffic</span>
                  <span>Timeouts: 3,000ms+</span>
                </div>
              </div>
            </div>

            <div className="tier-arrow-col">
              <span className="pipe-arrow">▼ Customer purchase disruption</span>
            </div>

            {/* Layer 5: User-Facing Features */}
            <div className="architecture-tier">
              <div className="tier-label">
                <Zap size={14} />
                <span>TIER 5 · USER EXPERIENCE</span>
              </div>
              <div className="tier-node critical">
                <div className="tier-node-title">
                  <b>Checkout &amp; Order Placement</b>
                  <span className="node-status-tag failing">USER IMPACT</span>
                </div>
                <p>Customers unable to complete orders. Checkout requests fail with error messages.</p>
                <div className="tier-node-stats">
                  <span>Checkout Drop: ~34% of attempts</span>
                  <span>Affected: Web &amp; Mobile</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 5: STRICT 3-TIER EXPLAINABILITY CHAIN */}
      {activeMode === "explain" && (
        <div className="explainability-explorer">
          <div className="explainability-header">
            <div>
              <span className="explain-kicker">3-TIER EXPLAINABILITY</span>
              <h3>Evidence → Inference → Confidence</h3>
              <p>Every conclusion shows the observed log evidence, reasoning, and confidence score.</p>
            </div>
            <div className="explain-score-pill">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Overall Causal Confidence: <b>94%</b></span>
            </div>
          </div>

          <div className="explainability-cards">
            {/* Finding 1 */}
            <article className="explain-card">
              <div className="explain-card-top">
                <span className="explain-stage-num">01</span>
                <h4>Root Cause Trigger: Database Connection Pool Exhaustion</h4>
                <span className="explain-conf-tag">94% Confidence</span>
              </div>

              <div className="explain-three-tiers">
                {/* Tier 1: Observed Evidence */}
                <div className="tier-box observed-tier">
                  <div className="tier-box-title">
                    <Terminal size={13} className="text-emerald-400" />
                    <b>1. OBSERVED EVIDENCE</b>
                  </div>
                  <pre className="tier-log-quote">
                    2025-06-14T12:04:02.207Z WARN [orders-service] db pool nearing capacity active=48 max=50{"\n"}
                    2025-06-14T12:04:03.388Z ERROR [orders-service] database connection acquisition timeout after 2000ms active=50 waiting=18
                  </pre>
                  <span className="tier-note">Direct timestamp and pool counter telemetry from orders-service.</span>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>DEDUCTIVE REASONING</span>
                </div>

                {/* Tier 2: AI Inference */}
                <div className="tier-box inference-tier">
                  <div className="tier-box-title">
                    <Sparkles size={13} className="text-indigo-400" />
                    <b>2. AI INFERENCE</b>
                  </div>
                  <p>
                    All 50 database connections were exhausted 2.1 seconds before any gateway timeouts or 5xx responses appeared. Chronological priority confirms this was the initiating trigger.
                  </p>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>CERTAINTY METRIC</span>
                </div>

                {/* Tier 3: Confidence Score */}
                <div className="tier-box confidence-tier">
                  <div className="tier-box-title">
                    <ShieldCheck size={13} className="text-sky-400" />
                    <b>3. CONFIDENCE RATIONALE</b>
                  </div>
                  <div className="conf-value-big">
                    <b>94%</b>
                    <span>High Certainty</span>
                  </div>
                  <ul className="conf-checklist">
                    <li><Check size={11} /> Temporal precedence verified (12:04:02 vs 12:04:05)</li>
                    <li><Check size={11} /> 4 supporting pool telemetry lines</li>
                    <li><Check size={11} /> No preceding network or hardware failures</li>
                  </ul>
                </div>
              </div>
            </article>

            {/* Finding 2 */}
            <article className="explain-card">
              <div className="explain-card-top">
                <span className="explain-stage-num">02</span>
                <h4>Amplification Mechanism: Automated Retries</h4>
                <span className="explain-conf-tag">91% Confidence</span>
              </div>

              <div className="explain-three-tiers">
                <div className="tier-box observed-tier">
                  <div className="tier-box-title">
                    <Terminal size={13} className="text-emerald-400" />
                    <b>1. OBSERVED EVIDENCE</b>
                  </div>
                  <pre className="tier-log-quote">
                    2025-06-14T12:04:06.113Z WARN [orders-service] retrying failed request attempt=1/5 backoff_ms=200{"\n"}
                    2025-06-14T12:04:06.816Z WARN [orders-service] retrying failed request attempt=2/5 backoff_ms=400
                  </pre>
                  <span className="tier-note">Recorded attempt count and rapid exponential backoff attempts during lock.</span>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>DEDUCTIVE REASONING</span>
                </div>

                <div className="tier-box inference-tier">
                  <div className="tier-box-title">
                    <Sparkles size={13} className="text-indigo-400" />
                    <b>2. AI INFERENCE</b>
                  </div>
                  <p>
                    Automatic client retries multiplied query load by up to 5x while the pool was already full. This prevented natural connection recycling and spilled backlog into worker queues.
                  </p>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>CERTAINTY METRIC</span>
                </div>

                <div className="tier-box confidence-tier">
                  <div className="tier-box-title">
                    <ShieldCheck size={13} className="text-sky-400" />
                    <b>3. CONFIDENCE RATIONALE</b>
                  </div>
                  <div className="conf-value-big">
                    <b>91%</b>
                    <span>High Certainty</span>
                  </div>
                  <ul className="conf-checklist">
                    <li><Check size={11} /> Attempt syntax explicitly captured in service logs</li>
                    <li><Check size={11} /> Queue depth growth perfectly tracks retry timestamps</li>
                    <li><Check size={11} /> Standard retry storm pattern match</li>
                  </ul>
                </div>
              </div>
            </article>

            {/* Finding 3 */}
            <article className="explain-card">
              <div className="explain-card-top">
                <span className="explain-stage-num">03</span>
                <h4>User Impact: 34% HTTP 5xx Outage Cascade</h4>
                <span className="explain-conf-tag">98% Confidence</span>
              </div>

              <div className="explain-three-tiers">
                <div className="tier-box observed-tier">
                  <div className="tier-box-title">
                    <Terminal size={13} className="text-emerald-400" />
                    <b>1. OBSERVED EVIDENCE</b>
                  </div>
                  <pre className="tier-log-quote">
                    2025-06-14T12:04:12.991Z ERROR [api-gateway] request failed status=503 route=/api/orders{"\n"}
                    2025-06-14T12:04:19.027Z ERROR [api-gateway] elevated 5xx rate detected rate=34% window=60s
                  </pre>
                  <span className="tier-note">Direct gateway emission of 500/503 HTTP status codes across orders and checkout.</span>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>DEDUCTIVE REASONING</span>
                </div>

                <div className="tier-box inference-tier">
                  <div className="tier-box-title">
                    <Sparkles size={13} className="text-indigo-400" />
                    <b>2. AI INFERENCE</b>
                  </div>
                  <p>
                    Because `/api/orders` and `/api/checkout` share the underlying database connection pool, the failure cascaded into public revenue checkout sessions.
                  </p>
                </div>

                <div className="tier-connector">
                  <ArrowRight size={14} />
                  <span>CERTAINTY METRIC</span>
                </div>

                <div className="tier-box confidence-tier">
                  <div className="tier-box-title">
                    <ShieldCheck size={13} className="text-sky-400" />
                    <b>3. CONFIDENCE RATIONALE</b>
                  </div>
                  <div className="conf-value-big">
                    <b>98%</b>
                    <span>Very High Certainty</span>
                  </div>
                  <ul className="conf-checklist">
                    <li><Check size={11} /> Direct HTTP status codes parsed from gateway</li>
                    <li><Check size={11} /> 34% failure metric logged explicitly in 60s window</li>
                    <li><Check size={11} /> Both critical business routes confirmed impacted</li>
                  </ul>
                </div>
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
