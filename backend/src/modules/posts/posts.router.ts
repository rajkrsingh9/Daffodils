import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import * as service from './posts.service';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  // ACTIVITY_LOG is server-generated only.
  type: z.enum(['MOMENT', 'VIBE_CHECK', 'WISHLIST']),
  caption: z.string().min(1).max(280),
  mediaUrls: z.array(z.string().url()).max(4).optional(),
  locationName: z.string().max(160).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

const feedSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(400).default(0),
});

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.createPost(req.user!.id, req.body) });
  })
);

router.get(
  '/feed',
  validateQuery(feedSchema),
  asyncHandler(async (req, res) => {
    const params = req.query as unknown as {
      lat?: number;
      lng?: number;
      radiusKm: number;
      limit: number;
      offset: number;
    };
    res.json({ data: await service.feed(req.user!.id, params) });
  })
);

// The one endpoint that returns dislikeCount (spec §7).
router.get(
  '/me',
  validateQuery(
    z.object({
      limit: z.coerce.number().int().min(1).max(50).default(30),
      cursor: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    res.json({ data: await service.myPosts(req.user!.id, limit, cursor) });
  })
);

router.get(
  '/me/quota',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.remainingPostsToday(req.user!.id) });
  })
);

router.get(
  '/me/drafts',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listDrafts(req.user!.id) });
  })
);

router.get(
  '/user/:username',
  validateQuery(
    z.object({
      limit: z.coerce.number().int().min(1).max(50).default(30),
      cursor: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    res.json({
      data: await service.userPosts(req.params.username, req.user!.id, limit, cursor),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getPost(req.params.id, req.user!.id) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.deletePost(req.params.id, req.user!.id) });
  })
);

router.post(
  '/:id/publish',
  validateBody(
    z.object({
      caption: z.string().min(1).max(280).optional(),
      mediaUrls: z.array(z.string().url()).max(4).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { caption, mediaUrls } = req.body;
    res.json({
      data: await service.publishDraft(req.params.id, req.user!.id, caption, mediaUrls),
    });
  })
);

router.post(
  '/:id/react',
  validateBody(z.object({ type: z.enum(['LIKE', 'DISLIKE']) })),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.react(req.params.id, req.user!.id, req.body.type) });
  })
);

// Outbound share link only — there is no repost anywhere in the app.
router.get(
  '/:id/share',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.shareLink(req.params.id, req.user!.id) });
  })
);

router.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listComments(req.params.id, req.user!.id) });
  })
);

router.post(
  '/:id/comments',
  validateBody(
    z.object({
      body: z.string().min(1).max(500),
      parentId: z.string().uuid().nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const data = await service.addComment(
      req.params.id,
      req.user!.id,
      req.body.body,
      req.body.parentId
    );
    res.status(201).json({ data });
  })
);

router.delete(
  '/comments/:commentId',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.deleteComment(req.params.commentId, req.user!.id) });
  })
);

export default router;
