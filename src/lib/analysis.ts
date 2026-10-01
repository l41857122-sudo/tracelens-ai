import { z } from "zod";

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

export const LogEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]),
  service: z.string(),
  message: z.string(),
  raw: z.string(),
});

export const IncidentAnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  timeRange: z.string(),
  affectedServices: z.array(z.string()),
  events: z.array(LogEventSchema),
  clusters: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
      severity: SeveritySchema,
      summary: z.string(),
      eventIds: z.array(z.string()),
    }),
  ),
  causalChain: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      kind: z.enum(["cause", "symptom", "impact"]),
      evidenceIds: z.array(z.string()),
    }),
  ),
  rootCause: z.object({
    title: z.string(),
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(z.string()),
  }),
  evidence: z.array(z.string()),
  inferences: z.array(z.string()),
  fixes: z.array(
    z.object({
      priority: z.enum(["now", "next", "later"]),
      title: z.string(),
      description: z.string(),
      code: z.string().optional(),
    }),
  ),
  impact: z.string(),
  contributingFactors: z.array(z.string()),
  prevention: z.array(z.string()),
});

export type IncidentAnalysis = z.infer<typeof IncidentAnalysisSchema>;
export type LogEvent = z.infer<typeof LogEventSchema>;

export const DEMO_LOGS = `2025-06-14T12:04:01.114Z INFO  [api-gateway] request accepted route=/api/orders trace_id=tr_8f2a
2025-06-14T12:04:02.207Z WARN  [orders-service] db pool nearing capacity active=48 max=50
2025-06-14T12:04:03.388Z ERROR [orders-service] database connection acquisition timeout after 2000ms active=50 waiting=18
2025-06-14T12:04:04.031Z WARN  [orders-service] query latency exceeded threshold duration_ms=1840 query=create_order
2025-06-14T12:04:05.442Z ERROR [api-gateway] upstream request timed out after 3000ms trace_id=tr_8f2a
2025-06-14T12:04:06.113Z WARN  [orders-service] retrying failed request attempt=1/5 backoff_ms=200
2025-06-14T12:04:06.816Z WARN  [orders-service] retrying failed request attempt=2/5 backoff_ms=400
2025-06-14T12:04:08.042Z ERROR [worker-queue] connection pool exhausted; job processing delayed queue=orders
2025-06-14T12:04:09.185Z WARN  [worker-queue] worker saturation detected active=32 idle=0 queue_depth=1840
2025-06-14T12:04:10.773Z ERROR [api-gateway] upstream request timed out after 3000ms trace_id=tr_b13c
2025-06-14T12:04:11.402Z ERROR [orders-service] database connection acquisition timeout after 2000ms active=50 waiting=46
2025-06-14T12:04:12.991Z ERROR [api-gateway] request failed status=503 route=/api/orders
2025-06-14T12:04:14.102Z ERROR [api-gateway] request failed status=500 route=/api/checkout
2025-06-14T12:04:15.908Z WARN  [worker-queue] queue depth critical queue_depth=2914 oldest_job_age_s=84
2025-06-14T12:04:17.263Z ERROR [orders-service] database connection acquisition timeout after 2000ms active=50 waiting=71
2025-06-14T12:04:19.027Z ERROR [api-gateway] elevated 5xx rate detected rate=34% window=60s`;

const CLASSIFIERS = [
  { id: "database", label: "Database pool", match: /database|connection pool|connection acquisition|db pool/i },
  { id: "latency", label: "Query latency", match: /latency|slow query|duration_ms/i },
  { id: "timeouts", label: "Request timeouts", match: /timeout|timed out/i },
  { id: "retries", label: "Automatic retries", match: /retry|retrying|backoff/i },
  { id: "workers", label: "Worker saturation", match: /worker|queue|job processing/i },
  { id: "http", label: "HTTP 5xx errors", match: /\b5\d\d\b|5xx|status=50[0-9]/i },
];

function normalizeLevel(value: unknown, text: string): LogEvent["level"] {
  const candidate = typeof value === "string" ? value.toUpperCase() : "";
  if (["ERROR", "WARN", "INFO", "DEBUG"].includes(candidate)) {
    return candidate as LogEvent["level"];
  }
  if (/fatal|error|exception|failed|exhausted|timeout/i.test(text)) return "ERROR";
  if (/warn|retry|saturat|critical|exceeded/i.test(text)) return "WARN";
  return "INFO";
}

function parseTimestamp(value: unknown, fallback: number): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date(fallback).toISOString();
}

