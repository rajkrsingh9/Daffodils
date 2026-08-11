import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import * as service from './safety.service';

const router = Router();
router.use(requireAuth);

const phone = z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number');

router.get(
  '/trusted-contact',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getTrustedContact(req.user!.id) });
  })
);

router.put(
  '/trusted-contact',
  validateBody(
    z.object({
      name: z.string().min(1).max(60),
      phone,
      relation: z.string().max(40).nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.setTrustedContact(req.user!.id, req.body) });
  })
);

router.delete(
  '/trusted-contact',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.removeTrustedContact(req.user!.id) });
  })
);

router.post(
  '/sos',
  validateBody(
    z.object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      matchId: z.string().uuid().optional(),
      note: z.string().max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.triggerSos(req.user!.id, req.body) });
  })
);

router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listSafetyLogs(req.user!.id) });
  })
);

router.post(
  '/live-location',
  validateBody(
    z.object({
      matchId: z.string().uuid(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
  ),
  asyncHandler(async (req, res) => {
    const { matchId, lat, lng } = req.body;
    res.json({ data: await service.shareLiveLocation(matchId, req.user!.id, lat, lng) });
  })
);

export default router;
