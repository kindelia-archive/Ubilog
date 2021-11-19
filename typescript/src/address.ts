import { break_list, drop_while } from "./lib/functional/mod.ts";
import type { Octuple, Quadruple } from "./lib/tuple.ts";
import type { U16, U8 } from "./lib/numbers/mod.ts";
import { u16, u8 } from "./lib/numbers/mod.ts";

import type { AddressPort } from "./types/networking.ts";

// TODO: move to lib/

export const valid_port = (port: number) => !isNaN(port) && port >= 1 && port <= 65535;
export const valid_octet = (octet: number) => !isNaN(octet) && octet >= 0 && octet <= 255;

function get_address_hostname(address: AddressPort): string {
  switch (address._) {
    case "IPv4":
      return address.octets.join(".");
  }
  throw "FAILURE";
}

export function to_deno(address: AddressPort): Deno.Addr {
  return {
    transport: "udp",
    hostname: get_address_hostname(address),
    port: address.port,
  };
}

export function from_deno(deno_addr: Deno.Addr, default_port: number): AddressPort {
  if (deno_addr.transport === "udp") {
    return string_to_address(`${deno_addr.hostname}:${deno_addr.port}`, default_port);
  } else {
    throw new Error(`Invalid UDP address: ${deno_addr}`);
  }
}

// TODO: use parser from lib
function string_to_address(address_txt: string, default_port: number): AddressPort {
  const addr_split = address_txt.split(":");
  const port_txt = addr_split[addr_split.length - 1];
  const ip_txt = addr_split.slice(0, -1).join(":");

  let port_: number;
  const err_msg = `invalid port '${port_txt}'`;
  if (port_txt !== undefined) {
    port_ = Number(port_txt);
    if (!valid_port(port_)) {
      throw new Error(err_msg);
    }
  } else {
    port_ = default_port;
  }
  const port = u16.check(port_).unwrap(err_msg);

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
