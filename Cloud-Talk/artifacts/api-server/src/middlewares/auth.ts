import { Request, Response, NextFunction } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: number;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Accept token from either cookie OR Authorization Bearer header
  let token: string | undefined = req.cookies?.session;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.userId = session.userId;
  next();
}