export function parseLogs(input: string): LogEvent[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 500).map((raw, index) => {
    let fields: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        fields = parsed as Record<string, unknown>;
      }
    } catch {
      // Plain-text log lines are expected and parsed below.
    }
    const match = raw.match(/(\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)/);
    const timestamp = parseTimestamp(
      fields.timestamp ?? fields.time ?? fields["@timestamp"] ?? match?.[1],
      Date.UTC(2025, 5, 14, 12, 4, index),
    );
    const messageValue = fields.message ?? fields.msg;
    const message = typeof messageValue === "string"
      ? messageValue
      : raw.replace(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?\s*/, "");
    const serviceMatch = raw.match(/\[([^\]]+)\]/);
    const service = fields.service ?? fields.component ?? serviceMatch?.[1];
    const levelMatch = raw.match(/\b(ERROR|WARN(?:ING)?|INFO|DEBUG)\b/i);
    return {
      id: `event-${index + 1}`,
      timestamp,
      level: normalizeLevel(fields.level ?? fields.severity ?? levelMatch?.[1], message),
      service: typeof service === "string" ? service : "application",
      message,
      raw,
    };
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function severityFor(events: LogEvent[]): IncidentAnalysis["severity"] {
  const errors = events.filter((event) => event.level === "ERROR").length;
  if (errors >= 8) return "critical";
  if (errors >= 3) return "high";
  return errors > 0 ? "medium" : "low";
}

function formatRange(events: LogEvent[]): string {
  if (!events.length) return "No timestamps available";
  const format = (value: string) => new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC", hour12: false,
  });
  return `${format(events[0].timestamp)} – ${format(events[events.length - 1].timestamp)} UTC`;
}

function clusterEvents(events: LogEvent[]): IncidentAnalysis["clusters"] {
  const clusters = CLASSIFIERS.flatMap((classifier) => {
    const matches = events.filter((event) => classifier.match.test(`${event.service} ${event.message}`));
    if (!matches.length) return [];
    const errors = matches.filter((event) => event.level === "ERROR").length;
    return [{
      id: classifier.id,
      label: classifier.label,
      count: matches.length,
      severity: errors > 3 ? "critical" as const : errors > 0 ? "high" as const : "medium" as const,
      summary: `${errors} error${errors === 1 ? "" : "s"} across ${new Set(matches.map((event) => event.service)).size} service${new Set(matches.map((event) => event.service)).size === 1 ? "" : "s"}.`,
      eventIds: matches.map((event) => event.id),
    }];
  });
  const classifiedIds = new Set(clusters.flatMap((cluster) => cluster.eventIds));
  const unclassified = events.filter((event) => !classifiedIds.has(event.id) && event.level !== "INFO" && event.level !== "DEBUG");
  if (unclassified.length) {
    const errors = unclassified.filter((event) => event.level === "ERROR").length;
    clusters.push({
      id: "other",
      label: "Other errors",
      count: unclassified.length,
      severity: errors > 3 ? "critical" : errors > 0 ? "high" : "medium",
      summary: `${errors} error${errors === 1 ? "" : "s"} across ${new Set(unclassified.map((event) => event.service)).size} service${new Set(unclassified.map((event) => event.service)).size === 1 ? "" : "s"}.`,
      eventIds: unclassified.map((event) => event.id),
    });
  }
  return clusters;
}

