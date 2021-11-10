import { Tag } from "./base.ts";

export type Bit = "0" | "1";
export type Bits = string & Tag<"Bits">;

export const empty = "" as Bits;
export const zero = "0" as Bits;
export const one = "1" as Bits;

/**
  Receives a string literal type `T` and returns `T` itself if it is only
  composed of of "0"s and "1"s, if possible, or else, will return a different
  literal type that wont match the input.
  Based on: https://stackoverflow.com/a/67184772/1967121 .
  */
// deno-fmt-ignore
type ValidBits<T extends string> = 
    T extends Bit ?
      T
    :
      T extends `${Bit}${infer R}` ?
        T extends `${infer F}${R}` ?
          `${F}${ValidBits<R>}`
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
