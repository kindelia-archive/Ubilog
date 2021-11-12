// deno-lint-ignore-file camelcase no-inferrable-types
import { parse as parse_args } from "https://deno.land/std@0.113.0/flags/mod.ts";
import * as path from "https://deno.land/std@0.110.0/path/mod.ts";

import { break_list, default_or_convert, drop_while } from "./lib/functional/mod.ts";
import { is_json_object } from "./lib/json.ts";
import { get_dir_with_base } from "./lib/files.ts";
import { bits_mask } from "./lib/numbers.ts";

import { AddressPort, Bits, Octuple, Quadruple, Tag } from "./types/mod.ts";
import * as T from "./types/mod.ts";
import type { U16, U256, U64, U8 } from "./types/numbers/mod.ts";
import { u16, u256, u64, u8 } from "./types/numbers/mod.ts";
import { keccak256 } from "./keccak256.ts";
import { cfg_nt, GetEnv, load_config_file, resolve_config } from "./config.ts";

// Configuration:
// ~/.ubilog/config
// Output:
// ~/.ubilog/data/blocks/HASH
// ~/.ubilog/data/mined/HASH

// Constants
// ---------

const BODY_SIZE = 1280;

const DIR_BLOCKS = "data/blocks";
const DIR_MINED = "data/mined";

// Types
// =====

// Blockchain
// ----------

type Dict<T> = Record<string, T>;

type Nat = bigint;

type Hash = string & Tag<"Hash">; // 0x0000000000000000000000000000000000000000000000000000000000000000
type Body = Uint8Array & Tag<"Body">; // 1280 bytes

type HashMap<T> = Map<Hash, T>;

type Block = {
  prev: Hash;
  time: U256;
  body: Body; // 1280 bytes
};

type Chain = {
  block: HashMap<Block>;
  children: HashMap<Array<Hash>>;
  pending: HashMap<Array<Block>>;
  work: HashMap<Nat>;
  height: HashMap<Nat>;
  target: HashMap<Nat>;
  seen: HashMap<true>;
  tip: [U64, Hash];
};

// Network
// -------

// type IPv4 = { ctor: "IPv4"; port: U16; val0: U8; val1: U8; val2: U8; val3: U8 };
// type IPv6 = { ctor: "IPv6"; port: U16; segments: number[] };
// type Address = IPv4 | IPv6;

type Peer = {
  seen_at: Nat;
  address: AddressPort;
};

type Cons<T> = { ctor: "Cons"; head: T; tail: List<T> };
type Nil<T> = { ctor: "Nil" };
type List<T> = Cons<T> | Nil<T>;

type HNode<A> = { ctor: "HNode"; value: [bigint, A]; child: List<Heap<A>> };
type Empty<A> = { ctor: "Empty" };
type Heap<A> = Empty<A> | HNode<A>;

type Slice = { work: U64; data: Bits };

type PutPeers = { ctor: "PutPeers"; peers: AddressPort[] };
type PutBlock = { ctor: "PutBlock"; block: Block };
type AskBlock = { ctor: "AskBlock"; b_hash: Hash };
type PutSlices = { ctor: "PutSlices"; slices: Slice[] };
type Message = PutPeers | PutBlock | AskBlock | PutSlices;

type Mail = {
  sent_by: Peer;
  message: Message;
};

type Node = {
  port: number; // TODO: U16
  peers: Dict<Peer>;
  chain: Chain;
  // slices: Heap<List<Slice>>
};

function HASH(hash: string): Hash {
  if (/^0x[0-9A-Fa-f]{64}$/.test(hash)) {
    return hash as Hash;
  } else {
    throw new Error("INCORRECT HASH FORMAT.");
  }
}

// Algorithms
// ==========

// Util

function assert_non_null<T>(value: T | null | undefined): asserts value is T {
  if (value == null) {
    throw "FAILURE: null or undefined value";
  }
}

type Gettable<K, T> = { get: (k: K) => T | undefined };
function get_assert<K, T>(m: Gettable<K, T>, k: K): T {
  const v = m.get(k);
  assert_non_null(v);
  return v;
}

function now(): bigint {
  return BigInt(Date.now());
}

// Numbers
// -------

const MASK_64: bigint = bits_mask(64n);
const MASK_192: bigint = bits_mask(192n);
// const MASK_256: bigint = bits_mask(256n);

function next_power_of_two(x: number): number {
  return x <= 1 ? x : 2 ** (Math.floor(Math.log(x - 1) / Math.log(2)) + 1);
}

// Strings
// -------

function pad_left(length: number, fill: string, str: string) {
  while (str.length < length) {
    str = fill + str;
  }
  return str.slice(0, length);
}

// Lists
// -----

function cons<T>(head: T, tail: List<T>): List<T> {
  return { ctor: "Cons", head, tail };
}

function nil<T>(): List<T> {
  return { ctor: "Nil" };
}

function array_to_list<T>(array: T[], index: number = 0): List<T> {
  if (index === array.length) {
    return nil();
  } else {
    return cons(array[index], array_to_list(array, index + 1));
  }
}

