import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

// A clean environment: the test runner's own NODE_TEST_CONTEXT, NODE_OPTIONS or OTEL_* would
// change how the child behaves.
export function childEnv(overrides) {
  return { PATH: process.env.PATH, HOME: process.env.HOME, OTEL_BSP_SCHEDULE_DELAY: "50", ...overrides };
}

export function runNode(args, env) {
  const child = spawn(process.execPath, args, { cwd: fixturesDir, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return {
    child,
    exited,
    output: () => ({ stdout, stderr }),
    waitForLine(pattern, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}; stderr: ${stderr}`)), timeoutMs);
        const check = () => {
          const match = stdout.match(pattern);
          if (match) {
            clearTimeout(timer);
            child.stdout.off("data", check);
            resolve(match);
          }
        };
        child.stdout.on("data", check);
        child.on("exit", () => {
          clearTimeout(timer);
          reject(new Error(`child exited before ${pattern}; stderr: ${stderr}`));
        });
        check();
      });
    },
  };
}
