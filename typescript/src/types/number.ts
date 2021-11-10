import Maybe, * as M from "../lib/functional/maybe.ts";
import { Tag } from "./base.ts";

const check_uint_number = <T extends number>(size: number) =>
  (value: number): Maybe<T> => {
    if (!Number.isInteger(value) || value >>> size) {
      return M.Nothing();
    }
    return M.Just(value as T);
  };
const check_uint_bigint = <T extends bigint>(size: bigint) =>
  (value: bigint): Maybe<T> => {
    if (value < 0n || value >> size) {
      M.Nothing();
    }
    return M.Just(value as T);
  };

const mask_uint_number = <T extends number>(size: number) =>
  (value: number): T => {
    return (((1 << size) - 1) & value) as T;
  };
const mask_uint_bigint = <T extends bigint>(size: bigint) =>
  (value: bigint): T => {
    return (((1n << size) - 1n) & value) as T;
  };

export type U8 = number & Tag<"U8">;
export namespace u8 {
  export const size = 8;
  export const zero = 0 as U8;
  export const check = check_uint_number<U8>(size);
  export const mask = mask_uint_number<U8>(size);
}

export type U16 = number & Tag<"U16">;
export namespace u16 {
  export const size = 16;
  export const zero = 0 as U16;
  export const check = check_uint_number<U16>(size);
  export const mask = mask_uint_number<U16>(size);
}

export type U64 = bigint & Tag<"U64">;
export namespace u64 {
  export const size = 64n;
  export const zero = 0n as U64;
  export const check = check_uint_bigint<U64>(size);
  export const mask = mask_uint_bigint<U64>(size);
}

export type U256 = bigint & Tag<"U256">;
export namespace u256 {
  export const size = 256n;
  export const zero = 0n as U256;
  export const check = check_uint_bigint<U256>(size);
  export const mask = mask_uint_bigint<U256>(size);
}