function list_to_array<T>(list: List<T>): Array<T> {
  const array = [];
  while (list.ctor !== "Nil") {
    array.push(list.head);
    list = list.tail;
  }
  return array;
}

// Bits
// ----

function bits_to_uint8array(bits: Bits): Uint8Array {
  if (bits.length < 2 ** 16) {
    const buff = new Uint8Array(2 + Math.ceil(bits.length / 8));
    bits = serialize_bits(bits);
    for (let i = 0; i < bits.length; i += 8) {
      let numb = 0;
      for (let j = 0; j < 8; ++j) {
        numb *= 2;
        //console.log(i, j, "read", bits[i + 8 - j - 1])
        if (bits[i + 8 - j - 1] === "1") {
          numb += 1;
        }
      }
      buff[Math.floor(i / 8)] = numb;
    }
    return buff;
  }
  throw "bit string too large";
}

function uint8array_to_bits(buff: Uint8Array): Bits {
  const size = (buff[0] ?? 0) + (buff[1] ?? 0) * 256;
  let bits = "" as Bits;
  for (let i = 2; i < buff.length; ++i) {
    const val = buff[i] ?? 0;
    for (let j = 0; j < 8 && bits.length < size; ++j) {
      const bit = (val >>> j) & 1 ? "1" : "0";
      bits = T.bits.push(bit)(bits);
    }
  }
  return bits;
}

// Numbers
// -------

// function compress_nat(numb: Nat): U64 {
//   let exp = 0n;
//   while (2n ** exp <= numb) {
//     exp += 1n;
//   }
//   let drop = exp - 48n;
//   drop = drop < 0n ? 0n : drop;
//   numb = ((numb >> drop) << 16n) | drop;
//   return numb & 0xffffffffffffffffn;
// }

// function decompress_nat(pack: U64): Nat {
//   const drop = pack & 0xffffn;
//   const numb = (pack >> 16n) << drop;
//   return numb;
// }

// Hashing
// -------

const HashZero: Hash = HASH(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);

// function u64_to_uint8array(value: U64): Uint8Array {
//   const bytes: number[] = [];
//   for (let i = 0; i < 8; ++i) {
//     bytes.push(Number((value >> BigInt((8 - i - 1) * 8)) % 0x100n));
//   }
//   return new Uint8Array(bytes);
// }

function u256_to_uint8array(value: U256): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < 32; ++i) {
    bytes.push(Number((value >> BigInt((32 - i - 1) * 8)) % 0x100n));
  }
  return new Uint8Array(bytes);
}

function hash_to_uint8array(hash: Hash): Uint8Array {
  return u256_to_uint8array(u256.mask(BigInt(hash)));
}

function compute_difficulty(target: Nat): Nat {
  return 2n ** 256n / (2n ** 256n - target);
}

function compute_target(difficulty: Nat): Nat {
  return 2n ** 256n - 2n ** 256n / difficulty;
}

// Computes next target by scaling the current difficulty by a `scale` factor
// Since the factor is an integer, it is divided by 2^32 to allow integer division
// - compute_next_target(t, 2n**32n / 2n): difficulty halves
// - compute_next_target(t, 2n**32n * 1n): nothing changes
// - compute_next_target(t, 2n**32n * 2n): difficulty doubles
function compute_next_target(last_target: Nat, scale: Nat): Nat {
  const last_difficulty = compute_difficulty(last_target);
  const next_difficulty = 1n + (last_difficulty * scale - 1n) / 2n ** 32n;
  return compute_target(next_difficulty);
}

function get_hash_work(hash: Hash): Nat {
  const value = BigInt(HASH(hash));
  if (value === 0n) {
    return 0n;
  } else {
    return compute_difficulty(value);
  }
}

function hash_uint8array(words: Uint8Array): Hash {
  return HASH(keccak256(Array.from(words)));
}

function hash_block(block: Block): Hash {
  if (block.prev === HashZero && block.time === 0n) {
    return HashZero;
  } else {
    return hash_uint8array(
      new Uint8Array([
        ...hash_to_uint8array(block.prev),
        ...u256_to_uint8array(block.time),
        ...block.body,
      ]),
    );
  }
}

//function hash_slice(slice: Slice) : Hash {
//return hash_uint8array(bits_to_uint8array(serialize_slice(slice)));
//}

// Attempts to mine a block by changing the least significant 192 bits of its
// time until its hash is larger than a target, up to an maximum number of
// attempts. Returns the time-adjusted block if it works, or null if it fails.
// If a secret_key is provided, the low bits are set as:
//   bits : U192 = keccak256(key_192 | rand_64)[0..192]
// This allows the miner to prove himself as the block miner by revealing a
// 192-bit key, plus the random number used to generate the low bits.
function mine(
  block: Block,
  target: Nat,
  max_attempts: number,
  node_time: U64,
  secret_key: U256 = u256.zero,
): [Block, U64] | null {
  for (let i = 0n; i < max_attempts; ++i) {
    const [rand_0, rand_1] = crypto.getRandomValues(new Uint32Array(2));
    const rand = u64.mask(BigInt(rand_0) | (BigInt(rand_1) << 32n));
    const nonce = (secret_key << 64n) | rand;
    const bits = BigInt(hash_uint8array(u256_to_uint8array(u256.mask(nonce)))) & MASK_192;
    const time = u256.mask(((node_time & MASK_64) << 192n) | bits);
    block = { ...block, time };
    const hash = hash_block(block);
    if (BigInt(hash) > target) {
      return [block, rand];
    }
  }
  return null;
}

