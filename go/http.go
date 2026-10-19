package formatio

import (
	"net/http"

	"github.com/overal-x/otel/go/internal/exception"
	"github.com/overal-x/otel/go/internal/zerocode"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

// Handler traces every request to h with otelhttp. When h routes with Go 1.22 patterns
// (http.ServeMux, or anything that sets Request.Pattern), the span is named "METHOD /route" and
// carries http.route.
//
// A panic in h is recorded on the request span with its stack trace, then re-raised with the
// same value, so net/http logs it and drops the connection exactly as without Formatio.
// http.ErrAbortHandler is re-raised without being recorded.
//
// In a binary Formatio built with compile-time instrumentation, requests and panics are already
// traced, and Handler returns h unchanged.
func Handler(h http.Handler) http.Handler {
	if zerocode.Active {
		return h
	}
	// The operation name is unused: otelhttp's default formatter names spans from the request.
	return otelhttp.NewHandler(recordPanics(h), "")
}

// Transport traces outbound requests and propagates the trace context to the server they call.
// A nil rt means http.DefaultTransport. In a binary built with compile-time instrumentation,
// outbound requests are already traced, and Transport returns rt (or http.DefaultTransport).
func Transport(rt http.RoundTripper) http.RoundTripper {
	if zerocode.Active {
		if rt == nil {
			return http.DefaultTransport
		}
		return rt
	}
	return otelhttp.NewTransport(rt)
}

// recordPanics runs inside otelhttp so the request span is still open when it records.
func recordPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		span := trace.SpanFromContext(r.Context())
		defer func() {
			// ServeMux sets r.Pattern while routing, after otelhttp took its request
			// attributes, and otelhttp renames the span from it only when the handler returns.
			route := routeOf(r.Pattern)
			if route != "" {
				span.SetAttributes(semconv.HTTPRoute(route))
			}
			v := recover()
			if v == nil {
				return
			}
			if v != http.ErrAbortHandler {
				if route != "" {
					span.SetName(r.Method + " " + route)
				}
				exception.RecordPanic(span, v)
			}
			// otelhttp's deferred End would otherwise see the panic and, like any SDK span
			// ended mid-panic, record it again without a stack trace (even ErrAbortHandler).
			// Nothing else otelhttp sets is lost: it only adds the response after a return.
			span.End()
			panic(v)
		}()
		next.ServeHTTP(w, r)
	})
}
