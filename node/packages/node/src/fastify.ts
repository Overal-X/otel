import { captureRequestException } from "./capture";
import { isServerError } from "./exception";

/** The part of a Fastify instance this needs, so Fastify stays an optional peer. */
export interface FastifyLike {
  addHook(
    name: "onError",
    hook: (request: any, reply: any, error: any) => Promise<void>,
  ): unknown;
}

/**
 * Adds an `onError` hook that records the error, with its stack, on the request's span. Errors
 * with a 4xx `statusCode`, such as validation failures, are not recorded.
 */
export function setupFastifyErrorHandler(app: FastifyLike): void {
  app.addHook("onError", async (_request, _reply, error) => {
    if (isServerError(error)) captureRequestException(error);
  });
}
