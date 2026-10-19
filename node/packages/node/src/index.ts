import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { type InitOptions, resolveConfig } from "./config";
import { installCrashHandlers } from "./crash";
import { flushTracing, isTracing, shutdownTracing, startTracing } from "./sdk";

export type { InitOptions } from "./config";
export { captureException } from "./capture";
export { expressErrorHandler, type ExpressErrorHandler } from "./express";
export { setupFastifyErrorHandler, type FastifyLike } from "./fastify";

const DEFAULT_FLUSH_TIMEOUT_MS = 2000;

const MISSING_HINTS = {
  endpoint: "no endpoint configured (FORMATIO_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT)",
  token: "no token configured (FORMATIO_TOKEN or an authorization header in OTEL_EXPORTER_OTLP_HEADERS)",
} as const;

let initialized = false;
let uninstallCrashHandlers: (() => void) | undefined;

/**
 * Starts tracing and crash reporting. On Formatio it needs no options: the `OTEL_*` variables
 * are injected when Tracing is on. With nowhere to export it warns once and leaves tracing off;
 * it never throws.
 */
export function init(options: InitOptions = {}): void {
  if (initialized) {
    console.warn("[formatio] init() was already called; ignoring this call");
    return;
  }
  initialized = true;
  try {
    const resolution = resolveConfig(options, process.env);
    if ("missing" in resolution) {
      console.warn(`[formatio] ${MISSING_HINTS[resolution.missing]}; tracing is off`);
      return;
    }
    const { config } = resolution;
    // The proto exporter always encodes protobuf; passing url and headers keeps its own OTEL_*
    // env reading from overriding what the contract resolved.
    const exporter = new OTLPTraceExporter({ url: config.url, headers: config.headers });
    startTracing(new BatchSpanProcessor(exporter), config.serviceName);
    uninstallCrashHandlers = installCrashHandlers(flushTracing);
    // A script that just runs to completion would otherwise lose the last batch.
    process.once("beforeExit", () => void flushTracing(DEFAULT_FLUSH_TIMEOUT_MS));
  } catch (err) {
    console.warn("[formatio] init failed; tracing is off:", err);
  }
}

/** Exports pending spans. Resolves false if that did not finish within `timeoutMs`. */
export function flush(timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS): Promise<boolean> {
  return isTracing() ? flushTracing(timeoutMs) : Promise.resolve(true);
}

/** Flushes, stops tracing and removes the crash handlers, restoring Node's own. */
export async function shutdown(): Promise<void> {
  uninstallCrashHandlers?.();
  uninstallCrashHandlers = undefined;
  await shutdownTracing();
}
