export function serializeRequest(req: { method?: string; url?: string }): {
  method?: string;
  path?: string;
} {
  return {
    method: req.method,
    path: typeof req.url === 'string' ? req.url.split('?')[0] : undefined,
  };
}

export function serializeResponse(res: { statusCode?: number }): {
  statusCode?: number;
} {
  return { statusCode: res.statusCode };
}

export function serializeError(err: { type?: string; message?: string }): {
  type?: string;
  message?: string;
} {
  return { type: err.type, message: err.message };
}
