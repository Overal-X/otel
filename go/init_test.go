package formatio

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	collectortrace "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/protobuf/proto"
)

var configEnv = []string{
	"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_EXPORTER_OTLP_TRACES_HEADERS",
	"OTEL_EXPORTER_OTLP_HEADERS",
	"OTEL_EXPORTER_OTLP_PROTOCOL",
	"OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
	"OTEL_EXPORTER_OTLP_COMPRESSION",
	"OTEL_EXPORTER_OTLP_TRACES_COMPRESSION",
	"OTEL_TRACES_SAMPLER",
}

func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range configEnv {
		t.Setenv(key, "")
		os.Unsetenv(key)
	}
}

func captureWarnings(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := warnings
	warnings = &buf
	t.Cleanup(func() { warnings = prev })
	return &buf
}

func TestInitWithoutConfigWarnsOnceAndDoesNothing(t *testing.T) {
	clearEnv(t)
	out := captureWarnings(t)
	before := otel.GetTracerProvider()

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown: %v", err)
	}
	if n := strings.Count(out.String(), "\n"); n != 1 || !strings.Contains(out.String(), "formatio:") {
		t.Errorf("warnings = %q, want one formatio line", out.String())
	}
	if otel.GetTracerProvider() != before {
		t.Error("Init replaced the global tracer provider")
	}
}

func TestInitNeverFails(t *testing.T) {
	clearEnv(t)
	captureWarnings(t)
	for _, opts := range [][]Option{
		{nil},
		{WithEndpoint("://bad"), WithToken("t")},
		{WithEndpoint("https://formatio.example")},
		{WithToken("t")},
	} {
		shutdown, err := Init(context.Background(), opts...)
		if err != nil {
			t.Fatalf("Init: %v", err)
		}
		if err := shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown: %v", err)
		}
	}
}

type export struct {
	path, contentType, authorization string
	request                          *collectortrace.ExportTraceServiceRequest
}

func fakeReceiver(t *testing.T) (*httptest.Server, <-chan export) {
	t.Helper()
	exports := make(chan export, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		req := &collectortrace.ExportTraceServiceRequest{}
		if err := proto.Unmarshal(body, req); err != nil {
			t.Errorf("decode export: %v", err)
		}
		exports <- export{r.URL.Path, r.Header.Get("Content-Type"), r.Header.Get("Authorization"), req}
	}))
	t.Cleanup(srv.Close)
	return srv, exports
}

func TestInitExportsOverTheWire(t *testing.T) {
	tests := []struct {
		name     string
		env      func(base string) map[string]string
		opts     []Option
		wantPath string
		wantAuth string
	}{
		{
			name: "otel base endpoint with a path",
			env: func(base string) map[string]string {
				return map[string]string{
					"OTEL_EXPORTER_OTLP_ENDPOINT": base + "/otlp/",
					"OTEL_EXPORTER_OTLP_HEADERS":  "authorization=Bearer%20secret",
				}
			},
			wantPath: "/otlp/v1/traces",
			wantAuth: "Bearer secret",
		},
		{
			name: "otel base endpoint, json protocol requested",
			env: func(base string) map[string]string {
				return map[string]string{
					"OTEL_EXPORTER_OTLP_ENDPOINT": base,
					"OTEL_EXPORTER_OTLP_HEADERS":  "authorization=Bearer%20injected",
					"OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
				}
			},
			wantPath: "/v1/traces",
			wantAuth: "Bearer injected",
		},
		{
			name: "options over otel traces endpoint",
			env: func(base string) map[string]string {
				return map[string]string{
					"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": base + "/elsewhere",
					"OTEL_EXPORTER_OTLP_TRACES_HEADERS":  "authorization=Bearer%20env",
				}
			},
			opts:     []Option{WithToken("opt"), WithServiceName("checkout")},
			wantPath: "/elsewhere",
			wantAuth: "Bearer opt",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearEnv(t)
			srv, exports := fakeReceiver(t)
			for k, v := range tt.env(srv.URL) {
				t.Setenv(k, v)
			}

			ctx := context.Background()
			shutdown, err := Init(ctx, tt.opts...)
			if err != nil {
				t.Fatalf("Init: %v", err)
			}
			_, span := otel.Tracer("test").Start(ctx, "work")
			span.End()
			if err := shutdown(ctx); err != nil {
				t.Fatalf("shutdown: %v", err)
			}

			got := <-exports
			if got.path != tt.wantPath {
				t.Errorf("path = %q, want %q", got.path, tt.wantPath)
			}
			if got.contentType != "application/x-protobuf" {
				t.Errorf("content-type = %q", got.contentType)
			}
			if got.authorization != tt.wantAuth {
				t.Errorf("authorization = %q, want %q", got.authorization, tt.wantAuth)
			}
			attrs := map[string]string{}
			for _, kv := range got.request.GetResourceSpans()[0].GetResource().GetAttributes() {
				attrs[kv.GetKey()] = kv.GetValue().GetStringValue()
			}
			if attrs["telemetry.distro.name"] != "formatio" || attrs["telemetry.distro.version"] != Version {
				t.Errorf("distro attributes = %q, %q", attrs["telemetry.distro.name"], attrs["telemetry.distro.version"])
			}
			if tt.opts != nil && attrs["service.name"] != "checkout" {
				t.Errorf("service.name = %q, want checkout", attrs["service.name"])
			}
		})
	}
}
