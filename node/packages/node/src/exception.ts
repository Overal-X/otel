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
    const { code, name, stack } = value as ErrorLike;
    const type = code || name;
    const message = messageOf(value as ErrorLike);
    if (type) attrs[ATTR_EXCEPTION_TYPE] = String(type);
    if (message) attrs[ATTR_EXCEPTION_MESSAGE] = message;
    if (stack) attrs[ATTR_EXCEPTION_STACKTRACE] = String(stack);
  }
  if (!attrs[ATTR_EXCEPTION_TYPE] && !attrs[ATTR_EXCEPTION_MESSAGE]) {
    attrs[ATTR_EXCEPTION_MESSAGE] = inspect(value);
  }
  if (escaped) attrs[ATTR_EXCEPTION_ESCAPED] = true;
  return attrs;
}

/**
 * An error's message, or for an `AggregateError` without one, its inner errors' messages:
 * Node's refused connections arrive that way (`ECONNREFUSED` with an empty message, one inner
 * error per address tried).
 */
export function messageOf(value: ErrorLike): string | undefined {
  if (value.message) return String(value.message);
  const inner = (value as { errors?: unknown }).errors;
  if (!Array.isArray(inner)) return undefined;
  const messages = new Set(
    inner.map((e) => (e as ErrorLike | null)?.message).filter(Boolean).map(String),
  );
  return messages.size > 0 ? [...messages].join("; ") : undefined;
}

/**
 * The value to hand the OTel SDK's `recordException`, which drops an empty message: an
 * error-like copy carrying `messageOf`, or the value itself when that changes nothing.
 */
export function withMessage<T>(value: T): T | ErrorLike {
  if (value === null || typeof value !== "object") return value;
  const error = value as ErrorLike;
  const message = messageOf(error);
  if (!message || message === error.message) return value;
  return { code: error.code, name: error.name, message, stack: error.stack };
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
