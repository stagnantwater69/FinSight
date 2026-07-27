import type { Request, Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  phoneNumber: z.string().max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const recoverPasswordSchema = z.object({
  email: z.string().email(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).nullable().optional(),
  lastName: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().max(20).nullable().optional(),
});

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const result = await authService.registerUser(input);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.loginUser(input);
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (token) {
    await authService.logoutUser(token);
  }
  res.status(204).send();
}

export async function recoverPassword(req: Request, res: Response) {
  const { email } = recoverPasswordSchema.parse(req.body);
  await authService.requestPasswordRecovery(email);
  res.status(200).json({ message: "If that email is registered, a reset link has been sent." });
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.id, input.currentPassword, input.newPassword);
  res.status(200).json({ message: "Password changed." });
}

export async function getMe(req: Request, res: Response) {
  const profile = await authService.getProfile(req.user!.id);
  res.status(200).json(profile);
}

export async function updateMe(req: Request, res: Response) {
  const input = updateProfileSchema.parse(req.body);
  const profile = await authService.updateProfile(req.user!.id, input);
  res.status(200).json(profile);
}
