# @formatio/node

Tracing and error tracking for Node.js apps on [Formatio](https://formatio.cloud). A thin
distribution of the OpenTelemetry Node SDK: it emits standard OTLP traces, nothing else.

```sh
npm i @formatio/node
```

## Setup

On Formatio, turn **Tracing** on for the application; the endpoint and token are injected.
Elsewhere, set `FORMATIO_ENDPOINT` (shown on the Tracing card) and `FORMATIO_TOKEN`. The standard
`OTEL_EXPORTER_OTLP_*` variables take precedence over both.

**ES modules** — preload the SDK. It must run before your app's `import`s, which are all loaded
before any of your code runs:

```sh
node --import @formatio/node/register server.js
# or: NODE_OPTIONS="--import @formatio/node/register"
```

**CommonJS** — preload it the same way with `--require`, or call `init()` on the first line:

```sh
node --require @formatio/node/register server.js
```

```js
require("@formatio/node").init(); // before anything else is required
```

`init({ endpoint, token, serviceName })` options override the environment. With no endpoint or
token, `init()` logs one warning and leaves tracing off; it never throws.

## Errors

Uncaught exceptions and unhandled rejections are reported on a span named `uncaught exception`,
flushed (2 s at most), and the process then exits with code 1 as Node would. If your app has its
own `uncaughtException` / `unhandledRejection` listener, the error is reported and your listener
decides what happens. `--unhandled-rejections` modes are respected.

Report errors you handle yourself:

```js
import { captureException } from "@formatio/node";

captureException(err, { "job.name": "nightly-sync" });
```

Fastify answers a thrown error with a 500 without recording it. Add its hook:

```js
import { setupFastifyErrorHandler } from "@formatio/node";

setupFastifyErrorHandler(fastify);
```

Express errors are recorded with their stack by the Express instrumentation already.
`app.use(expressErrorHandler())`, after all routes and before your own error handlers, also
records the error on the request's own span; it is optional.

Errors with a 4xx `status`/`statusCode`, such as a thrown `NotFound`, are never recorded, by
these hooks or by any instrumentation.

`flush(timeoutMs?)` exports pending spans; `shutdown()` flushes and stops the SDK.
