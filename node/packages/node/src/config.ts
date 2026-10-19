export interface InitOptions {
  /** Base URL of the OTLP intake, like `OTEL_EXPORTER_OTLP_ENDPOINT`; `/v1/traces` is appended. */
  endpoint?: string;
  /** Formatio tracing token, sent as `authorization: Bearer <token>`. */
  token?: string;
  /** Overrides `OTEL_SERVICE_NAME` and `service.name` in `OTEL_RESOURCE_ATTRIBUTES`. */
  serviceName?: string;
}

export interface ExportConfig {
  url: string;
  headers: Record<string, string>;
  serviceName?: string;
}

export type Resolution = { config: ExportConfig } | { missing: "endpoint" | "token" };

type Env = Record<string, string | undefined>;

const TRACES_PATH = "/v1/traces";

/**
 * Applies the contract shared by every Formatio SDK: explicit options, then the standard
 * `OTEL_*` env. The intake rejects unauthenticated exports, so
 * an endpoint without an `authorization` header is as unusable as no endpoint.
 */
export function resolveConfig(options: InitOptions, env: Env): Resolution {
  const url = tracesUrl(options, env);
  if (!url) return { missing: "endpoint" };
  const resolved = headers(options, env);
  if (!resolved.authorization) return { missing: "token" };
  return { config: { url, headers: resolved, serviceName: options.serviceName || undefined } };
}

function tracesUrl(options: InitOptions, env: Env): string | undefined {
  if (options.endpoint) return joinTracesPath(options.endpoint);
  if (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const base = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return base ? joinTracesPath(base) : undefined;
}

// Tolerates a base that already ends in the signal path: people paste the full traces URL
// into the base variable often enough, and `/v1/traces/v1/traces` only fails at export time.
export function joinTracesPath(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.endsWith(TRACES_PATH) ? trimmed : trimmed + TRACES_PATH;
}

function headers(options: InitOptions, env: Env): Record<string, string> {
  if (options.token) return bearer(options.token);
  const raw = env.OTEL_EXPORTER_OTLP_TRACES_HEADERS || env.OTEL_EXPORTER_OTLP_HEADERS;
  return raw ? parseHeaders(raw) : {};
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Parses the OTel `key=value,key2=value2` header list, whose values are URL-encoded. */
export function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim().toLowerCase();
    if (key) out[key] = decode(pair.slice(eq + 1).trim());
  }
  return out;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
