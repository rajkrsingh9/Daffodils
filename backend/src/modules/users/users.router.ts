import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import * as service from './users.service';

const router = Router();
router.use(requireAuth);

const usernameParam = z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/);

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  bio: z.string().max(300).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  username: usernameParam.optional(),
  interestTags: z.array(z.string().min(1).max(30)).max(15).optional(),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getMe(req.user!.id) });
  })
);

router.patch(
  '/me',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.updateMe(req.user!.id, req.body) });
  })
);

router.get(
  '/username-available',
  validateQuery(z.object({ username: usernameParam })),
  asyncHandler(async (req, res) => {
    const { username } = req.query as unknown as { username: string };
    res.json({ data: await service.checkUsername(username) });
  })
);

router.get(
  '/search',
  validateQuery(
    z.object({
      q: z.string().min(1).max(40),
      limit: z.coerce.number().int().min(1).max(30).default(20),
    })
  ),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as { q: string; limit: number };
    res.json({ data: await service.search(q, req.user!.id, limit) });
  })
);

router.post(
  '/me/location',
  validateBody(locationSchema),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    res.json({ data: await service.updateLocation(req.user!.id, lat, lng) });
  })
);

router.post(
  '/me/devices',
  validateBody(
    z.object({
      expoPushToken: z.string().min(10).max(200),
      platform: z.enum(['ios', 'android', 'web']).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { expoPushToken, platform } = req.body;
    res.json({ data: await service.registerDevice(req.user!.id, expoPushToken, platform) });
  })
);

router.delete(
  '/me/devices',
  validateBody(z.object({ expoPushToken: z.string().min(10).max(200) })),
  asyncHandler(async (req, res) => {
    res.json({
      data: await service.unregisterDevice(req.user!.id, req.body.expoPushToken),
    });
  })
);

router.get(
  '/me/blocks',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listBlocked(req.user!.id) });
  })
);

router.post(
  '/report',
  validateBody(
    z.object({
      username: usernameParam.optional(),
      postId: z.string().uuid().optional(),
      reason: z.string().min(3).max(80),
      details: z.string().max(500).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.report(req.user!.id, req.body) });
  })
);

// Public profile routes — every profile is public (posts_profile_layer.svg).
router.get(
  '/:username',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getProfile(req.params.username, req.user!.id) });
  })
);

router.get(
  '/:username/activity',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getActivity(req.params.username, req.user!.id) });
  })
);

router.get(
  '/:username/reviews',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getReviews(req.params.username) });
  })
);

router.post(
  '/:username/block',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.block(req.user!.id, req.params.username) });
  })
);

router.delete(
  '/:username/block',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.unblock(req.user!.id, req.params.username) });
  })
);

export default router;
