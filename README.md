# Formatio SDK

Error tracking and tracing for applications on [Formatio](https://formatio.cloud), in one
package and one line per language. Each SDK is a thin distribution of the official
OpenTelemetry SDK: it emits standard OTLP traces, so dropping it for plain OpenTelemetry keeps
every trace and error group working.

| Directory | Package |
| --- | --- |
| `go/` | `github.com/overal-x/otel/go` |
| `node/` | `@formatio/otel-node`, `@formatio/otel-next` |
| `python/` | `formatio-otel` (imports as `formatio_otel`) |

On Formatio, tracing is on for new applications and the endpoint and token are injected. Go
applications built with Railpack need no SDK: the build compiles the instrumentation in with
OpenTelemetry's `otelc` and this repository's [`go/otelc`](go/otelc) rules. Install an SDK there
only to report errors you handle yourself.
Elsewhere, set the standard OTLP variables from the Tracing card; the SDKs read nothing else:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT='https://your-formatio-host/otlp'
export OTEL_EXPORTER_OTLP_HEADERS='authorization=Bearer <tracing token>'
```
