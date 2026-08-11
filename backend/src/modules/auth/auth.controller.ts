import { Request, Response } from 'express';
import * as authService from './auth.service';

export async function register(req: Request, res: Response) {
  const data = await authService.register(req.body);
  res.status(201).json({ data });
}

export async function login(req: Request, res: Response) {
  res.json({ data: await authService.login(req.body) });
}

export async function refresh(req: Request, res: Response) {
  res.json({ data: await authService.refresh(req.body.refreshToken) });
}

export async function logout(req: Request, res: Response) {
  res.json({ data: await authService.logout(req.body.refreshToken) });
}

export async function sendOtp(req: Request, res: Response) {
  res.json({ data: await authService.sendOtp(req.body.phone) });
}

export async function verifyOtp(req: Request, res: Response) {
  const data = await authService.verifyOtp(
    req.user?.id ?? null,
    req.body.phone,
    req.body.code
  );
  res.json({ data });
}
