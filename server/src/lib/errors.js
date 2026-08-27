const STATUS_CODES = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

export class ApiError extends Error {
  constructor(code, message, fields) {
    super(message);
    this.code = code;
    this.status = STATUS_CODES[code] || 500;
    this.fields = fields;
  }
}

export function fail(res, code, message, fields) {
  const status = STATUS_CODES[code] || 500;
  const error = { code, message };
  if (fields) error.fields = fields;
  return res.status(status).json({ error });
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function errorMiddleware(err, req, res, _next) {
  if (err instanceof ApiError) {
    fail(res, err.code, err.message, err.fields);
    return;
  }
  console.error(err);
  fail(res, "server_error", "Something went wrong.");
}
