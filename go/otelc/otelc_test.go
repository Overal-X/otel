package otelc

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestRecordRequestPanic(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	ctx, span := provider.Tracer("test").Start(t.Context(), "GET /crash")
	r := httptest.NewRequest(http.MethodGet, "/crash", nil).WithContext(ctx)

	recordRequestPanic(r, errors.New("boom"))
	recordRequestPanic(r, http.ErrAbortHandler)
	span.End()

	ended := recorder.Ended()[0]
	if len(ended.Events()) != 1 {
		t.Fatalf("events = %d, want 1 (ErrAbortHandler is not recorded)", len(ended.Events()))
	}
	attrs := map[string]string{}
	for _, a := range ended.Events()[0].Attributes {
		attrs[string(a.Key)] = a.Value.Emit()
	}
	if attrs["exception.type"] != "*errors.errorString" || attrs["exception.message"] != "boom" || attrs["exception.stacktrace"] == "" {
		t.Errorf("exception attributes = %v", attrs)
	}
	if ended.Status().Code != codes.Error {
		t.Errorf("status = %v, want Error", ended.Status())
	}
}

func TestInitMarksTheBuildInstrumented(t *testing.T) {
	if recordPanic == nil {
		t.Fatal("init did not set the net/http hook")
	}
}
