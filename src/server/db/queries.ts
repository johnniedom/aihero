import { randomUUID } from "node:crypto";

import type { UIMessage } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "./index";
import { chats, messages } from "./schema";

// Type aliases keep the rest of the file approachable for juniors.
type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export type ChatSummary = Pick<
  ChatRow,
  "id" | "title" | "createdAt" | "updatedAt"
>;

export type ChatWithMessages = ChatRow & {
  messages: MessageRow[];
};

type Message = UIMessage;
type MessagePart = Message extends { parts: Array<infer Part> } ? Part : never;

/**
 * Normalizes whatever shape the UI sent (parts or content) into the parts array we store in Postgres.
 */
const normalizeParts = (message: Message): MessagePart[] => {
  const candidate = (message as { parts?: unknown }).parts;
  console.log("normalizeParts candidate:", candidate, message);

  if (Array.isArray(candidate)) {
    return candidate as MessagePart[];
  }

  const content = (message as { content?: unknown }).content;
  
  if (typeof content === "string") {
    return [{ type: "text", text: content } as MessagePart];
  }

  if (Array.isArray(content)) {
    return content as MessagePart[];
  }

  return [] as MessagePart[];
};

const now = () => new Date();

export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: Message[];
}): Promise<{ id: string }> =>
  db.transaction(async (tx) => {
    const { userId, chatId, title, messages: newMessages } = opts;
    const existing = await tx.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, chatId),
      columns: {
        id: true,
        userId: true,
      },
    });

    if (existing && existing.userId !== userId) {
      throw new Error("Chat does not belong to user");
    }

    const timestamp = now();

    if (existing) {
      await tx
        .update(chats)
        .set({ title: title, updatedAt: timestamp })
        .where(eq(chats.id, chatId));

      await tx.delete(messages).where(eq(messages.chatId, chatId));
    } else {
      await tx.insert(chats).values({
        id: chatId,
        userId: userId,
        title: title,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    if (newMessages.length > 0) {
      const payload = newMessages.map((message, index) => ({
        id: (message as { id?: string }).id ?? randomUUID(),
        chatId: chatId,
        role: message.role,
        parts: normalizeParts(message),
        order: index,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

      await tx.insert(messages).values(payload);
    }

    return { id: opts.chatId };
  });

export const getChat = async (opts: {
  userId: string;
  chatId: string;
}): Promise<ChatWithMessages | null> => {
  const chat = await db.query.chats.findFirst({
    where: (chat, { and, eq }) =>
      and(eq(chat.id, opts.chatId), eq(chat.userId, opts.userId)),
    with: {
      messages: {
        orderBy: (message, { asc }) => [asc(message.order)],
      },
    },
  });

  if (!chat) {
    return null;
  }

  return chat;
};

export const getChats = async (opts: {
  userId: string;
}): Promise<ChatSummary[]> =>
  db
    .select({
      id: chats.id,
      title: chats.title,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(eq(chats.userId, opts.userId))
    .orderBy(desc(chats.updatedAt));
