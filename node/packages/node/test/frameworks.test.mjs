import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, beforeEach, test } from "node:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { startInMemory } from "./helpers/in-memory.mjs";

const { require, waitForSpan, exporter } = startInMemory();
const { expressErrorHandler, setupFastifyErrorHandler } = await import("@formatio/node");

// Required only after tracing started, as with --require: that is when they get patched.
const express = require("express");
const fastify = require("fastify");

const servers = [];
beforeEach(() => exporter.reset());
after(() => Promise.all(servers.map((close) => close())));

const serverSpan = (route) => (s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === route;
const exceptionEvent = (span) => span.events.find((e) => e.name === "exception");

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("expressErrorHandler records the stack on the request's span", async () => {
  const app = express();
  app.get("/orders/:id", (_req, _res, next) => {
    setImmediate(() => next(new Error("database unavailable")));
  });
  app.get("/missing", () => {
    throw Object.assign(new Error("no such thing"), { status: 404 });
  });
  app.use(expressErrorHandler());
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).send("failed"));
  const base = await listen(createServer(app));

  assert.equal((await fetch(`${base}/orders/7`)).status, 500);
  const span = await waitForSpan(serverSpan("/orders/:id"));
  const event = exceptionEvent(span);
  assert.ok(event, "server span has an exception event");
  assert.equal(event.attributes["exception.message"], "database unavailable");
  assert.match(event.attributes["exception.stacktrace"], /database unavailable\n\s+at /);
  assert.equal(span.status.code, SpanStatusCode.ERROR);

  assert.equal((await fetch(`${base}/missing`)).status, 404);
  const missing = await waitForSpan(serverSpan("/missing"));
  assert.equal(exceptionEvent(missing), undefined, "4xx errors are not recorded on the server span");
});

test("setupFastifyErrorHandler records the stack on the request's span", async () => {
  const app = fastify();
  setupFastifyErrorHandler(app);
  app.get("/reports", async () => {
    throw new Error("report renderer crashed");
  });
  app.get("/invalid", async () => {
    throw Object.assign(new Error("bad query"), { statusCode: 400 });
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  servers.push(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;

  assert.equal((await fetch(`${base}/reports`)).status, 500);
  const span = await waitForSpan((s) => s.kind === SpanKind.SERVER && s.name.startsWith("GET") && exceptionEvent(s));
  assert.equal(exceptionEvent(span).attributes["exception.message"], "report renderer crashed");
  assert.match(exceptionEvent(span).attributes["exception.stacktrace"], /report renderer crashed\n\s+at /);

  assert.equal((await fetch(`${base}/invalid`)).status, 400);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const recorded = exporter.getFinishedSpans().flatMap((s) => s.events).filter((e) => e.name === "exception");
  assert.deepEqual(recorded.map((e) => e.attributes["exception.message"]), ["report renderer crashed"]);
});
