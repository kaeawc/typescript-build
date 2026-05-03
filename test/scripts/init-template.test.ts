import { describe, expect, test } from "bun:test";
import {
  parseTemplateInitArgs,
  isHelpRequest,
  updateMarkdownIntro,
  updatePackageJson,
  type TemplateInitOptions,
} from "../../scripts/init-template";

const baseOptions: TemplateInitOptions = {
  packageName: "my-app",
  binName: "my-app",
  dryRun: false,
  description: "A focused project built from the template.",
};

describe("init-template", () => {
  test("parses a scoped package name and derives the binary name", () => {
    expect(parseTemplateInitArgs(["--name", "@scope/my-app", "--dry-run"])).toEqual({
      packageName: "@scope/my-app",
      binName: "my-app",
      dryRun: true,
    });
  });

  test("parses explicit bin and description options", () => {
    expect(parseTemplateInitArgs([
      "--name=my-app",
      "--bin",
      "appctl",
      "--description=My app description.",
    ])).toEqual({
      packageName: "my-app",
      binName: "appctl",
      dryRun: false,
      description: "My app description.",
    });
  });

  test("rejects invalid package names", () => {
    expect(() => parseTemplateInitArgs(["--name", "My App"])).toThrow(/valid lowercase npm package name/);
  });

  test("detects help requests before required argument validation", () => {
    expect(isHelpRequest(["--help"])).toBe(true);
    expect(isHelpRequest(["--name", "my-app"])).toBe(false);
  });

  test("updates package name, description, and template binary entry", () => {
    const next = updatePackageJson({
      name: "typescript-build",
      description: "Template description.",
      version: "0.0.0",
      bin: {
        "typescript-build": "./dist/src/index.js",
        "existing-tool": "./dist/existing.js",
      },
    }, baseOptions);

    expect(next).toEqual({
      name: "my-app",
      description: "A focused project built from the template.",
      version: "0.0.0",
      bin: {
        "existing-tool": "./dist/existing.js",
        "my-app": "./dist/src/index.js",
      },
    });
  });

  test("keeps the existing description when no description is provided", () => {
    const next = updatePackageJson({
      name: "typescript-build",
      description: "Template description.",
      bin: "dist/src/index.js",
    }, {
      packageName: "my-app",
      binName: "my-app",
      dryRun: false,
    });

    expect(next.description).toBe("Template description.");
    expect(next.bin).toEqual({ "my-app": "dist/src/index.js" });
  });

  test("updates markdown heading and intro paragraph", () => {
    const markdown = `# typescript-build

Template description that can wrap
across multiple lines.

## Quick start

Run the checks.
`;

    expect(updateMarkdownIntro(markdown, baseOptions)).toBe(`# my-app

A focused project built from the template.

## Quick start

Run the checks.
`);
  });

  test("updates only the markdown heading when no description is provided", () => {
    const markdown = `# typescript-build

Keep this paragraph.
`;

    expect(updateMarkdownIntro(markdown, {
      packageName: "my-app",
      binName: "my-app",
      dryRun: false,
    })).toBe(`# my-app

Keep this paragraph.
`);
  });
});
