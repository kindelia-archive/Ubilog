// deno-lint-ignore-file camelcase no-inferrable-types
import { ensureDirSync } from "https://deno.land/std/fs/mod.ts"; // FIXME: can this be local?
import { keccak256 } from "./keccak256.ts";
//import {path from "path"

// Persistence:
// ~/.ubilog/blocks/HASH
// ~/.ubilog/longest
// ~/.ubilog/to_mine
// ~/.ubilog/peers
// TODO

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

type IPv4 = { ctor: "IPv4"; val0: U8; val1: U8; val2: U8; val3: U8; port: U16 };
type Address = IPv4;

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

//type Slice = { work: U64, data: Bits }

type PutPeers = { ctor: "PutPeers"; peers: Address[] };
//type PutSlice = { ctor: "PutSlice", slice: Slice }
type PutBlock = { ctor: "PutBlock"; block: Block };
type AskBlock = { ctor: "AskBlock"; bhash: Hash };
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

// Numbers
// -------

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
  throw new Error("bitstring too large");
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

const HashZero: Hash = HASH("0x0000000000000000000000000000000000000000000000000000000000000000");

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
  if ((block.prev === HashZero) && (block.time === 0n)) {
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
): Block | null {
  // TODO return rands
  for (let i = 0n; i < max_attempts; ++i) {
    const [rand_0, rand_1] = crypto.getRandomValues(new Uint32Array(2));
    const nonce = (secret_key << 64n) | (BigInt(rand_0) << 32n) | BigInt(rand_1);
    const bits = BigInt(hash_uint8array(u256_to_uint8array(nonce))) &
      0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
    const time = (node_time << 192n) | bits;
    block = { ...block, time };
    const hash = hash_block(block);
    if (BigInt(hash) > target) {
      //console.log("nice", hash, target);
      return block;
    }
  }
  return null;
}

// Slices
// ------

// Fills a body with the top slices on the slice-pool
//function fill_body(body: Body, slices: Heap<string>) {
//for (var i = 0; i < 1280; ++i) {
//body[i] = 0;
//}
//var i = 0
//while (slices.ctor !== "Empty" && i < 1280 * 8) {
//var bits : string = (heap_head(slices) || [0,""])[1]
////console.log("got", bits);
//for (var k = 0; k < bits.length && i < 1280 * 8; ++k, ++i) {
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

const EmptyBody: Body = new Uint8Array(1280);

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
          const advances_time = btime > (chain.block[phash].time >> 192n);
          if (has_enough_work && advances_time) {
            chain.work[bhash] = chain.work[phash] + work;
            if (phash !== HashZero) {
              chain.height[bhash] = chain.height[phash] + 1n;
            }

            if (chain.height[bhash] > 0n && chain.height[bhash] % BLOCKS_PER_PERIOD === 0n) {
              let checkpoint_hash = phash;
              for (let i = 0n; i < BLOCKS_PER_PERIOD - 1n; ++i) {
                checkpoint_hash = chain.block[checkpoint_hash].prev;
              }
              const period_time = Number(btime - (chain.block[checkpoint_hash].time >> 192n));
              const last_target = chain.target[phash];
              const scale = BigInt(Math.floor(2 ** 32 * Number(TIME_PER_PERIOD) / period_time));
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
      return address.val0 + "." + address.val1 + "." + address.val2 + "." + address.val3;
  }
  return "";
}

