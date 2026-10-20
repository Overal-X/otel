import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { childEnv, fixturesDir, runNode } from "./helpers/child.mjs";
import { SpanKind, startReceiver } from "./helpers/otlp-receiver.mjs";

const require = createRequire(import.meta.url);
const { isPackageManager } = require("../dist/package-manager.js");

const receiver = await startReceiver();
after(() => receiver.close());

// Installed as Formatio's build installs it: packed, with dependencies of its own, apart from the
// application's, and preloaded by path.
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const formatioDir = mkdtempSync(join(tmpdir(), "formatio-otel-"));
after(() => rmSync(formatioDir, { recursive: true, force: true }));
execFileSync("npm", ["pack", "--silent", "--pack-destination", formatioDir], { cwd: packageDir });
const tarball = join(formatioDir, readdirSync(formatioDir).find((name) => name.endsWith(".tgz")));
execFileSync("npm", ["install", "--prefix", formatioDir, "--prefer-offline", "--omit=dev", "--no-audit", "--no-fund", "--silent", tarball]);
const preload = join(formatioDir, "node_modules", "@formatio", "otel-node", "dist", "auto.mjs");

const env = (service) =>
  childEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url, OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20t", OTEL_SERVICE_NAME: service });

test("isPackageManager matches package manager CLIs only", () => {
  for (const script of [
    "/mise/installs/node/22.23.3/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npx-cli.js",
    "/usr/local/lib/node_modules/corepack/dist/pnpm.js",
    "/usr/local/lib/node_modules/corepack/dist/yarn.js",
    "/root/.cache/node/corepack/v1/pnpm/9.0.0/bin/pnpm.cjs",
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
  ]) {
    assert.equal(isPackageManager(script), true, script);
  }
  for (const script of [undefined, "/app/server.js", "/app/npm-server.js", "/app/node_modules/next/dist/bin/next"]) {
    assert.equal(isPackageManager(script), false, script);
  }
});

test("--import @formatio/otel-node/auto stays out of a package manager's process", async () => {
  const pm = runNode(["--import", preload, join(fixturesDir, "pm", "npm-cli.js")], env("pm"));
  const [line] = await pm.waitForLine(/pipeline (true|false)/);
  assert.equal(line, "pipeline false");
});

test("an application's own copy of the SDK uses the preloaded pipeline", async (t) => {
  // Outside this package, where its name would resolve to the package itself, and inside the
  // workspace, where the hoisted dependencies resolve.
  const appDir = mkdtempSync(join(packageDir, "..", "..", ".second-copy-"));
  t.after(() => rmSync(appDir, { recursive: true, force: true }));
  const ownCopy = join(appDir, "node_modules", "@formatio", "otel-node");
  cpSync(join(packageDir, "dist"), join(ownCopy, "dist"), { recursive: true });
  cpSync(join(packageDir, "package.json"), join(ownCopy, "package.json"));
  cpSync(join(fixturesDir, "second-copy.cjs"), join(appDir, "app.cjs"));

  const service = "second-copy";
  const app = runNode(["--import", preload, join(appDir, "app.cjs")], env(service));
  t.after(() => app.child.kill());
  const [, port] = await app.waitForLine(/listening (\d+)/);

  assert.equal(await (await fetch(`http://127.0.0.1:${port}/users/7`)).text(), "user 7");
  await receiver.waitForSpan((s) => s.resource.attributes["service.name"] === service && s.kind === SpanKind.SERVER);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/flush`)).text(), "flushed true");
  await receiver.waitForSpan((s) => s.resource.attributes["service.name"] === service && s.name === "GET /flush");

  const users = receiver.spans().filter((s) => s.resource.attributes["service.name"] === service && s.name === "GET /users/:id");
  assert.equal(users.length, 1, "one pipeline, so one span per request");

  await fetch(`http://127.0.0.1:${port}/crash`);
  const exit = await Promise.race([app.exited, new Promise((resolve) => setTimeout(resolve, 8000, "still running"))]);
  assert.deepEqual(exit, { code: 1, signal: null });
  const crashes = receiver.spans().filter((s) => s.resource.attributes["service.name"] === service && s.name === "uncaught exception");
  assert.equal(crashes.length, 1, "one set of crash handlers");
  assert.doesNotMatch(app.output().stderr, /already called/);
});
