import { createRequire } from "node:module";

// Starts the SDK's tracing against an in-memory exporter through the internal module, which the
// package's exports map keeps out of the public API.
export function startInMemory() {
  const require = createRequire(import.meta.url);
  const { InMemorySpanExporter, SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
  const { startTracing, flushTracing } = require("../../dist/sdk.js");
  const exporter = new InMemorySpanExporter();
  startTracing(new SimpleSpanProcessor(exporter));
  return {
    exporter,
    require,
    // The resource's host detector resolves asynchronously, and SimpleSpanProcessor waits for it
    // before exporting, so finished spans are not visible synchronously.
    async finishedSpans() {
      await flushTracing(2000);
      return exporter.getFinishedSpans();
    },
    async waitForSpan(predicate, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const span = exporter.getFinishedSpans().find(predicate);
        if (span) return span;
        if (Date.now() > deadline) {
          throw new Error(`no matching span; got ${exporter.getFinishedSpans().map((s) => s.name)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
}
