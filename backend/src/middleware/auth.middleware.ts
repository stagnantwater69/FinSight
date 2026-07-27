import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { prisma } from "../config/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: number;
        authId: string;
        email: string;
      };
    }
  }
}

// Every authenticated route uses this. There is only one role in this
// system (Small Business Owner) — do not add a role check here.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const user = await prisma.user.findUnique({ where: { authId: data.user.id } });
  if (!user) {
    return res.status(401).json({ error: "No FinSight profile for this account" });
  }

  req.user = { id: user.id, authId: user.authId, email: user.email };
  next();
}
