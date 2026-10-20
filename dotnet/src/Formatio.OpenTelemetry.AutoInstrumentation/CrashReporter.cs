using System.Diagnostics;
using OpenTelemetry;
using OpenTelemetry.Trace;

namespace Formatio.OpenTelemetry.AutoInstrumentation;

/// <summary>
/// Records an unhandled exception on a span named <c>uncaught exception</c> and waits up to two
/// seconds for it to be exported: the runtime ends the process as soon as the handlers return,
/// taking any span still batched with it.
/// </summary>
internal static class CrashReporter
{
    internal const string SourceName = "Formatio.OpenTelemetry";

    private const int FlushTimeoutMilliseconds = 2000;

    private static readonly ActivitySource Source = new(SourceName);

    internal static void Install(TracerProvider tracerProvider) =>
        AppDomain.CurrentDomain.UnhandledException += (_, args) => Report(tracerProvider, args.ExceptionObject);

    internal static void Report(TracerProvider tracerProvider, object error)
    {
        try
        {
            using (var activity = Source.StartActivity("uncaught exception", ActivityKind.Internal))
            {
                if (activity is not null && error is Exception exception)
                {
                    // Activity.AddException, which the warning points to, only exists from .NET 9.
#pragma warning disable CS0618
                    activity.RecordException(exception, new TagList { { "exception.escaped", true } });
#pragma warning restore CS0618
                    activity.SetStatus(ActivityStatusCode.Error, exception.Message);
                }
            }

            tracerProvider.ForceFlush(FlushTimeoutMilliseconds);
        }
        catch
        {
            // Reporting must never replace the crash being reported.
        }
    }
}
