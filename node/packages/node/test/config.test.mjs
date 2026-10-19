import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { resolveConfig, parseHeaders } = require("../dist/config.js");

const auth = { FORMATIO_TOKEN: "tok" };

test("endpoint precedence", async (t) => {
  const cases = [
    {
      name: "option wins over every env and is a base URL",
      options: { endpoint: "https://opt.example" },
      env: { ...auth, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://t.example/x", OTEL_EXPORTER_OTLP_ENDPOINT: "https://o.example", FORMATIO_ENDPOINT: "https://f.example" },
      url: "https://opt.example/v1/traces",
    },
    {
      name: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is used as-is",
      env: { ...auth, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://t.example/custom", OTEL_EXPORTER_OTLP_ENDPOINT: "https://o.example" },
      url: "https://t.example/custom",
    },
    {
      name: "OTEL_EXPORTER_OTLP_ENDPOINT gains /v1/traces",
      env: { ...auth, OTEL_EXPORTER_OTLP_ENDPOINT: "https://o.example/", FORMATIO_ENDPOINT: "https://f.example" },
      url: "https://o.example/v1/traces",
    },
    {
      name: "FORMATIO_ENDPOINT gains /v1/traces",
      env: { ...auth, FORMATIO_ENDPOINT: "https://f.example/otlp" },
      url: "https://f.example/otlp/v1/traces",
    },
    {
      name: "a base that already ends in /v1/traces is not doubled, trailing slash or not",
      env: { ...auth, OTEL_EXPORTER_OTLP_ENDPOINT: "https://x/otlp/v1/traces/" },
      url: "https://x/otlp/v1/traces",
    },
    {
      name: "an option that already ends in /v1/traces is not doubled",
      options: { endpoint: "https://opt.example/v1/traces" },
      env: auth,
      url: "https://opt.example/v1/traces",
    },
    {
      name: "FORMATIO_ENDPOINT with trailing slashes",
      env: { ...auth, FORMATIO_ENDPOINT: "https://f.example/otlp//" },
      url: "https://f.example/otlp/v1/traces",
    },
    {
      name: "empty variables count as unset",
      env: { ...auth, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "", OTEL_EXPORTER_OTLP_ENDPOINT: "", FORMATIO_ENDPOINT: "https://f.example" },
      url: "https://f.example/v1/traces",
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.equal(resolveConfig(c.options ?? {}, c.env).config.url, c.url);
    });
  }
});

test("auth precedence", async (t) => {
  const endpoint = { FORMATIO_ENDPOINT: "https://f.example" };
  const cases = [
    {
      name: "token option wins over env headers",
      options: { token: "opt" },
      env: { ...endpoint, OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20env", FORMATIO_TOKEN: "f" },
      headers: { authorization: "Bearer opt" },
    },
    {
      name: "traces headers win over generic headers",
      env: { ...endpoint, OTEL_EXPORTER_OTLP_TRACES_HEADERS: "authorization=Bearer%20traces", OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20all" },
      headers: { authorization: "Bearer traces" },
    },
    {
      name: "generic headers are URL-decoded and win over FORMATIO_TOKEN",
      env: { ...endpoint, OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer%20abc, x-extra = 1", FORMATIO_TOKEN: "f" },
      headers: { authorization: "Bearer abc", "x-extra": "1" },
    },
    {
      name: "FORMATIO_TOKEN becomes a bearer header",
      env: { ...endpoint, FORMATIO_TOKEN: "f" },
      headers: { authorization: "Bearer f" },
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(resolveConfig(c.options ?? {}, c.env).config.headers, c.headers);
    });
  }
});

test("nothing to export to", () => {
  assert.deepEqual(resolveConfig({}, {}), { missing: "endpoint" });
  assert.deepEqual(resolveConfig({ token: "t" }, { FORMATIO_TOKEN: "t" }), { missing: "endpoint" });
});

test("an endpoint without an authorization header is not enough", () => {
  assert.deepEqual(resolveConfig({}, { FORMATIO_ENDPOINT: "https://f.example" }), { missing: "token" });
  assert.deepEqual(
    resolveConfig({}, { FORMATIO_ENDPOINT: "https://f.example", OTEL_EXPORTER_OTLP_HEADERS: "x-other=1" }),
    { missing: "token" },
  );
});

test("serviceName option is passed through", () => {
  assert.equal(resolveConfig({ serviceName: "api" }, { FORMATIO_ENDPOINT: "https://f", FORMATIO_TOKEN: "t" }).config.serviceName, "api");
});

test("parseHeaders ignores malformed pairs", () => {
  assert.deepEqual(parseHeaders("=x,novalue,a=b=c,bad=%E0%A4%A"), { a: "b=c", bad: "%E0%A4%A" });
});
