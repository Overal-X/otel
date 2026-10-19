import assert from "node:assert/strict";
import { after, test } from "node:test";
import { childEnv, runNode } from "./helpers/child.mjs";
import { SpanKind, startReceiver } from "./helpers/otlp-receiver.mjs";

const receiver = await startReceiver();
after(() => receiver.close());

for (const [flag, fixture] of [
  ["--import", "express-app.mjs"],
  ["--require", "express-app.cjs"],
]) {
  test(`${flag} @formatio/otel-node/register instruments an Express app (${fixture})`, async (t) => {
    const app = runNode(
      [flag, "@formatio/otel-node/register", fixture],
      childEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url, OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20t", OTEL_SERVICE_NAME: fixture }),
    );
    t.after(() => app.child.kill());
    const [, port] = await app.waitForLine(/listening (\d+)/);

    assert.equal(await (await fetch(`http://127.0.0.1:${port}/users/42`)).text(), "user 42");

    const span = await receiver.waitForSpan(
      (s) => s.resource.attributes["service.name"] === fixture && s.kind === SpanKind.SERVER,
    );
    assert.equal(span.name, "GET /users/:id");
    assert.equal(span.attributes["http.route"], "/users/:id");
    assert.ok(
      receiver.spans().some((s) => s.resource.attributes["service.name"] === fixture && s.scope.name === "@opentelemetry/instrumentation-express"),
      "express itself is instrumented, not only http",
    );
  });
}
