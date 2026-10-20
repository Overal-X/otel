package cloud.formatio.otel;

import io.opentelemetry.javaagent.extension.AgentListener;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;

/**
 * Reports any thread's uncaught exception, a crash at startup among them, which the agent's
 * instrumentation only sees when it happens inside a request. Runs once the agent is installed,
 * before the application's main method.
 */
public final class CrashReportingListener implements AgentListener {
  @Override
  public void afterAgent(AutoConfiguredOpenTelemetrySdk autoConfiguredSdk) {
    Thread.setDefaultUncaughtExceptionHandler(
        new CrashHandler(
            autoConfiguredSdk.getOpenTelemetrySdk().getSdkTracerProvider(),
            Thread.getDefaultUncaughtExceptionHandler()));
  }
}