function show_block(chain: Chain, block: Block, index: number) {
  const bhash = hash_block(block);
  const work = chain.work[bhash] || 0n;
  const show_index = BigInt(index).toString();
  const show_time = (block.time >> 192n).toString(10);
  const show_body = [].slice.call(block.body, 0, 32).map(
    (x: number) => pad_left(2, "0", x.toString(16)),
  ).join("");
  const show_hash = bhash;
  const show_work = work.toString();
  return "" +
    pad_left(8, " ", show_index) + " | " +
    pad_left(13, "0", show_time) + " | " +
    pad_left(64, "0", show_hash) + " | " +
    pad_left(64, "0", show_body) + " | " +
    pad_left(16, "0", show_work);
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

function serialize_fixlen(size: F64, value: Nat): Bits {
  if (size > 0) {
    const head = (value % 2n) === 0n ? "0" : "1";
    const tail = serialize_fixlen(size - 1, value / 2n);
    return head + tail;
  } else {
    return "";
  }
}

function deserialize_fixlen(size: F64, bits: Bits): [Bits, Nat] {
  if (size === 0) {
    return [bits, 0n];
  } else {
    if (bits[0] === "0") {
      let x;
      [bits, x] = deserialize_fixlen(size - 1, bits.slice(1));
      return [bits, x * 2n];
    } else if (bits[0] === "1") {
      let x;
      [bits, x] = deserialize_fixlen(size - 1, bits.slice(1));
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
      const val0 = serialize_fixlen(8, BigInt(address.val0));
      const val1 = serialize_fixlen(8, BigInt(address.val1));
      const val2 = serialize_fixlen(8, BigInt(address.val2));
      const val3 = serialize_fixlen(8, BigInt(address.val3));
      const port = serialize_fixlen(16, BigInt(address.port));
      return "0" + val0 + val1 + val2 + val3 + port;
    }
  }
  return "";
}

function deserialize_address(bits: Bits): [Bits, Address] {
  if (bits[0] === "0") {
    let val0, val1, val2, val3, port;
    [bits, val0] = deserialize_fixlen(8, bits.slice(1));
    [bits, val1] = deserialize_fixlen(8, bits);
    [bits, val2] = deserialize_fixlen(8, bits);
    [bits, val3] = deserialize_fixlen(8, bits);
    [bits, port] = deserialize_fixlen(16, bits);
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
  const size = serialize_fixlen(16, BigInt(data.length));
  return size + data;
}

function deserialize_bits(bits: Bits): [Bits, Bits] {
  let size, data;
  [bits, size] = deserialize_fixlen(16, bits);
  [bits, data] = [bits.slice(Number(size)), bits.slice(0, Number(size))];
  return [bits, data];
}

//function serialize_slice(slice: Slice) : Bits {
//var work = serialize_fixlen(64, slice.work);
//var data = serialize_bits(slice.data);
//return work + data;
//}

//function deserialize_slice(bits: Bits) : [Bits, Slice] {
//var [bits,work] = deserialize_fixlen(64, bits);
//var [bits,data] = deserialize_bits(bits);
//return [bits, {work, data}];
//}

function serialize_uint8array(bytes: number, array: Uint8Array): Bits {
  let bits = "";
  for (let i = 0; i < bytes; ++i) {
    bits += serialize_fixlen(8, BigInt(array[i]));
  }
  return bits;
}

function deserialize_uint8array(bytes: number, bits: Bits): [Bits, Uint8Array] {
  const vals = [];
  for (let i = 0; i < bytes; ++i) {
    let val;
    [bits, val] = deserialize_fixlen(8, bits);
    vals.push(Number(val));
  }
  return [bits, new Uint8Array(vals)];
}

function serialize_hash(hash: Hash): Bits {
  return serialize_fixlen(256, BigInt(HASH(hash)));
}

function deserialize_hash(bits: Bits): [Bits, Hash] {
  let nat;
  [bits, nat] = deserialize_fixlen(256, bits);
  return [bits, HASH("0x" + pad_left(64, "0", nat.toString(16)))];
}

function serialize_block(block: Block): Bits {
  const prev = serialize_hash(block.prev);
  const time = serialize_fixlen(256, block.time);
  const body = serialize_uint8array(1280, block.body);
  return prev + time + body;
}

function deserialize_block(bits: Bits): [Bits, Block] {
  let prev, time, body;
  [bits, prev] = deserialize_hash(bits);
  [bits, time] = deserialize_fixlen(256, bits);
  [bits, body] = deserialize_uint8array(1280, bits);
  return [bits, { prev, time, body }];
}

function serialize_message(message: Message): Bits {
  switch (message.ctor) {
    case "PutPeers": {
      const peers = serialize_list(serialize_address, array_to_list(message.peers));
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

function address_to_deno(address: Address) {
  return { transport: "udp", hostname: get_address_hostname(address), port: address.port };
}

function deno_to_address(deno: any): Address {
  const [val0, val1, val2, val3] = deno.hostname.split(".");
  return {
    ctor: "IPv4",
    val0: Number(val0),
    val1: Number(val1),
    val2: Number(val2),
    val3: Number(val3),
    port: Number(deno.port),
  };
}

function udp_init(port: number = DEFAULT_PORT) {
  console.log("init", port);
  return Deno.listenDatagram({ port, transport: "udp" });
}

function udp_send(udp: any, address: Address, message: Message) {
  //console.log("send", address, message);
  udp.send(bits_to_uint8array(serialize_message(message)), address_to_deno(address));
}

function udp_receive<T>(udp: any, callback: (address: Address, message: Message) => T) {
  setTimeout(async () => {
    for await (const [buff, deno] of udp) {
      let bits = uint8array_to_bits(buff);
      const addr = deno_to_address(deno);
      let msg;
      [bits, msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}

// Node
// ----

export function start_node(port: number = DEFAULT_PORT) {
  const MINER_CPS = 16;
  const MINER_HASHRATE = 1024;
  let MINED = 0;

  // Initializes the node
  const peers: Dict<Peer> = {};
  for (const peer_port of [42000, 42001, 42002]) {
    const addr: Address = { ctor: "IPv4", val0: 127, val1: 0, val2: 0, val3: 1, port: peer_port };
    const seen: Nat = BigInt(Date.now());
    peers[serialize_address(addr)] = { seen_at: seen, address: addr };
  }
  const chain: Chain = initial_chain();
  //var slices : Heap<Slice> = {ctor: "Empty"};
  const node: Node = { port, peers, chain };

  const body: Body = EmptyBody;
  //body[0] = (port % 42000);

  // Initializes sockets
  const udp = udp_init(port);

  // TODO: improve performance
  function random_peers(count: number): Array<Peer> {
    const keys = Object.keys(node.peers);
    const peers = [];
    for (let i = 0; i < count; ++i) {
      peers.push(node.peers[keys[keys.length * Math.random() << 0]]);
    }
    return peers;
  }

  // Returns the current time
  // TODO: get peers median?
  function get_time(): U64 {
    return BigInt(Date.now());
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
          node.peers[serialize_address(address)] = { seen_at: get_time(), address };
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
    const new_block = mine(
      { ...BlockZero, body, prev: tip_hash },
      tip_target,
      max_hashes,
      get_time(),
      0n,
    );
    //console.log("[miner] Difficulty: " + compute_difficulty(tip_target) + " hashes/block. Power: " + max_hashes + " hashes.");
    if (new_block !== null) {
      MINED += 1;
      add_block(node.chain, new_block, get_time());
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
      //console.log("asked " + count + " pendings");
    }
  }

  function get_blocks_dir() {
    const dir = Deno.env.get("HOME") + "/.ubilog/blocks";
    ensureDirSync(dir);
    return dir;
  }

  // Saves longest chain
  function saver() {
    const chain = get_longest_chain(node.chain);
    for (let i = 0; i < chain.length; ++i) {
      const bits = serialize_block(chain[i]);
      const buff = bits_to_uint8array(bits);
      const indx = pad_left(16, "0", i.toString(16));
      const bdir = get_blocks_dir();
      ensureDirSync(bdir);
      Deno.writeFileSync(bdir + "/" + indx, buff);
    }
  }

  // Loads saved blocks
  function loader() {
    const bdir = get_blocks_dir();
    const files = Array.from(Deno.readDirSync(bdir)).sort((x, y) => x.name > y.name ? 1 : -1);
    for (const file of files) {
      const buff = Deno.readFileSync(bdir + "/" + file.name);
      const [_bits, block] = deserialize_block(uint8array_to_bits(buff));
      //console.log("loaded " + file.name);
      //console.log(hash_block(block));
      //console.log(block);
      add_block(node.chain, block, get_time());
    }
    //Deno.exit();
  }

  // Displays status
  function displayer() {
    const targ = node.chain.target[node.chain.tip[1]];
    const diff = compute_difficulty(targ);
    const rate = diff * 1000n / TIME_PER_BLOCK;
    const pendings = node.chain.pending;
    let pending_size = 0;
    let pending_seen = 0;
    for (const bhash in pendings) {
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
    console.log("- online_peers  : " + Object.keys(node.peers).length + " peers");
    console.log("- chain_height  : " + get_longest_chain(node.chain).length + " blocks");
    console.log("- database      : " + (Object.keys(node.chain.block).length - 1) + " blocks");
    console.log("- pending       : " + pending_size + " blocks (" + pending_seen + " downloaded)");
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
  setInterval(displayer, 1000);
  setInterval(saver, 1000 * 30);
}

//var port = Number(Deno.args[0]) || 42000;
//start_node(port);

function test_0() {
  const block_0 = mine({...BlockZero, prev: HashZero           }, compute_target(1000n), 999999, BigInt(Date.now())) || BlockZero;
  const block_1 = mine({...BlockZero, prev: hash_block(block_0)}, compute_target(1000n), 999999, BigInt(Date.now())) || BlockZero;
  const block_2 = mine({...BlockZero, prev: hash_block(block_1)}, compute_target(1000n), 999999, BigInt(Date.now())) || BlockZero;

  const chain = initial_chain();
  add_block(chain, block_0, BigInt(Date.now()));
  add_block(chain, block_1, BigInt(Date.now()));
  add_block(chain, block_2, BigInt(Date.now()));
  console.log(show_chain(chain, 8));

  console.log(serialize_block(block_2));
}
//test_0();

//start_node(42000);
