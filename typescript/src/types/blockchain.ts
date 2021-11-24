import type { ImmSet } from "../deps.ts";

import type { U256, U64 } from "../lib/numbers/mod.ts";

import type { BitStr } from "../lib/bit_str.ts";
import type { Hash, HashMap } from "./hash.ts";

export type { Hash } from "./hash.ts";

type Nat = bigint;

export type Slice = BitStr;
export type PowSlice = { work: U64; data: BitStr };

export type BlockBody = Slice[]; // max 1280 bytes

export type Block = {
  prev: Hash;
  time: U256;
  body: BlockBody; // 1280 bytes
};

export type Chain = {
  block: HashMap<Block>;
  children: HashMap<Array<Hash>>;
  pending: HashMap<Array<Block>>;
  work: HashMap<Nat>;
  height: HashMap<Nat>;
  target: HashMap<Nat>;
  seen: HashMap<true>;
  tip: [score: U64, b_hash: Hash];
  mined_slices: HashMap<ImmSet<Slice>>;
};
