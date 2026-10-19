import assert from "node:assert/strict";
import { after, test } from "node:test";
import { childEnv, runNode } from "./helpers/child.mjs";
import { SpanKind, StatusCode, startReceiver } from "./helpers/otlp-receiver.mjs";

const receiver = await startReceiver();
after(() => receiver.close());

function crash(scenario, nodeArgs = []) {
  const run = runNode(
    [...nodeArgs, "crash.cjs", scenario],
    childEnv({ FORMATIO_ENDPOINT: receiver.url, FORMATIO_TOKEN: "t", OTEL_SERVICE_NAME: `crash-${scenario}-${nodeArgs.join("")}` }),
  );
  return { ...run, service: `crash-${scenario}-${nodeArgs.join("")}` };
}

const crashSpans = (service) =>
  receiver.spans().filter((s) => s.resource.attributes["service.name"] === service && s.name === "uncaught exception");

function assertCrashSpan(span, message) {
  assert.equal(span.kind, SpanKind.INTERNAL);
  assert.equal(span.status.code, StatusCode.ERROR);
  const [event] = span.events;
  assert.equal(event.name, "exception");
  assert.equal(event.attributes["exception.escaped"], true);
  assert.equal(event.attributes["exception.message"], message);
  assert.match(event.attributes["exception.stacktrace"], /crash\.cjs/);
}

test("an uncaught exception is exported, then the process exits 1", async () => {
  const run = crash("uncaught");
  const { code } = await run.exited;
  assert.equal(code, 1);
  assert.match(run.output().stderr, /boom outside any request/);
  const spans = crashSpans(run.service);
  assert.equal(spans.length, 1);
  assertCrashSpan(spans[0], "boom outside any request");
});

test("an unhandled rejection is exported, then the process exits 1", async () => {
  const run = crash("rejection");
  const { code } = await run.exited;
  assert.equal(code, 1);
  assert.match(run.output().stderr, /rejected outside any request/);
  const spans = crashSpans(run.service);
  assert.equal(spans.length, 1);
  assertCrashSpan(spans[0], "rejected outside any request");
});

test("--unhandled-rejections=strict still records once and exits 1", async () => {
  const run = crash("rejection", ["--unhandled-rejections=strict"]);
  const { code, signal } = await run.exited;
  // Node 24 aborts on an async_hooks assertion when the socket of an export started from a
  // strict-mode rejection closes; the span is already out by then. Node 26 exits 1 cleanly.
  if (process.versions.node.startsWith("24.") && signal === "SIGABRT") assert.equal(code, null);
  else assert.equal(code, 1);
  assert.equal(crashSpans(run.service).length, 1);
});

test("--unhandled-rejections=warn records and keeps running", async () => {
  const run = crash("rejection", ["--unhandled-rejections=warn"]);
  assert.equal((await run.exited).code, 0);
  await receiver.waitForSpan((s) => s.resource.attributes["service.name"] === run.service);
  assert.equal(crashSpans(run.service).length, 1);
});

test("with an app-owned uncaughtException listener the app decides and the process lives", async () => {
  const run = crash("owned-uncaught");
  assert.equal((await run.exited).code, 0);
  const { stdout } = run.output();
  assert.match(stdout, /app handled: owned by the app/);
  assert.match(stdout, /still alive/);
  const span = await receiver.waitForSpan((s) => s.resource.attributes["service.name"] === run.service);
  assertCrashSpan(span, "owned by the app");
});

test("an unhandled rejection reaches an app-owned uncaughtException listener, as without the SDK", async () => {
  const run = crash("owned-rejection");
  assert.equal((await run.exited).code, 0);
  const { stdout } = run.output();
  assert.match(stdout, /app handled: rejection the app catches \(unhandledRejection\)/);
  assert.match(stdout, /still alive/);
  await receiver.waitForSpan((s) => s.resource.attributes["service.name"] === run.service);
  assert.equal(crashSpans(run.service).length, 1);
});