// Slices
// ------

// Fills a body with the top slices on the slice-pool
//function fill_body(body: Body, slices: Heap<string>) {
//for (var i = 0; i < BODY_SIZE; ++i) {
//body[i] = 0;
//}
//var i = 0
//while (slices.ctor !== "Empty" && i < BODY_SIZE * 8) {
//var bits : string = (heap_head(slices) ?? [0,""])[1]
////console.log("got", bits);
//for (var k = 0; k < bits.length && i < BODY_SIZE * 8; ++k, ++i) {
////console.log("- bit_" + i + ": " + bits[k]);
//if (bits[k] === "1") {
//var x = Math.floor(i / 8)
//var y = i % 8
//body[x] = body[x] | (1 << (7 - y));
//}
//}
//slices = heap_tail(slices);
//}
//}

// Chain
// -----

// don't accept blocks from 1 hour in the future
const DELAY_TOLERANCE: Nat = 60n * 60n * 1000n;

// readjusts difficulty every 20 blocks
const BLOCKS_PER_PERIOD: Nat = 20n;

// 1 second per block
const TIME_PER_BLOCK: Nat = 1000n;

// readjusts difficulty every 60 seconds
const TIME_PER_PERIOD: Nat = TIME_PER_BLOCK * BLOCKS_PER_PERIOD;

// initial target of 256 hashes per block
const INITIAL_TARGET: Nat = compute_target(256n);

const EmptyBody: Body = new Uint8Array(BODY_SIZE) as Body;

const BlockZero: Block = {
  prev: HashZero,
  time: u256.zero,
  body: EmptyBody,
};

function initial_chain(): Chain {
  const block: HashMap<Block> = new Map([[HashZero, BlockZero]]);
  const children: HashMap<Array<Hash>> = new Map([[HashZero, []]]);
  const pending: HashMap<Array<Block>> = new Map();
  const work: HashMap<U64> = new Map([[HashZero, u64.zero]]);
  const height: HashMap<Nat> = new Map([[HashZero, 0n]]);
  const target: HashMap<Nat> = new Map([[HashZero, INITIAL_TARGET]]);
  const seen: HashMap<true> = new Map();
  const tip: [U64, Hash] = [u64.zero, HashZero];
  return { block, children, pending, work, height, target, seen, tip };
}

function add_block(chain: Chain, block: Block, time: T.U64) {
  const must_add: Block[] = [block];
  while (must_add.length > 0) {
    const block = must_add.pop() ?? BlockZero;
    const b_time = block.time >> 192n;
    const b_hash = hash_block(block);
    if (b_time < BigInt(time) + DELAY_TOLERANCE) {
      // Block has valid time
      if (chain.block.get(b_hash) === undefined) {
        // Block is not present in the database
        const p_hash = block.prev;
        // If previous block is available, add the block
        // TODO: extract function to add mined blocks?
        if (chain.block.get(p_hash) !== undefined) {
          console.log("  ++ adding block".padEnd(30, " "), b_hash); // DEBUG
          const work = get_hash_work(b_hash);
          // const ptime = chain.block
          chain.block.set(b_hash, block);
          chain.work.set(b_hash, 0n);
          chain.height.set(b_hash, 0n);
          chain.target.set(b_hash, 0n);
          chain.children.set(b_hash, []);
          // If the block is valid
          const p_block = get_assert(chain.block, p_hash);
          const p_target = get_assert(chain.target, p_hash);
          const has_enough_work = BigInt(b_hash) >= p_target;
          const advances_time = b_time > p_block.time >> 192n;
          if (has_enough_work && advances_time) {
            const p_work = get_assert(chain.work, p_hash);
            chain.work.set(b_hash, p_work + work);
            if (p_hash !== HashZero) {
              const p_height = get_assert(chain.height, p_hash);
              chain.height.set(b_hash, p_height + 1n);
            }
            if (
              get_assert(chain.height, b_hash) > 0n &&
              get_assert(chain.height, b_hash) % BLOCKS_PER_PERIOD === 0n
            ) {
              // Update difficulty
              let checkpoint_hash = p_hash;
              for (let i = 0n; i < BLOCKS_PER_PERIOD - 1n; ++i) {
                checkpoint_hash = get_assert(chain.block, checkpoint_hash).prev;
              }
              const period_time = Number(
                b_time - (get_assert(chain.block, checkpoint_hash).time >> 192n),
              );
              const last_target = get_assert(chain.target, p_hash);
              const scale = BigInt(
                Math.floor((2 ** 32 * Number(TIME_PER_PERIOD)) / period_time),
              );
              const next_target = compute_next_target(last_target, scale);
              chain.target.set(b_hash, next_target);
              // console.log();
              // console.log("[DIFF] A period should last   " + TIME_PER_PERIOD + " seconds.");
              // console.log("[DIFF] the last period lasted " + period_time + " seconds.");
              // console.log("[DIFF] the last difficulty was " + compute_difficulty(last_target) + " hashes per block.");
              // console.log("[DIFF] the next difficulty is  " + compute_difficulty(next_target) + " hashes per block.");
              // console.log();
            } else {
              // Keep old difficulty
              chain.target.set(b_hash, get_assert(chain.target, p_hash));
            }
            // Refresh tip
            if (get_assert(chain.work, b_hash) > chain.tip[0]) {
              chain.tip = [u64.mask(get_assert(chain.work, b_hash)), b_hash];
            }
          }
          // Registers this block as a child
          get_assert(chain.children, p_hash).push(b_hash);
          // Add all blocks that were waiting for this block
          for (const pending of chain.pending.get(b_hash) ?? []) {
            must_add.push(pending);
          }
          chain.pending.delete(b_hash);
          // Otherwise, add this block to the previous block's pending list
        } else if (chain.seen.get(b_hash) === undefined) {
          console.log(" ^^ pending block".padEnd(30, " "), b_hash); // DEBUG
          chain.pending.set(p_hash, chain.pending.get(p_hash) ?? []);
          get_assert(chain.pending, p_hash).push(block);
        }
        chain.seen.set(b_hash, true);
      }
    } else {
      console.log("  D: block time invalid".padEnd(30, " "), b_hash); // DEBUG
    }
  }
}

