import { Router, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { formatUser } from "./auth";

const router = Router();

// GET /users/search?q=...
router.get("/search", requireAuth, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    res.json([]);
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.nickname, `%${q.trim()}%`))
    .limit(20);

  res.json(users.filter(u => u.id !== req.userId).map(formatUser));
});

// GET /users/:userId
router.get("/:userId", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

export default router;
