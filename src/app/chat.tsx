"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { isNewChatCreatedStreamPart } from "~/lib/chat-data";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string | undefined;
}

export const ChatPage = ({ userName, isAuthenticated, chatId }: ChatProps) => {
  const [input, setInput] = useState("");
  const [showSignInModal, setShowSignInModal] = useState<boolean>(false);
  const router = useRouter();

  // Sync auth state with modal visibility
  useEffect(() => {
    if (!isAuthenticated) {
      setShowSignInModal(true);
    } else {
      setShowSignInModal(false);
    }
  }, [isAuthenticated]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Include chatId in request body if available
        body: () => (chatId ? { chatId } : {}),
      }),
    [chatId],
  );

  // Track pending chat ID to avoid duplicate navigations
  const pendingChatIdRef = useRef<string | null>(chatId ?? null);

  const { messages, sendMessage, status } = useChat({
    transport,
    // Listen for NEW_CHAT_CREATED data part emitted by server for new conversations
    onData: (dataPart) => {
      if (!isNewChatCreatedStreamPart(dataPart)) {
        return;
      }

      const nextChatId = dataPart.data.chatId;

      if (pendingChatIdRef.current === nextChatId) {
        return;
      }

      pendingChatIdRef.current = nextChatId;

      // Navigate to the new chat ID when server creates it
      if (!chatId || chatId !== nextChatId) {
        router.replace(`?id=${nextChatId}`);
      }
    },
  });

  useEffect(() => {
    pendingChatIdRef.current = chatId ?? null;
  }, [chatId]);

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // Submit message to API and clear input field
    event.preventDefault();
    const text = input.trim();

    if (!text) {
      return;
    }

    try {
      await sendMessage({ text });
      setInput("");
    } catch (error) {
      if (error instanceof Error) {
        console.error("Failed to send message", error.message, error);
      } else {
        console.error("Failed to send message", String(error));
      }
    }
  };

  return (
    <>
      <div className="flex flex-1 flex-col">
        <div
          className="mx-auto w-full max-w-[65ch] flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500"
          role="log"
          aria-label="Chat messages"
        >
          {messages?.map((message: UIMessage, index: number) => {
            return (
              <ChatMessage
                key={message.id || index}
                parts={message.parts ?? []}
                role={message.role}
                userName={userName}
              />
            );
          })}
        </div>

        <div className="border-t border-gray-700">
          <form onSubmit={handleSubmit} className="mx-auto max-w-[65ch] p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say something..."
                autoFocus
                aria-label="Chat input"
                className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !isAuthenticated}
                className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <SignInModal isOpen={showSignInModal} onClose={() => void 0} />
    </>
  );
};
