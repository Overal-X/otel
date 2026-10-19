/** The fields of Next's `onRequestError` request argument that are used. */
export interface RequestErrorRequest {
  path?: string;
  method?: string;
}

/** The fields of Next's `onRequestError` context argument that are used. */
export interface RequestErrorContext {
  routePath?: string;
  routeType?: string;
}

export function requestErrorAttributes(
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (context.routePath) attrs["next.route"] = context.routePath;
  if (context.routeType) attrs["next.route_type"] = context.routeType;
  if (request.method) attrs["http.request.method"] = request.method;
  if (request.path) attrs["url.path"] = request.path;
  return attrs;
}
