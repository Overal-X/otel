// Package formatio reports traces and errors to Formatio. It is a thin distribution of the
// OpenTelemetry Go SDK and emits only standard OTLP spans, so code that uses it keeps working
// with plain OpenTelemetry configured by the same environment.
package formatio

import (
	"context"
	"fmt"
	"io"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
)

// Version is the SDK release, reported as the telemetry.distro.version resource attribute.
const Version = "0.1.0"

// A variable so tests can capture the warning.
var warnings io.Writer = os.Stderr

// Init installs a global tracer provider that batches spans to Formatio over OTLP/HTTP, and the
// W3C tracecontext and baggage propagators. Call it at the top of main and defer shutdown,
// which flushes what is still buffered.
//
// On Formatio, Init needs no options: the endpoint, token and service name come from the
// OTEL_* variables injected when Tracing is on. Elsewhere, set OTEL_EXPORTER_OTLP_ENDPOINT and
// OTEL_EXPORTER_OTLP_HEADERS. Without an endpoint or token, Init prints one warning to stderr and leaves
// tracing off, so an unconfigured run still starts; err is non-nil only if the exporter cannot
// be built.
func Init(ctx context.Context, opts ...Option) (shutdown func(context.Context) error, err error) {
	var o options
	for _, opt := range opts {
		if opt != nil {
			opt(&o)
		}
	}
	cfg, err := resolve(o, os.Getenv)
	if err != nil {
		fmt.Fprintf(warnings, "formatio: tracing is off: %v\n", err)
		return noShutdown, nil
	}

	exporter, err := otlptracehttp.New(ctx,
		// otlptracehttp reads OTEL_EXPORTER_OTLP_* itself; explicit options override that, so
		// the endpoint, headers and encoding are exactly the resolved ones.
		otlptracehttp.WithEndpointURL(cfg.tracesURL),
		otlptracehttp.WithHeaders(cfg.headers),
		otlptracehttp.WithEncoding(otlptracehttp.EncodingProtobuf),
	)
	if err != nil {
		return noShutdown, err
	}
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(newResource(cfg.serviceName)),
	)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	return provider.Shutdown, nil
}

func noShutdown(context.Context) error { return nil }

func newResource(serviceName string) *resource.Resource {
	attrs := []attribute.KeyValue{
		semconv.TelemetryDistroName("formatio"),
		semconv.TelemetryDistroVersion(Version),
	}
	if serviceName != "" {
		attrs = append(attrs, semconv.ServiceName(serviceName))
	}
	// Default brings OTEL_SERVICE_NAME (or unknown_service:<binary>), OTEL_RESOURCE_ATTRIBUTES
	// and telemetry.sdk.*. Merge fails only on two different schema URLs, which a schemaless
	// resource cannot cause.
	res, _ := resource.Merge(resource.Default(), resource.NewSchemaless(attrs...))
	return res
}
