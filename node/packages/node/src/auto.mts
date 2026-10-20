import { register } from "node:module";
import { init } from "./index.js";
import { isPackageManager } from "./package-manager.js";

// Formatio's build preloads this through NODE_OPTIONS, which every Node process in the container
// inherits, npm running the start script among them; only the application should report.
if (!isPackageManager(process.argv[1])) {
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  init();
}
