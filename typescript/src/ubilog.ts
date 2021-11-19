// deno-lint-ignore-file camelcase

// import { Set as ImmSet } from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

import type { U256, U64 } from "./lib/numbers/mod.ts";
import { bits_mask, u16, u256, u64 } from "./lib/numbers/mod.ts";
import type { Heap } from "./lib/heap.ts";
import * as heap from "./lib/heap.ts";
import type { BitStr } from "./lib/bit_str.ts";
import * as bit_str from "./lib/bit_str.ts";
import { get_dir_with_base } from "./lib/files.ts";
import type { AddressOptPort } from "./lib/address.ts";

import type { Hash, HashMap } from "./types/hash.ts";
import * as hash from "./types/hash.ts";
import type { Block, BlockBody, Chain, Slice } from "./types/blockchain.ts";
import type { AddressPort, Message, Peer } from "./types/networking.ts";

import {
  deserialize_block,
  deserialize_message,
  serialize_address,
  serialize_bits,
  serialize_block,
  serialize_message,
  serialize_slice,
} from "./serialization.ts";

import * as address from "./address.ts";
import { keccak256 } from "./keccak256.ts";
import { pad_left } from "./util.ts";

// Configuration:
// ~/.ubilog/config
// Output:
// ~/.ubilog/data/blocks/HASH
// ~/.ubilog/data/mined/HASH

// Constants
// =========

import {
  BLOCKS_PER_PERIOD,
  BODY_SIZE,
  DEFAULT_PORT,
  DELAY_TOLERANCE,
  DIR_BLOCKS,
  DIR_MINED,
  TIME_PER_BLOCK,
  TIME_PER_PERIOD,
} from "./constants.ts";

export const EMPTY_BODY: BlockBody = new Uint8Array(BODY_SIZE) as BlockBody;

export const BLOCK_ZERO: Block = {
  prev: hash.zero,
  time: u256.zero,
  body: EMPTY_BODY,
};

const DEFAULT_SCORE = (slice: Slice) => get_hash_work(hash_slice(slice));

// Types
// =====

type Dict<T> = Record<string, T>;

type Nat = bigint; // TODO: tagged type

// Network
// -------

type Node = {
  port: number; // TODO: U16
  peers: Dict<Peer>;
  chain: Chain;
  pool: Heap<Slice>;
};

// Algorithms
// ==========

const HASH = hash.assert;

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

function next_power_of_two(x: number): number {
  return x <= 1 ? x : 2 ** (Math.floor(Math.log(x - 1) / Math.log(2)) + 1);
}

// Bits
// ----

