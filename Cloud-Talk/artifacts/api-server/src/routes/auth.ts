import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

export function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    nickname: user.nickname,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    expires: expiresAt,
  });
}

// POST /auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { nickname, password, displayName } = req.body;
  if (!nickname || !password) {
    res.status(400).json({ error: "nickname and password are required" });
    return;
  }
  if (nickname.length < 3 || nickname.length > 32) {
    res.status(400).json({ error: "nickname must be 3-32 characters" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "password must be at least 6 characters" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.nickname, nickname)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Nickname already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ nickname, passwordHash, displayName: displayName || null, isOnline: true })
    .returning();

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);

  // Return token in body so frontend can use it as Bearer token (works in iframes)
  res.status(201).json({ user: formatUser(user), token });
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    res.status(400).json({ error: "nickname and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.nickname, nickname)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid nickname or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid nickname or password" });
    return;
  }

  await db.update(usersTable).set({ isOnline: true }).where(eq(usersTable.id, user.id));

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);

  res.json({ user: formatUser({ ...user, isOnline: true }), token });
});

// POST /auth/logout
router.post("/logout", requireAuth, async (req: AuthRequest, res: Response) => {
  const token = req.cookies?.session ?? req.headers.authorization?.slice(7);
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    await db.update(usersTable).set({ isOnline: false, lastSeen: new Date() }).where(eq(usersTable.id, req.userId!));
  }
  res.clearCookie("session");
  res.json({ success: true });
});

// GET /auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

export default router;
