import type { AddressPort, Message } from "./types/networking.ts";
import * as address from "./address.ts";

import {
  deserialize_bits_from_uint8array,
  deserialize_message,
  serialize_bits_to_uint8array,
  serialize_message,
} from "./serialization.ts";

export const udp_init = (port: number) => Deno.listenDatagram({ port, transport: "udp" })

export function udp_send(
  udp: Deno.DatagramConn,
  addr: AddressPort,
  message: Message,
) {
  const buf = serialize_bits_to_uint8array(serialize_message(message));
  udp.send(buf, address.to_deno(addr));
}

export function udp_receive<T>(
  udp: Deno.DatagramConn,
  default_port: number,
  callback: (address: AddressPort, message: Message) => T,
) {
  setTimeout(async () => {
    for await (const [buff, deno_addr] of udp) {
      const bits = deserialize_bits_from_uint8array(buff);
      const addr = address.from_deno(deno_addr, default_port);
      const [_rest, msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}
