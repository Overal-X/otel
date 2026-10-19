# @formatio/next

Tracing and error tracking for Next.js 15+ apps on [Formatio](https://formatio.cloud), built on
[`@formatio/node`](../node).

```sh
npm i @formatio/next
```

## Setup

Create `instrumentation.ts` at the project root (or in `src/`):

```ts
export { register, onRequestError } from "@formatio/next";
```

`register` starts tracing in the Node.js runtime; the edge runtime is not traced.
`onRequestError` records errors from server components, route handlers, server actions and
middleware with `next.route` and `next.route_type`, on the request's span.

On Formatio, turn **Tracing** on for the application. Elsewhere, set `FORMATIO_ENDPOINT` and
`FORMATIO_TOKEN`.

If the build bundles the SDK into the server, keep it external so its instrumentation can patch
modules at load time:

```js
// next.config.js
module.exports = { serverExternalPackages: ["@formatio/node"] };
```

Errors you handle yourself: `import { captureException } from "@formatio/node"`.
