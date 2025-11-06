// Constants and type guards for streaming new chat creation events
// Used by both server (to emit) and client (to detect) the NEW_CHAT_CREATED data part
export const NEW_CHAT_CREATED_EVENT = "NEW_CHAT_CREATED" as const;
export const NEW_CHAT_CREATED_DATA_PART_TYPE =
  "data-new-chat-created" as const;

// Payload structure sent when a new chat is created on the server
export type NewChatCreatedData = {
  type: typeof NEW_CHAT_CREATED_EVENT;
  chatId: string;
};

// Stream part wrapper for the new chat event
export type NewChatCreatedStreamPart = {
  type: typeof NEW_CHAT_CREATED_DATA_PART_TYPE;
  data: NewChatCreatedData;
  transient?: boolean;
};

// Validates the NEW_CHAT_CREATED payload structure
export function isNewChatCreatedData(
  data: unknown,
): data is NewChatCreatedData {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const candidate = data as { type?: unknown; chatId?: unknown };

  return (
    candidate.type === NEW_CHAT_CREATED_EVENT &&
    typeof candidate.chatId === "string" &&
    candidate.chatId.length > 0
  );
}

export function isNewChatCreatedStreamPart(
  part: unknown,
): part is NewChatCreatedStreamPart {
  // Validates the full stream part (type + data) for type safety
  if (typeof part !== "object" || part === null) {
    return false;
  }

  const candidate = part as { type?: unknown; data?: unknown };

  return (
    candidate.type === NEW_CHAT_CREATED_DATA_PART_TYPE &&
    isNewChatCreatedData(candidate.data)
  );
}
