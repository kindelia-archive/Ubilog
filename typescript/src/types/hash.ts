import type { Tag } from "../lib/tag_type.ts";
import type Maybe from "../lib/functional/maybe.ts";
import * as M from "../lib/functional/maybe.ts";

export type Hash = string & Tag<"Hash">; // 0x0000000000000000000000000000000000000000000000000000000000000000

export type HashMap<T> = Map<Hash, T>;

export const zero: Hash =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash;

export const check = (value: string): Maybe<Hash> => {
  if (/^0x[0-9A-Fa-f]{64}$/.test(value)) {
    return M.Just(value as Hash);
  } else {
    return M.Nothing();
  }
};

export const assert = (value: string): Hash => {
  const result = check(value);
  switch (result._) {
    case "Just":
      return result.value;
    case "Nothing":
      throw new Error("INCORRECT HASH FORMAT.");
  }
};
