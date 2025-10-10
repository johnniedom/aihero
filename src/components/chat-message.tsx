import ReactMarkdown, { type Components } from "react-markdown";
import type { UIMessage } from "ai";

// Extract the MessagePart type from the UIMessage type
// Hover over MessagePart to see all possible part types:
// - text parts (content)
// - tool-call parts (when AI invokes a tool)
// - tool-result parts (when tool execution completes)
// - image parts, file parts, source parts, reasoning parts, etc.
export type MessagePart = NonNullable<UIMessage["parts"]>[number];

// Interface defining the props for the ChatMessage component
interface ChatMessageProps {
  parts: MessagePart[]; // Array of message parts
  role: string; // "assistant" for AI messages, "user" for human messages
  userName: string; // Name of the user who sent the message
}

// Custom component overrides for react-markdown
// These define how different markdown elements should be rendered
const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>, // Paragraph styling with margins
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>, // Unordered list with bullet points
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>, // Ordered list with numbers
  li: ({ children }) => <li className="mb-1">{children}</li>, // List item styling
  code: (
    { className, children, ...props }, // Inline code styling
  ) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: (
    { children }, // Code block styling with background and padding
  ) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: (
    { children, ...props }, // Link styling with blue color and external link behavior
  ) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

// Wrapper component that renders markdown content using react-markdown
// with our custom styling overrides
const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

// Main ChatMessage component that displays a single chat message
// Handles both AI assistant messages and user messages with different styling
// Now supports rendering different message parts including tool invocations
export const ChatMessage = ({ parts, role, userName }: ChatMessageProps) => {
  // Debug logging to see what parts we're getting
  console.log("ChatMessage received:", { parts, role, userName });

  // Determine if this is an AI message (assistant role) or user message
  const isAI = role === "assistant";

  return (
    // Container with bottom margin for message spacing
    <div className="mb-6">
      {/* Message bubble with different background colors for AI vs user */}
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        {/* Sender label showing "AI" or the user's name */}
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>

        {/* Content area with prose styling for readable text */}
        <div className="prose prose-invert max-w-none">
          {parts?.length > 0 ? (
            parts.map((part, index) => {
              // Debug each part
              console.log(`Part ${index}:`, part);

              // Render different UI based on the part type
              // Hover over 'part' to see all possible types!

              if (part.type === "text") {
                return <Markdown key={index}>{part.text}</Markdown>;
              }

              if (
                part.type === "tool-call" &&
                "toolName" in part &&
                "args" in part
              ) {
                return (
                  <div
                    key={index}
                    className="my-2 rounded border border-blue-500/30 bg-blue-950/20 p-3"
                  >
                    <p className="mb-1 text-xs font-semibold text-blue-400">
                      🔧 Tool Call: {String(part.toolName)}
                    </p>
                    <pre className="overflow-x-auto text-xs text-gray-400">
                      {JSON.stringify(part.args, null, 2)}
                    </pre>
                  </div>
                );
              }

              if (
                part.type === "tool-result" &&
                "toolName" in part &&
                "result" in part
              ) {
                return (
                  <div
                    key={index}
                    className="my-2 rounded border bg-green-950/20 p-3 text-green-400"
                  >
                    <p className="mb-1 text-xs font-semibold text-green-400">
                      ✅ Tool Result: {String(part.toolName)}
                    </p>
                    <pre className="max-h-48 overflow-auto text-xs text-gray-400">
                      {JSON.stringify(part.result, null, 2)}
                    </pre>
                  </div>
                );
              }

              // Debug unknown part types
              console.warn("Unknown part type:", part.type, part);

              // For any other part types, show a debug view
              return (
                <div
                  key={index}
                  className="my-2 rounded border border-yellow-500/30 bg-yellow-950/20 p-3"
                >
                  <pre className="overflow-x-auto text-xs text-gray-400">
                    {JSON.stringify(part, null, 2)}
                  </pre>
                </div>
              );
            })
          ) : (
            <div className="italic text-gray-500">No parts to display</div>
          )}
        </div>
      </div>
    </div>
  );
};
