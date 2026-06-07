import { Router, Response } from "express";
import { db, callsTable, usersTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { formatUser } from "./auth";

const router = Router();

async function formatCall(call: typeof callsTable.$inferSelect) {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, call.callerId)).limit(1);
  const [receiver] = await db.select().from(usersTable).where(eq(usersTable.id, call.receiverId)).limit(1);

  return {
    id: call.id,
    callerId: call.callerId,
    caller: caller ? formatUser(caller) : undefined,
    receiverId: call.receiverId,
    receiver: receiver ? formatUser(receiver) : undefined,
    type: call.type,
    status: call.status,
    duration: call.duration,
    createdAt: call.createdAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    sdpOffer: call.sdpOffer ?? null,
    sdpAnswer: call.sdpAnswer ?? null,
    iceCandidatesA: call.iceCandidatesA ?? null,
    iceCandidatesB: call.iceCandidatesB ?? null,
  };
}

// GET /calls/incoming — first ringing call where current user is receiver
router.get("/incoming", requireAuth, async (req: AuthRequest, res: Response) => {
  const [call] = await db
    .select()
    .from(callsTable)
    .where(and(eq(callsTable.receiverId, req.userId!), eq(callsTable.status, "ringing")))
    .orderBy(callsTable.createdAt)
    .limit(1);

  if (!call) {
    res.json(null);
    return;
  }
  res.json(await formatCall(call));
});

// GET /calls/active — first active call where current user is caller or receiver
router.get("/active", requireAuth, async (req: AuthRequest, res: Response) => {
  const [call] = await db
    .select()
    .from(callsTable)
    .where(
      and(
        eq(callsTable.status, "active"),
        or(eq(callsTable.callerId, req.userId!), eq(callsTable.receiverId, req.userId!))
      )
    )
    .orderBy(callsTable.createdAt)
    .limit(1);

  if (!call) {
    res.json(null);
    return;
  }
  res.json(await formatCall(call));
});

// GET /calls/history
router.get("/history", requireAuth, async (req: AuthRequest, res: Response) => {
  const calls = await db
    .select()
    .from(callsTable)
    .where(or(eq(callsTable.callerId, req.userId!), eq(callsTable.receiverId, req.userId!)))
    .orderBy(callsTable.createdAt);

  const formatted = await Promise.all(calls.reverse().map(formatCall));
  res.json(formatted);
});

// GET /calls/:callId — get full call record including signaling fields
router.get("/:callId", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = parseInt(String(req.params.callId));
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);

  if (!call || (call.callerId !== req.userId && call.receiverId !== req.userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  res.json(await formatCall(call));
});

// POST /calls
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { receiverId, type } = req.body;
  if (!receiverId || !type) {
    res.status(400).json({ error: "receiverId and type are required" });
    return;
  }

  const [receiver] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(receiverId))).limit(1);
  if (!receiver) {
    res.status(404).json({ error: "Receiver not found" });
    return;
  }

  const [call] = await db
    .insert(callsTable)
    .values({
      callerId: req.userId!,
      receiverId: parseInt(receiverId),
      type,
      status: "ringing",
    })
    .returning();

  res.status(201).json(await formatCall(call));
});

// POST /calls/:callId/accept
router.post("/:callId/accept", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = parseInt(String(req.params.callId));
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);

  if (!call || call.receiverId !== req.userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  const [updated] = await db
    .update(callsTable)
    .set({ status: "active" })
    .where(eq(callsTable.id, callId))
    .returning();

  res.json(await formatCall(updated));
});

// POST /calls/:callId/reject
router.post("/:callId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = parseInt(String(req.params.callId));
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);

  if (!call || call.receiverId !== req.userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  const [updated] = await db
    .update(callsTable)
    .set({ status: "rejected", endedAt: new Date() })
    .where(eq(callsTable.id, callId))
    .returning();

  res.json(await formatCall(updated));
});

// POST /calls/:callId/end
router.post("/:callId/end", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = parseInt(String(req.params.callId));
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);

  if (!call || (call.callerId !== req.userId && call.receiverId !== req.userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  const endedAt = new Date();
  const duration = call.status === "active"
    ? Math.round((endedAt.getTime() - call.createdAt.getTime()) / 1000)
    : undefined;

  const [updated] = await db
    .update(callsTable)
    .set({ status: "ended", endedAt, ...(duration !== undefined ? { duration } : {}) })
    .where(eq(callsTable.id, callId))
    .returning();

  res.json(await formatCall(updated));
});

// POST /calls/:callId/signal — merge SDP/ICE signaling data
router.post("/:callId/signal", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = parseInt(String(req.params.callId));
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);

  if (!call || (call.callerId !== req.userId && call.receiverId !== req.userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  const { sdpOffer, sdpAnswer, candidatesA, candidatesB } = req.body as {
    sdpOffer?: string;
    sdpAnswer?: string;
    candidatesA?: string;
    candidatesB?: string;
  };

  const updates: Partial<typeof callsTable.$inferInsert> = {};
  if (sdpOffer !== undefined) updates.sdpOffer = sdpOffer;
  if (sdpAnswer !== undefined) updates.sdpAnswer = sdpAnswer;

  // Merge ICE candidates by appending new ones to the existing JSON array
  if (candidatesA !== undefined) {
    const existing: unknown[] = call.iceCandidatesA ? JSON.parse(call.iceCandidatesA) : [];
    const incoming: unknown[] = JSON.parse(candidatesA);
    updates.iceCandidatesA = JSON.stringify([...existing, ...incoming]);
  }
  if (candidatesB !== undefined) {
    const existing: unknown[] = call.iceCandidatesB ? JSON.parse(call.iceCandidatesB) : [];
    const incoming: unknown[] = JSON.parse(candidatesB);
    updates.iceCandidatesB = JSON.stringify([...existing, ...incoming]);
  }

  if (Object.keys(updates).length === 0) {
    res.json(await formatCall(call));
    return;
  }

  const [updated] = await db
    .update(callsTable)
    .set(updates)
    .where(eq(callsTable.id, callId))
    .returning();

  res.json(await formatCall(updated));
});

export default router;
