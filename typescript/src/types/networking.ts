import type { AddressPort } from "../lib/address.ts";
import type { Block, Hash, PowSlice } from "./blockchain.ts";

export type { Address, AddressPort } from "../lib/address.ts";

type Nat = bigint;

export type Peer = {
  seen_at: Nat;
  address: AddressPort;
};

export type PutPeers = { ctor: "PutPeers"; peers: AddressPort[] };
export type PutBlock = { ctor: "PutBlock"; block: Block };
export type AskBlock = { ctor: "AskBlock"; b_hash: Hash };
export type PutSlice = { ctor: "PutSlice"; slice: PowSlice };
export type Message = PutPeers | PutBlock | AskBlock | PutSlice;

// type Mail = {
//   sent_by: Peer;
//   message: Message;
// };
