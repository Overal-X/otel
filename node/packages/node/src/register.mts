import { register } from "node:module";
import { init } from "./index.js";

// An ESM app's imports never pass through require(), where instrumentations patch modules; this
// loader hook is how they reach them, and it only sees modules loaded after it is registered.
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
init();
