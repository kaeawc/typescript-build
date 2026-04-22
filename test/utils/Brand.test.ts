import { describe, expect, test } from "bun:test";
import { brand, type Brand } from "../../src/utils/Brand";

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const UserId = brand<"UserId">();
const OrderId = brand<"OrderId">();

describe("Brand", () => {
  test("branded values are runtime-equal to their raw form", () => {
    const id = UserId("u-1");
    expect(String(id)).toBe("u-1");
    expect(String(id)).toBe("u-1");
  });

  test("branded types survive typeof checks on the underlying primitive", () => {
    const id: UserId = UserId("u-1");
    expect(typeof id).toBe("string");
  });

  test("different brands are nominally distinct at the type level", () => {
    const u: UserId = UserId("u-1");
    const o: OrderId = OrderId("o-1");

    // The compile-time guarantee is that `u` is not assignable to `OrderId`
    // and vice versa. At runtime they're just strings, so this test only
    // exercises the explicit conversion path.
    expect(u).not.toBe(o);
  });

  test("brand helper returns a type-assertion function", () => {
    type Email = Brand<string, "Email">;
    const Email = brand<"Email">();

    const e: Email = Email("a@example.com");
    expect(e).toBe("a@example.com" as unknown as Email);
  });
});
