import { diag, DiagConsoleLogger } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  CompositePropagator,
  diagLogLevelFromString,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  defaultResource,
  detectResources,
  envDetector,
  hostDetector,
  processDetector,
  resourceFromAttributes,
  type Resource,
} from "@opentelemetry/resources";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { VERSION } from "./version";

// Noisy enough to crowd real requests out of the intake's per-trace limits.
const DISABLED_INSTRUMENTATIONS = [
  "@opentelemetry/instrumentation-fs",
  "@opentelemetry/instrumentation-dns",
  "@opentelemetry/instrumentation-net",
] as const;

let provider: NodeTracerProvider | undefined;
let unregisterInstrumentations: (() => void) | undefined;

/**
 * Registers the global tracer provider and the auto-instrumentations. Built on the provider
 * rather than `NodeSDK`, which would also start metric and log pipelines from
 * `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER`.
 */
export function startTracing(processor: SpanProcessor, serviceName?: string): void {
  if (provider) return;
  enableDiagLogger();
  provider = new NodeTracerProvider({
    resource: buildResource(serviceName),
    spanProcessors: [processor],
  });
  provider.register({
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  });
  unregisterInstrumentations = registerInstrumentations({
    tracerProvider: provider,
    instrumentations: getNodeAutoInstrumentations(
      Object.fromEntries(DISABLED_INSTRUMENTATIONS.map((name) => [name, { enabled: false }])),
    ),
  });
}

export function isTracing(): boolean {
  return provider !== undefined;
}

/** Resolves true when every pending span was exported within the timeout. */
export async function flushTracing(timeoutMs: number): Promise<boolean> {
  if (!provider) return true;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, false);
    timer.unref();
  });
  const flushed = provider.forceFlush().then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([flushed, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function shutdownTracing(): Promise<void> {
  unregisterInstrumentations?.();
  await provider?.shutdown();
}

function buildResource(serviceName?: string): Resource {
  const resource = defaultResource()
    .merge(detectResources({ detectors: [envDetector, processDetector, hostDetector] }))
    .merge(
      resourceFromAttributes({
        "telemetry.distro.name": "formatio",
        "telemetry.distro.version": VERSION,
      }),
    );
  return serviceName
    ? resource.merge(resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }))
    : resource;
}

function enableDiagLogger(): void {
  const level = process.env.OTEL_LOG_LEVEL;
  if (level) diag.setLogger(new DiagConsoleLogger(), { logLevel: diagLogLevelFromString(level) });
}
