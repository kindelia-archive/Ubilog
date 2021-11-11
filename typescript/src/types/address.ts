import { Octuple, Quadruple } from "./tuple.ts";
import { U16 } from "./numbers/mod.ts";

export type Octets = Quadruple<number>;
export type Segments = Octuple<number>;

export type IPv4 = { _: "IPv4"; octets: Octets };
export type IPv6 = { _: "IPv6"; segments: Segments };
export type Address = IPv4 | IPv6;
export type AddressPort = Address & { port: U16 };
