package formatio

import (
	"bytes"
	"net/http"
	"reflect"
	"testing"

	"github.com/overal-x/otel/go/internal/zerocode"
	"go.opentelemetry.io/otel"
)

func TestBuildInstrumentedBinaryKeepsItsPipeline(t *testing.T) {
	zerocode.Active = true
	t.Cleanup(func() { zerocode.Active = false })
	var warned bytes.Buffer
	prev := warnings
	warnings = &warned
	t.Cleanup(func() { warnings = prev })
	clearEnv(t)
	before := otel.GetTracerProvider()

	shutdown, err := Init(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := shutdown(t.Context()); err != nil {
		t.Fatal(err)
	}
	if otel.GetTracerProvider() != before {
		t.Error("Init replaced the global tracer provider")
	}
	if warned.Len() != 0 {
		t.Errorf("Init warned %q; the build-time pipeline needs no config check", warned.String())
	}

	mux := http.NewServeMux()
	if got := Handler(mux); got != http.Handler(mux) {
		t.Errorf("Handler wrapped the mux: %T", got)
	}
	if got := Transport(nil); got != http.DefaultTransport {
		t.Errorf("Transport(nil) = %T, want http.DefaultTransport", got)
	}
	custom := &http.Transport{}
	if got := Transport(custom); !reflect.DeepEqual(got, http.RoundTripper(custom)) {
		t.Errorf("Transport(rt) = %T, want rt", got)
	}
}
