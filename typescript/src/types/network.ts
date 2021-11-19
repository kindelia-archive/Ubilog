import type { AddressPort } from "./address.ts";
import type { Block, Hash, Slice } from "./blockchain.ts";

type Nat = bigint;

export type Peer = {
  seen_at: Nat;
  address: AddressPort;
};

type PutPeers = { ctor: "PutPeers"; peers: AddressPort[] };
type PutBlock = { ctor: "PutBlock"; block: Block };
type AskBlock = { ctor: "AskBlock"; b_hash: Hash };
type PutSlice = { ctor: "PutSlice"; slice: Slice };
export type Message = PutPeers | PutBlock | AskBlock | PutSlice;

// type Mail = {
//   sent_by: Peer;
//   message: Message;
// };
