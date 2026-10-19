package formatio

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func recordSpans(t *testing.T, opts ...sdktrace.TracerProviderOption) *tracetest.InMemoryExporter {
	t.Helper()
	exporter := tracetest.NewInMemoryExporter()
	if opts == nil {
		opts = []sdktrace.TracerProviderOption{sdktrace.WithSyncer(exporter)}
	}
	provider := sdktrace.NewTracerProvider(opts...)
	otel.SetTracerProvider(provider)
	t.Cleanup(func() { _ = provider.Shutdown(context.Background()) })
	return exporter
}

func onlySpan(t *testing.T, exporter *tracetest.InMemoryExporter) tracetest.SpanStub {
	t.Helper()
	spans := exporter.GetSpans()
	if len(spans) != 1 {
		t.Fatalf("got %d spans, want 1", len(spans))
	}
	return spans[0]
}

func exceptionEvent(t *testing.T, span tracetest.SpanStub) map[attribute.Key]attribute.Value {
	t.Helper()
	for _, event := range span.Events {
		if event.Name == "exception" {
			attrs := map[attribute.Key]attribute.Value{}
			for _, kv := range event.Attributes {
				attrs[kv.Key] = kv.Value
			}
			return attrs
		}
	}
	t.Fatalf("span %q has no exception event", span.Name)
	return nil
}

func catchPanic(f func()) (v any) {
	defer func() { v = recover() }()
	f()
	return nil
}

var errPayment = errors.New("card declined")

func TestCaptureErrorOnActiveSpan(t *testing.T) {
	exporter := recordSpans(t)
	ctx, span := otel.Tracer("test").Start(context.Background(), "checkout")
	CaptureError(ctx, errPayment, attribute.String("order.id", "o1"))
	span.End()

	got := onlySpan(t, exporter)
	if got.Name != "checkout" || got.Status.Code != codes.Error {
		t.Errorf("span = %q status %v", got.Name, got.Status.Code)
	}
	if !hasAttr(got.Attributes, "order.id", "o1") {
		t.Errorf("span attributes = %v", got.Attributes)
	}
	event := exceptionEvent(t, got)
	if event["exception.message"].AsString() != "card declined" {
		t.Errorf("event = %v", event)
	}
	if !strings.Contains(event["exception.stacktrace"].AsString(), "TestCaptureErrorOnActiveSpan") {
		t.Error("stack trace does not reach the caller")
	}
}

func TestCaptureErrorWithoutSpan(t *testing.T) {
	exporter := recordSpans(t)
	CaptureError(context.Background(), errPayment)
	CaptureError(context.Background(), nil)

	got := onlySpan(t, exporter)
	if got.Name != "exception" || got.SpanKind != trace.SpanKindInternal || got.Status.Code != codes.Error {
		t.Errorf("span = %q kind %v status %v", got.Name, got.SpanKind, got.Status.Code)
	}
	exceptionEvent(t, got)
}

func TestRecoverRecordsFlushesAndRepanics(t *testing.T) {
	exporter := tracetest.NewInMemoryExporter()
	// A batch that would never export on its own: the span arrives only through Recover's flush.
	recordSpans(t, sdktrace.WithBatcher(exporter, sdktrace.WithBatchTimeout(time.Hour)))

	got := catchPanic(func() {
		defer Recover(context.Background())
		panic("boot failed")
	})
	if got != "boot failed" {
		t.Fatalf("re-panicked with %v", got)
	}

	span := onlySpan(t, exporter)
	if span.Name != "uncaught exception" || span.SpanKind != trace.SpanKindInternal || span.Status.Code != codes.Error {
		t.Errorf("span = %q kind %v status %v", span.Name, span.SpanKind, span.Status.Code)
	}
	event := exceptionEvent(t, span)
	if !event["exception.escaped"].AsBool() || !strings.Contains(event["exception.stacktrace"].AsString(), "capture_test.go") {
		t.Errorf("event = %v", event)
	}
}

func TestRecoverWithoutPanic(t *testing.T) {
	exporter := recordSpans(t)
	func() { defer Recover(context.Background()) }()
	if n := len(exporter.GetSpans()); n != 0 {
		t.Errorf("got %d spans", n)
	}
}

func hasAttr(attrs []attribute.KeyValue, key, want string) bool {
	for _, kv := range attrs {
		if string(kv.Key) == key {
			return kv.Value.AsString() == want
		}
	}
	return false
}
