import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { DEMO_LOGS } from "@/lib/analysis";

test("rejects empty or malformed analysis requests", async () => {
  const response = await POST(new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs: "   " }),
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /at least one log line/i);
});

test("serves structured deterministic analysis without a provider or database", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DATABASE_URL;
  try {
    const response = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: DEMO_LOGS }),
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "demo");
    assert.equal(result.storage, "ephemeral");
    assert.equal(result.analysis.events.length, 16);
    assert.equal(result.analysis.rootCause.title, "Database connection pool exhaustion");
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
