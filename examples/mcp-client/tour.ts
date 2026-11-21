import type { Client } from "@modelcontextprotocol/client";

export type TourLog = (line: string) => void;

const firstText = (result: { content?: unknown }): string =>
  ((result.content ?? []) as Array<{ type: string; text?: string }>).find(block => block.type === "text")?.text ?? "";

/**
 * Walks through the notes server's features with an already-connected client:
 * tools, resources, completion, prompts, subscriptions, and input-required.
 * Returns the ids of the notes it created.
 */
export const runNotesTour = async (client: Client, log: TourLog): Promise<string[]> => {
  log(`connected: ${client.getServerVersion()?.name ?? "?"} over the ${client.getProtocolEra() ?? "?"} protocol`);

  // Subscriptions (2026-07-28): change notifications arrive on a listen stream.
  const subscription =
    client.getProtocolEra() === "modern" ? await client.listen({ resourcesListChanged: true }) : undefined;

  // Tools with structured output.
  const ids: string[] = [];
  for (const [title, tags] of [
    ["Kickoff agenda", ["meeting", "planning"]],
    ["Ideas for Q3", ["planning"]],
  ] as const) {
    const added = await client.callTool({ name: "add_note", arguments: { title, body: `Notes about ${title}`, tags } });
    const note = (added.structuredContent as { note: { id: string } }).note;
    ids.push(note.id);
    log(`add_note -> ${firstText(added)}`);
  }
  const found = await client.callTool({ name: "search_notes", arguments: { tag: "planning" } });
  log(`search_notes(tag=planning) -> ${firstText(found)}`);

  // Resources and resource templates.
  const index = await client.readResource({ uri: "notes://index" });
  log(`notes://index -> ${(JSON.parse((index.contents[0] as { text: string }).text) as unknown[]).length} entries`);

  // Completion for prompt arguments.
  const { completion } = await client.complete({
    ref: { type: "ref/prompt", name: "summarize_notes" },
    argument: { name: "tag", value: "pl" },
  });
  log(`complete(summarize_notes.tag="pl") -> ${completion.values.join(", ")}`);

  // Prompts with embedded resources.
  const prompt = await client.getPrompt({ name: "summarize_notes", arguments: { tag: "planning" } });
  log(`summarize_notes -> ${prompt.messages.length} messages`);

  // Input required: the client's elicitation handler answers the confirmation.
  const deleted = await client.callTool({ name: "delete_note", arguments: { id: ids[0] ?? "" } });
  log(`delete_note -> ${firstText(deleted)}`);

  await subscription?.close();
  return ids;
};
