#!/usr/bin/env bun
import { createUsersApiClient } from "./client";

if (import.meta.main) {
  const baseUrl = process.argv[2];
  const userId = process.argv[3];
  if (!baseUrl || !userId) {
    process.stderr.write("usage: api-client <base-url> <user-id>\n");
    process.exit(64);
  }

  const result = await createUsersApiClient(baseUrl).getUser(userId);
  if (!result.ok) {
    process.stderr.write(`error: ${result.error.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
}
