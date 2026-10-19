// Package exception records panics the way every Formatio Go entry point does, so a panic in a
// handler, in Recover or in an otelc-instrumented server lands in Errors with the same name.
package exception

import (
	"fmt"
	"reflect"
	"runtime/debug"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

// RecordPanic writes the exception event the OTel SDK adds to a span ended mid-panic, with the
// same type and message, plus the stack trace and exception.escaped the SDK leaves out.
func RecordPanic(span trace.Span, v any) {
	message := fmt.Sprint(v)
	span.AddEvent(semconv.ExceptionEventName, trace.WithAttributes(
		semconv.ExceptionType(Type(v)),
		semconv.ExceptionMessage(message),
		semconv.ExceptionStacktrace(string(debug.Stack())),
		attribute.Bool("exception.escaped", true),
	))
	span.SetStatus(codes.Error, message)
}

// Type names a panic value as "pkgpath.Name". It departs from the OTel SDK only for
// predeclared types, which the SDK prints as ".string": the Errors page shows this name.
func Type(v any) string {
	t := reflect.TypeOf(v)
	if t.PkgPath() == "" {
		return t.String()
	}
	return fmt.Sprintf("%s.%s", t.PkgPath(), t.Name())
}
