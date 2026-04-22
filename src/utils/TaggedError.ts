/**
 * Base class for structured application errors.
 *
 * Every `TaggedError` has a `_tag` literal so callers can narrow on it with
 * a discriminated union — the same pattern we use for `WsMessage`, but for
 * error values. Combine with `Result<T, E>` for errors that live in signatures.
 *
 * ```
 * class NotFound extends TaggedError<"NotFound"> {
 *   constructor(public readonly id: string) {
 *     super("NotFound", `resource ${id} not found`);
 *   }
 * }
 *
 * class Forbidden extends TaggedError<"Forbidden"> {
 *   constructor(public readonly reason: string) {
 *     super("Forbidden", reason);
 *   }
 * }
 *
 * type RepoError = NotFound | Forbidden;
 *
 * function handle(error: RepoError) {
 *   switch (error._tag) {
 *     case "NotFound": return 404;
 *     case "Forbidden": return 403;
 *   }
 * }
 * ```
 */
export abstract class TaggedError<TTag extends string> extends Error {
  public readonly _tag: TTag;

  constructor(tag: TTag, message: string, options?: { cause?: unknown }) {
    super(message);
    this._tag = tag;
    this.name = tag;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    // Ensure instanceof checks work when targeting ES5/ES2015 transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Type guard: is the value a `TaggedError` with the given tag?
 */
export const isTagged = <TTag extends string>(
  value: unknown,
  tag: TTag
): value is TaggedError<TTag> => {
  return value instanceof TaggedError && value._tag === tag;
};
