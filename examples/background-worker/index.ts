#!/usr/bin/env bun
import { processWorkItems, type WorkItem } from "./worker";

const items: WorkItem[] = [
  { id: "welcome-email", payload: "ada@example.test" },
  { id: "audit-log", payload: "user.created" },
];

if (import.meta.main) {
  const results = await processWorkItems(items, async item => {
    process.stdout.write(`processed ${item.id}: ${item.payload}\n`);
  });
  const failed = results.filter(result => !result.ok);
  process.exit(failed.length === 0 ? 0 : 1);
}