function get_longest_chain(chain: Chain): Array<Block> {
  const longest = [];
  let b_hash = chain.tip[1];
  while (true) {
    const block = chain.block.get(b_hash);
    if (block == undefined || b_hash === HashZero) {
      break;
    }
    longest.push(block);
    b_hash = block.prev;
  }
  return longest.reverse();
}

// Stringification
// ---------------

function get_address_hostname(address: AddressPort): string {
  switch (address._) {
    case "IPv4":
      return address.octets.join(".");
  }
  throw "FAILURE";
}

function show_block(chain: Chain, block: Block, index: number) {
  const b_hash = hash_block(block);
  const work = chain.work.get(b_hash) ?? 0n;
  const show_index = BigInt(index).toString();
  const show_time = (block.time >> 192n).toString(10);
  const show_body = [].slice
    .call(block.body, 0, 32)
    .map((x: number) => pad_left(2, "0", x.toString(16)))
    .join("");
  const show_hash = b_hash;
  const show_work = work.toString();
  return (
    "" +
    pad_left(8, " ", show_index) +
    " | " +
    pad_left(13, "0", show_time) +
    " | " +
    pad_left(64, "0", show_hash) +
    " | " +
    pad_left(64, "0", show_body) +
    " | " +
    pad_left(16, "0", show_work)
  );
}

function show_chain(chain: Chain, lines: number) {
  // const count = Math.floor(lines / 2);
  const blocks = get_longest_chain(chain);
  const lim = next_power_of_two(blocks.length);
  const add = lim > lines ? lim / lines : 1;
  let text =
    "       # | time          | hash                                                             | head                                                             | work\n";
  for (let i = 0; i < blocks.length - 1; i += add) {
    text += show_block(chain, blocks[i], i) + "\n";
  }
  if (blocks.length > 1) {
    text += show_block(chain, blocks[blocks.length - 1], blocks.length - 1) + "\n";
  }
  return text;
}

// Serialization
// -------------

function serialize_fixed_len(size: number, value: Nat): Bits {
  if (size > 0) {
    const head = value % 2n === 0n ? "0" : "1";
    const tail = serialize_fixed_len(size - 1, value / 2n); // ?? >> 1n ?
    return T.bits.push_front(head)(tail);
  } else {
    return T.bits.empty;
  }
}

function deserialize_fixed_len(size: number, bits: Bits): [Bits, Nat] {
  if (size === 0) {
    return [bits, 0n];
  } else {
    if (bits[0] === "0") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, T.bits.slice(1)(bits));
      return [bits, x * 2n];
    } else if (bits[0] === "1") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, T.bits.slice(1)(bits));
      return [bits, x * 2n + 1n];
    } else {
      return [T.bits.empty, 0n];
    }
  }
}

function serialize_list<T>(item: (x: T) => Bits, list: List<T>): Bits {
  switch (list.ctor) {
    case "Nil": {
      const bit0 = "0";
      return T.bits.from(bit0);
    }
    case "Cons": {
      const bit1 = "1";
      const head = item(list.head);
      const tail = serialize_list(item, list.tail);
      const ser = T.bits.concat(head, tail);
      return T.bits.push_front(bit1)(ser);
    }
  }
}

function deserialize_list<T>(
  item: (x: Bits) => [Bits, T],
  bits: Bits,
): [Bits, List<T>] {
  if (bits[0] === "0") {
    return [T.bits.slice(1)(bits), nil()];
  } else if (bits[0] === "1") {
    let head, tail;
    [bits, head] = item(T.bits.slice(1)(bits));
    [bits, tail] = deserialize_list(item, bits);
    return [bits, cons(head, tail)];
  } else {
    return [T.bits.empty, nil()];
  }
}

