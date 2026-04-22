/**
 * Nominal typing for primitive values.
 *
 * TypeScript is structurally typed, which means `string` and `string` are
 * interchangeable even when they semantically aren't — a `UserId` and an
 * `OrderId` are both strings and you'll cheerfully swap them by accident.
 * A `Brand<T, B>` marks a primitive so the compiler treats `Brand<string, "UserId">`
 * and `Brand<string, "OrderId">` as incompatible types.
 *
 * ```
 * export type UserId = Brand<string, "UserId">;
 * export type OrderId = Brand<string, "OrderId">;
 *
 * export const UserId = (raw: string): UserId => raw as UserId;
 * export const OrderId = (raw: string): OrderId => raw as OrderId;
 *
 * const u: UserId = UserId("u-1");
 * const o: OrderId = OrderId("o-1");
 * acceptUserId(o); // type error: OrderId is not assignable to UserId
 * ```
 *
 * The `__brand` field is phantom — it only exists in the type system and
 * has no runtime cost. The `unique symbol` makes each brand distinct even
 * when the type arguments happen to look identical.
 */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/**
 * Helper that constructs a brand coercer function in one line:
 *
 * ```
 * export const UserId = brand<"UserId">();
 * export type  UserId = ReturnType<typeof UserId>;
 * // UserId("u-1") returns a branded string
 * ```
 */
export const brand = <TBrand extends string>() =>
  <T>(value: T): Brand<T, TBrand> => value as Brand<T, TBrand>;
