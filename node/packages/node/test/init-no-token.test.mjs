import assert from "node:assert/strict";
import { test } from "node:test";
import { trace } from "@opentelemetry/api";

for (const key of Object.keys(process.env)) {
  if (key.startsWith("OTEL_") || key.startsWith("FORMATIO_")) delete process.env[key];
}
process.env.FORMATIO_ENDPOINT = "http://127.0.0.1:9";

const { init } = await import("@formatio/node");

test("init with an endpoint but no token warns once and starts nothing", () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    init({ serviceName: "x" });
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no token configured/);
  assert.equal(trace.getTracer("t").startSpan("s").isRecording(), false);
});
