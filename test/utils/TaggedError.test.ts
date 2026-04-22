import { describe, expect, test } from "bun:test";
import { isTagged, TaggedError } from "../../src/utils/TaggedError";

class NotFound extends TaggedError<"NotFound"> {
  constructor(public readonly id: string) {
    super("NotFound", `resource ${id} not found`);
  }
}

class Forbidden extends TaggedError<"Forbidden"> {
  constructor(public readonly reason: string) {
    super("Forbidden", reason);
  }
}

type RepoError = NotFound | Forbidden;

describe("TaggedError", () => {
  test("stores the tag and message", () => {
    const e = new NotFound("u-1");
    expect(e._tag).toBe("NotFound");
    expect(e.message).toBe("resource u-1 not found");
    expect(e.name).toBe("NotFound");
    expect(e.id).toBe("u-1");
  });

  test("instanceof Error holds", () => {
    const e = new NotFound("u-1");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TaggedError);
    expect(e).toBeInstanceOf(NotFound);
  });

  test("discriminated union narrowing works on _tag", () => {
    const handle = (error: RepoError): number => {
      switch (error._tag) {
        case "NotFound": return 404;
        case "Forbidden": return 403;
      }
    };

    expect(handle(new NotFound("a"))).toBe(404);
    expect(handle(new Forbidden("no"))).toBe(403);
  });

  test("cause option is propagated", () => {
    const cause = new Error("underlying");
    class Wrapped extends TaggedError<"Wrapped"> {
      constructor(msg: string, originalCause: unknown) {
        super("Wrapped", msg, { cause: originalCause });
      }
    }
    const e = new Wrapped("wrapped", cause);
    expect((e as Error & { cause?: unknown }).cause).toBe(cause);
  });

  test("isTagged narrows on the tag", () => {
    const e: unknown = new NotFound("u-1");
    expect(isTagged(e, "NotFound")).toBe(true);
    expect(isTagged(e, "Forbidden")).toBe(false);
    expect(isTagged(new Error("plain"), "NotFound")).toBe(false);
    expect(isTagged(null, "NotFound")).toBe(false);
  });
});
