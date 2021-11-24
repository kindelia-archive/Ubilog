// deno-lint-ignore-file camelcase
import { ImmSet } from "./deps.ts";

import type { U256, U64 } from "./lib/numbers/mod.ts";
import { bits_mask, u16, u256, u64 } from "./lib/numbers/mod.ts";
import * as heap from "./lib/heap.ts";
import { get_dir_with_base } from "./lib/files.ts";
import type { AddressOptPort } from "./lib/address.ts";

import { assert as HASH, Hash, HashMap, zero as HASH_ZERO } from "./types/hash.ts";
import type { Block, BlockBody, Chain, PowSlice, Slice } from "./types/blockchain.ts";
import type { AddressPort, Message, Peer } from "./types/networking.ts";

import * as ser from "./serialization.ts";

import { udp_init, udp_receive, udp_send } from "./networking.ts";
import { keccak256 } from "./keccak256.ts";
import { assert_non_null, get_assert, get_time, pad_left } from "./util.ts";

// Files
// =====

// Configuration:
// ~/.ubilog/config.json
// Output:
// ~/.ubilog/data/blocks/HASH
// ~/.ubilog/data/mined/HASH

// Constants
// =========

import { BLOCKS_PER_PERIOD, INITIAL_DIFFICULTY, TIME_PER_BLOCK } from "./constants.ts";
import { BODY_SIZE, DELAY_TOLERANCE } from "./constants.ts";
import { DEFAULT_PORT, DIR_BLOCKS, DIR_MINED } from "./constants.ts";

// export const EMPTY_BODY: BlockBody = new Uint8Array(BODY_SIZE) as BlockBody;
export const EMPTY_BODY: BlockBody = [];

export const BLOCK_ZERO: Block = {
  prev: HASH_ZERO,
  time: u256.zero,
  body: EMPTY_BODY,
};

const DEFAULT_SCORE = (slice: PowSlice) => get_hash_work(hash_pow_slice(slice));

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
};

// Algorithms
// ==========

// Numbers
// -------

const MASK_64: bigint = bits_mask(64n);
const MASK_192: bigint = bits_mask(192n);

const next_power_of_two = (x: number): number =>
  x <= 1 ? x : 2 ** (Math.floor(Math.log(x - 1) / Math.log(2)) + 1);

// Hashing
// -------

function u256_to_uint8array(value: U256): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < 32; ++i) {
    bytes.push(Number((value >> BigInt((32 - i - 1) * 8)) % 0x100n));
  }
  return new Uint8Array(bytes);
}

const hash_to_uint8array = (hash: Hash): Uint8Array => u256_to_uint8array(u256.mask(BigInt(hash)));

const body_to_uint8array = (body: BlockBody): Uint8Array =>
  ser.bits_to_uint8array(ser.serialize_body(body));

const compute_difficulty = (target: Nat): Nat => 2n ** 256n / (2n ** 256n - target);

const compute_target = (difficulty: Nat): Nat => 2n ** 256n - 2n ** 256n / difficulty;

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
  const value = BigInt(hash);
  if (value === 0n) {
    return 0n;
  }
  return compute_difficulty(value);
}

const hash_uint8array = (words: Uint8Array): Hash => HASH(keccak256(Array.from(words)));

function hash_block(block: Block): Hash {
  if (block.prev === HASH_ZERO && block.time === 0n) {
    return HASH_ZERO;
  } else {
    return hash_uint8array(
      new Uint8Array([
        ...hash_to_uint8array(block.prev),
        ...u256_to_uint8array(block.time),
        ...body_to_uint8array(block.body),
      ]),
    );
  }
}

