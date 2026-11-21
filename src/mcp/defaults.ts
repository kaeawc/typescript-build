import { createRequestStateCodec } from "@modelcontextprotocol/server";
import { systemClock, type Clock } from "../utils/Clock";
import { NodeIdGenerator, type IdGenerator } from "../utils/IdGenerator";
import { InMemoryKvStore } from "../utils/KvStore";
import { defaultTimer, type Timer } from "../utils/SystemTimer";
import { loadNoteSkills } from "./features/skills";
import type { DeleteNoteState, NotesMcpDeps } from "./NotesMcpDeps";
import { KvNoteStore, type Note } from "./notes/NoteStore";
import { TaskRunner } from "./tasks/TaskRunner";
import { KvTaskStore, type TaskRecord } from "./tasks/TaskStore";

export interface NotesMcpDepsOptions {
  readonly version: string;
  /**
   * HMAC key for `requestState` (at least 32 bytes). Share it across instances
   * behind a load balancer; a random per-process key is used when omitted.
   */
  readonly stateKey?: string | Uint8Array;
  readonly clock?: Clock;
  readonly timer?: Timer;
  readonly ids?: IdGenerator;
  readonly exportStepMs?: number;
}

/**
 * Wires the notes MCP server with in-memory stores. Swap the KvStores for
 * persistent ones here when notes and tasks must survive restarts.
 */
export const createNotesMcpDeps = async (options: NotesMcpDepsOptions): Promise<NotesMcpDeps> => {
  const clock = options.clock ?? systemClock;
  const timer = options.timer ?? defaultTimer;
  const ids = options.ids ?? new NodeIdGenerator();
  const taskStore = new KvTaskStore(new InMemoryKvStore<TaskRecord>({ timer }), clock, ids);
  return {
    name: "notes",
    version: options.version,
    notes: new KvNoteStore(new InMemoryKvStore<Note>({ timer }), clock, ids),
    taskStore,
    tasks: new TaskRunner(taskStore),
    timer,
    stateCodec: createRequestStateCodec<DeleteNoteState>({
      key: options.stateKey ?? crypto.getRandomValues(new Uint8Array(32)),
      ttlSeconds: 600,
    }),
    skills: await loadNoteSkills(),
    ...(options.exportStepMs === undefined ? {} : { exportStepMs: options.exportStepMs }),
  };
};
