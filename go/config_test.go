package formatio

import (
	"errors"
	"maps"
	"testing"
)

func TestResolve(t *testing.T) {
	tests := []struct {
		name        string
		opts        options
		env         map[string]string
		wantURL     string
		wantHeaders map[string]string
		wantErr     error
	}{
		{
			name: "options win over every variable",
			opts: options{endpoint: "https://opt.example/otlp", token: "opt"},
			env: map[string]string{
				"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://traces.example/x",
				"OTEL_EXPORTER_OTLP_TRACES_HEADERS":  "authorization=Bearer%20env",
			},
			wantURL:     "https://opt.example/otlp/v1/traces",
			wantHeaders: map[string]string{"authorization": "Bearer opt"},
		},
		{
			name: "traces endpoint is used as-is",
			env: map[string]string{
				"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://traces.example/custom",
				"OTEL_EXPORTER_OTLP_ENDPOINT":        "https://base.example",
				"OTEL_EXPORTER_OTLP_TRACES_HEADERS":  "authorization=Bearer%20traces",
				"OTEL_EXPORTER_OTLP_HEADERS":         "authorization=Bearer%20base",
			},
			wantURL:     "https://traces.example/custom",
			wantHeaders: map[string]string{"authorization": "Bearer traces"},
		},
		{
			name: "base endpoint gets the traces path once",
			env: map[string]string{
				"OTEL_EXPORTER_OTLP_ENDPOINT": "http://otel-intake:4318/",
				"OTEL_EXPORTER_OTLP_HEADERS":  "authorization=Bearer%20base, x-extra = 1 ,bad,=novalue",
			},
			wantURL:     "http://otel-intake:4318/v1/traces",
			wantHeaders: map[string]string{"authorization": "Bearer base", "x-extra": "1"},
		},
		{
			name: "base already ends in the traces path",
			env: map[string]string{
				"OTEL_EXPORTER_OTLP_ENDPOINT": "https://formatio.example/otlp/v1/traces/",
				"OTEL_EXPORTER_OTLP_HEADERS":  "authorization=Bearer%20secret",
			},
			wantURL:     "https://formatio.example/otlp/v1/traces",
			wantHeaders: map[string]string{"authorization": "Bearer secret"},
		},
		{
			name:    "no endpoint",
			env:     map[string]string{"OTEL_EXPORTER_OTLP_HEADERS": "authorization=Bearer%20secret"},
			wantErr: errNoEndpoint,
		},
		{
			name:    "no token",
			env:     map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://formatio.example"},
			wantURL: "https://formatio.example/v1/traces",
			wantErr: errNoToken,
		},
		{
			name: "FORMATIO_* variables are not read",
			env: map[string]string{
				"FORMATIO_ENDPOINT": "https://formatio.example/otlp",
				"FORMATIO_TOKEN":    "secret",
			},
			wantErr: errNoEndpoint,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := resolve(tt.opts, func(k string) string { return tt.env[k] })
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if cfg.tracesURL != tt.wantURL {
				t.Errorf("tracesURL = %q, want %q", cfg.tracesURL, tt.wantURL)
			}
			if tt.wantErr == nil && !maps.Equal(cfg.headers, tt.wantHeaders) {
				t.Errorf("headers = %v, want %v", cfg.headers, tt.wantHeaders)
			}
		})
	}
}

func TestResolveRejectsNonHTTPEndpoints(t *testing.T) {
	for _, endpoint := range []string{"otel-intake:4318", "://bad", "grpc://host:4317"} {
		_, err := resolve(options{endpoint: endpoint, token: "t"}, func(string) string { return "" })
		if err == nil {
			t.Errorf("resolve(%q) succeeded", endpoint)
		}
	}
}

func TestRouteOf(t *testing.T) {
	for pattern, want := range map[string]string{
		"":                             "",
		"/":                            "/",
		"GET /users/{id}":              "/users/{id}",
		"POST example.com/orders/{id}": "/orders/{id}",
	} {
		if got := routeOf(pattern); got != want {
			t.Errorf("routeOf(%q) = %q, want %q", pattern, got, want)
		}
	}
}
