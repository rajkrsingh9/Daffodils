import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import * as service from './chat.service';

const router = Router();
router.use(requireAuth);

router.get(
  '/rooms',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listRooms(req.user!.id) });
  })
);

router.get(
  '/rooms/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getRoom(req.params.id, req.user!.id) });
  })
);

router.get(
  '/rooms/:id/messages',
  validateQuery(
    z.object({
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
    })
  ),
  asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
    res.json({ data: await service.listMessages(req.params.id, req.user!.id, cursor, limit) });
  })
);

// REST fallback for message send — the socket path is primary.
router.post(
  '/rooms/:id/messages',
  validateBody(
    z.object({
      type: z.enum(['TEXT', 'IMAGE', 'LOCATION']).default('TEXT'),
      body: z.string().max(2000).nullable().optional(),
      mediaUrl: z.string().url().nullable().optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.sendMessage(req.params.id, req.user!.id, req.body),
    });
  })
);

router.post(
  '/rooms/:id/read',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.markRead(req.params.id, req.user!.id) });
  })
);

export default router;
