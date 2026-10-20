using System.Diagnostics;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Instrumentation.AspNetCore;
using OpenTelemetry.Instrumentation.Http;
using OpenTelemetry.Trace;
using Xunit;

namespace Formatio.OpenTelemetry.AutoInstrumentation.Tests;

public class CrashReporterTests
{
    [Fact]
    public void RecordsTheCrashAndFlushesItBeforeTheProcessEnds()
    {
        var exported = new List<Activity>();
        // Batched with a delay far beyond the test, so the span is only exported if Report flushed.
        using var tracerProvider = global::OpenTelemetry.Sdk.CreateTracerProviderBuilder()
            .AddSource(CrashReporter.SourceName)
            .AddProcessor(new BatchActivityExportProcessor(new InMemoryExporter<Activity>(exported), scheduledDelayMilliseconds: 3_600_000))
            .Build()!;

        CrashReporter.Report(tracerProvider, new InvalidOperationException("crash outside a request"));

        var span = Assert.Single(exported);
        Assert.Equal("uncaught exception", span.DisplayName);
        Assert.Equal(ActivityStatusCode.Error, span.Status);
        Assert.Equal("crash outside a request", span.StatusDescription);
        var exception = Assert.Single(span.Events);
        Assert.Equal("exception", exception.Name);
        var tags = exception.Tags.ToDictionary(tag => tag.Key, tag => tag.Value);
        Assert.Equal("System.InvalidOperationException", tags["exception.type"]);
        Assert.Equal(true, tags["exception.escaped"]);
    }

    [Fact]
    public void AnExceptionObjectThatIsNotAnExceptionIsStillAnEndedSpan()
    {
        var exported = new List<Activity>();
        using var tracerProvider = global::OpenTelemetry.Sdk.CreateTracerProviderBuilder()
            .AddSource(CrashReporter.SourceName)
            .AddInMemoryExporter(exported)
            .Build()!;

        CrashReporter.Report(tracerProvider, "thrown by native code");

        Assert.Equal("uncaught exception", Assert.Single(exported).DisplayName);
    }

    [Fact]
    public void ThePluginRecordsExceptionsOnRequestAndClientSpans()
    {
        var plugin = new Plugin();
        var aspNetCore = new AspNetCoreTraceInstrumentationOptions();
        var httpClient = new HttpClientTraceInstrumentationOptions();

        plugin.ConfigureTracesOptions(aspNetCore);
        plugin.ConfigureTracesOptions(httpClient);

        Assert.True(aspNetCore.RecordException);
        Assert.True(httpClient.RecordException);
    }
}
