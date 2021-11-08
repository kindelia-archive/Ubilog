// deno-lint-ignore-file camelcase no-inferrable-types
import { parse as parse_args } from "https://deno.land/std@0.113.0/flags/mod.ts";
import * as path from "https://deno.land/std@0.110.0/path/mod.ts";

import { break_list, default_or_convert, drop_while } from "./lib/functional/mod.ts";
import { is_json_object, JSONValue } from "./lib/json.ts";
import { ensure_text_file, get_dir_with_base } from "./lib/files.ts";
import { bits_mask } from "./lib/numbers.ts";

import { keccak256 } from "./keccak256.ts";
import { resolve_config } from "./config.ts";

// TODO
// - slices

// Configuration:
// ~/.ubilog/config
// Output:
// ~/.ubilog/data/blocks/HASH
// ~/.ubilog/data/mined/HASH  // TODO: mined rands on JSONL file(s)

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

type F64 = number;
type Nat = bigint;

type U8 = F64;
type U16 = F64;
type U64 = Nat;
type U256 = Nat;

type Hash = string; // 0x0000000000000000000000000000000000000000000000000000000000000000
type Body = Uint8Array; // 1280 bytes

type Block = {
  prev: Hash;
  time: U256;
  body: Body; // 1280 bytes
};

type Chain = {
  block: Dict<Block>;
  children: Dict<Array<Hash>>;
  pending: Dict<Array<Block>>;
  work: Dict<Nat>;
  height: Dict<Nat>;
  target: Dict<Nat>;
  seen: Dict<1>;
  tip: [U64, Hash];
};

// Network
// -------

type Bits = string;

type IPv4 = { ctor: "IPv4"; port: U16; val0: U8; val1: U8; val2: U8; val3: U8 };
type IPv6 = { ctor: "IPv6"; port: U16; segments: number[] };
type Address = IPv4 | IPv6;

type Peer = {
  seen_at: Nat;
  address: Address;
};

type Cons<T> = { ctor: "Cons"; head: T; tail: List<T> };
type Nil<T> = { ctor: "Nil" };
type List<T> = Cons<T> | Nil<T>;

type HNode<A> = { ctor: "HNode"; value: [bigint, A]; child: List<Heap<A>> };
type Empty<A> = { ctor: "Empty" };
type Heap<A> = Empty<A> | HNode<A>;

type Slice = { work: U64; data: Bits };

type PutPeers = { ctor: "PutPeers"; peers: Address[] };
type PutBlock = { ctor: "PutBlock"; block: Block };
type AskBlock = { ctor: "AskBlock"; bhash: Hash };
type PutSlices = { ctor: "PutSlices"; slices: Slice[] };
type Message = PutPeers | PutBlock | AskBlock;

type Mail = {
  sent_by: Peer;
  message: Message;
};

type Node = {
  port: F64;
  peers: Dict<Peer>;
  chain: Chain;
  //slices: Heap<Slice>
};

function HASH(hash: Hash) {
  if (/^0x[0-9A-Fa-f]{64}$/.test(hash)) {
    return hash;
  } else {
    throw new Error("INCORRECT HASH FORMAT.");
  }
}

// Algorithms
// ==========

// Util

function now(): bigint {
  return BigInt(Date.now());
}

// Numbers
// -------

const MASK_64 = bits_mask(64n);
const MASK_192 = bits_mask(192n);
const MASK_256 = bits_mask(256n);

function next_power_of_two(x: number): number {
  return x <= 1 ? x : 2 ** (Math.floor(Math.log(x - 1) / Math.log(2)) + 1);
}

// Strings
// -------