function serialize_address(address: AddressPort): Bits {
  switch (address._) {
    case "IPv4": {
      const bit0 = "0";
      const val0 = serialize_fixed_len(8, BigInt(address.octets[0]));
      const val1 = serialize_fixed_len(8, BigInt(address.octets[1]));
      const val2 = serialize_fixed_len(8, BigInt(address.octets[2]));
      const val3 = serialize_fixed_len(8, BigInt(address.octets[3]));
      const port = serialize_fixed_len(16, BigInt(address.port));
      return T.bits.push_front(bit0)(
        T.bits.concat(val0, val1, val2, val3, port),
      );
    }
  }
  throw new Error("FAILURE: unknown address type");
}

function deserialize_address(bits: Bits): [Bits, AddressPort] {
  if (bits[0] === "0") {
    let val0, val1, val2, val3, port;
    bits = T.bits.slice(1)(bits);
    [bits, val0] = deserialize_fixed_len(8, bits);
    [bits, val1] = deserialize_fixed_len(8, bits);
    [bits, val2] = deserialize_fixed_len(8, bits);
    [bits, val3] = deserialize_fixed_len(8, bits);
    [bits, port] = deserialize_fixed_len(16, bits);
    const octets = [val0, val1, val2, val3]
      .map(Number)
      .map(u8.mask) as Quadruple<U8>;
    return [
      bits,
      {
        _: "IPv4",
        octets,
        port: u16.mask(Number(port)),
      },
    ];
  } else {
    throw "Bad address deserialization.";
  }
}

function serialize_bits(data: Bits): Bits {
  const size = serialize_fixed_len(16, BigInt(data.length));
  return T.bits.concat(size, data);
}

function deserialize_bits(bits: Bits): [Bits, Bits] {
  let size_: bigint, data: Bits;
  [bits, size_] = deserialize_fixed_len(16, bits);
  const size = Number(size_);
  [bits, data] = [T.bits.slice(size)(bits), T.bits.slice(0, size)(bits)];
  return [bits, data];
}

function serialize_slice(slice: Slice): Bits {
  const work = serialize_fixed_len(64, slice.work);
  const data = serialize_bits(slice.data);
  return T.bits.concat(work, data);
}

function deserialize_slice(bits: Bits): [Bits, Slice] {
  let work_: bigint, data: Bits;
  [bits, work_] = deserialize_fixed_len(64, bits);
  [bits, data] = deserialize_bits(bits);
  const work = u64.mask(work_); // TODO: fix size mask redundancy, refactor `deserialize_fixed_len`;
  return [bits, { work, data }];
}

function serialize_uint8array(bytes: number, array: Uint8Array): Bits {
  let bits = T.bits.empty;
  for (let i = 0; i < bytes; ++i) {
    const ser = serialize_fixed_len(8, BigInt(array[i]));
    bits = T.bits.concat(bits, ser);
  }
  return bits;
}

function deserialize_uint8array(bytes: number, bits: Bits): [Bits, Uint8Array] {
  const vals = [];
  for (let i = 0; i < bytes; ++i) {
    let val: bigint;
    [bits, val] = deserialize_fixed_len(8, bits);
    vals.push(Number(val));
  }
  return [bits, new Uint8Array(vals)];
}

function serialize_hash(hash: Hash): Bits {
  return serialize_fixed_len(256, BigInt(HASH(hash)));
}

function deserialize_hash(bits: Bits): [Bits, Hash] {
  let nat;
  [bits, nat] = deserialize_fixed_len(256, bits);
  return [bits, HASH("0x" + pad_left(64, "0", nat.toString(16)))];
}

function serialize_block(block: Block): Bits {
  const prev = serialize_hash(block.prev);
  const time = serialize_fixed_len(256, block.time);
  const body = serialize_uint8array(BODY_SIZE, block.body);
  return T.bits.concat(prev, time, body);
}

function deserialize_block(bits: Bits): [Bits, Block] {
  let prev, time, body;
  [bits, prev] = deserialize_hash(bits);
  [bits, time] = deserialize_fixed_len(256, bits);
  [bits, body] = deserialize_uint8array(BODY_SIZE, bits);
  time = u256.mask(time);
  return [bits, { prev, time, body: body as Body }];
}

function serialize_message(message: Message): Bits {
  switch (message.ctor) {
    case "PutPeers": {
      const code0 = T.bits.from("0000");
      const peers = serialize_list(
        serialize_address,
        array_to_list(message.peers),
      );
      return T.bits.concat(code0, peers);
    }
    case "PutBlock": {
      const code1 = T.bits.from("1000");
      const block = serialize_block(message.block);
      return T.bits.concat(code1, block);
    }
    case "AskBlock": {
      const code2 = T.bits.from("0100");
      const b_hash = serialize_hash(message.b_hash);
      return T.bits.concat(code2, b_hash);
    }
    case "PutSlices": {
      const code3 = T.bits.from("1100");
      const slices = serialize_list(
        serialize_slice,
        array_to_list(message.slices),
      );
      return T.bits.concat(code3, slices);
    }
  }
}

