import Maybe, * as M from "./lib/functional/maybe.ts";

declare const tag: unique symbol;
export type Tag<T> = { readonly [tag]: T };

export type Dict<T> = Record<string, T>;

export type U8 = number & Tag<"U8">;
export type U16 = number & Tag<"U16">;
export type U64 = bigint & Tag<"U64">;
export type U256 = bigint & Tag<"U256">;

const check_uint_number =
  <T extends number>(size: number) =>
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
  }

const mask_uint_number = <T extends number>(size: number) => (value: number): T => {
  return (((1 << size) - 1) & value) as T;
}
const mask_uint_bigint = <T extends bigint>(size: bigint) => (value: bigint): T => {
  return (((1n << size) - 1n) & value) as T;
}

export namespace U8 {
  const size = 8;
  export const check = check_uint_number<U8>(size);
  export const mask = mask_uint_number<U8>(size);
}

export namespace U16 {
  const size = 16;
  export const check = check_uint_number<U16>(size);
  export const mask = mask_uint_number<U16>(size);
}

export namespace U64 {
  const size = 64;
  export const check = check_uint_number<U16>(size);
  export const mask = mask_uint_number<U16>(size);

}

export namespace U256 {
  const size = 256;
  export const check = check_uint_number<U16>(size);
  export const mask = mask_uint_number<U16>(size);
}
