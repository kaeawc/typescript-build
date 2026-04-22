/**
 * A typed success/failure value. Use this at API boundaries where a failure
 * is a legitimate, expected outcome that callers must handle — not an
 * exceptional condition.
 *
 * When to use `Result<T, E>`:
 *   - Parsing a user-supplied string
 *   - Validating an input object
 *   - Calling an external service that can return a typed error envelope
 *   - Any function whose "failure" is part of its contract
 *
 * When NOT to use it:
 *   - Panics, OOM, bugs: throw
 *   - Operations where "failure" is never expected: throw
 *
 * Usage:
 *   const r = parseInt("42");
 *   if (r.ok) {
 *     console.log(r.value);
 *   } else {
 *     console.error(r.error);
 *   }
 *
 * Or with helpers:
 *   const parsed = parseInt("42").map(n => n * 2);
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  map<U>(fn: (value: T) => U): Result<U, never>;
  mapErr<F>(fn: (error: never) => F): Result<T, F>;
  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F>;
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
  map<U>(fn: (value: never) => U): Result<U, E>;
  mapErr<F>(fn: (error: E) => F): Result<never, F>;
  flatMap<U, F>(fn: (value: never) => Result<U, F>): Result<U, E | F>;
  unwrap(): never;
  unwrapOr<T>(defaultValue: T): T;
}

export const ok = <T>(value: T): Ok<T> => ({
  ok: true,
  value,
  map<U>(fn: (value: T) => U): Result<U, never> {
    return ok(fn(value));
  },
  mapErr<F>(_fn: (error: never) => F): Result<T, F> {
    return this as unknown as Result<T, F>;
  },
  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F> {
    return fn(value);
  },
  unwrap(): T {
    return value;
  },
  unwrapOr(_defaultValue: T): T {
    return value;
  },
});

export const err = <E>(error: E): Err<E> => ({
  ok: false,
  error,
  map<U>(_fn: (value: never) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  },
  mapErr<F>(fn: (error: E) => F): Result<never, F> {
    return err(fn(error));
  },
  flatMap<U, F>(_fn: (value: never) => Result<U, F>): Result<U, E | F> {
    return this as unknown as Result<U, E | F>;
  },
  unwrap(): never {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Tried to unwrap an Err: ${String(error)}`);
  },
  unwrapOr<T>(defaultValue: T): T {
    return defaultValue;
  },
});

/**
 * Wrap a throwing function so it returns a `Result` instead.
 */
export const tryCatch = <T>(fn: () => T): Result<T, Error> => {
  try {
    return ok(fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Async counterpart of `tryCatch`.
 */
export const tryCatchAsync = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Combine an array of Results — short-circuit on the first Err.
 */
export const all = <T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) {
      return r;
    }
    values.push(r.value);
  }
  return ok(values);
};
