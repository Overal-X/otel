import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { exceptionAttributes, isServerError, statusMessage } = require("../dist/exception.js");
const { unhandledRejectionsMode } = require("../dist/node-flags.js");

test("exceptionAttributes matches recordException for errors", () => {
  const err = new TypeError("bad input");
  assert.deepEqual(exceptionAttributes(err), {
    "exception.type": "TypeError",
    "exception.message": "bad input",
    "exception.stacktrace": err.stack,
  });
  const coded = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
  assert.equal(exceptionAttributes(coded)["exception.type"], "ECONNREFUSED");
});

test("exceptionAttributes sets escaped only when asked", () => {
  assert.equal(exceptionAttributes(new Error("x"))["exception.escaped"], undefined);
  assert.equal(exceptionAttributes(new Error("x"), true)["exception.escaped"], true);
});

test("exceptionAttributes keeps the whole stack", () => {
  const err = new Error("deep");
  err.stack = `Error: deep\n${"    at frame (file.js:1:1)\n".repeat(500)}`;
  assert.equal(exceptionAttributes(err, true)["exception.stacktrace"], err.stack);
});

test("exceptionAttributes gives non-errors a message", () => {
  assert.deepEqual(exceptionAttributes("plain"), { "exception.message": "plain" });
  assert.deepEqual(exceptionAttributes(42), { "exception.message": "42" });
  assert.deepEqual(exceptionAttributes({ reason: "x" }), { "exception.message": "{ reason: 'x' }" });
  assert.equal(statusMessage(undefined), "undefined");
});

test("isServerError skips 4xx only", () => {
  assert.equal(isServerError(new Error("x")), true);
  assert.equal(isServerError(Object.assign(new Error("x"), { status: 404 })), false);
  assert.equal(isServerError(Object.assign(new Error("x"), { statusCode: 422 })), false);
  assert.equal(isServerError(Object.assign(new Error("x"), { status: 503 })), true);
  assert.equal(isServerError(Object.assign(new Error("x"), { status: 302 })), true);
  assert.equal(isServerError("string"), true);
});

test("unhandledRejectionsMode", () => {
  assert.equal(unhandledRejectionsMode([]), "throw");
  assert.equal(unhandledRejectionsMode(["--unhandled-rejections=warn"]), "warn");
  assert.equal(unhandledRejectionsMode(["--unhandled-rejections", "strict"]), "strict");
  assert.equal(unhandledRejectionsMode([], "--max-old-space-size=100 --unhandled-rejections=none"), "none");
  assert.equal(unhandledRejectionsMode(["--unhandled-rejections=strict"], "--unhandled-rejections=warn"), "strict");
  assert.equal(unhandledRejectionsMode(["--unhandled-rejections=bogus"]), "throw");
});
