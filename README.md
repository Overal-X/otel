# Formatio SDK

Error tracking and tracing for applications on [Formatio](https://formatio.cloud), in one
package and one line per language. Each SDK is a thin distribution of the official
OpenTelemetry SDK: it emits standard OTLP traces, so dropping it for plain OpenTelemetry keeps
every trace and error group working.

| Directory | Package |
| --- | --- |
| `go/` | `github.com/overal-x/otel/go` |
| `node/` | `@formatio/node`, `@formatio/next` |
| `python/` | `formatio` |

On Formatio, turn **Tracing** on for the application; the endpoint and token are injected.
Elsewhere, set `FORMATIO_ENDPOINT` (the public endpoint on the Tracing card) and
`FORMATIO_TOKEN`.
