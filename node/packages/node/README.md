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

Express and Fastify answer a thrown error with a 500 but do not record its stack. Add the hook:

```js
import { expressErrorHandler, setupFastifyErrorHandler } from "@formatio/node";

app.use(expressErrorHandler()); // Express: after all routes, before your own error handlers
setupFastifyErrorHandler(fastify); // Fastify
```

Errors with a 4xx `status`/`statusCode` are passed through unrecorded.

`flush(timeoutMs?)` exports pending spans; `shutdown()` flushes and stops the SDK.
