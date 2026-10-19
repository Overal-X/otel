import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { startInMemory } from "./helpers/in-memory.mjs";

const { exporter, finishedSpans } = startInMemory();
const { captureException } = await import("@formatio/node");
const tracer = trace.getTracer("test");

beforeEach(() => exporter.reset());

const exceptionEvents = (span) => span.events.filter((e) => e.name === "exception");

test("without an active span it reports on a span named exception", async () => {
  const err = new Error("job failed");
  captureException(err, { "job.name": "nightly" });

  const [span] = await finishedSpans();
  assert.equal(span.name, "exception");
  assert.equal(span.kind, SpanKind.INTERNAL);
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.status.message, "job failed");
  assert.equal(span.attributes["job.name"], "nightly");

  const [event] = exceptionEvents(span);
  assert.equal(event.attributes["exception.type"], "Error");
  assert.equal(event.attributes["exception.message"], "job failed");
  assert.equal(event.attributes["exception.stacktrace"], err.stack);
  assert.equal(event.attributes["exception.escaped"], undefined);
  assert.equal(event.attributes["job.name"], undefined);
});

test("with an active span it records on that span", async () => {
  tracer.startActiveSpan("work", (span) => {
    captureException(new RangeError("out of range"), { "order.id": "42" });
    span.end();
  });

  const spans = await finishedSpans();
  assert.deepEqual(spans.map((s) => s.name), ["work"]);
  const [work] = spans;
  assert.equal(work.status.code, SpanStatusCode.ERROR);
  assert.equal(work.attributes["order.id"], "42");
  assert.equal(exceptionEvents(work)[0].attributes["exception.type"], "RangeError");
});

test("after the active span ended it reports on its own span in the same trace", async () => {
  let parent;
  tracer.startActiveSpan("request", (span) => {
    parent = span;
    span.end();
    captureException("late failure");
  });

  const own = (await finishedSpans()).find((s) => s.name === "exception");
  assert.equal(own.spanContext().traceId, parent.spanContext().traceId);
  assert.equal(exceptionEvents(own)[0].attributes["exception.message"], "late failure");
});