function deserialize_message(bits: Bits): [Bits, Message] {
  const CODE_SIZE = 4;
  const code = T.bits.slice(0, CODE_SIZE)(bits);
  bits = T.bits.slice(CODE_SIZE)(bits);
  switch (code) {
    case "0000": {
      let peers;
      [bits, peers] = deserialize_list(deserialize_address, bits);
      return [bits, { ctor: "PutPeers", peers: list_to_array(peers) }];
    }
    case "1000": {
      let block;
      [bits, block] = deserialize_block(bits);
      return [bits, { ctor: "PutBlock", block }];
    }
    case "0100": {
      let b_hash;
      [bits, b_hash] = deserialize_hash(bits);
      return [bits, { ctor: "AskBlock", b_hash }];
    }
    case "1100": {
      let slices_: List<Slice>;
      [bits, slices_] = deserialize_list(deserialize_slice, bits);
      const slices = list_to_array(slices_);
      return [bits, { ctor: "PutSlices", slices }];
    }
  }
  throw "bad message deserialization"; // TODO: handle error on bad serialization of messages
}

// Networking
// ----------

const DEFAULT_PORT: number = 16936;

const valid_port = (port: number) => !isNaN(port) && port >= 1 && port <= 65535;
const valid_octet = (octet: number) => !isNaN(octet) && octet >= 0 && octet <= 255;

function address_to_deno(address: AddressPort): Deno.Addr {
  return {
    transport: "udp",
    hostname: get_address_hostname(address),
    port: address.port,
  };
}

function deno_to_address(deno_addr: Deno.Addr): AddressPort {
  if (deno_addr.transport === "udp") {
    return string_to_address(`${deno_addr.hostname}:${deno_addr.port}`);
  } else {
    throw new Error(`Invalid UDP address: ${deno_addr}`);
  }
}

// TODO: use parser from lib
function string_to_address(address_txt: string): AddressPort {
  const addr_split = address_txt.split(":");
  const port_txt = addr_split[addr_split.length - 1];
  const ip_txt = addr_split.slice(0, -1).join(":");

  const port_ = default_or_convert(Number, valid_port)(DEFAULT_PORT)(port_txt);
  if (port_ === null) {
    throw new Error(`invalid port: '${port_txt}'`);
  }
  const port = u16.check(port_).unwrap();

  if (ip_txt[0] == "[") {
    // IPv6 address
    // TODO: dual (ipv4) format
    const txt = ip_txt.slice(1, -1);
    const segments_txt = txt.split(":");

    const is_empty = (x: string): boolean => !x;
    let [prefix_txt, suffix_txt] = break_list(is_empty)(segments_txt);
    prefix_txt = drop_while(is_empty)(prefix_txt);
    suffix_txt = drop_while(is_empty)(suffix_txt);

    const prefix_segments = prefix_txt.map((x) => parseInt(x, 16));
    const suffix_segments = suffix_txt.map((x) => parseInt(x, 16));
    const len = prefix_segments.length + suffix_segments.length;
    const fill: number[] = Array(8 - len).fill(0);
    const segments_ = prefix_segments.concat(fill).concat(suffix_segments);
    const segments = segments_.map(u16.mask) as Octuple<U16>;

    return {
      _: "IPv6",
      segments,
      port,
    };
  } else {
    const [val0_txt, val1_txt, val2_txt, val3_txt] = ip_txt.split(".");
    const val0 = Number(val0_txt);
    const val1 = Number(val1_txt);
    const val2 = Number(val2_txt);
    const val3 = Number(val3_txt);
    if ([val0, val1, val2, val3].some((x) => !valid_octet(x))) {
      throw new Error(`invalid address: ${ip_txt}`);
    }
    const octets = [val0, val1, val2, val3]
      .map(Number)
      .map(u8.mask) as Quadruple<U8>;
    return {
      _: "IPv4",
      octets,
      port,
    };
  }
}

function udp_init(port: number = DEFAULT_PORT) {
  //console.log("init", port);
  return Deno.listenDatagram({ port, transport: "udp" });
}

function udp_send(
  udp: Deno.DatagramConn,
  address: AddressPort,
  message: Message,
) {
  //console.log("send", address, message);
  udp.send(
    bits_to_uint8array(serialize_message(message)),
    address_to_deno(address),
  );
}

