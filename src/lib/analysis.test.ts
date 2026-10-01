import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDeterministically, DEMO_LOGS, parseLogs } from "./analysis";

test("parses the demo logs and preserves chronological order", () => {
  const events = parseLogs(DEMO_LOGS);
  assert.equal(events.length, 16);
  assert.equal(events[0].service, "api-gateway");
  assert.ok(events.every((event, index) => index === 0 || Date.parse(events[index - 1].timestamp) <= Date.parse(event.timestamp)));
});

test("builds the expected database-to-5xx causal chain without an API key", () => {
  const analysis = analyzeDeterministically(DEMO_LOGS);
  assert.equal(analysis.severity, "critical");
  assert.equal(analysis.rootCause.title, "Database connection pool exhaustion");
  assert.deepEqual(
    analysis.causalChain.map((node) => node.title),
    [
      "DB connection pool exhausted",
      "Query latency climbed",
      "Requests timed out",
      "Retries amplified load",
      "Workers saturated",
      "5xx errors reached 34%",
    ],
  );
  assert.ok(analysis.evidence.some((item) => item.includes("active=50")));
  assert.ok(analysis.inferences.some((item) => item.includes("likely")));
  assert.equal(analysis.fixes[0].priority, "now");
});

test("parses JSON and plain-text formats and avoids unrelated demo conclusions", () => {
  const input = [
    '{"timestamp":"2025-06-14T12:00:00Z","level":"ERROR","service":"payments","message":"charge declined"}',
    "2025-06-14T12:00:01Z WARN [payments] upstream slow",
  ].join("\n");
  const events = parseLogs(input);
  assert.equal(events.length, 2);
  assert.equal(events[0].service, "payments");
  assert.equal(events[0].message, "charge declined");
  const analysis = analyzeDeterministically(input);
  assert.equal(analysis.title, "Application incident · log analysis");
  assert.equal(analysis.causalChain[0].kind, "cause");
});

test("empty logs return a valid empty deterministic analysis", () => {
  const analysis = analyzeDeterministically("");
  assert.equal(analysis.events.length, 0);
  assert.equal(analysis.severity, "low");
  assert.equal(analysis.rootCause.confidence, 0);
});
