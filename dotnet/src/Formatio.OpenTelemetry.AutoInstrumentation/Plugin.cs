using OpenTelemetry.AutoInstrumentation.PluginApi;
using OpenTelemetry.AutoInstrumentation.PluginApi.Telemetry;
using OpenTelemetry.Instrumentation.AspNetCore;
using OpenTelemetry.Instrumentation.Http;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Formatio.OpenTelemetry.AutoInstrumentation;

/// <summary>
/// Loaded by OpenTelemetry .NET automatic instrumentation from <c>OTEL_DOTNET_AUTO_PLUGINS</c>,
/// which Formatio's build sets. Records exceptions on request and client spans, which the
/// instrumentation leaves off by default, and reports crashes, as Formatio's other SDKs do.
/// </summary>
public sealed class Plugin :
    IPlugin,
    ITelemetryPlugin,
    IConfigureTracesOptions<AspNetCoreTraceInstrumentationOptions>,
    IConfigureTracesOptions<HttpClientTraceInstrumentationOptions>
{
    public void Initializing()
    {
    }

    public void Initialized()
    {
    }

    public TracerProviderBuilder BeforeConfigureTracerProvider(TracerProviderBuilder builder) =>
        builder.AddSource(CrashReporter.SourceName);

    public TracerProviderBuilder AfterConfigureTracerProvider(TracerProviderBuilder builder) => builder;

    public void TracerProviderInitialized(TracerProvider tracerProvider) => CrashReporter.Install(tracerProvider);

    public MeterProviderBuilder BeforeConfigureMeterProvider(MeterProviderBuilder builder) => builder;

    public MeterProviderBuilder AfterConfigureMeterProvider(MeterProviderBuilder builder) => builder;

    public void MeterProviderInitialized(MeterProvider meterProvider)
    {
    }

    public ResourceBuilder ConfigureResource(ResourceBuilder builder) => builder;

    public void ConfigureTracesOptions(AspNetCoreTraceInstrumentationOptions options) => options.RecordException = true;

    public void ConfigureTracesOptions(HttpClientTraceInstrumentationOptions options) => options.RecordException = true;
}
