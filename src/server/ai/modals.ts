import { google } from "@ai-sdk/google";

// Export the Google Gemini model instance.
// Using gemini-2.0-flash-001 or newer for tool calling support.
export const model = google("gemini-2.0-flash-001");
