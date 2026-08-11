import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import * as service from './notifications.service';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validateQuery(
    z.object({
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(30),
    })
  ),
  asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query as unknown as {
      cursor?: string;
      limit: number;
    };
    res.json({ data: await service.list(req.user!.id, cursor, limit) });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ data: { count: await service.unreadCount(req.user!.id) } });
  })
);

router.post(
  '/read',
  validateBody(z.object({ ids: z.array(z.string().uuid()).max(100).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.markRead(req.user!.id, req.body.ids) });
  })
);

export default router;
