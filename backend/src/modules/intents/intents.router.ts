import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFaceVerified } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import * as matchesService from '../matches/matches.service';
import * as service from './intents.service';

const router = Router();
router.use(requireAuth);

const vibeTag = z.enum(['CASUAL', 'ENERGETIC', 'QUIET', 'ADVENTUROUS']);

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).nullable().optional(),
  activityEmoji: z.string().max(8).optional(),
  locationName: z.string().min(2).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  scheduledAt: z.string().datetime(),
  groupSize: z.number().int().min(1).max(6),
  vibeTag,
  radiusKm: z.number().min(1).max(20),
  expiresAt: z.string().datetime(),
  fromPostId: z.string().uuid().optional(),
});

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).default(10),
  vibeTag: vibeTag.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Creating an intent requires a verified face record (spec §2).
router.post(
  '/',
  requireFaceVerified,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createIntent(req.user!.id, req.body) });
  })
);

router.get(
  '/nearby',
  validateQuery(nearbySchema),
  asyncHandler(async (req, res) => {
    const params = req.query as unknown as {
      lat: number;
      lng: number;
      radiusKm: number;
      vibeTag?: 'CASUAL' | 'ENERGETIC' | 'QUIET' | 'ADVENTUROUS';
      limit: number;
    };
    res.json({ data: await service.nearbyIntents(req.user!.id, params) });
  })
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.myIntents(req.user!.id) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getIntent(req.params.id, req.user!.id) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.cancelIntent(req.params.id, req.user!.id) });
  })
);

router.post(
  '/:id/rebroadcast',
  requireFaceVerified,
  asyncHandler(async (req, res) => {
    res.json({ data: await service.rebroadcast(req.params.id, req.user!.id) });
  })
);

// "I'm in →" — also face gated: a normal user cannot join any intent.
router.post(
  '/:id/respond',
  requireFaceVerified,
  validateBody(z.object({ message: z.string().max(200).nullable().optional() })),
  asyncHandler(async (req, res) => {
    const data = await matchesService.respond(
      req.params.id,
      req.user!.id,
      req.body.message
    );
    res.status(201).json({ data });
  })
);

router.delete(
  '/:id/respond',
  asyncHandler(async (req, res) => {
    res.json({ data: await matchesService.withdraw(req.params.id, req.user!.id) });
  })
);

// Maker dashboard — live list of yes-responders.
router.get(
  '/:id/responses',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listResponses(req.params.id, req.user!.id) });
  })
);

// "Choose →" on a responder card.
router.post(
  '/:id/select',
  validateBody(z.object({ responseId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const data = await matchesService.select(
      req.params.id,
      req.body.responseId,
      req.user!.id
    );
    res.json({ data });
  })
);

export default router;
