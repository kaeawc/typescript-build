import { SkillsExtension, memorySkillFiles, type SkillCatalog } from "@modelcontextprotocol/server/ext/skills";

/**
 * Skills shipped with the server (SEP-2640, `io.modelcontextprotocol/skills`).
 * Kept in code so they survive bundling; for skills on disk use
 * `loadSkills(dir)` from `@modelcontextprotocol/server/ext/skills/node`.
 */
export const NOTE_SKILL_FILES: Readonly<Record<string, string>> = {
  "curate-notes/SKILL.md": `---
name: curate-notes
description: Keep a notes collection tidy with the notes MCP server - dedupe, tag, pin, and summarize.
---

# Curating notes

1. Read \`notes://index\` to see every note, its tags and pin state.
2. Use \`search_notes\` before \`add_note\` so you extend an existing note instead of duplicating it.
3. Tag consistently: lowercase, singular nouns (\`meeting\`, \`idea\`, \`todo\`). See [tagging.md](tagging.md).
4. Use the \`summarize_notes\` prompt for a tag-level digest.
5. For long exports call \`export_notes\`; with the tasks extension it returns a task to poll.
6. \`delete_note\` always asks the user to confirm. Never work around the confirmation.
`,
  "curate-notes/tagging.md": `# Tagging conventions

- Lowercase, no spaces: \`release-notes\`, not \`Release Notes\`.
- At most four tags per note.
- Prefer existing tags; \`summarize_notes\` completes tag names.
`,
};

/** Builds the skills catalog. Do it once at startup and attach it to every server instance. */
export const loadNoteSkills = (): Promise<SkillCatalog> =>
  SkillsExtension.load(memorySkillFiles({ ...NOTE_SKILL_FILES }));
