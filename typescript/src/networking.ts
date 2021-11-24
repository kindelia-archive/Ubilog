import type { AddressPort, Message } from "./types/networking.ts";
import * as address from "./address.ts";

import {
  deserialize_message,
  serialize_message,
  serialize_bits_to_uint8array,
  deserialize_bits_from_uint8array,
} from "./serialization.ts";

export function udp_init(port: number) {
  return Deno.listenDatagram({ port, transport: "udp" });
}

export function udp_send(
  udp: Deno.DatagramConn,
  addr: AddressPort,
  message: Message,
) {
  udp.send(
    serialize_bits_to_uint8array(serialize_message(message)),
    address.to_deno(addr),
  );
}

export function udp_receive<T>(
  udp: Deno.DatagramConn,
  default_port: number,
  callback: (address: AddressPort, message: Message) => T,
) {
  setTimeout(async () => {
    for await (const [buff, deno_addr] of udp) {
      let bits = deserialize_bits_from_uint8array(buff);
      const addr = address.from_deno(deno_addr, default_port);
      let msg;
      [bits, msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}
