# formatio (Go)

Traces and errors for Go applications on [Formatio](https://formatio.cloud). A thin
distribution of the OpenTelemetry Go SDK: it emits standard OTLP spans, so replacing it with
plain OpenTelemetry keeps every trace and error group.

```sh
go get github.com/overal-x/otel/go
```

## Setup

```go
shutdown, _ := formatio.Init(ctx)
defer shutdown(ctx)
http.ListenAndServe(":8080", formatio.Handler(mux))
```

`Handler` traces each request (named by its `ServeMux` route, e.g. `GET /users/{id}`) and
records a panic with its stack trace before letting `net/http` handle it as usual. Wrap
outbound clients with `formatio.Transport(nil)` to trace calls and carry the trace to the
service you call. Report errors you handle yourself with `formatio.CaptureError(ctx, err)`.

## Configuration

On Formatio, turn **Tracing** on for the application: the endpoint, token and service name
are injected as `OTEL_*` variables, and `Init` needs no options. Elsewhere, set:

| Variable | |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | the public endpoint on the Tracing card |
| `OTEL_EXPORTER_OTLP_HEADERS` | `authorization=Bearer <tracing token>` |

`WithEndpoint`, `WithToken` and `WithServiceName` override the environment. With no endpoint or token,
`Init` prints one warning and the app runs untraced. `OTEL_TRACES_SAMPLER` is respected.

## Crashes

Go has no process-wide crash hook: a panic in any goroutine ends the process before anything
else runs. To get crashes outside a request into **Errors**, defer `Recover` at the top of
`main` and of every goroutine you start:

```go
func main() {
	ctx := context.Background()
	shutdown, _ := formatio.Init(ctx)
	defer shutdown(ctx)
	defer formatio.Recover(ctx) // after shutdown, so it runs first

	go func() {
		defer formatio.Recover(ctx)
		work(ctx)
	}()
	// ...
}
```

`Recover` records the panic, waits up to 2 s for it to be sent, and panics again with the
same value, so the process exits exactly as it would without it.
