import { inspect } from "node:util";
import type { Attributes } from "@opentelemetry/api";
import {
  ATTR_EXCEPTION_ESCAPED,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from "@opentelemetry/semantic-conventions";

interface ErrorLike {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  stack?: unknown;
}

/**
 * The attributes of an `exception` event, derived exactly as the OTel SDK's `recordException`
 * derives them (`code` before `name`), so an error recorded here and by an instrumentation
 * deduplicates on the server. Unlike `recordException`, a thrown value with neither a type nor a
 * message still yields an event, and `escaped` can be set.
 */
export function exceptionAttributes(value: unknown, escaped = false): Attributes {
  const attrs: Attributes = {};
  if (typeof value === "string") {
    attrs[ATTR_EXCEPTION_MESSAGE] = value;
  } else if (value !== null && typeof value === "object") {
    const { code, name, message, stack } = value as ErrorLike;
    const type = code || name;
    if (type) attrs[ATTR_EXCEPTION_TYPE] = String(type);
    if (message) attrs[ATTR_EXCEPTION_MESSAGE] = String(message);
    if (stack) attrs[ATTR_EXCEPTION_STACKTRACE] = String(stack);
  }
  if (!attrs[ATTR_EXCEPTION_TYPE] && !attrs[ATTR_EXCEPTION_MESSAGE]) {
    attrs[ATTR_EXCEPTION_MESSAGE] = inspect(value);
  }
  if (escaped) attrs[ATTR_EXCEPTION_ESCAPED] = true;
  return attrs;
}

export function statusMessage(value: unknown): string {
  const attrs = exceptionAttributes(value);
  return String(attrs[ATTR_EXCEPTION_MESSAGE] ?? attrs[ATTR_EXCEPTION_TYPE]);
}

/**
 * Whether a framework error handler should report the error: 4xx errors such as a thrown
 * `NotFound` are the client's mistake, the same line Express's and Fastify's own handlers draw
 * when they pick the response status from `status`/`statusCode`.
 */
export function isServerError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return true;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const code = typeof status === "number" ? status : statusCode;
  return typeof code !== "number" || code < 400 || code >= 500;
}
