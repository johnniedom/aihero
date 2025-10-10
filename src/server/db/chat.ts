import { randomUUID } from "node:crypto";

import type { UIMessage } from "ai";
import { asc, desc, eq } from "drizzle-orm";

// These helpers codify the rules for chat persistence in one place so the rest of the
// codebase can stay focused on product logic. Treat this file as the single source of truth
// for how chats and messages map into Postgres.

import { db } from "./index";
import { chats, messages } from "./schema";

// Prefer generating message IDs here so callers do not need to remember to do it.
const messageId = () => randomUUID();

type Message = UIMessage;

type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
// The UI SDK allows messages to carry different part shapes (text, image, tool output, ...).
// This utility type lets us work with those parts without hard-coding every variant.
type MessagePart = Message extends { parts: Array<infer Part> } ? Part : never;

type MessageInsertRow = typeof messages.$inferInsert;

type ChatWithMessages = ChatRow & {
  messages: Array<Omit<MessageRow, "parts"> & { parts: MessagePart[] }>;
};

type ChatSummary = Pick<ChatRow, "id" | "title" | "createdAt" | "updatedAt">;

// Normalize every incoming message into an array of "parts" so we can store a consistent
// JSON payload. The AI SDK historically exposed both `content` and `parts`; this guard keeps
// us resilient to either form.
const toMessageParts = (message: Message): MessagePart[] => {
  const candidate = (message as { parts?: unknown; content?: unknown }).parts;
  if (Array.isArray(candidate)) {
    return candidate as MessagePart[];
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return [{ type: "text", text: content }] as MessagePart[];
  }

  if (Array.isArray(content)) {
    return content as MessagePart[];
  }

  return [];
};

// Drizzle returns raw DB rows. This helper ensures each message has the parsed parts array
// and is sorted in conversational order before we hand it back to the caller.
const formatChatWithMessages = (
  chat: ChatRow & { messages: MessageRow[] },
): ChatWithMessages => ({
  ...chat,
  messages: chat.messages
    .map((message) => ({
      ...message,
      parts: (message.parts as MessagePart[]) ?? [],
    }))
    .sort((a, b) => a.order - b.order),
});

// Upsert semantics:
// - Creating a new chat writes both the chat and message rows.
// - Updating an existing chat replaces the entire message set in a single transaction.
// - Writes are scoped by userId so we cannot accidentally overwrite another user's data.
export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: Message[];
}): Promise<ChatWithMessages> =>
  db.transaction(async (tx) => {
    // First, determine whether we are creating or replacing a chat.
    const existing = await tx.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, opts.chatId),
      with: {
        messages: {
          orderBy: (message, { asc }) => [asc(message.order)],
        },
      },
    });

    // Guardrail: never allow a user to overwrite someone else's chat.
    if (existing && existing.userId !== opts.userId) {
      throw new Error("Chat does not belong to user");
    }

    const now = new Date();

    if (existing) {
      // Update the chat metadata and clear old messages so we can fully replace them.
      await tx
        .update(chats)
        .set({ title: opts.title, updatedAt: now })
        .where(eq(chats.id, opts.chatId));

      await tx.delete(messages).where(eq(messages.chatId, opts.chatId));
    } else {
      // Chat does not exist yet; create it using the provided identifiers.
      await tx.insert(chats).values({
        id: opts.chatId,
        userId: opts.userId,
        title: opts.title,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (opts.messages.length > 0) {
      // Recreate the message thread in order so later reads are deterministic.
      const payload: MessageInsertRow[] = opts.messages.map(
        (message, index) => ({
          id: (message as { id?: string }).id ?? messageId(),
          chatId: opts.chatId,
          role: message.role,
          parts: toMessageParts(message),
          order: index,
          createdAt: now,
          updatedAt: now,
        }),
      );

      await tx.insert(messages).values(payload);
    }

    // Return the freshly written state so callers receive the authoritative view.
    const refreshed = await tx.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, opts.chatId),
      with: {
        messages: {
          orderBy: (message, { asc }) => [asc(message.order)],
        },
      },
    });

    if (!refreshed) {
      throw new Error("Chat upsert failed");
    }

    return formatChatWithMessages(refreshed);
  });

// Fetch a single chat along with its messages, validating ownership at the query layer.
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

  return formatChatWithMessages(chat);
};

// Lightweight listing endpoint: we deliberately skip message bodies for performance and bandwidth.
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
