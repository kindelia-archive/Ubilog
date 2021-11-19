export type { Nat } from "./nat.ts";
export type { U8 } from "./u8.ts";
export type { U16 } from "./u16.ts";
export type { U64 } from "./u64.ts";
export type { U256 } from "./u256.ts";

export * as nat from "./nat.ts";
export * as u8 from "./u8.ts";
export * as u16 from "./u16.ts";
export * as u64 from "./u64.ts";
export * as u256 from "./u256.ts";

export const bits_mask = (x: bigint): bigint => (1n << x) - 1n;