function pad_left(length: F64, fill: string, str: string) {
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

// Heap
// ----

// function heap_merge<A>(a: Heap<A>, b: Heap<A>): Heap<A> {
//   if (a.ctor === "Empty") {
//     return b
//   } else if (b.ctor === "Empty") {
//     return a
//   } else if (a.value[0] > b.value[0]) {
//     return {ctor: "HNode", value: a.value, child: {ctor: "Cons", head: b, tail: a.child}}
//   } else {
//     return {ctor: "HNode", value: b.value, child: {ctor: "Cons", head: a, tail: b.child}}
//   }
// }

// function heap_merge_pairs<A>(pairs: List<Heap<A>>): Heap<A> {
//   switch (pairs.ctor) {
//     case "Nil": return {ctor: "Empty"}
//     case "Cons": switch (pairs.tail.ctor) {
//       case "Nil": return pairs.head
//       case "Cons": return heap_merge(heap_merge(pairs.head, pairs.tail.head), heap_merge_pairs(pairs.tail.tail))
//     }
//   }
// }

// function heap_insert<A>(value: [bigint,A], heap: Heap<A>): Heap<A> {
//   return heap_merge({ctor: "HNode", value: value, child: {ctor: "Nil"}}, heap)
// }

// function heap_head<A>(heap: Heap<A>): [bigint,A] | null {
//   switch (heap.ctor) {
//     case "HNode": return heap.value
//     case "Empty": return null
//   }
// }

// function heap_tail<A>(heap: Heap<A>): Heap<A> {
//   switch (heap.ctor) {
//     case "HNode": return heap_merge_pairs(heap.child)
//     case "Empty": return heap
//   }
// }

//insert :: Ord a => a -> Heap a -> Heap a
//insert x = merge (Heap x [])

//deleteMin :: Ord a => Heap a -> Heap a
//deleteMin (Heap x hs) = mergePairs hs

// Bits
// ----

function bits_to_uint8array(bits: Bits): Uint8Array {
  if (bits.length < 2 ** 16) {
    const buff = new Uint8Array(2 + Math.ceil(bits.length / 8));
    bits = serialize_bits(bits);
    //console.log("->", bits)
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
  throw new Error("bit string too large");
}

function uint8array_to_bits(buff: Uint8Array): Bits {
  const size = (buff[0] || 0) + (buff[1] || 0) * 256;
  let bits = "";
  for (let i = 2; i < buff.length; ++i) {
    const val = buff[i] || 0;
    for (let j = 0; j < 8 && bits.length < size; ++j) {
      bits += (val >>> j) & 1 ? "1" : "0";
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
//   const bytes: F64[] = [];
//   for (let i = 0; i < 8; ++i) {
//     bytes.push(Number((value >> BigInt((8 - i - 1) * 8)) % 0x100n));
//   }
//   return new Uint8Array(bytes);
// }

function u256_to_uint8array(value: U256): Uint8Array {
  const bytes: F64[] = [];
  for (let i = 0; i < 32; ++i) {
    bytes.push(Number((value >> BigInt((32 - i - 1) * 8)) % 0x100n));
  }
  return new Uint8Array(bytes);
}

function hash_to_uint8array(hash: Hash): Uint8Array {
  return u256_to_uint8array(BigInt(hash));
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
  max_attempts: F64,
  node_time: U64,
  secret_key: U256 = 0n,
): [Block, U64] | null {
  for (let i = 0n; i < max_attempts; ++i) {
    const [rand_0, rand_1] = crypto.getRandomValues(new Uint32Array(2));
    const rand = BigInt(rand_0) | (BigInt(rand_1) << 32n);
    const nonce = (secret_key << 64n) | rand;
    const bits = BigInt(hash_uint8array(u256_to_uint8array(nonce))) & MASK_192;
    const time = ((node_time & MASK_64) << 192n) | bits;
    block = { ...block, time };
    const hash = hash_block(block);
    if (BigInt(hash) > target) {
      //console.log("nice", hash, target);
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
//var bits : string = (heap_head(slices) || [0,""])[1]
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

const EmptyBody: Body = new Uint8Array(BODY_SIZE);

const BlockZero: Block = {
  prev: HashZero,
  time: 0n,
  body: EmptyBody,
};

function initial_chain(): Chain {
  const block: Dict<Block> = { [HashZero]: BlockZero };
  const children: Dict<Array<Hash>> = { [HashZero]: [] };
  const pending: Dict<Array<Block>> = {};
  const work: Dict<Nat> = { [HashZero]: 0n };
  const height: Dict<Nat> = { [HashZero]: 0n };
  const target: Dict<Nat> = { [HashZero]: INITIAL_TARGET };
  const seen: Dict<1> = {};
  const tip: [U256, Hash] = [0n, HashZero];
  return { block, children, pending, work, height, target, seen, tip };
}

function add_block(chain: Chain, block: Block, time: U64) {
  const must_add: Block[] = [block];
  while (must_add.length > 0) {
    const block = must_add.pop() || BlockZero;
    const btime = block.time >> 192n;
    if (btime < BigInt(time) + DELAY_TOLERANCE) {
      const bhash = hash_block(block);
      if (chain.block[bhash] === undefined) {
        const phash = block.prev;
        // If previous block is available, add the block
        // TODO: extract function to add mined blocks?
        if (chain.block[phash] !== undefined) {
          const work = get_hash_work(bhash);
          // const ptime = chain.block
          chain.block[bhash] = block;
          chain.work[bhash] = 0n;
          chain.height[bhash] = 0n;
          chain.target[bhash] = 0n;
          chain.children[bhash] = [];
          // If the block is valid
          const has_enough_work = BigInt(bhash) >= chain.target[phash];
          const advances_time = btime > chain.block[phash].time >> 192n;
          if (has_enough_work && advances_time) {
            chain.work[bhash] = chain.work[phash] + work;
            if (phash !== HashZero) {
              chain.height[bhash] = chain.height[phash] + 1n;
            }
            if (
              chain.height[bhash] > 0n &&
              chain.height[bhash] % BLOCKS_PER_PERIOD === 0n
            ) {
              let checkpoint_hash = phash;
              for (let i = 0n; i < BLOCKS_PER_PERIOD - 1n; ++i) {
                checkpoint_hash = chain.block[checkpoint_hash].prev;
              }
              const period_time = Number(
                btime - (chain.block[checkpoint_hash].time >> 192n),
              );
              const last_target = chain.target[phash];
              const scale = BigInt(
                Math.floor((2 ** 32 * Number(TIME_PER_PERIOD)) / period_time),
              );
              const next_target = compute_next_target(last_target, scale);
              chain.target[bhash] = next_target;
              //console.log("A period should last   " + TIME_PER_PERIOD + " seconds.");
              //console.log("The last period lasted " + period_time + " seconds.");
              //console.log("The last difficulty was " + compute_difficulty(last_target) + " hashes per block.");
              //console.log("The next difficulty is  " + compute_difficulty(next_target) + " hashes per block.");
              // Keep old difficulty
            } else {
              chain.target[bhash] = chain.target[phash];
            }
            // Refresh tip
            if (chain.work[bhash] > chain.tip[0]) {
              chain.tip = [chain.work[bhash], bhash];
            }
          }
          // Registers this block as a child
          chain.children[phash].push(bhash);
          // Add all blocks that were waiting for this block
          for (const pending of chain.pending[bhash] || []) {
            must_add.push(pending);
          }
          delete chain.pending[bhash];
          // Otherwise, add this block to the previous block's pending list
        } else if (chain.seen[bhash] === undefined) {
          chain.pending[phash] = chain.pending[phash] || [];
          chain.pending[phash].push(block);
        }
        chain.seen[bhash] = 1;
      }
    }
  }
  //Deno.exit();
}

function get_longest_chain(chain: Chain): Array<Block> {
  const longest = [];
  let bhash = chain.tip[1];
  while (chain.block[bhash] !== undefined && bhash !== HashZero) {
    const block = chain.block[bhash];
    longest.push(block);
    bhash = block.prev;
  }
  return longest.reverse();
}

// Stringification
// ---------------

function get_address_hostname(address: Address): string {
  switch (address.ctor) {
    case "IPv4":
      return (
        address.val0 +
        "." +
        address.val1 +
        "." +
        address.val2 +
        "." +
        address.val3
      );
  }
  return "";
}

function show_block(chain: Chain, block: Block, index: number) {
  const bhash = hash_block(block);
  const work = chain.work[bhash] || 0n;
  const show_index = BigInt(index).toString();
  const show_time = (block.time >> 192n).toString(10);
  const show_body = [].slice
    .call(block.body, 0, 32)
    .map((x: number) => pad_left(2, "0", x.toString(16)))
    .join("");
  const show_hash = bhash;
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

function show_chain(chain: Chain, _lines: number) {
  // const count = Math.floor(lines / 2);
  const blocks = get_longest_chain(chain);
  const lim = next_power_of_two(blocks.length);
  const add = lim > 32 ? lim / 32 : 1;
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

function serialize_fixed_len(size: F64, value: Nat): Bits {
  if (size > 0) {
    const head = value % 2n === 0n ? "0" : "1";
    const tail = serialize_fixed_len(size - 1, value / 2n);
    return head + tail;
  } else {
    return "";
  }
}

function deserialize_fixed_len(size: F64, bits: Bits): [Bits, Nat] {
  if (size === 0) {
    return [bits, 0n];
  } else {
    if (bits[0] === "0") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, bits.slice(1));
      return [bits, x * 2n];
    } else if (bits[0] === "1") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, bits.slice(1));
      return [bits, x * 2n + 1n];
    } else {
      return ["", 0n];
    }
  }
}

function serialize_list<T>(item: (x: T) => Bits, list: List<T>): Bits {
  switch (list.ctor) {
    case "Nil":
      return "0";
    case "Cons":
      return "1" + item(list.head) + serialize_list(item, list.tail);
  }
}

function deserialize_list<T>(
  item: (x: Bits) => [Bits, T],
  bits: Bits,
): [Bits, List<T>] {
  if (bits[0] === "0") {
    return [bits.slice(1), nil()];
  } else if (bits[0] === "1") {
    let head, tail;
    [bits, head] = item(bits.slice(1));
    [bits, tail] = deserialize_list(item, bits);
    return [bits, cons(head, tail)];
  } else {
    return ["", nil()];
  }
}

function serialize_address(address: Address): Bits {
  switch (address.ctor) {
    case "IPv4": {
      const val0 = serialize_fixed_len(8, BigInt(address.val0));
      const val1 = serialize_fixed_len(8, BigInt(address.val1));
      const val2 = serialize_fixed_len(8, BigInt(address.val2));
      const val3 = serialize_fixed_len(8, BigInt(address.val3));
      const port = serialize_fixed_len(16, BigInt(address.port));
      return "0" + val0 + val1 + val2 + val3 + port;
    }
  }
  return "";
}

function deserialize_address(bits: Bits): [Bits, Address] {
  if (bits[0] === "0") {
    let val0, val1, val2, val3, port;
    [bits, val0] = deserialize_fixed_len(8, bits.slice(1));
    [bits, val1] = deserialize_fixed_len(8, bits);
    [bits, val2] = deserialize_fixed_len(8, bits);
    [bits, val3] = deserialize_fixed_len(8, bits);
    [bits, port] = deserialize_fixed_len(16, bits);
    return [
      bits,
      {
        ctor: "IPv4",
        val0: Number(val0),
        val1: Number(val1),
        val2: Number(val2),
        val3: Number(val3),
        port: Number(port),
      },
    ];
  } else {
    throw "Bad address deserialization.";
  }
}

function serialize_bits(data: Bits): Bits {
  const size = serialize_fixed_len(16, BigInt(data.length));
  return size + data;
}

//function deserialize_bits(bits: Bits): [Bits, Bits] {
//  let size, data;
//  [bits, size] = deserialize_fixed_len(16, bits);
//  [bits, data] = [bits.slice(Number(size)), bits.slice(0, Number(size))];
//  return [bits, data];
//}

//function serialize_slice(slice: Slice) : Bits {
//var work = serialize_fixed_len(64, slice.work);
//var data = serialize_bits(slice.data);
//return work + data;
//}

//function deserialize_slice(bits: Bits) : [Bits, Slice] {
//var [bits,work] = deserialize_fixed_len(64, bits);
//var [bits,data] = deserialize_bits(bits);
//return [bits, {work, data}];
//}

function serialize_uint8array(bytes: number, array: Uint8Array): Bits {
  let bits = "";
  for (let i = 0; i < bytes; ++i) {
    bits += serialize_fixed_len(8, BigInt(array[i]));
  }
  return bits;
}

function deserialize_uint8array(bytes: number, bits: Bits): [Bits, Uint8Array] {
  const vals = [];
  for (let i = 0; i < bytes; ++i) {
    let val;
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
  return prev + time + body;
}

function deserialize_block(bits: Bits): [Bits, Block] {
  let prev, time, body;
  [bits, prev] = deserialize_hash(bits);
  [bits, time] = deserialize_fixed_len(256, bits);
  [bits, body] = deserialize_uint8array(BODY_SIZE, bits);
  return [bits, { prev, time, body }];
}

function serialize_message(message: Message): Bits {
  switch (message.ctor) {
    case "PutPeers": {
      const peers = serialize_list(
        serialize_address,
        array_to_list(message.peers),
      );
      return "0000" + peers;
    }
    case "PutBlock": {
      const block = serialize_block(message.block);
      return "1000" + block;
    }
    case "AskBlock": {
      const bhash = serialize_hash(message.bhash);
      return "0100" + bhash;
    }
      //case "PutSlice": {
      //const slice = serialize_slice(message.slice);
      //return "11" + slice;
      //}
  }
  return "";
}

function deserialize_message(bits: Bits): [Bits, Message] {
  switch (bits.slice(0, 4)) {
    case "0000": {
      let peers;
      [bits, peers] = deserialize_list(deserialize_address, bits.slice(2));
      return [bits, { ctor: "PutPeers", peers: list_to_array(peers) }];
    }
    case "1000": {
      let block;
      [bits, block] = deserialize_block(bits.slice(2));
      return [bits, { ctor: "PutBlock", block }];
    }
    case "0100": {
      let bhash;
      [bits, bhash] = deserialize_hash(bits.slice(2));
      return [bits, { ctor: "AskBlock", bhash }];
    }
      // case "11": {
      //   let slice;
      //   [bits, slice] = deserialize_slice(bits.slice(2));
      //   return [bits, { ctor: "PutSlice", slice }];
      // }
  }
  throw "Bad message deserialization.";
}

// Networking
// ----------

const DEFAULT_PORT: number = 16936;

const valid_port = (port: number) => !isNaN(port) && port >= 1 && port <= 65535;
const valid_octet = (octet: number) => !isNaN(octet) && octet >= 0 && octet <= 255;

function address_to_deno(address: Address): Deno.Addr {
  return {
    transport: "udp",
    hostname: get_address_hostname(address),
    port: address.port,
  };
}

function deno_to_address(deno_addr: Deno.Addr): Address {
  if (deno_addr.transport === "udp") {
    return string_to_address(`${deno_addr.hostname}:${deno_addr.port}`);
  } else {
    throw new Error(`Invalid UDP address: ${deno_addr}`);
  }
}

// TODO: use parser from lib
function string_to_address(address_txt: string): Address {
  const addr_split = address_txt.split(":");
  const port_txt = address_txt[-1];
  const ip_txt = addr_split.slice(0, -1).join(":");

  const port = default_or_convert(Number, valid_port)(DEFAULT_PORT)(port_txt);
  if (port === null) {
    throw new Error(`invalid port: '${port_txt}'`);
  }

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
    const segments = prefix_segments.concat(fill).concat(suffix_segments);

    return {
      ctor: "IPv6",
      port: port,
      segments: segments,
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
    return {
      ctor: "IPv4",
      port: port,
      val0: val0,
      val1: val1,
      val2: val2,
      val3: val3,
    };
  }
}

function udp_init(port: number = DEFAULT_PORT) {
  //console.log("init", port);
  return Deno.listenDatagram({ port, transport: "udp" });
}

function udp_send(udp: Deno.DatagramConn, address: Address, message: Message) {
  //console.log("send", address, message);
  udp.send(
    bits_to_uint8array(serialize_message(message)),
    address_to_deno(address),
  );
}

function udp_receive<T>(
  udp: Deno.DatagramConn,
  callback: (address: Address, message: Message) => T,
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
  { port = DEFAULT_PORT, display = false },
) {
  const get_dir = get_dir_with_base(base_dir);

  // TODO: i don't understand this  :P
  const MINER_CPS = 16;
  const MINER_HASHRATE = 1024;

  let MINED = 0;

  // Loads config

  const peers: Dict<Peer> = {};

  // Initializes the node

  //console.log(peers);

  const chain: Chain = initial_chain();
  //var slices : Heap<Slice> = {ctor: "Empty"};
  const node: Node = { port, peers, chain };

  let body: Body = EmptyBody;
  //body[0] = (port % 42000);

  // Initializes sockets
  const udp = udp_init(port);

  // Returns the current time
  // TODO: get peers median?
  function get_time(): U64 {
    return now();
  }

  function send(to: Address, message: Message) {
    if (!(get_address_hostname(to) === "127.0.0.1" && to.port === port)) {
      udp_send(udp, to, message);
    }
  }

  function all_peers(): Array<Peer> {
    return Object.values(node.peers);
  }

  // Handles incoming messages
  function handle_message(sender: Address, message: Message) {
    switch (message.ctor) {
      case "PutPeers":
        //console.log("PutPeers", message.peers.length);
        for (const address of message.peers) {
          node.peers[serialize_address(address)] = {
            seen_at: get_time(),
            address,
          };
        }
        break;
      case "PutBlock":
        //console.log("PutBlock", hash_block(message.block));
        add_block(node.chain, message.block, get_time());
        break;
      case "AskBlock": {
        //console.log("AskBlock", message.bhash);
        const block = node.chain.block[message.bhash];
        if (block) {
          send(sender, { ctor: "PutBlock", block });
          //console.log("send asked block");
          // Gets some children to send too
          //for (var i = 0; i < 8; ++i) {
          //var block = node.chain.block[block.prev];
          //if (block) {
          //send(sender, {ctor: "PutBlock", block});
          //}
          //}
          break;
        }
      }
        //case "PutSlice":
        //var work = get_hash_work(hash_slice(message.slice));
        //node.slices = heap_insert([work, message.slice], node.slices);
        //break;
    }
  }
  udp_receive(udp, handle_message);

  // Attempts to mine a new block
  function miner() {
    const tip_hash = node.chain.tip[1];
    // const tip_block = node.chain.block[tip_hash];
    const tip_target = node.chain.target[tip_hash];
    const max_hashes = MINER_HASHRATE / MINER_CPS;
    const mined = mine(
      { ...BlockZero, body, prev: tip_hash },
      tip_target,
      max_hashes,
      get_time(),
      0n,
    );
    //console.log("[miner] Difficulty: " + compute_difficulty(tip_target) + " hashes/block. Power: " + max_hashes + " hashes.");
    if (mined !== null) {
      const [new_block, rand] = mined;
      MINED += 1;
      add_block(node.chain, new_block, get_time());

      const bhash = hash_block(new_block);
      const dir = get_dir(DIR_MINED);
      const rand_txt = pad_left((64 / 8) * 2, "0", rand.toString(16));
      // TODO: one file per secret_key? store secret key hash with each rand (much redundancy)?
      Deno.writeTextFileSync(dir + "/" + bhash, rand_txt);
      //displayer();
    }
  }

  // Sends our tip block to random peers
  function gossiper() {
    const block = node.chain.block[node.chain.tip[1]];
    for (const peer of all_peers()) {
      //console.log("send PutBlock", hash_block(block));
      send(peer.address, { ctor: "PutBlock", block });
    }
  }

  // Requests missing blocks
  function requester() {
    for (const bhash in node.chain.pending) {
      let count = 0;
      if (!node.chain.seen[bhash]) {
        for (const peer of all_peers()) {
          send(peer.address, { ctor: "AskBlock", bhash });
          ++count;
        }
      }
      //console.log("asked " + count + " pending blocks");
    }
  }

  // Saves longest chain
  function saver() {
    const chain = get_longest_chain(node.chain);
    for (let i = 0; i < chain.length; ++i) {
      const bits = serialize_block(chain[i]);
      const buff = bits_to_uint8array(bits);
      const indx = pad_left(16, "0", i.toString(16));
      const bdir = get_dir(DIR_BLOCKS);
      Deno.writeFileSync(bdir + "/" + indx, buff);
    }
  }

  // Loads saved blocks
  function loader() {
    const bdir = get_dir(DIR_BLOCKS);
    const files = Array.from(Deno.readDirSync(bdir)).sort((x, y) => x.name > y.name ? 1 : -1);
    for (const file of files) {
      const buff = Deno.readFileSync(bdir + "/" + file.name);
      const [_bits, block] = deserialize_block(uint8array_to_bits(buff));
      add_block(node.chain, block, get_time());
    }
  }

  // Displays status
  function displayer() {
    const target = node.chain.target[node.chain.tip[1]];
    const diff = compute_difficulty(target);
    const rate = (diff * 1000n) / TIME_PER_BLOCK;
    const pending = node.chain.pending;
    let pending_size = 0;
    let pending_seen = 0;
    for (const bhash in pending) {
      if (node.chain.seen[bhash]) {
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
    console.log(
      "- database      : " +
        (Object.keys(node.chain.block).length - 1) +
        " blocks",
    );
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
    console.log("");
    console.log("Blocks");
    console.log("------");
    console.log("");
    console.log(show_chain(node.chain, 32));
  }

  loader();

  setInterval(miner, 1000 / MINER_CPS);
  setInterval(gossiper, 1000);
  setInterval(requester, 1000 / 32);
  setInterval(saver, 1000 * 30);
  if (display) {
    setInterval(displayer, 1000);
  }
}

//function test_0() {
//  const target = compute_target(1000n);
//  const max_attempts = 999999;
//  const do_mine = (prev: Hash) =>
//    mine({ ...BlockZero, prev }, target, max_attempts, BigInt(Date.now())) ||
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

function err(x: any) {
  console.error(`ERROR: ${x}`);
}

function show_usage() {
  console.log(`Usage:  ubilog-ts [--port PORT]`);
}

function err_usage_exit(x: any): never {
  err(x);
  show_usage();
  Deno.exit(1);
}

const DEFAULT_CONFIG_FILE = `
{
  "peers": ["127.0.0.1:42000", "127.0.0.1:42001", "127.0.0.1:42002"]
}
`;

function load_config_file(base_dir: string): JSONValue {
  const config_path = `${base_dir}/config`;
  ensure_text_file(config_path, DEFAULT_CONFIG_FILE);
  const config_file = Deno.readTextFileSync(config_path);
  const config_data = JSON.parse(config_file);
  return config_data;
}

// TODO: move stuff to lib/config.ts
type GetEnv = (name: string) => string | undefined;

export function main(args: string[], get_env: GetEnv = Deno.env.get): void {
  const parsed_flags = parse_args(args, {
    string: ["port"],
    boolean: ["display"],
  });

  // TODO: fix ENV("HOME") || ""
  const base_dir = get_env("UBILOG_DIR") || path.join(get_env("HOME") || "", ".ubilog");
  const config_file_data = load_config_file(base_dir);
  if (!is_json_object(config_file_data)) {
    throw new Error(`invalid config file, it's not a JSON object`);
  }

  const config = resolve_config(parsed_flags, config_file_data, get_env);

  start_node(base_dir, { port: config.net_port, display: config.display });
}

if (import.meta.main) {
  main(Deno.args, Deno.env.get);
}
