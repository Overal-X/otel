package cloud.formatio.otel;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import java.io.PrintStream;
import java.util.concurrent.TimeUnit;

/**
 * Records an uncaught exception on a span named {@code uncaught exception}, as the other Formatio
 * SDKs do, and waits up to two seconds for it to be exported before the crash takes its usual
 * course: the previous default handler, or the JVM's own report.
 */
final class CrashHandler implements Thread.UncaughtExceptionHandler {
  static final long FLUSH_TIMEOUT_SECONDS = 2;

  private static final Attributes ESCAPED =
      Attributes.of(AttributeKey.booleanKey("exception.escaped"), true);

  private final SdkTracerProvider tracerProvider;
  private final Tracer tracer;
  private final Thread.UncaughtExceptionHandler previous;
  private final PrintStream err;

  CrashHandler(SdkTracerProvider tracerProvider, Thread.UncaughtExceptionHandler previous) {
    this(tracerProvider, previous, System.err);
  }

  CrashHandler(SdkTracerProvider tracerProvider, Thread.UncaughtExceptionHandler previous, PrintStream err) {
    this.tracerProvider = tracerProvider;
    this.tracer = tracerProvider.get("cloud.formatio.otel");
    this.previous = previous;
    this.err = err;
  }

  @Override
  public void uncaughtException(Thread thread, Throwable error) {
    try {
      report(thread, error);
    } catch (Throwable ignored) {
      // Reporting must never replace the crash being reported.
    }
    if (previous != null) {
      previous.uncaughtException(thread, error);
      return;
    }
    // What ThreadGroup.uncaughtException prints; calling it would come back here, since it
    // defers to the default handler.
    err.print("Exception in thread \"" + thread.getName() + "\" ");
    error.printStackTrace(err);
  }

  private void report(Thread thread, Throwable error) {
    Span span =
        tracer
            .spanBuilder("uncaught exception")
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("thread.name", thread.getName())
            .startSpan();
    span.recordException(error, ESCAPED);
    span.setStatus(StatusCode.ERROR, error.getMessage() != null ? error.getMessage() : error.getClass().getName());
    span.end();
    tracerProvider.forceFlush().join(FLUSH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
  }
}
