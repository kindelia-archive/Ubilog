import type { AddressPort } from "../lib/address.ts";
import type { Block, Hash, PowSlice } from "./blockchain.ts";

export type { Address, AddressPort } from "../lib/address.ts";

type Nat = bigint;

export type Peer = {
  seen_at: Nat;
  address: AddressPort;
};

type PutPeers = { ctor: "PutPeers"; peers: AddressPort[] };
type PutBlock = { ctor: "PutBlock"; block: Block };
type AskBlock = { ctor: "AskBlock"; b_hash: Hash };
type PutSlice = { ctor: "PutSlice"; slice: PowSlice };
export type Message = PutPeers | PutBlock | AskBlock | PutSlice;

// type Mail = {
//   sent_by: Peer;
//   message: Message;
// };
