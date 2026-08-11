import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';
import { optionalAuth } from './middleware/auth';

import authRouter from './modules/auth/auth.router';
import chatRouter from './modules/chat/chat.router';
import faceRouter from './modules/face/face.router';
import intentsRouter from './modules/intents/intents.router';
import matchesRouter from './modules/matches/matches.router';
import notificationsRouter from './modules/notifications/notifications.router';
import postsRouter from './modules/posts/posts.router';
import safetyRouter from './modules/safety/safety.router';
import usersRouter from './modules/users/users.router';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', service: 'daffodils-api', time: new Date().toISOString() })
  );

  // optionalAuth first so the rate limiter can key on user id rather than IP,
  // which stops one NAT'd office from sharing a single bucket.
  const api = express.Router();
  api.use(optionalAuth);
  api.use(generalLimiter);

  api.use('/auth', authRouter);
  api.use('/face', faceRouter);
  api.use('/users', usersRouter);
  api.use('/intents', intentsRouter);
  api.use('/matches', matchesRouter);
  api.use('/posts', postsRouter);
  api.use('/chat', chatRouter);
  api.use('/safety', safetyRouter);
  api.use('/notifications', notificationsRouter);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
