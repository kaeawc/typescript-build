import { describe, expect, test } from "bun:test";
import { all, err, ok, tryCatch, tryCatchAsync, type Result } from "../../src/utils/Result";

describe("Result", () => {
  test("ok constructs a success value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
    }
  });

  test("err constructs a failure value", () => {
    const r = err("boom");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("boom");
    }
  });

  test("map transforms an Ok value", () => {
    const r = ok(5).map(n => n * 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(10);
    }
  });

  test("map is a no-op on Err", () => {
    const r = err("nope").map((n: number) => n * 2);
    expect(r.ok).toBe(false);
  });

  test("mapErr transforms an Err", () => {
    const r = err("nope").mapErr(msg => new Error(msg));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(Error);
    }
  });

  test("flatMap chains Ok values", () => {
    const square = (n: number): Result<number, string> => ok(n * n);
    const r = ok(3).flatMap(square);
    if (r.ok) {
      expect(r.value).toBe(9);
    }
  });

  test("flatMap short-circuits on Err", () => {
    let called = false;
    const r = err("boom").flatMap(() => {
      called = true;
      return ok(1);
    });
    expect(called).toBe(false);
    expect(r.ok).toBe(false);
  });

  test("unwrap returns the value on Ok and throws on Err", () => {
    expect(ok(42).unwrap()).toBe(42);
    expect(() => err("boom").unwrap()).toThrow(/boom/);
  });

  test("unwrapOr returns the default on Err", () => {
    expect(ok(42).unwrapOr(0)).toBe(42);
    expect(err("boom").unwrapOr(0)).toBe(0);
  });

  test("tryCatch wraps thrown exceptions as Err", () => {
    const r1 = tryCatch(() => 42);
    expect(r1.ok).toBe(true);

    const r2 = tryCatch(() => { throw new Error("boom"); });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.message).toBe("boom");
    }
  });

  test("tryCatchAsync wraps rejected promises as Err", async () => {
    const r = await tryCatchAsync(async () => { throw new Error("async boom"); });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe("async boom");
    }
  });

  test("all short-circuits on the first Err", () => {
    const r = all([ok(1), ok(2), err("nope"), ok(3)]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("nope");
    }
  });

  test("all returns an array of values when every Result is Ok", () => {
    const r = all([ok(1), ok(2), ok(3)]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([1, 2, 3]);
    }
  });
});