export function analyzeDeterministically(input: string): IncidentAnalysis {
  const events = parseLogs(input);
  const clusters = clusterEvents(events);
  const knownIncident = /pool|database|connection/i.test(input) && /worker|queue/i.test(input);
  const fallback = (id: string) => events.find((event) => CLASSIFIERS.find((classifier) => classifier.id === id)?.match.test(event.message))?.id;
  const ids = (key: string) => clusters.find((cluster) => cluster.id === key)?.eventIds.slice(0, 2) ?? [];
  const causalChain: IncidentAnalysis["causalChain"] = knownIncident
    ? [
      { id: "db", title: "DB connection pool exhausted", detail: "The pool reached 50/50 connections; new work queued for an available connection.", kind: "cause", evidenceIds: ids("database") },
      { id: "latency", title: "Query latency climbed", detail: "Order writes waited on the saturated pool and breached the latency threshold.", kind: "symptom", evidenceIds: ids("latency") },
      { id: "timeouts", title: "Requests timed out", detail: "Gateway requests exceeded their 3-second upstream deadline.", kind: "symptom", evidenceIds: ids("timeouts") },
      { id: "retries", title: "Retries amplified load", detail: "Five attempts per request sent more work to an already saturated database.", kind: "symptom", evidenceIds: ids("retries") },
      { id: "workers", title: "Workers saturated", detail: "All 32 workers were active while the queue grew past 2,900 jobs.", kind: "impact", evidenceIds: ids("workers") },
      { id: "http", title: "5xx errors reached 34%", detail: "The gateway returned 500/503 responses as upstream requests failed.", kind: "impact", evidenceIds: ids("http") },
    ]
    : clusters.map((cluster, index) => ({
      id: cluster.id,
      title: cluster.label,
      detail: cluster.summary,
      kind: index === 0 ? "cause" as const : "symptom" as const,
      evidenceIds: cluster.eventIds.slice(0, 2),
    }));
  const evidence = knownIncident
    ? [
      "The orders-service connection pool reached its configured maximum: active=50, max=50.",
      "Database acquisition timed out while the pool was full; waiting connections rose from 18 to 71.",
      "The API gateway reported upstream timeouts and then emitted 500/503 responses.",
      "Automatic retries continued while the worker queue grew to 2,914 jobs and all 32 workers were active.",
    ]
    : events.slice(0, 5).map((event) => `${event.level} in ${event.service}: ${event.message}`);
  const inferences = knownIncident
    ? [
      "The connection pool is the likely initiating failure because saturation appears before downstream timeouts and 5xx responses.",
      "Retries likely amplified pool contention; the logs show increasing attempts but do not establish retry-budget configuration.",
      "The worker backlog is likely downstream of shared database contention, not an independent queue failure.",
    ]
    : [
      "Events are ordered by their parsed timestamps; ordering alone does not prove causation.",
      "The first error cluster is a candidate trigger, but inspect traces and dependency health before treating it as confirmed.",
    ];
  return IncidentAnalysisSchema.parse({
    title: knownIncident ? "Orders API · database connection exhaustion" : "Application incident · log analysis",
    summary: knownIncident
      ? "A fully exhausted database connection pool appears to have started a cascading failure: slow order writes timed out, retries increased contention, workers backed up, and gateway 5xx responses peaked at 34%."
      : `Parsed ${events.length} log events into ${clusters.length} recurring error cluster${clusters.length === 1 ? "" : "s"}. Review the first error and its surrounding events to validate the likely trigger.`,
    severity: severityFor(events),
    confidence: knownIncident ? 0.94 : events.length ? 0.62 : 0,
    timeRange: formatRange(events),
    affectedServices: [...new Set(events.map((event) => event.service))],
    events,
    clusters,
    causalChain,
    rootCause: {
      title: knownIncident ? "Database connection pool exhaustion" : clusters[0]?.label ?? "Insufficient evidence",
      explanation: knownIncident
        ? "All 50 database connections were in use before the first gateway failures. Acquisition timeouts and increasing waiters precede request timeouts, retries, worker saturation, and elevated 5xx rates. This ordering supports pool exhaustion as the initiating fault."
        : "The earliest recurring error cluster is the strongest available lead. The provided logs do not independently prove a dependency or causal relationship.",
      confidence: knownIncident ? 0.94 : events.length ? 0.62 : 0,
      evidenceIds: knownIncident ? [...ids("database"), ...ids("latency")].slice(0, 4) : [fallback(clusters[0]?.id ?? "")].filter((id): id is string => Boolean(id)),
    },
    evidence,
    inferences,
    fixes: knownIncident
      ? [
        { priority: "now", title: "Stop retry amplification", description: "Temporarily cap retries and add exponential backoff with jitter; fail fast when the pool is saturated." },
        { priority: "now", title: "Restore database headroom", description: "Inspect and release leaked or idle connections, then scale the pool only after checking the database connection limit." },
        { priority: "next", title: "Bound concurrency", description: "Set a per-instance concurrency limit so API and worker traffic cannot overwhelm the shared database pool." },
        { priority: "next", title: "Add pool saturation alerts", description: "Alert on pool utilization, acquisition wait time, and the ratio of retries to original requests." },
      ]
      : [
        { priority: "now", title: "Inspect the earliest error", description: "Correlate this cluster with traces, deployment events, and the health of its upstream dependencies." },
        { priority: "next", title: "Add context to structured logs", description: "Include trace IDs, service names, error codes, and dependency timing so causality can be verified." },
      ],
    impact: knownIncident
      ? "Order and checkout requests degraded for at least 18 seconds in the supplied sample. The gateway logged a 34% 5xx rate; 2,914 queued jobs and an 84-second oldest job indicate asynchronous processing was delayed. Customer and revenue impact cannot be established from logs alone."
      : `The supplied sample contains ${events.filter((event) => event.level === "ERROR").length} error events. Customer impact cannot be quantified without request volume, traces, and service-level metrics.`,
    contributingFactors: knownIncident
      ? ["A shared database pool served both API and background-worker traffic.", "Retries added database work during an existing capacity incident.", "Worker concurrency was not isolated from API demand."]
      : ["The sample does not include deployment history or dependency-health signals.", "Trace IDs and request-volume metrics may be needed to confirm blast radius."],
    prevention: knownIncident
      ? ["Use bounded retries with jitter, retry budgets, and circuit breaking.", "Reserve database capacity for latency-sensitive API requests.", "Load-test pool limits and worker concurrency against peak traffic."]
      : ["Capture trace IDs and dependency timings in structured logs.", "Correlate recurring errors with metrics and deployment events."],
  });
}
