import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { env } from '../config/env';

const keyByUserOrIp = (req: Request) => req.user?.id ?? req.ip ?? 'anonymous';

/** 100 req/min across the API (spec §11). */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.limits.generalRatePerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' },
  },
});

/** 10 req/min on auth endpoints (spec §11). */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.limits.authRatePerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, try again in a minute',
    },
  },
});
