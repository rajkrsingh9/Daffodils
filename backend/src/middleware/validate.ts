import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

/** Zod validation on every request body (spec §11). */
export const validateBody =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };

export const validateQuery =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // Express 4 allows reassigning req.query; keep the parsed/coerced values.
    Object.defineProperty(req, 'query', { value: result.data, writable: true });
    next();
  };

export const validateParams =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(result.error);
    req.params = result.data;
    next();
  };

/** Wraps async handlers so rejected promises reach the error middleware. */
export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
    fn: T
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
