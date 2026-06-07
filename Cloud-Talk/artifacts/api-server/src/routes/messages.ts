import { Router, Response } from "express";
import { db, messagesTable, reactionsTable, usersTable, conversationParticipantsTable } from "@workspace/db";
import { eq, and, lt, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { formatUser } from "./auth";

const router = Router({ mergeParams: true });

export async function formatMessage(msg: typeof messagesTable.$inferSelect) {
  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, msg.senderId)).limit(1);

  const reactionRows = await db
    .select({ reaction: reactionsTable, user: usersTable })
    .from(reactionsTable)
    .innerJoin(usersTable, eq(reactionsTable.userId, usersTable.id))
    .where(eq(reactionsTable.messageId, msg.id));

  let replyTo = null;
  if (msg.replyToId) {
    const [replyMsg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msg.replyToId)).limit(1);
    if (replyMsg) {
      const [replySender] = await db.select().from(usersTable).where(eq(usersTable.id, replyMsg.senderId)).limit(1);
      replyTo = {
        id: replyMsg.id,
        conversationId: replyMsg.conversationId,
        senderId: replyMsg.senderId,
        sender: replySender ? formatUser(replySender) : undefined,
        type: replyMsg.type,
        text: replyMsg.text,
        mediaUrl: replyMsg.mediaUrl,
        mediaDuration: replyMsg.mediaDuration,
        reactions: [],
        replyToId: replyMsg.replyToId,
        createdAt: replyMsg.createdAt.toISOString(),
      };
    }
  }

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    sender: sender ? formatUser(sender) : undefined,
    type: msg.type,
    text: msg.text,
    mediaUrl: msg.mediaUrl,
    mediaDuration: msg.mediaDuration,
    reactions: reactionRows.map(r => ({
      emoji: r.reaction.emoji,
      userId: r.reaction.userId,
      user: formatUser(r.user),
      createdAt: r.reaction.createdAt.toISOString(),
    })),
    replyToId: msg.replyToId,
    replyTo,
    createdAt: msg.createdAt.toISOString(),
  };
}

// GET /conversations/:conversationId/messages
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const conversationId = parseInt(String(req.params.conversationId));
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  // Check participant
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
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const before = req.query.before ? parseInt(req.query.before as string) : undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);

  let query = db
    .select()
    .from(messagesTable)
    .where(
      before
        ? and(eq(messagesTable.conversationId, conversationId), lt(messagesTable.id, before))
        : eq(messagesTable.conversationId, conversationId)
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);

  const msgs = await query;
  const formatted = await Promise.all(msgs.reverse().map(formatMessage));
  res.json(formatted);
});

// POST /conversations/:conversationId/messages
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
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
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { type = "text", text, mediaUrl, mediaDuration, replyToId } = req.body;

  if (type === "text" && !text?.trim()) {
    res.status(400).json({ error: "text is required for text messages" });
    return;
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      senderId: req.userId!,
      type,
      text: text || null,
      mediaUrl: mediaUrl || null,
      mediaDuration: mediaDuration || null,
      replyToId: replyToId || null,
    })
    .returning();

  const formatted = await formatMessage(msg);
  res.status(201).json(formatted);
});

// DELETE /conversations/:conversationId/messages/:messageId
router.delete("/:messageId", requireAuth, async (req: AuthRequest, res: Response) => {
  const messageId = parseInt(String(req.params.messageId));
  if (isNaN(messageId)) {
    res.status(400).json({ error: "Invalid message ID" });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg || msg.senderId !== req.userId) {
    res.status(403).json({ error: "Cannot delete this message" });
    return;
  }

  await db.delete(messagesTable).where(eq(messagesTable.id, messageId));
  res.json({ success: true });
});

// POST /conversations/:conversationId/messages/:messageId/reactions
router.post("/:messageId/reactions", requireAuth, async (req: AuthRequest, res: Response) => {
  const messageId = parseInt(String(req.params.messageId));
  const { emoji } = req.body;

  if (!emoji) {
    res.status(400).json({ error: "emoji is required" });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  // Remove existing reaction with same emoji from this user
  await db
    .delete(reactionsTable)
    .where(
      and(
        eq(reactionsTable.messageId, messageId),
        eq(reactionsTable.userId, req.userId!),
        eq(reactionsTable.emoji, emoji)
      )
    );

  await db.insert(reactionsTable).values({
    messageId,
    userId: req.userId!,
    emoji,
  });

  const formatted = await formatMessage(msg);
  res.json(formatted);
});

// DELETE /conversations/:conversationId/messages/:messageId/reactions?emoji=...
router.delete("/:messageId/reactions", requireAuth, async (req: AuthRequest, res: Response) => {
  const messageId = parseInt(String(req.params.messageId));
  const emoji = req.query.emoji as string;

  if (!emoji) {
    res.status(400).json({ error: "emoji query param is required" });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  await db
    .delete(reactionsTable)
    .where(
      and(
        eq(reactionsTable.messageId, messageId),
        eq(reactionsTable.userId, req.userId!),
        eq(reactionsTable.emoji, emoji)
      )
    );

  const formatted = await formatMessage(msg);
  res.json(formatted);
});

export default router;
