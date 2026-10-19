import { context, type Attributes, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { getRPCMetadata } from "@opentelemetry/core";
import { exceptionAttributes, statusMessage } from "./exception";
import { VERSION } from "./version";

const tracer = () => trace.getTracer("@formatio/otel-node", VERSION);

/**
 * Records an error on the active span and marks it failed. With no span in progress — a
 * background job, or after the request ended — it is reported on a span of its own named
 * `exception`, so it still forms an error group.
 */
export function captureException(err: unknown, attributes?: Attributes): void {
  const active = trace.getActiveSpan();
  if (active?.isRecording()) {
    recordException(active, err, attributes);
    return;
  }
  reportOnOwnSpan("exception", err, attributes);
}

/**
 * Records on the request's SERVER span rather than the innermost one, which inside an error
 * middleware is the middleware's own INTERNAL span.
 */
export function captureRequestException(err: unknown): void {
  const span = getRPCMetadata(context.active())?.span;
  if (span?.isRecording()) recordException(span, err);
  else captureException(err);
}

export function reportOnOwnSpan(
  name: string,
  err: unknown,
  attributes?: Attributes,
  escaped = false,
): void {
  const span = tracer().startSpan(name, { kind: SpanKind.INTERNAL, attributes });
  recordException(span, err, undefined, escaped);
  span.end();
}

function recordException(span: Span, err: unknown, attributes?: Attributes, escaped = false): void {
  if (attributes) span.setAttributes(attributes);
  span.addEvent("exception", exceptionAttributes(err, escaped));
  span.setStatus({ code: SpanStatusCode.ERROR, message: statusMessage(err) });
}
