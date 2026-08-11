import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody } from '../../middleware/validate';
import * as controller from './auth.controller';

const router = Router();

// 10 req/min on every auth endpoint (spec §11).
router.use(authLimiter);

const phone = z
  .string()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in E.164 format');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

const username = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');

const registerSchema = z
  .object({
    phone: phone.optional(),
    email: z.string().email().optional(),
    password,
    name: z.string().min(1).max(60),
    username,
    city: z.string().max(80).optional(),
    deviceId: z.string().min(6).max(128),
    phoneProofToken: z.string().max(64).optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: 'Provide a phone number or an email address',
    path: ['phone'],
  });

const loginSchema = z.object({
  identifier: z.string().min(3).max(128),
  password: z.string().min(1).max(128),
  deviceId: z.string().min(6).max(128),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

const otpSendSchema = z.object({ phone });
const otpVerifySchema = z.object({ phone, code: z.string().length(6) });

router.post('/register', validateBody(registerSchema), asyncHandler(controller.register));
router.post('/login', validateBody(loginSchema), asyncHandler(controller.login));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(controller.refresh));
router.post('/logout', validateBody(refreshSchema), asyncHandler(controller.logout));
router.post('/otp/send', validateBody(otpSendSchema), asyncHandler(controller.sendOtp));

// Works signed-in (upgrades trust tier) or signed-out (returns a proof token
// that registration consumes) — onboarding verifies the phone before the
// account exists.
router.post(
  '/otp/verify',
  optionalAuth,
  validateBody(otpVerifySchema),
  asyncHandler(controller.verifyOtp)
);

export default router;
