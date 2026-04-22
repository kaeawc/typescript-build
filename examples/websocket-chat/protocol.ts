/**
 * Discriminated-union request/response protocol for the chat example.
 * The `type` field is the tag — server and client dispatch on it.
 */
export type ChatRequest =
  | { type: "join";    room: string; id?: string | undefined }
  | { type: "leave";   room: string; id?: string | undefined }
  | { type: "message"; room: string; text: string; id?: string | undefined };

export type ChatResponse =
  | { type: "joined";   room: string; id?: string | undefined; success: true }
  | { type: "left";     room: string; id?: string | undefined; success: true }
  | { type: "incoming"; room: string; text: string; from: string; id?: string | undefined; success: true };
