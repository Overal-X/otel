import { inspect } from "node:util";
import { reportOnOwnSpan } from "./capture";
import { unhandledRejectionsMode } from "./node-flags";

const CRASH_FLUSH_TIMEOUT_MS = 2000;

type Flush = (timeoutMs: number) => Promise<boolean>;

/**
 * Reports crashes, then reproduces what Node would have done without our listeners: merely
 * adding an `uncaughtException` or `unhandledRejection` listener stops Node from exiting, so
 * the default outcome has to be re-created by hand. Returns a function that removes them.
 */
export function installCrashHandlers(flush: Flush): () => void {
  const rejectionsMode = unhandledRejectionsMode(process.execArgv, process.env.NODE_OPTIONS);
  let exiting = false;
  let forwarding = false;

  const exitAfterFlush = (err: unknown) => {
    if (exiting) return;
    exiting = true;
    process.stderr.write(`${inspect(err)}\n\nNode.js ${process.version}\n`);
    void flush(CRASH_FLUSH_TIMEOUT_MS).finally(() => process.exit(1));
  };

  const onUncaughtException = (err: unknown) => {
    if (forwarding) return;
    reportCrash(err);
    if (!hasOtherListeners("uncaughtException", onUncaughtException)) exitAfterFlush(err);
  };

  const onUnhandledRejection = (reason: unknown) => {
    // Node raised it as an uncaught exception before emitting this, and that was recorded.
    if (rejectionsMode === "strict") return;
    reportCrash(reason);
    if (hasOtherListeners("unhandledRejection", onUnhandledRejection)) return;

    if (rejectionsMode === "throw") {
      if (!hasOtherListeners("uncaughtException", onUncaughtException)) {
        exitAfterFlush(reason);
        return;
      }
      // Without our listener Node would hand the rejection to the app's uncaughtException
      // listeners; do the same, skipping our own so it is not recorded twice.
      forwarding = true;
      try {
        (process as NodeJS.EventEmitter).emit("uncaughtException", reason, "unhandledRejection");
      } finally {
        forwarding = false;
      }
    } else if (rejectionsMode === "warn-with-error-code") {
      process.emitWarning(`Unhandled promise rejection: ${inspect(reason)}`, "UnhandledPromiseRejectionWarning");
      process.exitCode = 1;
    }
  };

  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
  return () => {
    process.off("uncaughtException", onUncaughtException);
    process.off("unhandledRejection", onUnhandledRejection);
  };
}

function reportCrash(err: unknown): void {
  try {
    reportOnOwnSpan("uncaught exception", err, undefined, true);
  } catch {
    // Reporting must never replace the app's crash with one of ours.
  }
}

function hasOtherListeners(event: "uncaughtException" | "unhandledRejection", ours: Function): boolean {
  return (process as NodeJS.EventEmitter).listeners(event).some((listener) => listener !== ours);
}
