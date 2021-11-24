import * as u16 from "../lib/numbers/u16.ts";
import * as u64 from "../lib/numbers/u64.ts";
import { AddressPort, parse_address_port } from "../lib/address.ts";
import type { PutSlice } from "../types/networking.ts";

import * as net from "../networking.ts";
import { deserialize_bits_from_uint8array } from "../serialization.ts";
import { BODY_SIZE, DEFAULT_PORT } from "../constants.ts";

const rand_int = (max: number): number => Math.floor(Math.random() * max);

const rand_range = (lo: number, hi: number): number => lo + rand_int(hi - lo);

const rand_port = () => rand_range(1024 + 1, 65535);

// ==== //

const addr_txt = Deno.args[0] ?? "127.0.0.1:42001";
const addr_res = parse_address_port(addr_txt);
const addr_port_opt = addr_res.unwrap();
// TODO: refactor into function on `lib/address.ts`
const addr: AddressPort = {
  ...addr_port_opt,
  port: addr_port_opt.port ?? u16.check(DEFAULT_PORT).unwrap(),
};

const port = rand_port();
console.error(`using port: ${port}`);
console.error(`sending to: ${addr_txt}`);

// Handle bytes

const buf = new Uint8Array(2 + BODY_SIZE);
let bytes_size: number;
{
  const read_buf = buf.subarray(2);
  const n = Deno.stdin.readSync(read_buf);
  if (n === null) {
    console.error("ERROR: standard input closed");
    Deno.exit(1);
  }
  bytes_size = n;
}

const bits_size = bytes_size * 8;
buf[0] = bits_size & 0xff;
buf[1] = (bits_size >> 8) & 0xff;
const bits = deserialize_bits_from_uint8array(buf);

// Handle bit string

// TODO

const pow_slice = {
  work: u64.mask(0n),
  data: bits,
};

const message: PutSlice = {
  ctor: "PutSlice",
  slice: pow_slice,
};

const udp = net.udp_init(port);

net.udp_send(udp, addr, message);
