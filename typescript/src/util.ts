import * as u64 from "./lib/numbers/u64.ts";

export function pad_left(length: number, fill: string, str: string) {
  while (str.length < length) {
    str = fill + str;
  }
  return str.slice(0, length);
}

export function assert_non_null<T>(value: T | null | undefined): asserts value is T {
  if (value == null) {
    throw "FAILURE: null or undefined value";
  }
}

export type Gettable<K, T> = { get: (k: K) => T | undefined };
export function get_assert<K, T>(m: Gettable<K, T>, k: K): T {
  const v = m.get(k);
  assert_non_null(v);
  return v;
}

// Returns current time as fixed-size U64
export function get_time(): u64.U64 {
  return u64.mask(BigInt(Date.now()));
}
