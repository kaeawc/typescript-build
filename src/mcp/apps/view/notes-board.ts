/**
 * MCP App view for the notes board (runs in the host's sandboxed iframe).
 *
 * Bundled at build time by `bundleView` (a Bun macro) and inlined into the
 * `ui://notes/board.html` resource, so it works under the spec's default CSP
 * with no network access. Type-checked with tsconfig.view.json (DOM lib).
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

interface BoardNote {
  id: string;
  title: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
}

const app = new App({ name: "notes-board", version: "1.0.0" });
const list = document.querySelector<HTMLUListElement>("#notes");
const status = document.querySelector<HTMLParagraphElement>("#status");
let notes: BoardNote[] = [];

const setStatus = (text: string): void => {
  if (status) {
    status.textContent = text;
  }
};

const applyContext = (context: Partial<McpUiHostContext> | undefined): void => {
  if (context?.theme) {
    applyDocumentTheme(context.theme);
  }
  if (context?.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context?.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }
};

const togglePin = async (note: BoardNote): Promise<void> => {
  setStatus(`${note.pinned ? "Unpinning" : "Pinning"} "${note.title}"…`);
  // set_note_pinned is app-only (visibility: ["app"]): the model never sees it.
  const result = await app.callServerTool({
    name: "set_note_pinned",
    arguments: { id: note.id, pinned: !note.pinned },
  });
  if (result.isError) {
    setStatus("Could not update the note.");
    return;
  }
  notes = notes.map(candidate => (candidate.id === note.id ? { ...candidate, pinned: !note.pinned } : candidate));
  render();
  setStatus("Saved.");
};

const discuss = async (note: BoardNote): Promise<void> => {
  await app.updateModelContext({ structuredContent: { selectedNote: note } });
  await app.sendMessage({ role: "user", content: [{ type: "text", text: `Tell me about my note "${note.title}".` }] });
};

const button = (label: string, onClick: () => Promise<void>): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", () => {
    onClick().catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  });
  return element;
};

const render = (): void => {
  if (!list) {
    return;
  }
  list.replaceChildren(
    ...notes.map(note => {
      const item = document.createElement("li");
      item.className = note.pinned ? "pinned" : "";
      const title = document.createElement("strong");
      title.textContent = `${note.pinned ? "📌 " : ""}${note.title}`;
      const tags = document.createElement("span");
      tags.className = "tags";
      tags.textContent = note.tags.map(tag => `#${tag}`).join(" ");
      item.append(
        title,
        tags,
        button(note.pinned ? "Unpin" : "Pin", () => togglePin(note)),
        button("Discuss", () => discuss(note)),
      );
      return item;
    }),
  );
  setStatus(notes.length === 0 ? "No notes yet. Ask the assistant to add one." : `${notes.length} note(s)`);
};

// Handlers must be registered before connect(): tool input/result arrive right after the handshake.
app.addEventListener("toolresult", result => {
  const content = result.structuredContent as { notes?: BoardNote[] } | undefined;
  notes = content?.notes ?? [];
  render();
});
app.addEventListener("hostcontextchanged", applyContext);

await app.connect();
applyContext(app.getHostContext());
