import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
import { SpanStatusCode, trace } from "@opentelemetry/api";

for (const key of Object.keys(process.env)) {
  if (key.startsWith("OTEL_") || key.startsWith("FORMATIO_")) delete process.env[key];
}

// Tracing goes to an in-memory exporter through @formatio/otel-node's internal module, outside its
// public exports.
const require = createRequire(import.meta.url);
const { InMemorySpanExporter, SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { startTracing, flushTracing } = require("../../node/dist/sdk.js");
const exporter = new InMemorySpanExporter();
startTracing(new SimpleSpanProcessor(exporter));

const { register, onRequestError } = await import("@formatio/otel-next");

async function finishedSpans() {
  await flushTracing(2000);
  return exporter.getFinishedSpans();
}

async function warningsDuring(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

// Shapes Next 15 passes to onRequestError.
const request = { path: "/dashboard?tab=2", method: "GET", headers: { host: "example.com" } };
const renderContext = { routerKind: "App Router", routePath: "/dashboard", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined };
const actionContext = { routerKind: "App Router", routePath: "/settings", routeType: "action", revalidateReason: undefined };

beforeEach(() => exporter.reset());

test("in the edge runtime both hooks do nothing", async () => {
  process.env.NEXT_RUNTIME = "edge";
  const warnings = await warningsDuring(async () => {
    await register();
    await onRequestError(new Error("edge"), request, renderContext);
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(await finishedSpans(), []);
});

test("register starts @formatio/otel-node in the Node.js runtime", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  const warnings = await warningsDuring(() => register());
  // Nothing is configured here, so init's one warning is the proof that it ran.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[formatio\] no endpoint configured/);
});

test("onRequestError without an active span reports on its own span with the route", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  const err = new Error("server component failed");
  await onRequestError(err, request, renderContext);

  const [span] = await finishedSpans();
  assert.equal(span.name, "exception");
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.deepEqual(span.attributes, {
    "next.route": "/dashboard",
    "next.route_type": "render",
    "http.request.method": "GET",
    "url.path": "/dashboard?tab=2",
  });
  const [event] = span.events;
  assert.equal(event.name, "exception");
  assert.equal(event.attributes["exception.stacktrace"], err.stack);
});

test("onRequestError records on the active span when there is one", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  await trace.getTracer("next").startActiveSpan("POST /settings", async (span) => {
    await onRequestError(new Error("action failed"), { path: "/settings", method: "POST", headers: {} }, actionContext);
    span.end();
  });

  const spans = await finishedSpans();
  assert.deepEqual(spans.map((s) => s.name), ["POST /settings"]);
  assert.equal(spans[0].attributes["next.route"], "/settings");
  assert.equal(spans[0].attributes["next.route_type"], "action");
  assert.equal(spans[0].attributes["http.request.method"], "POST");
  assert.equal(spans[0].events[0].attributes["exception.message"], "action failed");
});
