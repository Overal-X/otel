import assert from "node:assert/strict";
import { test } from "node:test";
import { trace } from "@opentelemetry/api";

for (const key of Object.keys(process.env)) {
  if (key.startsWith("OTEL_") || key.startsWith("FORMATIO_")) delete process.env[key];
}

const { init, captureException, flush, shutdown } = await import("@formatio/node");

function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test("init with nothing configured warns once, starts nothing and never throws", async () => {
  const listenersBefore = process.listenerCount("uncaughtException") + process.listenerCount("unhandledRejection");

  const warnings = captureWarnings(() => init());
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no endpoint configured/);

  assert.equal(trace.getTracer("t").startSpan("s").isRecording(), false);
  assert.equal(process.listenerCount("uncaughtException") + process.listenerCount("unhandledRejection"), listenersBefore);
  assert.doesNotThrow(() => captureException(new Error("no-op")));
  assert.equal(await flush(), true);
  await shutdown();
});

test("a second init warns and does nothing", () => {
  process.env.FORMATIO_ENDPOINT = "http://127.0.0.1:9";
  process.env.FORMATIO_TOKEN = "t";
  const warnings = captureWarnings(() => init());
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /already called/);
  assert.equal(trace.getTracer("t").startSpan("s").isRecording(), false);
});
