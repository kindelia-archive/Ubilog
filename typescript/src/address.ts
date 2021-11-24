import { u16 } from "./lib/numbers/mod.ts";

import { parse_address_port } from "./lib/address.ts";
import type { AddressPort } from "./types/networking.ts";

export const valid_port = (port: number) => !isNaN(port) && port >= 1 && port <= 65535;
export const valid_octet = (octet: number) => !isNaN(octet) && octet >= 0 && octet <= 255;

function get_address_hostname(address: AddressPort): string {
  switch (address._) {
    case "IPv4": return address.octets.join(".");
  }
  throw "FAILURE";
}

export function to_deno(address: AddressPort): Deno.Addr {
  const hostname = get_address_hostname(address);
  return { transport: "udp", hostname, port: address.port };
}

export function from_deno(deno_addr: Deno.Addr, default_port: number): AddressPort {
  if (deno_addr.transport !== "udp") throw new Error(`invalid UDP address: ${deno_addr}`);

  const addr_txt = `${deno_addr.hostname}:${deno_addr.port}`;
  const addr = parse_address_port(addr_txt).unwrap();
  // TODO: refactor into function on `lib/address.ts`
  const port = addr.port ?? u16.check(default_port).unwrap();
  return { ...addr, port };
}
