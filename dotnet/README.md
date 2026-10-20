# Formatio plugin for OpenTelemetry .NET automatic instrumentation

Formatio's Railpack builds add [OpenTelemetry .NET automatic instrumentation](https://opentelemetry.io/docs/zero-code/dotnet/)
and this plugin to .NET applications. The plugin records exceptions on ASP.NET Core and
`HttpClient` spans, which the instrumentation leaves off by default, and reports an unhandled
exception on a span named `uncaught exception`, waiting up to 2 seconds for it and any batched
spans to be exported before the process ends.

Use it with the automatic instrumentation anywhere by copying the DLL next to the bundle's own
assemblies (`$OTEL_DOTNET_AUTO_HOME/net/net*/`) and setting:

```sh
export OTEL_DOTNET_AUTO_PLUGINS='Formatio.OpenTelemetry.AutoInstrumentation.Plugin, Formatio.OpenTelemetry.AutoInstrumentation'
```

## Build and release

```sh
dotnet test test/Formatio.OpenTelemetry.AutoInstrumentation.Tests
dotnet build -c Release src/Formatio.OpenTelemetry.AutoInstrumentation -o .publish
```

The DLL is reproducible. Its package references pin the versions the automatic instrumentation
release loads (v1.17.0); bump them together. A release is the DLL attached to a GitHub release
tagged `dotnet/v<version>`; Formatio pins its SHA-256.
