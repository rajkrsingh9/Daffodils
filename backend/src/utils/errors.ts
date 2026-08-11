export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(400, msg, code, details);

export const unauthorized = (msg = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, msg, code);

export const forbidden = (msg = 'Not allowed', code = 'FORBIDDEN') =>
  new AppError(403, msg, code);

export const notFound = (msg = 'Not found', code = 'NOT_FOUND') =>
  new AppError(404, msg, code);

export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, msg, code);

export const tooManyRequests = (msg: string, code = 'RATE_LIMITED') =>
  new AppError(429, msg, code);
