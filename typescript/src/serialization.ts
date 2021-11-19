import type { Quadruple } from "./lib/tuple.ts"
import type { U8 } from "./lib/numbers/mod.ts";
import { u16, u256, u64, u8 } from "./lib/numbers/mod.ts";

import type { List } from "./list.ts";
import * as list from "./list.ts";

import type { Bits } from "./types/bits.ts"
import * as bits_t from "./types/bits.ts"
import type { Block, BlockBody, Hash, Slice } from "./types/blockchain.ts";
import type { AddressPort } from "./types/address.ts";
import type { Message } from "./types/network.ts";
import * as hash from "./types/hash.ts";

import { BODY_SIZE } from "./constants.ts";
import { pad_left } from "./util.ts";

type Nat = bigint;

const HASH = hash.assert;

export function serialize_fixed_len(size: number, value: Nat): Bits {
  if (size > 0) {
    const head = value % 2n === 0n ? "0" : "1";
    const tail = serialize_fixed_len(size - 1, value / 2n); // ?? >> 1n ?
    return bits_t.push_front(head)(tail);
  } else {
    return bits_t.empty;
  }
}

export function deserialize_fixed_len(size: number, bits: Bits): [Bits, Nat] {
  if (size === 0) {
    return [bits, 0n];
  } else {
    if (bits[0] === "0") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, bits_t.slice(1)(bits));
      return [bits, x * 2n];
    } else if (bits[0] === "1") {
      let x;
      [bits, x] = deserialize_fixed_len(size - 1, bits_t.slice(1)(bits));
      return [bits, x * 2n + 1n];
    } else {
      return [bits_t.empty, 0n];
    }
  }
}

export function serialize_list<T>(item: (x: T) => Bits, list: List<T>): Bits {
  switch (list.ctor) {
    case "Nil": {
      const bit0 = "0";
      return bits_t.from(bit0);
    }
    case "Cons": {
      const bit1 = "1";
      const head = item(list.head);
      const tail = serialize_list(item, list.tail);
      const ser = bits_t.concat(head, tail);
      return bits_t.push_front(bit1)(ser);
    }
  }
}

export function deserialize_list<T>(
  item: (x: Bits) => [Bits, T],
  bits: Bits,
): [Bits, List<T>] {
  if (bits[0] === "0") {
    return [bits_t.slice(1)(bits), list.empty];
  } else if (bits[0] === "1") {
    let head, tail;
    [bits, head] = item(bits_t.slice(1)(bits));
    [bits, tail] = deserialize_list(item, bits);
    return [bits, list.cons(head, tail)];
  } else {
    return [bits_t.empty, list.empty];
  }
}

export function serialize_address(address: AddressPort): Bits {
  switch (address._) {
    case "IPv4": {
      const bit0 = "0";
      const val0 = serialize_fixed_len(8, BigInt(address.octets[0]));
      const val1 = serialize_fixed_len(8, BigInt(address.octets[1]));
      const val2 = serialize_fixed_len(8, BigInt(address.octets[2]));
      const val3 = serialize_fixed_len(8, BigInt(address.octets[3]));
      const port = serialize_fixed_len(16, BigInt(address.port));
      return bits_t.push_front(bit0)(
        bits_t.concat(val0, val1, val2, val3, port),
      );
    }
  }
  throw new Error("FAILURE: unknown address type");
}

