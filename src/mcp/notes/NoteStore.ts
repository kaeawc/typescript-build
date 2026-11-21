import type { Clock } from "../../utils/Clock";
import type { IdGenerator } from "../../utils/IdGenerator";
import type { KvStore } from "../../utils/KvStore";

/** A note, the demo domain object the MCP server exposes. */
export interface Note {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewNote {
  readonly title: string;
  readonly body: string;
  readonly tags?: readonly string[];
}

export interface NoteQuery {
  /** Case-insensitive substring matched against title and body. */
  readonly text?: string;
  readonly tag?: string;
  readonly limit?: number;
}

/**
 * Storage for notes. Async so a persistent backend can replace the KvStore
 * one without touching the MCP layer.
 */
export interface NoteStore {
  create(note: NewNote): Promise<Note>;
  get(id: string): Promise<Note | undefined>;
  list(): Promise<Note[]>;
  search(query: NoteQuery): Promise<Note[]>;
  setPinned(id: string, pinned: boolean): Promise<Note | undefined>;
  delete(id: string): Promise<boolean>;
  tags(): Promise<string[]>;
}

const normalizeTags = (tags: readonly string[] | undefined): string[] =>
  [...new Set((tags ?? []).map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0))].toSorted();

/** Newest first, pinned notes on top. */
const byPinnedThenRecent = (a: Note, b: Note): number =>
  Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);

export class KvNoteStore implements NoteStore {
  constructor(
    private readonly kv: KvStore<Note>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: NewNote): Promise<Note> {
    const now = this.clock.nowIso();
    const note: Note = {
      id: this.ids.next(),
      title: input.title.trim(),
      body: input.body,
      tags: normalizeTags(input.tags),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.kv.set(note.id, note);
    return note;
  }

  get(id: string): Promise<Note | undefined> {
    return this.kv.get(id);
  }

  async list(): Promise<Note[]> {
    const notes: Note[] = [];
    for (const key of await this.kv.keys()) {
      const note = await this.kv.get(key);
      if (note) {
        notes.push(note);
      }
    }
    return notes.toSorted(byPinnedThenRecent);
  }

  async search(query: NoteQuery): Promise<Note[]> {
    const text = query.text?.trim().toLowerCase() ?? "";
    const tag = query.tag?.trim().toLowerCase();
    const matches = (await this.list()).filter(
      note =>
        (text === "" || note.title.toLowerCase().includes(text) || note.body.toLowerCase().includes(text)) &&
        (tag === undefined || tag === "" || note.tags.includes(tag)),
    );
    return query.limit === undefined ? matches : matches.slice(0, query.limit);
  }

  async setPinned(id: string, pinned: boolean): Promise<Note | undefined> {
    const note = await this.kv.get(id);
    if (!note) {
      return undefined;
    }
    const updated: Note = { ...note, pinned, updatedAt: this.clock.nowIso() };
    await this.kv.set(id, updated);
    return updated;
  }

  delete(id: string): Promise<boolean> {
    return this.kv.delete(id);
  }

  async tags(): Promise<string[]> {
    return [...new Set((await this.list()).flatMap(note => note.tags))].toSorted();
  }
}
