import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import { metrics, trace } from "@opentelemetry/api";
import { SpanKind, startReceiver } from "./helpers/otlp-receiver.mjs";

const require = createRequire(import.meta.url);
const { logs } = require("@opentelemetry/api-logs");
const { version } = require("../package.json");

const receiver = await startReceiver();
after(() => receiver.close());

for (const key of Object.keys(process.env)) {
  if (key.startsWith("OTEL_")) delete process.env[key];
}
Object.assign(process.env, {
  OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url,
  OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20secret-token",
  OTEL_SERVICE_NAME: "wire-test",
  // None of these may change what is exported or start another pipeline.
  OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/json",
  OTEL_METRICS_EXPORTER: "otlp",
  OTEL_LOGS_EXPORTER: "otlp",
});

const { init, flush, shutdown, captureException } = await import("@formatio/otel-node");
init();
after(() => shutdown());

test("spans reach the intake as OTLP/HTTP protobuf with the token and distro attributes", async () => {
  trace.getTracer("wire").startActiveSpan("checkout", (span) => {
    captureException(new Error("card declined"));
    span.end();
  });
  assert.equal(await flush(), true);

  const span = await receiver.waitForSpan((s) => s.name === "checkout");
  assert.ok(receiver.requests.length > 0);
  for (const request of receiver.requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/v1/traces");
    assert.equal(request.headers["content-type"], "application/x-protobuf");
    assert.equal(request.headers.authorization, "Bearer secret-token");
  }
  assert.equal(span.kind, SpanKind.INTERNAL);
  assert.equal(span.resource.attributes["telemetry.distro.name"], "formatio");
  assert.equal(span.resource.attributes["telemetry.distro.version"], version);
  assert.equal(span.resource.attributes["service.name"], "wire-test");
  assert.equal(span.events[0].attributes["exception.message"], "card declined");
});

test("no metric or log pipeline is started whatever OTEL_*_EXPORTER says", () => {
  assert.equal(metrics.getMeterProvider().constructor.name, "NoopMeterProvider");
  // The logs API hands out a proxy until a provider registers; its delegate shows whether one did.
  assert.equal(logs.getLoggerProvider()._getDelegate().constructor.name, "NoopLoggerProvider");
  assert.deepEqual([...new Set(receiver.requests.map((r) => r.path))], ["/v1/traces"]);
});
