# @formatio/otel-next

Tracing and error tracking for Next.js 15+ apps on [Formatio](https://formatio.cloud), built on
[`@formatio/otel-node`](../node).

Releases are on [GitHub](https://github.com/overal-x/otel/releases), not the npm registry. Installing the tarball by its URL also
installs the `@formatio/otel-node` released with it:

```sh
npm i https://github.com/overal-x/otel/releases/download/node/v0.1.0/formatio-otel-next-0.1.0.tgz
```

## Setup

Create `instrumentation.ts` at the project root (or in `src/`):

```ts
export { register, onRequestError } from "@formatio/otel-next";
```

`register` starts tracing in the Node.js runtime; the edge runtime is not traced.
`onRequestError` records errors from server components, route handlers, server actions and
middleware with `next.route` and `next.route_type`, on the request's span.

On Formatio, turn **Tracing** on for the application. Elsewhere, set
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` as in
[`@formatio/otel-node`](../node#setup).

If the build bundles the SDK into the server, keep it external so its instrumentation can patch
modules at load time:

```js
// next.config.js
module.exports = { serverExternalPackages: ["@formatio/otel-node"] };
```

Errors you handle yourself: `import { captureException } from "@formatio/otel-node"`.
