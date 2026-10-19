import type { Context, Exception, HrTime } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { isServerError, withMessage } from "./exception";

/**
 * Applies the SDK's exception rules to what instrumentations record. They all go through
 * `span.recordException`, and Express's records every error a handler passes on, 4xx included,
 * on each layer span it crosses, so skipping 4xx in our own error hooks alone changes nothing.
 */
export class ExceptionFilter implements SpanProcessor {
  onStart(span: Span, _parentContext: Context): void {
    const record = span.recordException.bind(span);
    span.recordException = (exception: Exception, time?: HrTime) => {
      if (isServerError(exception)) record(withMessage(exception) as Exception, time);
    };
  }

  onEnd(_span: ReadableSpan): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
