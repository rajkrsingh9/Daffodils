import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import { DESCRIPTOR_LENGTH } from './face.provider';
import * as faceService from './face.service';

const router = Router();
router.use(requireAuth);

const descriptorSchema = z
  .array(z.number().finite())
  .length(DESCRIPTOR_LENGTH, `descriptor must contain ${DESCRIPTOR_LENGTH} numbers`);

const enrollSchema = z.object({
  descriptor: descriptorSchema,
  challengeToken: z.string().uuid(),
  imageUrl: z.string().url().optional().nullable(),
});

const verifySchema = z.object({
  descriptor: descriptorSchema,
  challengeToken: z.string().uuid(),
});

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({ data: await faceService.status(req.user!.id) });
  })
);

router.post(
  '/challenge',
  asyncHandler(async (req, res) => {
    res.json({ data: await faceService.issueChallenge(req.user!.id) });
  })
);

router.post(
  '/enroll',
  validateBody(enrollSchema),
  asyncHandler(async (req, res) => {
    const { descriptor, challengeToken, imageUrl } = req.body;
    const data = await faceService.enroll(
      req.user!.id,
      descriptor,
      challengeToken,
      imageUrl
    );
    res.status(201).json({ data });
  })
);

router.post(
  '/verify',
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    const { descriptor, challengeToken } = req.body;
    res.json({ data: await faceService.verify(req.user!.id, descriptor, challengeToken) });
  })
);

router.delete(
  '/record',
  asyncHandler(async (req, res) => {
    res.json({ data: await faceService.revoke(req.user!.id) });
  })
);

export default router;
