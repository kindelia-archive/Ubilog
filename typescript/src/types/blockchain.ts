import type { Tag } from "../lib/tag_type.ts";
import type { U256, U64 } from "../lib/numbers/mod.ts";

import type { BitStr } from "../lib/bit_str.ts";
import type { Hash, HashMap } from "./hash.ts";

export type { Hash } from "./hash.ts";

type Nat = bigint;

// Slice, Post, dunno
// on L2: set of transactions, kind of L2 "block"
// should/could be a set of related transactions (by monetary incentive)
// TODO: rename to Post?
export type Slice = { work: U64; data: BitStr };

export type BlockBody = Uint8Array & Tag<"Body">; // 1280 bytes

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
  tip: [U64, Hash];
};
