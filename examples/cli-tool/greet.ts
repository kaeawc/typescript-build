import { err, ok, type Result } from "../../src/utils/Result";
import { TaggedError } from "../../src/utils/TaggedError";

export class InvalidName extends TaggedError<"InvalidName"> {
  constructor(public readonly reason: string) {
    super("InvalidName", reason);
  }
}

/**
 * Pure business logic: given a greeting prefix and a name, produce a
 * greeting. Returns a `Result` instead of throwing so callers can handle
 * validation errors as data.
 */
export const greet = (greeting: string, name: string): Result<string, InvalidName> => {
  if (!name || name.trim() === "") {
    return err(new InvalidName("name is required"));
  }
  if (name.length > 100) {
    return err(new InvalidName("name must be <= 100 characters"));
  }
  return ok(`${greeting}, ${name}!`);
};