function udp_receive<T>(
  udp: Deno.DatagramConn,
  callback: (address: AddressPort, message: Message) => T,
) {
  setTimeout(async () => {
    for await (const [buff, deno_addr] of udp) {
      let bits = uint8array_to_bits(buff);
      const addr = deno_to_address(deno_addr);
      let msg;
      [bits, msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}

// Node
// ----

export function start_node(
  base_dir: string,
  config: {
    port?: number;
    display?: boolean;
    mine: boolean;
    secret_key?: U256;
    peers?: cfg_nt.AddressOptPort[];
  },
) {
  const get_dir = get_dir_with_base(base_dir);
  // TODO: fix much redundancy on config params
  const cfg = Object.assign(
    {},
    {
      port: DEFAULT_PORT,
      display: false,
      mine: false,
      secret_key: u256.zero,
      peers: [] as cfg_nt.AddressOptPort[],
    },
    config,
  );

  // TODO: i don't understand this  :P
  // const MINER_CPS = 16;
  const MINER_HASHRATE = 64;

  let MINED = 0;

  const initial_peers: Dict<Peer> = {};
  for (const cfg_peer of cfg.peers) {
    const port = u16.mask(cfg_peer.port ?? DEFAULT_PORT);
    const address = { ...cfg_peer, port };
    const peer = { seen_at: now(), address };
    initial_peers[serialize_address(address)] = peer;
  }
  // Initializes the node

  const chain: Chain = initial_chain();
  // var slices : Heap<Slice> = {ctor: "Empty"};
  const node: Node = { port: cfg.port, peers: initial_peers, chain };

  const body: Body = EmptyBody;
  body[0] = (cfg.port >> 8) % 0xff; // DEBUG
  body[1] = cfg.port % 0xff; // DEBUG

  // Initializes sockets
  const udp = udp_init(cfg.port);

  // Returns the current time
  // TODO: get peers median?
  function get_time(): U64 {
    return u64.mask(now());
  }

  function send(to: AddressPort, message: Message) {
    // if (!(get_address_hostname(to) === "127.0.0.1" && to.port === port)) {
    udp_send(udp, to, message);
    // }
  }

  function all_peers(): Array<Peer> {
    return Object.values(node.peers).filter((p) => p.address.port !== cfg.port); //! DEBUG
  }

  // Handles incoming messages
  function handle_message(sender: AddressPort, message: Message) {
    switch (message.ctor) {
      case "PutPeers": {
        console.log(
          "<- received PutPeers".padEnd(30, " "),
          message.peers.length,
        ); // DEBUG
        for (const address of message.peers) {
          node.peers[serialize_address(address)] = {
            seen_at: get_time(),
            address,
          };
        }
        return;
      }
      case "PutBlock": {
        // console.log(
        //   "<- received PutBlock".padEnd(30, " "),
        //   hash_block(message.block),
        // ); // DEBUG
        add_block(node.chain, message.block, get_time());
        return;
      }
      case "AskBlock": {
        // console.log("<- received AskBlock".padEnd(30, " "), message.b_hash); // DEBUG
        const block = node.chain.block.get(message.b_hash);
        if (block) {
          // console.log(
          //    `  -> sending asked block:`.padEnd(30, " "),
          //   `${message.b_hash}`,
          // ); // DEBUG
          send(sender, { ctor: "PutBlock", block });
          // Gets some children to send too
          //for (var i = 0; i < 8; ++i) {
          //var block = node.chain.block[block.prev];
          //if (block) {
          //send(sender, {ctor: "PutBlock", block});
          //}
          //}
        } else {
          // console.log(
          //   `  XX block not found:`.padEnd(30, " "),
          //   `${message.b_hash}`,
          // ); // DEBUG
        }
        return;
      }
      case "PutSlices": {
        console.log("<- received PutSlices".padEnd(30, " ")); // DEBUG
        // const work = get_hash_work(hash_slice(message.slice));
        // node.slices = heap_insert([work, message.slice], node.slices);
        return;
      }
    }
    throw `bad message`;
  }

  function write_block(block: Block, rand: U64) {
    const b_hash = hash_block(block);
    const dir = get_dir(DIR_MINED);
    const rand_txt = pad_left((64 / 8) * 2, "0", rand.toString(16));
    // TODO: one JSONL file per secret_key
    Deno.writeTextFileSync(dir + "/" + b_hash, rand_txt);
  }

  // Attempts to mine a new block
  function miner() {
    const tip_hash = node.chain.tip[1];
    const tip_target = node.chain.target.get(tip_hash);
    assert_non_null(tip_target);
    // const max_hashes = MINER_HASHRATE / MINER_CPS;
    const max_hashes = 16;
    const mined = mine(
      { ...BlockZero, body, prev: tip_hash },
      tip_target,
      max_hashes,
      get_time(),
      cfg.secret_key,
    );
    //console.log("[miner] Difficulty: " + compute_difficulty(tip_target) + " hashes/block. Power: " + max_hashes + " hashes.");
    if (mined != null) {
      console.log("=> block MINED".padEnd(30, " "));
      const [new_block, rand] = mined;
      MINED += 1;
      add_block(node.chain, new_block, get_time());
      write_block(new_block, rand);
    }
    // Let other jobs run and loop
    // await null;
    setTimeout(miner, 0);
  }

  // Sends our tip block to random peers
  function gossiper() {
    const tip_hash = node.chain.tip[1];
    const block = get_assert(node.chain.block, tip_hash);
    console.log("=> sending TIP".padEnd(30, " "), hash_block(block)); // DEBUG
    for (const peer of all_peers()) {
      send(peer.address, { ctor: "PutBlock", block });
    }
  }

  // Requests missing blocks
  function requester() {
    for (const b_hash of node.chain.pending.keys()) {
      if (!node.chain.seen.get(b_hash)) {
        console.log("=> requesting PENDING".padEnd(30, " "), b_hash); // DEBUG
        for (const peer of all_peers()) {
          send(peer.address, { ctor: "AskBlock", b_hash });
        }
      }
    }
  }

  // Saves longest chain
  function saver() {
    const chain = get_longest_chain(node.chain);
    for (let i = 0; i < chain.length; ++i) {
      const bits = serialize_block(chain[i]);
      const buff = bits_to_uint8array(bits);
      const indx = pad_left(16, "0", i.toString(16));
      const b_dir = get_dir(DIR_BLOCKS);
      Deno.writeFileSync(b_dir + "/" + indx, buff);
    }
  }

  // Loads saved blocks
  function loader() {
    const b_dir = get_dir(DIR_BLOCKS);
    const files = Array.from(Deno.readDirSync(b_dir)).sort((x, y) => x.name > y.name ? 1 : -1);
    for (const file of files) {
      const buff = Deno.readFileSync(b_dir + "/" + file.name);
      const [_bits, block] = deserialize_block(uint8array_to_bits(buff));
      add_block(node.chain, block, get_time());
    }
  }

  // Displays status
  function displayer() {
    const tip_hash = node.chain.tip[1];
    const tip_target = get_assert(node.chain.target, tip_hash);
    const diff = compute_difficulty(tip_target);
    const rate = (diff * 1000n) / TIME_PER_BLOCK;
    const pending = node.chain.pending;
    let pending_size = 0;
    let pending_seen = 0;
    for (const b_hash of pending.keys()) {
      if (node.chain.seen.get(b_hash)) {
        pending_seen += 1;
      }
      pending_size += 1;
    }
    console.clear();
    console.log("Ubilog");
    console.log("======");
    console.log("");
    console.log("- current_time  : " + get_time() + " UTC");
    console.log(
      "- online_peers  : " + Object.keys(node.peers).length + " peers",
    );
    console.log(
      "- chain_height  : " + get_longest_chain(node.chain).length + " blocks",
    );
    console.log("- database      : " + (node.chain.block.size - 1) + " blocks");
    console.log(
      "- pending       : " +
        pending_size +
        " blocks (" +
        pending_seen +
        " downloaded)",
    );
    console.log("- total_mined   : " + MINED + " blocks");
    console.log("- own_hash_rate : " + MINER_HASHRATE + " hashes / second");
    console.log("- net_hash_rate : " + rate + " hashes / second");
    console.log("- difficulty    : " + diff + " hashes / block");
    console.log(
      "- peers: ",
      all_peers()
        .map((p) => JSON.stringify(p.address))
        .join(", "),
    );
    console.log("");
    console.log("Blocks");
    console.log("------");
    console.log("");
    console.log(show_chain(node.chain, 16));
  }

  // function display_tip() {
  //   const tip = chain.tip;
  //   const tip_hash = tip[1];
  //   // const tip_block = get_assert(chain.block, tip_hash);
  //   const tip_height = get_assert(chain.height, tip_hash);
  //   console.log(tip_height, "->", tip_hash);
  // }

  loader();

  const receiver = () => udp_receive(udp, handle_message);

  setInterval(gossiper, 1000);
  setInterval(requester, 1000 / 32);
  setInterval(receiver, 1000 / 64);
  setInterval(saver, 1000 * 30);

  if (cfg.mine) {
    // setInterval(miner, 1000 / MINER_CPS);
    miner();
  }
  if (cfg.display) {
    setTimeout(
      () => setInterval(displayer, 1000), //
      900,
    );
  }
}

//function test_0() {
//  const target = compute_target(1000n);
//  const max_attempts = 999999;
//  const do_mine = (prev: Hash) =>
//    mine({ ...BlockZero, prev }, target, max_attempts, BigInt(Date.now())) ??
//    BlockZero;
//  const block_0 = do_mine(HashZero);
//  const block_1 = do_mine(hash_block(block_0));
//  const block_2 = do_mine(hash_block(block_1));
//
//  const chain = initial_chain();
//  add_block(chain, block_0, BigInt(Date.now()));
//  add_block(chain, block_1, BigInt(Date.now()));
//  add_block(chain, block_2, BigInt(Date.now()));
//  console.log(show_chain(chain, 8));
//
//  console.log(serialize_block(block_2));
//}
//test_0();

// function err(x: string) {
//   console.error(`ERROR: ${x}`);
// }

// function show_usage() {
//   console.log(`Usage:  ubilog-ts [--port PORT]`);
// }

// function err_usage_exit(x: string): never {
//   err(x);
//   show_usage();
//   Deno.exit(1);
// }

export function main(args: string[], get_env: GetEnv): void {
  const parsed_flags = parse_args(args, {
    string: ["port"],
    boolean: ["display"],
  });

  // TODO: fix ENV("HOME") ?? ""
  const base_dir = get_env("UBILOG_DIR") ?? path.join(get_env("HOME") ?? "", ".ubilog");
  const config_file_data = load_config_file(base_dir);
  if (!is_json_object(config_file_data)) {
    throw new Error(`invalid config file, content is not a JSON object`);
  }

  const config = resolve_config(parsed_flags, config_file_data, get_env);

  // TODO: redundancy. pass entire config object
  // (needs fixed size numbers on config)
  start_node(base_dir, {
    port: config.net_port,
    display: config.display,
    mine: config.mine,
    // secret_key: config.secret_key,
    peers: config.peers,
  });
}

if (import.meta.main) {
  main(Deno.args, Deno.env.get);
}
