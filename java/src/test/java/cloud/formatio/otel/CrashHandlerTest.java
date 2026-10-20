package cloud.formatio.otel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.EventData;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class CrashHandlerTest {
  private final InMemorySpanExporter exporter = InMemorySpanExporter.create();
  // Batched, with a delay far beyond the test, so a span is only there if the handler flushed.
  private final SdkTracerProvider tracerProvider =
      SdkTracerProvider.builder()
          .addSpanProcessor(
              BatchSpanProcessor.builder(exporter).setScheduleDelay(java.time.Duration.ofHours(1)).build())
          .build();
  private final ByteArrayOutputStream stderr = new ByteArrayOutputStream();

  @Test
  void recordsTheCrashAndFlushesBeforeTheJvmReportsIt() {
    CrashHandler handler = new CrashHandler(tracerProvider, null, new PrintStream(stderr, true));
    Thread worker = new Thread("worker-1");

    handler.uncaughtException(worker, new IllegalStateException("crash outside a request"));

    List<SpanData> spans = exporter.getFinishedSpanItems();
    assertEquals(1, spans.size());
    SpanData span = spans.get(0);
    assertEquals("uncaught exception", span.getName());
    assertEquals(StatusCode.ERROR, span.getStatus().getStatusCode());
    assertEquals("crash outside a request", span.getStatus().getDescription());
    assertEquals("worker-1", span.getAttributes().get(AttributeKey.stringKey("thread.name")));
    EventData event = span.getEvents().get(0);
    assertEquals("exception", event.getName());
    assertEquals("java.lang.IllegalStateException", event.getAttributes().get(AttributeKey.stringKey("exception.type")));
    assertEquals(true, event.getAttributes().get(AttributeKey.booleanKey("exception.escaped")));

    String printed = new String(stderr.toByteArray(), StandardCharsets.UTF_8);
    assertTrue(printed.startsWith("Exception in thread \"worker-1\" java.lang.IllegalStateException: crash outside a request"), printed);
  }

  @Test
  void handsTheCrashToThePreviousHandlerInsteadOfPrinting() {
    AtomicReference<Throwable> seen = new AtomicReference<>();
    CrashHandler handler = new CrashHandler(tracerProvider, (t, e) -> seen.set(e), new PrintStream(stderr, true));
    RuntimeException crash = new RuntimeException("owned by the app");

    handler.uncaughtException(Thread.currentThread(), crash);

    assertSame(crash, seen.get());
    assertEquals(0, stderr.size());
    assertEquals(1, exporter.getFinishedSpanItems().size());
  }

  @Test
  void aFailureToReportStillLetsTheCrashThrough() {
    tracerProvider.shutdown().join(1, java.util.concurrent.TimeUnit.SECONDS);
    AtomicReference<Throwable> seen = new AtomicReference<>();
    CrashHandler handler = new CrashHandler(tracerProvider, (t, e) -> seen.set(e), new PrintStream(stderr, true));
    Error crash = new OutOfMemoryError("heap");

    handler.uncaughtException(Thread.currentThread(), crash);

    assertSame(crash, seen.get());
  }
}
