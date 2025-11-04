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

    const existingChat = await tx.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (existingChat) {
      if (existingChat.userId !== userId) {
        throw new Error("Chat ID already exists under a different user");
      }

      // Update chat metadata first. We set `updatedAt` explicitly so the chat's
      // last-modified timestamp reflects the work we're about to do. Because this
      // code runs inside a transaction (`tx`), the update will be rolled back
      // if any subsequent operation (like deleting or reinserting messages)
      // fails — so the database won't be left in a partially-updated state.
      await tx
        .update(chats)
        .set({ title, updatedAt: now() })
        .where(eq(chats.id, chatId));

      // Delete the existing message rows for this chat. We do a hard-delete
      // here because the application's desired semantics are to *replace*
      // the entire message set when upserting
      await tx.delete(messages).where(eq(messages.chatId, chatId));
    } else {
      const timestamp = now();
      await tx.insert(chats).values({
        id: chatId,
        userId,
        title,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    if (newMessages.length > 0) {
      const timestamp = now();
      await tx.insert(messages).values(
        newMessages.map((message, index) => ({
          id: (message as { id?: string }).id ?? randomUUID(),
          chatId,
          role: message.role,
          parts: normalizeParts(message),
          order: index,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    return { id: chatId };
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
