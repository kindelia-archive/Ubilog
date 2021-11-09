import Maybe, * as M from "./lib/functional/maybe.ts";

declare const tag: unique symbol;
export type Tag<T> = { readonly [tag]: T };

export type Dict<T> = Record<string, T>;

export namespace Bits {
  export type Bit = "0" | "1";
  export type Bits = string & Tag<"Bits">;

  export const empty = "" as Bits;
  export const zero = "0" as Bits;
  export const one = "1" as Bits;

  // based on https://stackoverflow.com/a/67184772/1967121
  type ValidBits<T extends string> = T extends Bit ? T
    : T extends `${Bit}${infer R}` ? T extends `${infer F}${R}` ? `${F}${ValidBits<R>}`
    : never
    : Bit | "";

  export function from<T extends string>(
    val: T extends ValidBits<T> ? T : ValidBits<T>,
  ): Bits {
    return val as Bits;
  }
  export const push = (bit: Bit) => (bits: Bits): Bits => (bits + bit) as Bits;
  export const push_front = (bit: Bit) => (bits: Bits): Bits => (bit + bits) as Bits;
  export const concat = (...bs: Bits[]) => bs.reduce((acc, b) => (acc + b) as Bits);
  export const slice = (start?: number, end?: number) =>
    (bits: Bits) => bits.slice(start, end) as Bits;
}

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

export namespace U8 {
  export type U8 = number & Tag<"U8">;
  export const size = 8;
  export const zero = 0 as U8;
  export const check = check_uint_number<U8>(size);
  export const mask = mask_uint_number<U8>(size);
}

export namespace U16 {
  export type U16 = number & Tag<"U16">;
  export const size = 16;
  export const zero = 0 as U16;
  export const check = check_uint_number<U16>(size);
  export const mask = mask_uint_number<U16>(size);
}

export namespace U64 {
  export type U64 = bigint & Tag<"U64">;
  export const size = 64n;
  export const zero = 0n as U64;
  export const check = check_uint_bigint<U64>(size);
  export const mask = mask_uint_bigint<U64>(size);
}

export namespace U256 {
  export type U256 = bigint & Tag<"U256">;
  export const size = 256n;
  export const zero = 0n as U256;
  export const check = check_uint_bigint<U256>(size);
  export const mask = mask_uint_bigint<U256>(size);
}

export namespace T {
  export type Bit = Bits.Bit;
  export type Bits = Bits.Bits;
  export type U8 = U8.U8;
  export type U16 = U16.U16;
  export type U64 = U64.U64;
  export type U256 = U256.U256;
}

export default T;
