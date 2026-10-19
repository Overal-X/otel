// Package otelc holds Formatio's rules for OpenTelemetry Go compile-time instrumentation
// (go.opentelemetry.io/otelc). otelc's net/http instrumentation exports a panicking handler as a
// 200 with no exception; these rules record the panic on the request span first.
//
// Formatio adds this package when it builds a Go application with Tracing on. To use it in
// your own build, add it to the module and to otel.instrumentation.go after `otelc setup`:
//
//	go get github.com/overal-x/otel/go/otelc
//	echo '_ "github.com/overal-x/otel/go/otelc"' # inside the import block of otel.instrumentation.go
//
// Nothing imports it from application code.
package otelc

import (
	"net/http"
	_ "unsafe" // go:linkname

	"github.com/overal-x/otel/go/internal/exception"
	"github.com/overal-x/otel/go/internal/zerocode"
	"go.opentelemetry.io/otel/trace"
)

//go:linkname recordPanic net/http.formatioRecordPanic
var recordPanic func(*http.Request, any)

func init() {
	recordPanic = recordRequestPanic
	zerocode.Active = true
}

// recordRequestPanic runs in net/http's deferred recover, before otelc ends the request span;
// net/http re-raises the panic afterwards, so it still logs it and drops the connection.
func recordRequestPanic(r *http.Request, v any) {
	if v == http.ErrAbortHandler {
		return
	}
	exception.RecordPanic(trace.SpanFromContext(r.Context()), v)
}
