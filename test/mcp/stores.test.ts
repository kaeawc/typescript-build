import { describe, expect, test } from "bun:test";
import { KvNoteStore, type Note } from "../../src/mcp/notes/NoteStore";
import { TaskRunner } from "../../src/mcp/tasks/TaskRunner";
import { KvTaskStore, toCreateTaskResult, toDetailedTask, type TaskRecord } from "../../src/mcp/tasks/TaskStore";
import { FakeClock } from "../../src/utils/Clock";
import { CountingIdGenerator } from "../../src/utils/IdGenerator";
import { InMemoryKvStore } from "../../src/utils/KvStore";
import { FakeTimer } from "../fakes/FakeTimer";

const makeNotes = () => {
  const clock = new FakeClock("2026-01-01T00:00:00.000Z");
  return { clock, store: new KvNoteStore(new InMemoryKvStore<Note>(), clock, new CountingIdGenerator("n")) };
};

const makeTasks = () => {
  const clock = new FakeClock("2026-01-01T00:00:00.000Z");
  const timer = new FakeTimer();
  const store = new KvTaskStore(new InMemoryKvStore<TaskRecord>({ timer }), clock, new CountingIdGenerator("t"));
  return { clock, timer, store, runner: new TaskRunner(store) };
};

describe("KvNoteStore", () => {
  test("normalizes tags and orders pinned, then most recently updated", async () => {
    const { clock, store } = makeNotes();
    await store.create({ title: " First ", body: "a", tags: ["Work", "work", " ", "Alpha"] });
    clock.advance(1000);
    await store.create({ title: "Second", body: "b" });
    clock.advance(1000);
    await store.setPinned("n-1", true);

    const notes = await store.list();
    expect(notes.map(note => note.id)).toEqual(["n-1", "n-2"]);
    expect(notes[0]).toMatchObject({ title: "First", tags: ["alpha", "work"], pinned: true });
    expect(await store.tags()).toEqual(["alpha", "work"]);
  });

  test("searches by text and tag with a limit", async () => {
    const { store } = makeNotes();
    await store.create({ title: "Budget", body: "Q3 numbers", tags: ["finance"] });
    await store.create({ title: "Offsite", body: "budget for venue", tags: ["events"] });
    expect((await store.search({ text: "BUDGET" })).length).toBe(2);
    expect((await store.search({ text: "budget", tag: "events" })).map(note => note.title)).toEqual(["Offsite"]);
    expect((await store.search({ limit: 1 })).length).toBe(1);
  });

  test("setPinned and delete report unknown ids", async () => {
    const { store } = makeNotes();
    expect(await store.setPinned("missing", true)).toBeUndefined();
    expect(await store.delete("missing")).toBe(false);
  });
});

describe("KvTaskStore and TaskRunner", () => {
  test("runs a job to completion and exposes SEP-2663 wire shapes", async () => {
    const { runner, store, clock } = makeTasks();
    const task = await runner.start(async ctx => {
      clock.advance(500);
      await ctx.report("halfway");
      return { content: [{ type: "text", text: "done" }] };
    });
    expect(toCreateTaskResult(task)).toEqual({
      resultType: "task",
      taskId: "t-1",
      status: "working",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      ttlMs: 3_600_000,
      pollIntervalMs: 1000,
    });

    await runner.settled(task.taskId);
    const done = await store.get(task.taskId);
    expect(done).toMatchObject({ status: "completed", lastUpdatedAt: "2026-01-01T00:00:00.500Z" });
    expect(toDetailedTask(done!)).toMatchObject({ status: "completed", result: { content: [{ text: "done" }] } });
  });

  test("records failures with an error and no result", async () => {
    const { runner, store } = makeTasks();
    const task = await runner.start(() => Promise.reject(new Error("disk full")));
    await runner.settled(task.taskId);
    const failed = await store.get(task.taskId);
    expect(toDetailedTask(failed!)).toMatchObject({ status: "failed", error: { code: -32603, message: "disk full" } });
  });

  test("cancellation aborts the job and terminal states stick", async () => {
    const { runner, store, timer } = makeTasks();
    let sawAbort = false;
    const task = await runner.start(async ctx => {
      await timer.sleep(1000);
      sawAbort = ctx.signal.aborted;
      return { content: [] };
    });
    await runner.cancel(task.taskId);
    timer.advanceTime(1000);
    await runner.settled(task.taskId);

    expect(sawAbort).toBe(true);
    expect((await store.get(task.taskId))?.status).toBe("cancelled");
    expect(await store.update(task.taskId, { status: "completed" })).toMatchObject({ status: "cancelled" });
    expect(await runner.cancel("unknown")).toBeUndefined();
  });

  test("tasks expire after their ttl", async () => {
    const { store, timer } = makeTasks();
    const task = await store.create({ ttlMs: 1000 });
    timer.advanceTime(1001);
    expect(await store.get(task.taskId)).toBeUndefined();
  });
});
