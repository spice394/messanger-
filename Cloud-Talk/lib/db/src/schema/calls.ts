import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const callsTable = pgTable("calls", {
  id: serial("id").primaryKey(),
  callerId: integer("caller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // audio, video
  status: text("status").notNull().default("ringing"), // ringing, active, ended, rejected, missed
  duration: integer("duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  sdpOffer: text("sdp_offer"),
  sdpAnswer: text("sdp_answer"),
  iceCandidatesA: text("ice_candidates_a"), // caller's ICE candidates (JSON array)
  iceCandidatesB: text("ice_candidates_b"), // receiver's ICE candidates (JSON array)
});

export const insertCallSchema = createInsertSchema(callsTable).omit({ id: true, createdAt: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;
