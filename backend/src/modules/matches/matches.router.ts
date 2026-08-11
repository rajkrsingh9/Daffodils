import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import * as service from './matches.service';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listMatches(req.user!.id) });
  })
);

router.get(
  '/pending-ratings',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.pendingRatings(req.user!.id) });
  })
);

// Responder accepts the maker's selection -> match + chat room are created.
router.post(
  '/responses/:responseId/confirm',
  asyncHandler(async (req, res) => {
    const data = await service.confirmSelection(req.params.responseId, req.user!.id);
    res.status(201).json({ data });
  })
);

router.post(
  '/responses/:responseId/decline',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.declineSelection(req.params.responseId, req.user!.id) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.getMatch(req.params.id, req.user!.id) });
  })
);

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    res.json({ data: await service.completeMatch(req.params.id, req.user!.id) });
  })
);

router.post(
  '/:id/cancel',
  validateBody(z.object({ reason: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.cancelMatch(req.params.id, req.user!.id, req.body.reason) });
  })
);

// Post-activity rating: 1–5 stars + optional 140-char review (spec §6).
router.post(
  '/:id/rate',
  validateBody(
    z.object({
      score: z.number().int().min(1).max(5),
      review: z.string().max(140).nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { score, review } = req.body;
    res.status(201).json({ data: await service.rate(req.params.id, req.user!.id, score, review) });
  })
);

export default router;
