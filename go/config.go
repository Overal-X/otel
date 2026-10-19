package formatio

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// Option overrides a setting Init would otherwise read from the environment.
type Option func(*options)

type options struct {
	endpoint    string
	token       string
	serviceName string
}

// WithEndpoint sets the base OTLP endpoint (the public endpoint on the Tracing card); spans go
// to its "/v1/traces". It wins over every OTEL_* and FORMATIO_* endpoint variable.
func WithEndpoint(endpoint string) Option {
	return func(o *options) { o.endpoint = endpoint }
}

// WithToken sends "authorization: Bearer <token>" in place of any headers from
// OTEL_EXPORTER_OTLP_TRACES_HEADERS, OTEL_EXPORTER_OTLP_HEADERS or FORMATIO_TOKEN.
func WithToken(token string) Option {
	return func(o *options) { o.token = token }
}

// WithServiceName sets service.name, winning over OTEL_SERVICE_NAME and
// OTEL_RESOURCE_ATTRIBUTES.
func WithServiceName(name string) Option {
	return func(o *options) { o.serviceName = name }
}

type config struct {
	tracesURL   string
	headers     map[string]string
	serviceName string
}

const tracesPath = "/v1/traces"

var (
	errNoEndpoint = errors.New("no endpoint; set FORMATIO_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT")
	errNoToken    = errors.New("no token; set FORMATIO_TOKEN or OTEL_EXPORTER_OTLP_HEADERS")
)

// resolve applies the precedence every Formatio SDK shares: options, then the standard OTEL_*
// variables, then the FORMATIO_* shorthands. An error says why tracing has to stay off.
func resolve(o options, getenv func(string) string) (config, error) {
	cfg := config{
		tracesURL:   resolveTracesURL(o, getenv),
		headers:     resolveHeaders(o, getenv),
		serviceName: o.serviceName,
	}
	if cfg.tracesURL == "" {
		return cfg, errNoEndpoint
	}
	if u, err := url.Parse(cfg.tracesURL); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return cfg, fmt.Errorf("endpoint %q is not an http(s) URL", cfg.tracesURL)
	}
	if len(cfg.headers) == 0 {
		return cfg, errNoToken
	}
	return cfg, nil
}

func resolveTracesURL(o options, getenv func(string) string) string {
	if o.endpoint != "" {
		return withTracesPath(o.endpoint)
	}
	// The signal-specific variable is a complete URL, per the OTLP exporter spec.
	if v := getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"); v != "" {
		return v
	}
	for _, key := range []string{"OTEL_EXPORTER_OTLP_ENDPOINT", "FORMATIO_ENDPOINT"} {
		if v := getenv(key); v != "" {
			return withTracesPath(v)
		}
	}
	return ""
}

// withTracesPath tolerates a base that already ends in the signal path, a common paste.
func withTracesPath(base string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, tracesPath) {
		return base
	}
	return base + tracesPath
}

func resolveHeaders(o options, getenv func(string) string) map[string]string {
	if o.token != "" {
		return bearer(o.token)
	}
	for _, key := range []string{"OTEL_EXPORTER_OTLP_TRACES_HEADERS", "OTEL_EXPORTER_OTLP_HEADERS"} {
		if v := getenv(key); v != "" {
			return parseHeaders(v)
		}
	}
	if token := getenv("FORMATIO_TOKEN"); token != "" {
		return bearer(token)
	}
	return nil
}

func bearer(token string) map[string]string {
	return map[string]string{"authorization": "Bearer " + token}
}

// parseHeaders reads the OTEL_EXPORTER_OTLP_HEADERS format, "k1=v1,k2=v2" with
// percent-encoded values, skipping malformed pairs the way otlptracehttp does.
func parseHeaders(s string) map[string]string {
	headers := map[string]string{}
	for pair := range strings.SplitSeq(s, ",") {
		k, v, ok := strings.Cut(pair, "=")
		k = strings.TrimSpace(k)
		if !ok || k == "" {
			continue
		}
		v, err := url.PathUnescape(v)
		if err != nil {
			continue
		}
		headers[k] = strings.TrimSpace(v)
	}
	return headers
}
