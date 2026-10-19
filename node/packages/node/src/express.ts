import { captureRequestException } from "./capture";
import { isServerError } from "./exception";

export type ExpressErrorHandler = (
  err: unknown,
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void,
) => void;

/**
 * Error middleware that records the error, with its stack, on the request's span and passes it
 * on unchanged. Mount it after all routes and before your own error handlers. Errors carrying a
 * 4xx `status`/`statusCode` are passed on without being recorded.
 */
export function expressErrorHandler(): ExpressErrorHandler {
  // Express tells error middleware apart by its arity, so all four parameters must stay.
  return function formatioErrorHandler(err, _req, _res, next) {
    if (isServerError(err)) captureRequestException(err);
    next(err);
  };
}
