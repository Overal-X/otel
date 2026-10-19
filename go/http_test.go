package formatio

import (
	"context"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

func TestHandlerRecordsPanicAndRepanics(t *testing.T) {
	exporter := recordSpans(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /users/{id}", func(http.ResponseWriter, *http.Request) {
		var users map[string]int
		users["ada"] = 1
	})

	got := catchPanic(func() {
		Handler(mux).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/users/7", nil))
	})
	if _, ok := got.(error); !ok {
		t.Fatalf("re-panicked with %#v, want the runtime error", got)
	}

	span := onlySpan(t, exporter)
	if span.Name != "GET /users/{id}" || span.SpanKind != trace.SpanKindServer || span.Status.Code != codes.Error {
		t.Errorf("span = %q kind %v status %v", span.Name, span.SpanKind, span.Status.Code)
	}
	if !hasAttr(span.Attributes, "http.route", "/users/{id}") {
		t.Errorf("attributes = %v, want http.route", span.Attributes)
	}
	if len(span.Events) != 1 {
		t.Errorf("got %d events, want the one exception", len(span.Events))
	}
	event := exceptionEvent(t, span)
	if event["exception.type"].AsString() != "runtime.plainError" || !event["exception.escaped"].AsBool() ||
		!strings.Contains(event["exception.stacktrace"].AsString(), "http_test.go") {
		t.Errorf("event = %v", event)
	}
}

func TestHandlerLeavesAbortHandlerAlone(t *testing.T) {
	exporter := recordSpans(t)
	h := Handler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }))

	got := catchPanic(func() { h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil)) })
	if got != http.ErrAbortHandler {
		t.Fatalf("re-panicked with %v", got)
	}
	span := onlySpan(t, exporter)
	if len(span.Events) != 0 || span.Status.Code == codes.Error {
		t.Errorf("abort recorded: events %v, status %v", span.Events, span.Status.Code)
	}
}

func TestHandlerNamesSpanByRoute(t *testing.T) {
	exporter := recordSpans(t)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /orders/{id}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusCreated) })

	rec := httptest.NewRecorder()
	Handler(mux).ServeHTTP(rec, httptest.NewRequest("POST", "/orders/9", nil))

	span := onlySpan(t, exporter)
	if rec.Code != http.StatusCreated || span.Name != "POST /orders/{id}" || !hasAttr(span.Attributes, "http.route", "/orders/{id}") {
		t.Errorf("code %d, span %q, attributes %v", rec.Code, span.Name, span.Attributes)
	}
}

func TestTransportPropagatesContext(t *testing.T) {
	exporter := recordSpans(t)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	var traceparent string
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		traceparent = r.Header.Get("traceparent")
	}))
	defer srv.Close()

	req, _ := http.NewRequestWithContext(context.Background(), "GET", srv.URL, nil)
	resp, err := (&http.Client{Transport: Transport(nil)}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	span := onlySpan(t, exporter)
	if span.SpanKind != trace.SpanKindClient || !strings.Contains(traceparent, span.SpanContext.TraceID().String()) {
		t.Errorf("kind %v, traceparent %q", span.SpanKind, traceparent)
	}
}

func TestHandlerPanicKeepsNetHTTPBehaviour(t *testing.T) {
	recordSpans(t)
	crash := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })
	for name, h := range map[string]http.Handler{"plain": crash, "wrapped": Handler(crash)} {
		srv := httptest.NewUnstartedServer(h)
		srv.Config.ErrorLog = log.New(io.Discard, "", 0)
		srv.Start()
		_, err := http.Get(srv.URL)
		srv.Close()
		if err == nil {
			t.Errorf("%s: got a response, want the connection dropped", name)
		}
	}
}