export function deserialize_address(bits: Bits): [Bits, AddressPort] {
  if (bits[0] === "0") {
    let val0, val1, val2, val3, port;
    bits = bits_t.slice(1)(bits);
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

export function serialize_bits(data: Bits): Bits {
  const size = serialize_fixed_len(16, BigInt(data.length));
  return bits_t.concat(size, data);
}

export function deserialize_bits(bits: Bits): [Bits, Bits] {
  let size_: bigint, data: Bits;
  [bits, size_] = deserialize_fixed_len(16, bits);
  const size = Number(size_);
  [bits, data] = [bits_t.slice(size)(bits), bits_t.slice(0, size)(bits)];
  return [bits, data];
}

export function serialize_slice(slice: Slice): Bits {
  const work = serialize_fixed_len(64, slice.work);
  const data = serialize_bits(slice.data);
  return bits_t.concat(work, data);
}

export function deserialize_slice(bits: Bits): [Bits, Slice] {
  let work_: bigint, data: Bits;
  [bits, work_] = deserialize_fixed_len(64, bits);
  [bits, data] = deserialize_bits(bits);
  const work = u64.mask(work_); // TODO: fix size mask redundancy, refactor `deserialize_fixed_len`;
  return [bits, { work, data }];
}

export function serialize_uint8array(bytes: number, array: Uint8Array): Bits {
  let bits = bits_t.empty;
  for (let i = 0; i < bytes; ++i) {
    const ser = serialize_fixed_len(8, BigInt(array[i]));
    bits = bits_t.concat(bits, ser);
  }
  return bits;
}

export function deserialize_uint8array(bytes: number, bits: Bits): [Bits, Uint8Array] {
  const vals = [];
  for (let i = 0; i < bytes; ++i) {
    let val: bigint;
    [bits, val] = deserialize_fixed_len(8, bits);
    vals.push(Number(val));
  }
  return [bits, new Uint8Array(vals)];
}

export function serialize_hash(hash: Hash): Bits {
  return serialize_fixed_len(256, BigInt(HASH(hash)));
}

export function deserialize_hash(bits: Bits): [Bits, Hash] {
  let nat;
  [bits, nat] = deserialize_fixed_len(256, bits);
  return [bits, HASH("0x" + pad_left(64, "0", nat.toString(16)))];
}

export function serialize_block(block: Block): Bits {
  const prev = serialize_hash(block.prev);
  const time = serialize_fixed_len(256, block.time);
  const body = serialize_uint8array(BODY_SIZE, block.body);
  return bits_t.concat(prev, time, body);
}

export function deserialize_block(bits: Bits): [Bits, Block] {
  let prev, time, body;
  [bits, prev] = deserialize_hash(bits);
  [bits, time] = deserialize_fixed_len(256, bits);
  [bits, body] = deserialize_uint8array(BODY_SIZE, bits);
  time = u256.mask(time);
  return [bits, { prev, time, body: body as BlockBody }];
}

export function serialize_message(message: Message): Bits {
  switch (message.ctor) {
    case "PutPeers": {
      const code0 = bits_t.from("0000");
      const peers = serialize_list(
        serialize_address,
        list.from_array(message.peers),
      );
      return bits_t.concat(code0, peers);
    }
    case "PutBlock": {
      const code1 = bits_t.from("1000");
      const block = serialize_block(message.block);
      return bits_t.concat(code1, block);
    }
    case "AskBlock": {
      const code2 = bits_t.from("0100");
      const b_hash = serialize_hash(message.b_hash);
      return bits_t.concat(code2, b_hash);
    }
    case "PutSlice": {
      const code3 = bits_t.from("1100");
      // const slices = serialize_list(
      //   serialize_slice,
      //   array_to_list(message.slices),
      // );
      const slice = serialize_slice(message.slice);
      return bits_t.concat(code3, slice);
    }
  }
}

export function deserialize_message(bits: Bits): [Bits, Message] {
  const CODE_SIZE = 4;
  const code = bits_t.slice(0, CODE_SIZE)(bits);
  bits = bits_t.slice(CODE_SIZE)(bits);
  switch (code) {
    case "0000": {
      let peers;
      [bits, peers] = deserialize_list(deserialize_address, bits);
      return [bits, { ctor: "PutPeers", peers: list.to_array(peers) }];
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
      // let slices_: List<Slice>;
      // [bits, slices_] = deserialize_list(deserialize_slice, bits);
      // const slices = list_to_array(slices_);
      let slice;
      [bits, slice] = deserialize_slice(bits);
      return [bits, { ctor: "PutSlice", slice }];
    }
  }
  throw "bad message deserialization"; // TODO: handle error on bad serialization of messages
}
