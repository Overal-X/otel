package formatio

import (
	"context"
	"time"

	"github.com/overal-x/otel/go/internal/exception"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const instrumentationName = "github.com/overal-x/otel/go"

// A crash waits this long at most for the export, so a dead endpoint cannot hold up the exit.
const crashFlushTimeout = 2 * time.Second

// CaptureError reports an error the caller handled. With a recording span in ctx, err is
// recorded on it with a stack trace and the span is marked failed; otherwise err gets a span of
// its own named "exception", so it is grouped in Errors either way. attrs go on that span, where
// the trace view shows them. A nil err is ignored.
func CaptureError(ctx context.Context, err error, attrs ...attribute.KeyValue) {
	if err == nil {
		return
	}
	span := trace.SpanFromContext(ctx)
	if !span.IsRecording() {
		_, span = tracer().Start(ctx, "exception", trace.WithSpanKind(trace.SpanKindInternal))
		defer span.End()
	}
	span.SetAttributes(attrs...)
	span.RecordError(err, trace.WithStackTrace(true))
	span.SetStatus(codes.Error, err.Error())
}

// Recover reports a panic as an "uncaught exception" span, waits up to 2 s for it to be
// exported, and re-panics with the same value, so the process still crashes with Go's own
// message and exit status. Defer it directly, after deferring Init's shutdown:
//
//	defer formatio.Recover(ctx)
//
// Go has no process-wide crash hook: a panic in any goroutine ends the process before other
// goroutines run, so every goroutine that should report its crash needs its own Recover.
func Recover(ctx context.Context) {
	// recover only stops a panic when called by the deferred function itself, so this cannot
	// move into a helper.
	v := recover()
	if v == nil {
		return
	}
	_, span := tracer().Start(ctx, "uncaught exception", trace.WithSpanKind(trace.SpanKindInternal))
	exception.RecordPanic(span, v)
	span.End()
	flush()
	panic(v)
}

func flush() {
	provider, ok := otel.GetTracerProvider().(interface{ ForceFlush(context.Context) error })
	if !ok {
		return
	}
	// Not the caller's context: it may already be cancelled, possibly what caused the panic.
	ctx, cancel := context.WithTimeout(context.Background(), crashFlushTimeout)
	defer cancel()
	_ = provider.ForceFlush(ctx)
}

func tracer() trace.Tracer {
	return otel.Tracer(instrumentationName, trace.WithInstrumentationVersion(Version))
}
