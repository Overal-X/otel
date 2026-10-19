export type UnhandledRejectionsMode = "throw" | "strict" | "warn" | "none" | "warn-with-error-code";

const MODES: readonly string[] = ["throw", "strict", "warn", "none", "warn-with-error-code"];
const FLAG = "--unhandled-rejections";

/**
 * The `--unhandled-rejections` mode Node runs in. Process flags override `NODE_OPTIONS`, and the
 * last occurrence wins, as in Node's own option parser.
 */
export function unhandledRejectionsMode(
  execArgv: readonly string[],
  nodeOptions = "",
): UnhandledRejectionsMode {
  const args = [...nodeOptions.split(/\s+/), ...execArgv];
  let mode = "throw";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${FLAG}=`)) mode = arg.slice(FLAG.length + 1);
    else if (arg === FLAG && i + 1 < args.length) mode = args[++i];
  }
  return MODES.includes(mode) ? (mode as UnhandledRejectionsMode) : "throw";
}
