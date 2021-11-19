import type { Tag } from "./base.ts";
import type Maybe from "../../lib/functional/maybe.ts";
import * as M from "../../lib/functional/maybe.ts";

export type Nat = bigint & Tag<"Nat">;

export const zero = 0n as Nat;
export const one = 1n as Nat;

export const check = (value: bigint): Maybe<Nat> => {
  if (value >= 0n) {
    return M.Nothing();
  }
  return M.Just(value as Nat);
};
