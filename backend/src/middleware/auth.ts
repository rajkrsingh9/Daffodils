import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db';
import { forbidden, unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../utils/tokens';

export interface AuthUser {
  id: string;
  username: string;
  trustTier: string;
  faceVerified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Every route outside /auth/* passes through here (spec §11). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing bearer token'));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = {
      id: payload.sub,
      username: payload.username,
      trustTier: payload.tier,
      faceVerified: payload.faceVerified,
    };
    next();
  } catch (err) {
    const expired = (err as Error).name === 'TokenExpiredError';
    next(
      unauthorized(
        expired ? 'Access token expired' : 'Invalid access token',
        expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED'
      )
    );
  }
}

/** Populates req.user when a token is present but never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = {
      id: payload.sub,
      username: payload.username,
      trustTier: payload.tier,
      faceVerified: payload.faceVerified,
    };
  } catch {
    /* ignore — treated as anonymous */
  }
  next();
}

/**
 * Spec §2: "Facial record and authentication is necessary for posting intents.
 * Normal user can only build their personal profile and cannot create or join
 * any intent."
 *
 * Reads the live DB flag rather than trusting the JWT claim, because a face
 * record can be revoked mid-session and the access token would still assert
 * the stale value for up to 15 minutes.
 */
export async function requireFaceVerified(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.user) return next(unauthorized());
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { faceVerified: true },
  });
  if (!user?.faceVerified) {
    return next(
      forbidden(
        'Face verification required before you can create or join an intent',
        'FACE_VERIFICATION_REQUIRED'
      )
    );
  }
  req.user.faceVerified = true;
  next();
}