function bits_to_uint8array(bits: BitStr): Uint8Array {
  if (bits.length < 2 ** 16) {
    const buff = new Uint8Array(2 + Math.ceil(bits.length / 8));
    bits = serialize_bits(bits);
    for (let i = 0; i < bits.length; i += 8) {
      let numb = 0;
      for (let j = 0; j < 8; ++j) {
        numb *= 2;
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

function uint8array_to_bits(buff: Uint8Array): BitStr {
  const size = (buff[0] ?? 0) + (buff[1] ?? 0) * 256;
  let result = bit_str.empty;
  for (let i = 2; i < buff.length; ++i) {
    const val = buff[i] ?? 0;
    for (let j = 0; j < 8 && result.length < size; ++j) {
      const bit = (val >>> j) & 1 ? "1" : "0";
      result = bit_str.push(bit)(result);
    }
  }
  return result;
}

// Hashing
// -------

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
  if (block.prev === hash.zero && block.time === 0n) {
    return hash.zero;
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

function hash_slice(slice: Slice): Hash {
  return hash_uint8array(bits_to_uint8array(serialize_slice(slice)));
}

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
// function fill_body(body: Body, slices: Heap<string>) {
//   for (var i = 0; i < BODY_SIZE; ++i) {
//     body[i] = 0;
//   }
//   var i = 0;
//   while (slices.ctor !== "Empty" && i < BODY_SIZE * 8) {
//     var bits: string = (heap_head(slices) ?? [0, ""])[1];
//     for (var k = 0; k < bits.length && i < BODY_SIZE * 8; ++k, ++i) {
//       if (bits[k] === "1") {
//         var x = Math.floor(i / 8);
//         var y = i % 8;
//         body[x] = body[x] | (1 << (7 - y));
//       }
//     }
//     slices = heap_tail(slices);
//   }
// }

// Chain
// -----

// initial target of 256 hashes per block
const INITIAL_TARGET: Nat = compute_target(256n);

function initial_chain(): Chain {
  const block: HashMap<Block> = new Map([[hash.zero, BLOCK_ZERO]]);
  const children: HashMap<Array<Hash>> = new Map([[hash.zero, []]]);
  const pending: HashMap<Array<Block>> = new Map();
  const work: HashMap<U64> = new Map([[hash.zero, u64.zero]]);
  const height: HashMap<Nat> = new Map([[hash.zero, 0n]]);
  const target: HashMap<Nat> = new Map([[hash.zero, INITIAL_TARGET]]);
  const seen: HashMap<true> = new Map();
  const tip: [U64, Hash] = [u64.zero, hash.zero];
  return { block, children, pending, work, height, target, seen, tip };
}

function add_block(chain: Chain, block: Block): Block[] {
  const b_hash = hash_block(block);
  if (chain.block.get(b_hash) !== undefined) {
    // Block is already present in the database
    return [];
  }

  let pending: Block[] = [];
  const p_hash = block.prev;
  // If previous block is not available
  if (chain.block.get(p_hash) === undefined) {
    // And this block was not been seen before
    if (chain.seen.get(b_hash) === undefined) {
      // Add this block to the previous block's pending list
      console.log(" ^^ pending block".padEnd(30, " "), b_hash); // DEBUG
      chain.pending.set(p_hash, chain.pending.get(p_hash) ?? []);
      get_assert(chain.pending, p_hash).push(block);
    }
  } // If previous block is available, add the block
  else {
    console.log("  ++ adding block".padEnd(30, " "), b_hash); // DEBUG
    const work = get_hash_work(b_hash);
    // TODO: ??
    chain.block.set(b_hash, block);
    chain.work.set(b_hash, 0n);
    chain.height.set(b_hash, 0n);
    chain.target.set(b_hash, 0n);
    chain.children.set(b_hash, []);
    const p_block = get_assert(chain.block, p_hash);
    const p_target = get_assert(chain.target, p_hash);
    const has_enough_work = BigInt(b_hash) >= p_target;
    const b_time = block.time >> 192n;
    const p_time = p_block.time >> 192n;
    const advances_time = b_time > p_time;
    // If the block is valid
    if (has_enough_work && advances_time) {
      const p_work = get_assert(chain.work, p_hash);
      chain.work.set(b_hash, p_work + work);
      if (p_hash !== hash.zero) {
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
    // Returns all blocks that were waiting for this block
    pending = chain.pending.get(b_hash) ?? [];
    chain.pending.delete(b_hash);
  }
  chain.seen.set(b_hash, true);
  return pending;
}

function handle_block(chain: Chain, block: Block, time: U64) {
  const must_add: Block[] = [block];
  while (must_add.length > 0) {
    const block = must_add.pop() ?? BLOCK_ZERO;
    const b_time = block.time >> 192n;
    if (b_time < BigInt(time) + DELAY_TOLERANCE) {
      // Block has valid time
      const pending_children = add_block(chain, block);
      // Add all blocks that were waiting for this block
      for (const pending of pending_children) {
        must_add.push(pending);
      }
    }
  }
}

function get_longest_chain(chain: Chain): Array<Block> {
  const longest = [];
  let b_hash = chain.tip[1];
  while (true) {
    const block = chain.block.get(b_hash);
    if (block == undefined || b_hash === hash.zero) {
      break;
    }
    longest.push(block);
    b_hash = block.prev;
  }
  return longest.reverse();
}

// Stringification
// ---------------

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

// Networking
// ----------

// TODO: move to constants

function udp_init(port: number = DEFAULT_PORT) {
  //console.log("init", port);
  return Deno.listenDatagram({ port, transport: "udp" });
}

function udp_send(
  udp: Deno.DatagramConn,
  addr: AddressPort,
  message: Message,
) {
  //console.log("send", address, message);
  udp.send(
    bits_to_uint8array(serialize_message(message)),
    address.to_deno(addr),
  );
}

function udp_receive<T>(
  udp: Deno.DatagramConn,
  callback: (address: AddressPort, message: Message) => T,
) {
  setTimeout(async () => {
    for await (const [buff, deno_addr] of udp) {
      let bits = uint8array_to_bits(buff);
      const addr = address.from_deno(deno_addr, DEFAULT_PORT);
      let msg;
      [bits, msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}

// Node
// ----

const CONFIG_DEFAULTS = {
  port: DEFAULT_PORT,
  display: false,
  mine: false,
  secret_key: u256.zero,
  peers: [] as AddressOptPort[],
};

export function start_node(
  base_dir: string,
  config: Partial<typeof CONFIG_DEFAULTS>,
) {
  const get_dir = get_dir_with_base(base_dir);
  const cfg = Object.assign({}, CONFIG_DEFAULTS, config);

  // const MINER_CPS = 16;
  // const MINER_HASHRATE = 64;

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
  const node: Node = {
    port: cfg.port,
    peers: initial_peers,
    chain: chain,
    pool: heap.empty,
  };
  // const mined_slices: HashMap<ImmSet<Hash>> = new Map();

  const body: BlockBody = EMPTY_BODY;
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
        handle_block(node.chain, message.block, get_time());
        return;
      }
      case "AskBlock": {
        // console.log("<- received AskBlock".padEnd(30, " "), message.b_hash); // DEBUG
        const block = node.chain.block.get(message.b_hash);
        if (block) {
          // console.log(`  -> sending asked block:`.padEnd(30, " "), `${message.b_hash}`); // DEBUG
          send(sender, { ctor: "PutBlock", block });
          // Gets some children to send too
          // for (var i = 0; i < 8; ++i) {
          //  var block = node.chain.block[block.prev];
          //  if (block) {
          //    send(sender, {ctor: "PutBlock", block});
          //  }
          // }
        } else {
          // console.log(`  XX block not found:`.padEnd(30, " "), `${message.b_hash}`); // DEBUG
        }
        return;
      }
      case "PutSlice": {
        console.log("<- received PutSlice".padEnd(30, " ")); // DEBUG
        const slice = message.slice;
        // TODO: this is re-serializing received slices
        // pass raw slice?
        const score = DEFAULT_SCORE(slice);
        node.pool = heap.insert([score, slice], node.pool);
        return;
      }
    }
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
      { ...BLOCK_ZERO, body, prev: tip_hash },
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
      handle_block(node.chain, new_block, get_time());
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
      handle_block(node.chain, block, get_time());
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
    // console.log("- own_hash_rate : " + MINER_HASHRATE + " hashes / second");
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
//  const block_0 = do_mine(hash.zero);
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
