import { requestErrorAttributes, type RequestErrorContext, type RequestErrorRequest } from "./attributes";

export type { RequestErrorContext, RequestErrorRequest } from "./attributes";

// @formatio/otel-node is only ever imported dynamically, behind the literal NEXT_RUNTIME check: Next
// compiles instrumentation.ts for the edge runtime too, inlines NEXT_RUNTIME there, and drops
// the dead branch, so the Node-only SDK never reaches the edge bundle.

/** Next's `instrumentation.ts` `register` hook: starts `@formatio/otel-node` in the Node.js runtime. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@formatio/otel-node");
    init();
  }
}

/**
 * Next's `instrumentation.ts` `onRequestError` hook (Next 15+). Records errors from server
 * components, route handlers, server actions and middleware with the route they came from.
 */
export async function onRequestError(
  err: unknown,
  request: Readonly<RequestErrorRequest>,
  context: Readonly<RequestErrorContext>,
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureException } = await import("@formatio/otel-node");
    captureException(err, requestErrorAttributes(request, context));
  }
}
