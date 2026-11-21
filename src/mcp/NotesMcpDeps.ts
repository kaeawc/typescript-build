import type { RequestStateCodec } from "@modelcontextprotocol/server";
import type { SkillCatalog } from "@modelcontextprotocol/server/ext/skills";
import type { Timer } from "../utils/SystemTimer";
import type { NoteStore } from "./notes/NoteStore";
import type { TaskRunner } from "./tasks/TaskRunner";
import type { TaskStore } from "./tasks/TaskStore";

export const NOTES_INDEX_URI = "notes://index";
export const NOTE_URI_TEMPLATE = "notes://notes/{id}";
export const noteUri = (id: string): string => `notes://notes/${encodeURIComponent(id)}`;

/** State carried across `delete_note` rounds in the signed `requestState`. */
export interface DeleteNoteState {
  readonly noteId: string;
  readonly title: string;
}

/**
 * Pushes change notifications to clients. Over HTTP (2026-07-28) these go to
 * `subscriptions/listen` streams through the handler; over a single
 * connection they go straight to the server instance.
 */
export interface NotesNotifier {
  notesChanged(noteId?: string): void;
}

/** Everything the notes MCP server needs. Shared across per-request server instances. */
export interface NotesMcpDeps {
  readonly name: string;
  readonly version: string;
  readonly notes: NoteStore;
  readonly taskStore: TaskStore;
  readonly tasks: TaskRunner;
  /** Paces the export job; inject FakeTimer in tests. */
  readonly timer: Timer;
  /** Signs `requestState` for multi-round input-required flows. */
  readonly stateCodec: RequestStateCodec<DeleteNoteState>;
  /** Skills catalog (SEP-2640); attached to every server instance. */
  readonly skills?: SkillCatalog;
  /** Delay between exported notes, so progress and cancellation are observable. */
  readonly exportStepMs?: number;
}
