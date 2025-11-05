import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  stepCountIs,
  tool,
  generateId,
} from "ai";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { model } from "~/server/ai/modals";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { requestLogs } from "~/server/db/schema";
import { upsertChat } from "~/server/db/queries";

// Import for web search
import { searchSerper } from "~/serper";
import * as z from "zod";

// Allow streaming response up 60 seconds
export const maxDuration = 60;

// Daily request limit for non-admin users to prevent abuse
const DAILY_REQUEST_LIMIT = 15;

type LegacyContent = string | Array<string | { text?: string }>;

const extractText = (part: UIMessage["parts"][number]): string => {
  if (typeof part === "string") {
    return part;
  }

  if (typeof part === "object" && part !== null && "text" in part) {
    const textValue = (part as { text?: unknown }).text;
    if (typeof textValue === "string") {
      return textValue;
    }
  }

  return "";
};

// Helper: get a plain text string from a UIMessage (handles both parts and legacy content)
const getMessageText = (message: UIMessage | undefined): string => {
  if (!message) return "";

  const partsText = (message.parts ?? [])
    .map((part) => extractText(part))
    .filter((value) => value.length > 0)
    .join(" ");

  if (partsText.length > 0) {
    return partsText;
  }

  const legacyContent = (message as { content?: LegacyContent }).content;

  if (typeof legacyContent === "string") {
    return legacyContent;
  }

  if (Array.isArray(legacyContent)) {
    return legacyContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const textValue = item?.text;
        return typeof textValue === "string" ? textValue : "";
      })
      .filter((value) => value.length > 0)
      .join(" ");
  }

  return "";
};

const deriveChatTitle = (chatMessages: UIMessage[]): string => {
  if (chatMessages.length === 0) {
    return "New Chat";
  }

  const lastUserMessage =
    [...chatMessages].reverse().find((message) => message.role === "user") ??
    chatMessages[chatMessages.length - 1];

  const text = getMessageText(lastUserMessage);

  if (!text) {
    return "New Chat";
  }

  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Extract admin status and user ID for rate limiting logic
  const isAdmin = session.user.isAdmin ?? false;
  const userId = session.user.id;

  // System prompt
  const systemMessage = {
    role: "system",
    content:
      "You are a helpful assistant with access to real-time web search.\n\n" +
      "CRITICAL FORMATTING RULE: When you receive URLs from the searchTheWeb tool, you MUST format them as markdown links in your response.\n" +
      "Format: [Descriptive Text](https://actual-url.com)\n" +
      "Example: [Premier League Official Stats](https://www.premierleague.com/stats)\n\n" +
      "Guidelines:\n" +
      "1. Use the searchTheWeb tool when questions require current information or specific websites\n" +
      "2. ALWAYS convert URLs to clickable markdown links - NEVER show plain URLs\n" +
      "3. Use the page title or a descriptive name as the link text\n" +
      "4. Include multiple relevant links when available\n" +
      "5. Cite your sources by providing these formatted links\n\n" +
      "Remember: Raw URLs like 'https://example.com' are NOT acceptable. Always use markdown link format!",
  };

  try {
    // Rate limiting: Check daily request count for non-admin users
    if (!isAdmin) {
      const now = new Date();
      const startOfToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(requestLogs)
        .where(
          and(
            eq(requestLogs.userId, userId),
            gte(requestLogs.createdAt, startOfToday),
            lt(requestLogs.createdAt, startOfTomorrow),
          ),
        );

      const requestCount = Number(countResult?.count ?? 0);

      if (requestCount >= DAILY_REQUEST_LIMIT) {
        return new Response("Too Many Requests", { status: 429 });
      }
    }

    // Log the request after passing rate limit check
    await db.insert(requestLogs).values({ userId });

    const body = (await request.json()) as {
      messages: Array<UIMessage>;
      chatId?: string;
    };

    const { messages: incomingMessages, chatId } = body;

    if (!incomingMessages || incomingMessages.length === 0) {
      return new Response("Bad Request: No messages provided", { status: 400 });
    }

    let currentChatId: string;
    let chatTitle: string | undefined;

    if (typeof chatId !== "string" || chatId.length === 0) {
      currentChatId = crypto.randomUUID();
      chatTitle = deriveChatTitle(incomingMessages);
      try {
        await upsertChat({
          userId,
          chatId: currentChatId,
          title: chatTitle,
          messages: incomingMessages,
        });
      } catch (err) {
        console.error("Error creating new chat:", err);
      }
    } else {
      currentChatId = chatId;
      // verify if chat belongs to the user
      const chat = await db.query.chats.findFirst({
        where: (chat, { eq }) => eq(chat.id, currentChatId),
      });
      if (chat?.userId !== userId) {
        return new Response("Unauthorized: Chat does not belong to user", {
          status: 401,
        });
      }
      chatTitle = chat.title;
    }

    const result = streamText({
      model: model,
      messages: convertToModelMessages(incomingMessages),
      system: systemMessage.content,
      stopWhen: stepCountIs(10), // allow up 10 steps
      tools: {
        searchTheWeb: tool({
          description:
            "Search the web for current information. Returns title, link (URL), and snippet for each result. " +
            "Use this when user asks about websites, current events, or specific information. " +
            "IMPORTANT: Always share the returned links with the user in your response.",
          inputSchema: z.object({
            query: z.string().describe("The query to search the web for"),
            num: z.number().int().min(1).max(10).optional(),
          }),

          execute: async ({ query }, { abortSignal }) => {
            try {
              const result = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return result.organic.map((r) => ({
                title: r.title,
                link: r.link,
                snippet: r.snippet,
              }));
            } catch (err) {
              // Log server-side for debugging
              console.error("searchWeb.execute error:", err);
              // Return an explicit error object the model can consume (or throw)
              // Returning a small error message is friendlier than throwing from execute
              const toolErrorMessage =
                err instanceof Error
                  ? err.message
                  : typeof err === "string"
                    ? err
                    : JSON.stringify(err);

              return {
                __tool_error: true,
                message: toolErrorMessage,
              };
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: incomingMessages, // IMPORTANT: Required to prevent duplicate messages
      generateMessageId: () => generateId(), // IMPORTANT: Required for proper message ID generation
      onFinish: async ({ messages: completedMessages }) => {
        const title = chatTitle ?? deriveChatTitle(completedMessages);

        try {
          await upsertChat({
            userId,
            chatId: currentChatId,
            title,
            messages: completedMessages,
          });
        } catch (err) {
          console.error("Error saving chat:", err);
        }
      },
    });
  } catch (error) {
    console.error("Error in /api/chat route:", error);
    return new Response("Oops! Something went wrong.", { status: 500 });
  }
}