function hash_pow_slice(pow_slice: PowSlice): Hash {
  return hash_uint8array(ser.bits_to_uint8array(ser.serialize_pow_slice(pow_slice)));
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

// Chain
// -----

// initial target of 256 hashes per block
const INITIAL_TARGET: Nat = compute_target(INITIAL_DIFFICULTY);

function initial_chain(): Chain {
  const block: HashMap<Block> = new Map([[HASH_ZERO, BLOCK_ZERO]]);
  const children: HashMap<Array<Hash>> = new Map([[HASH_ZERO, []]]);
  const pending: HashMap<Array<Block>> = new Map();
  const work: HashMap<U64> = new Map([[HASH_ZERO, u64.zero]]);
  const height: HashMap<Nat> = new Map([[HASH_ZERO, 0n]]);
  const target: HashMap<Nat> = new Map([[HASH_ZERO, INITIAL_TARGET]]);
  const mined_slices: HashMap<ImmSet<Slice>> = new Map([[HASH_ZERO, ImmSet()]]);
  const seen: HashMap<true> = new Map();
  const tip: [U64, Hash] = [u64.zero, HASH_ZERO];
  return { block, children, pending, work, height, target, seen, tip, mined_slices };
}

function handle_block(chain: Chain, block: Block, time: U64): { tip_was_updated: boolean } {
  let tip_was_updated = false;
  const must_add: Block[] = [block];
  while (must_add.length > 0) {
    const block = must_add.pop() ?? BLOCK_ZERO;
    const b_time = block.time >> 192n;
    if (b_time < BigInt(time) + DELAY_TOLERANCE) {
      // Block has valid time
      const { pending, tip_was_updated: tip_upd } = add_block(chain, block);
      tip_was_updated ||= tip_upd;
      // Add all blocks that were waiting for this block
      for (const p of pending) {
        must_add.push(p);
      }
    }
  }
  return { tip_was_updated };
}

function add_block(chain: Chain, block: Block): { pending: Block[]; tip_was_updated: boolean } {
  let pending: Block[] = [];
  let tip_was_updated = false;

  const b_hash = hash_block(block);
  if (chain.block.get(b_hash) !== undefined) {
    // Block is already present in the database
    return { pending, tip_was_updated };
  }

  const prev_hash = block.prev;
  // If previous block is not available
  if (chain.block.get(prev_hash) === undefined) {
    // And this block was not been seen before
    if (chain.seen.get(b_hash) === undefined) {
      // console.log(" ^^ pending block".padEnd(30, " "), b_hash); // DEBUG
      // Add this block to the previous block's pending list
      chain.pending.set(prev_hash, chain.pending.get(prev_hash) ?? []);
      get_assert(chain.pending, prev_hash).push(block);
    }
  } // If previous block is available, add the block
  else {
    // console.log("  ++ adding block".padEnd(30, " "), b_hash); // DEBUG
    // TODO: ??
    chain.block.set(b_hash, block);
    chain.work.set(b_hash, 0n);
    chain.height.set(b_hash, 0n);
    chain.target.set(b_hash, 0n);
    chain.children.set(b_hash, []);
    const prev_mined_slices = get_assert(chain.mined_slices, prev_hash);
    const b_mined_slices = prev_mined_slices.withMutations((s) => {
      for (const slice of block.body) s.add(slice);
    });
    chain.mined_slices.set(b_hash, b_mined_slices);
    // console.log(b_mined_slices); // DEBUG

    const prev_block = get_assert(chain.block, prev_hash);
    const prev_target = get_assert(chain.target, prev_hash);
    const has_enough_work = BigInt(b_hash) >= prev_target;
    const b_time = block.time >> 192n;
    const prev_time = prev_block.time >> 192n;
    const advances_time = b_time > prev_time;
    // If the block is valid
    if (has_enough_work && advances_time) {
      const prev_work = get_assert(chain.work, prev_hash);
      const work = get_hash_work(b_hash);
      chain.work.set(b_hash, prev_work + work);
      if (prev_hash !== HASH_ZERO) {
        const prev_height = get_assert(chain.height, prev_hash);
        chain.height.set(b_hash, prev_height + 1n);
      }
      const b_height = get_assert(chain.height, b_hash);
      if (!(b_height > 0n && b_height % BLOCKS_PER_PERIOD === 0n)) {
        // Keep old difficulty
        chain.target.set(b_hash, get_assert(chain.target, prev_hash));
      } else {
        // Update difficulty
        let checkpoint_hash = prev_hash;
        for (let i = 0n; i < BLOCKS_PER_PERIOD - 1n; ++i) {
          checkpoint_hash = get_assert(chain.block, checkpoint_hash).prev;
        }
        const period_time = Number(
          b_time - (get_assert(chain.block, checkpoint_hash).time >> 192n),
        );
        const last_target = get_assert(chain.target, prev_hash);
        const time_per_period = TIME_PER_BLOCK * BLOCKS_PER_PERIOD;
        const scale_ = (2 ** 32 * Number(time_per_period)) / period_time;
        const scale = BigInt(Math.floor(scale_));
        const next_target = compute_next_target(last_target, scale);
        chain.target.set(b_hash, next_target);
        // console.log("[DIFF] A period should last   " + time_per_period + " seconds."); // DEBUG
        // console.log("[DIFF] the last period lasted " + period_time + " seconds.");
        // console.log("[DIFF] the last difficulty was " + compute_difficulty(last_target) + " hashes per block.");
        // console.log("[DIFF] the next difficulty is  " + compute_difficulty(next_target) + " hashes per block.");
      }
      // Refresh tip
      if (get_assert(chain.work, b_hash) > chain.tip[0]) {
        chain.tip = [u64.mask(get_assert(chain.work, b_hash)), b_hash];
        tip_was_updated = true;
      }
    }
    // Registers this block as a child
    get_assert(chain.children, prev_hash).push(b_hash);
    // Returns all blocks that were waiting for this block
    pending = chain.pending.get(b_hash) ?? [];
    chain.pending.delete(b_hash);
  }
  chain.seen.set(b_hash, true);
  return { pending, tip_was_updated };
}

function get_longest_chain(chain: Chain): Array<Block> {
  const longest = [];
  let b_hash = chain.tip[1];
  while (true) {
    const block = chain.block.get(b_hash);
    if (block == undefined || b_hash === HASH_ZERO) {
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
  const show_hash = b_hash;
  const show_work = work.toString();
  const show_body = block.body.join(", ");
  // deno-fmt-ignore
  const header = [pad_left(8, " ", show_index), pad_left(13, "0", show_time), pad_left(64, "0", show_hash), pad_left(16, "0", show_work), pad_left(16, "0", show_body)];
  return (header.join(" | "));
}

function show_chain(chain: Chain, lines: number) {
  const blocks = get_longest_chain(chain);
  const lim = next_power_of_two(blocks.length);
  const add = lim > lines ? lim / lines : 1;
  const pad_s = (x: number) => (txt: string) => pad_left(x, " ", txt);
  // deno-fmt-ignore
  let text = `${pad_s(8)("#")} | ${pad_s(13)("time")} | ${pad_s(64)("hash")} | ${pad_s(16)("work")} | ${pad_s(64)("body")} \n`;
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

  const initial_peers: Dict<Peer> = {};
  for (const cfg_peer of cfg.peers) {
    const port = u16.mask(cfg_peer.port ?? DEFAULT_PORT);
    const address = { ...cfg_peer, port };
    const peer = { seen_at: get_time(), address };
    initial_peers[ser.serialize_address(address)] = peer;
  }

  // Node state

  const chain: Chain = initial_chain();
  const node: Node = {
    port: cfg.port,
    peers: initial_peers,
    chain: chain,
    // pool: heap.empty,
  };

  let slices_pool: heap.Heap<Slice> = heap.empty;
  let next_block_body: BlockBody = EMPTY_BODY;
  // next_block_body.push(serialize_fixed_len(16, BigInt(cfg.port)));
  let MINED = 0;

  // Initializes sockets
  const udp = udp_init(cfg.port);

  function send(to: AddressPort, message: Message) {
    udp_send(udp, to, message);
  }

  function all_peers(): Array<Peer> {
    return Object.values(node.peers);
  }

  function handle_slice(pow_slice: PowSlice) {
    const score = DEFAULT_SCORE(pow_slice);
    slices_pool = heap.insert(slices_pool, [score, pow_slice.data]);
  }

  const MAX_BODY_BITS = BODY_SIZE * 8;
  function build_next_block_body() {
    // One bit for the end of the list serialization
    let bits_len = 1;
    const chosen = [];
    const ignored = [];

    const tip_hash = chain.tip[1];
    const mined = get_assert(chain.mined_slices, tip_hash);

    let head: [bigint, Slice] | null;
    while (head = heap.head(slices_pool), head !== null) {
      const [_score, slice] = head;
      if (mined.has(slice)) {
        // TODO: FIX: not ignoring already mined slices
        // This slice is already on the longest chain
        // Pop and ignore it
        slices_pool = heap.tail(slices_pool);
        ignored.push(slice);
      } else {
        // One bit for each item on list serialization, plus the item length
        const item_bits_len = slice.length + 1;
        if (bits_len + item_bits_len > MAX_BODY_BITS) {
          // This slice doesn't fit in the body.
          break;
        }
        bits_len += item_bits_len;
        slices_pool = heap.tail(slices_pool);
        chosen.push(slice);
      }
    }
    next_block_body = chosen;
  }

  // Handles incoming messages
  function handle_message(sender: AddressPort, message: Message) {
    switch (message.ctor) {
      case "PutPeers": {
        // console.log("<- received PutPeers".padEnd(30, " "), message.peers.length); // DEBUG
        for (const address of message.peers) {
          node.peers[ser.serialize_address(address)] = {
            seen_at: get_time(),
            address,
          };
        }
        return;
      }
      case "PutBlock": {
        // console.log("<- received PutBlock".padEnd(30, " "), hash_block(message.block)); // DEBUG
        const { tip_was_updated } = handle_block(node.chain, message.block, get_time());
        if (cfg.mine && tip_was_updated) {
          build_next_block_body();
        }
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
        }
        // else { // DEBUG
        //   console.log(`  XX block not found:`.padEnd(30, " "), `${message.b_hash}`); // DEBUG
        // }
        return;
      }
      case "PutSlice": {
        // console.log("<- received PutSlice".padEnd(30, " ")); // DEBUG
        handle_slice(message.slice);
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

  // Attempts to mine new blocks
  function miner() {
    const tip_hash = node.chain.tip[1];
    const tip_target = node.chain.target.get(tip_hash);
    assert_non_null(tip_target);
    const max_hashes = 16;
    const mined = mine(
      { ...BLOCK_ZERO, body: next_block_body, prev: tip_hash },
      tip_target,
      max_hashes,
      get_time(),
      cfg.secret_key,
    );
    if (mined != null) {
      // console.log("=> block MINED".padEnd(30, " ")); // DEBUG
      const [new_block, rand] = mined;
      MINED += 1;
      handle_block(node.chain, new_block, get_time());
      write_block(new_block, rand);
    }
    // Let other jobs run and loop
    setTimeout(miner, 0);
  }

  // Sends our tip block to random peers
  function gossiper() {
    const tip_hash = node.chain.tip[1];
    const block = get_assert(node.chain.block, tip_hash);
    // console.log("=> sending TIP".padEnd(30, " "), hash_block(block)); // DEBUG
    for (const peer of all_peers()) {
      send(peer.address, { ctor: "PutBlock", block });
    }
  }

  // Requests missing blocks
  function requester() {
    for (const b_hash of node.chain.pending.keys()) {
      if (!node.chain.seen.get(b_hash)) {
        // console.log("=> requesting PENDING".padEnd(30, " "), b_hash); // DEBUG
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
      const bits = ser.serialize_block(chain[i]);
      const buff = ser.serialize_bits_to_uint8array(bits);
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
      const [_bits, block] = ser.deserialize_block(ser.deserialize_bits_from_uint8array(buff));
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
    console.log("- online_peers  : " + Object.keys(node.peers).length + " peers");
    console.log("- chain_height  : " + get_longest_chain(node.chain).length + " blocks");
    console.log("- database      : " + (node.chain.block.size - 1) + " blocks");
    console.log(`- pending       : ${pending_size} blocks (${pending_seen} downloaded)`);
    console.log(`- total_mined   : ${MINED} blocks`);
    // console.log("- own_hash_rate : " + MINER_HASHRATE + " hashes / second");
    console.log("- net_hash_rate : " + rate + " hashes / second");
    console.log("- difficulty    : " + diff + " hashes / block");
    console.log("- peers: ", all_peers().map((p) => JSON.stringify(p.address)).join(", "));
    console.log("");
    console.log("Blocks");
    console.log("------");
    console.log("");
    console.log(show_chain(node.chain, 16));
    console.log();
  }

  loader();

  const receiver = () => udp_receive(udp, DEFAULT_PORT, handle_message);

  setInterval(gossiper, 1000);
  setInterval(requester, 1000 / 32);
  setInterval(receiver, 1000 / 64);
  setInterval(saver, 1000 * 30);

  if (cfg.mine) {
    // setInterval(miner, 1000 / MINER_CPS);
    build_next_block_body();
    miner();
  }
  if (cfg.display) {
    setTimeout(
      () => setInterval(displayer, 1000), //
      900,
    );
  }
}
