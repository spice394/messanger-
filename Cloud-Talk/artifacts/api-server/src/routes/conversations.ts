import { Router, Response } from "express";
import { db, conversationsTable, conversationParticipantsTable, usersTable, messagesTable, reactionsTable } from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { formatUser } from "./auth";
import { formatMessage } from "./messages";

const router = Router();

export async function getConversationWithDetails(conversationId: number, currentUserId: number) {
  const participants = await db
    .select({ user: usersTable, joinedAt: conversationParticipantsTable.createdAt })
    .from(conversationParticipantsTable)
    .innerJoin(usersTable, eq(conversationParticipantsTable.userId, usersTable.id))
    .where(eq(conversationParticipantsTable.conversationId, conversationId));

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) return null;

  const lastMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  let lastMessage = null;
  if (lastMessages.length > 0) {
    lastMessage = await formatMessage(lastMessages[0]);
  }

  return {
    id: conv.id,
    participants: participants.map(p => formatUser(p.user)),
    lastMessage,
    unreadCount: 0,
    createdAt: conv.createdAt.toISOString(),
  };
}

// GET /conversations
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const participantRows = await db
    .select({ conversationId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, req.userId!));

  const convIds = participantRows.map(r => r.conversationId);
  if (convIds.length === 0) {
    res.json([]);
    return;
  }

  const results = await Promise.all(
    convIds.map(id => getConversationWithDetails(id, req.userId!))
  );

  const convs = results.filter(Boolean);
  // Sort by last message time
  convs.sort((a, b) => {
    const aTime = a!.lastMessage?.createdAt ?? a!.createdAt;
    const bTime = b!.lastMessage?.createdAt ?? b!.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  res.json(convs);
});

// POST /conversations
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { participantId } = req.body;
  if (!participantId) {
    res.status(400).json({ error: "participantId is required" });
    return;
  }

  const otherId = parseInt(participantId);
  if (isNaN(otherId) || otherId === req.userId) {
    res.status(400).json({ error: "Invalid participantId" });
    return;
  }

  // Check if conversation already exists between the two users
  const myConvs = await db
    .select({ conversationId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, req.userId!));

  const myConvIds = myConvs.map(r => r.conversationId);

  if (myConvIds.length > 0) {
    const sharedConvs = await db
      .select({ conversationId: conversationParticipantsTable.conversationId })
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.userId, otherId),
          inArray(conversationParticipantsTable.conversationId, myConvIds)
        )
      );

    if (sharedConvs.length > 0) {
      const existing = await getConversationWithDetails(sharedConvs[0].conversationId, req.userId!);
      res.json(existing);
      return;
    }
  }

  // Create new conversation
  const [conv] = await db.insert(conversationsTable).values({}).returning();
  await db.insert(conversationParticipantsTable).values([
    { conversationId: conv.id, userId: req.userId! },
    { conversationId: conv.id, userId: otherId },
  ]);

  const result = await getConversationWithDetails(conv.id, req.userId!);
  res.json(result);
});

// GET /conversations/:conversationId
router.get("/:conversationId", requireAuth, async (req: AuthRequest, res: Response) => {
  const conversationId = parseInt(String(req.params.conversationId));
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const [participant] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, req.userId!)
      )
    )
    .limit(1);

  if (!participant) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const result = await getConversationWithDetails(conversationId, req.userId!);
  if (!result) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(result);
});

export default router;
