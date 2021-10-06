import {keccak256} from "./keccak256.ts"

// Types
// -----

type Dict<T> = Record<string, T>

type U8 = number
type U16 = number
type U256 = bigint

type Hash = string

type IPv4 = {
  ip0: U8
  ip1: U8
  ip2: U8
  ip3: U8
  port: U16
}

type Address = IPv4

type Peer = {
  lastSeen: bigint
  address: Address
}

type Ping = {
  ctor: "Ping"
  addresses: Address[]
}

type RequestBlock = {
  ctor: "RequestBlock"
  block_hash: Hash
}

type ShareBlock = {
  ctor: "ShareBlock"
  block: Block
}

type Message = Ping | RequestBlock | ShareBlock

type Received = {
  sender: Peer
  message: Message
}

type Block = {
  prev: Hash
  nonce: U256
  body: Uint8Array // 1280 bytes
}

type State = {
  block: Dict<Block>
  children: Dict<Array<Hash>>
  pending: Dict<Array<Block>>
  score: Dict<bigint>
  seen: Dict<1>
  tip: [U256, Hash]
}

type Node = {
  port: number
  peers: Dict<Peer>
  state: State
}

// Utils
// -----

function pad_left(length: number, fill: string, str: string) {
  while (str.length < length) {
    str = fill + str;
  }
  return str.slice(0, length);
}

// Constants
// ---------

const ZeroHash : Hash = "0000000000000000000000000000000000000000000000000000000000000000";
const ZeroBody : Uint8Array = new Uint8Array(1280);
const ZeroBlock : Block = {prev: ZeroHash, nonce: 0n, body: ZeroBody};

// Hashing
// -------

function u256_to_uint8array(value: U256): Uint8Array {
  var bytes : number[] = [];
  for (var i = 0; i < 32; ++i) {
    bytes.push(Number((value >> BigInt((32 - i - 1) * 8)) % 0x100n))
  }
  return new Uint8Array(bytes);
}

function hash_uint8array(words: Uint8Array) : Hash {
  return keccak256(Array.from(words));
}

function get_hash_score(hash: Hash) : U256 {
  let value = BigInt(hash)
  if (value === 0n) {
    return 0n
  } else {
    return (2n ** 256n) / value
  }
}

function hash_block(block: Block) : Hash {
  if ((block.prev === ZeroHash) && (block.nonce === 0n)) {
    return ZeroHash;
  } else {
    return hash_uint8array(new Uint8Array([
      ...block.body,
      ...u256_to_uint8array(block.nonce),
      ...u256_to_uint8array(BigInt(block.prev)),
    ]))
  }
}

function mine(block: Block, target_score: U256, max_attempts: number) : Block | null {
  for (var i = 0n; i < max_attempts; ++i) {
    let nonce = BigInt(Math.floor(Math.random() * (2 ** 48)));
    let block_score = get_hash_score(hash_block({...block, nonce}))
    if (block_score >= target_score) {
      return {...block, nonce}
    }
  }
  return block
}

// Blockchain
// ----------

function initial_state() : State {
  let block : Dict<Block> = {[ZeroHash]: ZeroBlock}
  let children : Dict<Array<Hash>> = {[ZeroHash]: []}
  let pending : Dict<Array<Block>> = {}
  let score : Dict<bigint> = {[ZeroHash]: 0n}
  let seen : Dict<1> = {}
  let tip : [U256, Hash] = [0n, ZeroHash]
  return {block, children, pending, score, seen, tip}
}


function add_block(state: State, block: Block) {
  let block_hash = hash_block(block)
  if (state.block[block_hash] === undefined) {
    let prev_hash = block.prev
    state.seen[block_hash] = 1
    // If previous block is available, add the block
    if (state.block[prev_hash] !== undefined) {
      let block_score = state.score[prev_hash] + get_hash_score(block_hash)
      state.block[block_hash] = block
      state.score[block_hash] = block_score
      state.children[block_hash] = []
      state.children[prev_hash].push(block_hash)
      if (block_score > state.tip[0]) {
        state.tip = [block_score, block_hash];
      }
      // Add all blocks that were waiting for this block
      for (var pending of (state.pending[block_hash] || [])) {
        add_block(state, pending)
      }
      delete state.pending[block_hash];
    // Otherwise, add this block to the previous block's pending list
    } else if (state.seen[block_hash] === undefined) {
      state.pending[prev_hash] = state.pending[prev_hash] || [];
      state.pending[prev_hash].push(block)
    }
  }
}

function get_longest_chain(state: State) : Array<Block> {
  var longest = [];
  var block_hash = state.tip[1];
  while (state.block[block_hash] !== undefined && block_hash !== ZeroHash) {
    var block = state.block[block_hash];
    longest.push(block);
    block_hash = block.prev;
  }
  return longest.reverse();
}

// Stringification
// ---------------

function show_message(message: Message) : string {
  switch (message.ctor) {
    case "Ping":
      return "ping(" + message.addresses.map(show_address) + ")"
      break;
    case "RequestBlock":
      return "request_block(" + message.block_hash + ")"
      break;
    case "ShareBlock":
      return "share_block(" + hash_block(message.block) + ")"
      break;
  }
}

function show_ip(addr: Address) : string {
  let ip0 = addr.ip0.toString()
  let ip1 = addr.ip1.toString()
  let ip2 = addr.ip2.toString()
  let ip3 = addr.ip3.toString()
  return ip0 + "." + ip1 + "." + ip2 + "." + ip3
}

function show_port(addr: Address) : string {
  return addr.port.toString()
}

function show_address(addr: Address) : string {
  return show_ip(addr) + ":" + show_port(addr)
}

function show_peer(peer: Peer) : string {
  return "<" + show_address(peer.address) + ">"
}

function peer_map_from_list(peers: Array<Peer>) : Dict<Peer> {
  let map : Dict<Peer> = {};
  for (var peer of peers) {
    map[show_address(peer.address)] = peer;
  }
  return map;
}

// Tests
// -----

var state = initial_state();

var block_0 = mine({prev: ZeroHash           , nonce: 0n, body: ZeroBody}, 1000n, 999999) || ZeroBlock;
var block_1 = mine({prev: hash_block(block_0), nonce: 0n, body: ZeroBody}, 1000n, 999999) || ZeroBlock;
var block_2 = mine({prev: hash_block(block_1), nonce: 0n, body: ZeroBody}, 1000n, 999999) || ZeroBlock;
add_block(state, block_0);
add_block(state, block_1);
add_block(state, block_2);
display(state);














//function received_from_udp_message(time: U256, recv: IO.RecvUdp.Message) : Maybe<Received> {
  //let ip = String.split(recv.from.ip, ".").map((x) => BigInt(x))
  //let port = recv.from.port
  //let peer = Peer.new(time, Address.ipv4(ip[0], ip[1], ip[2], ip[3], port))
  //let msge = Lit.Bits.deserialize.message(Bits.hex.decode(recv.data))
  //return Maybe.some(Received.new(peer, msge))
//}

//function node_send(node: Node, peer: Peer, message: Message) : IO<void> {
  //let from_port = node.port
  //let to_ip     = address_show.ip(peer.address)
  //let to_port   = BigInt(peer.address.port)
  //return IO.send_udp(from_port, to_ip, to_port, Bits.hex.encode(Lit.Bits.serialize.message(message)))
//}

//function node_get_random_peers(node: Node, count: Nat) : IO<Array<Peer>> {
  //get time = Date.now()
  //let peers = peer_map_from_list([
    //Peer.new(time, address_ipv4(127,0,0,1,42000))
    //Peer.new(time, address_ipv4(127,0,0,1,42001))
    //Peer.new(time, address_ipv4(127,0,0,1,42002))
    //Peer.new(time, address_ipv4(127,0,0,1,42003))
  //])
  //return peers;
//}

//function node_send_to_random_peers(node: Node, count: Nat, message: Message) {
  //get peers = node_get_random_peers(node, count)
  //node_broadcast(node, message, peers)
//}

//function node_broadcast(node: Node, message: Message, peers: Array<Peer>) {
  //console.log("Broadcasting message...")
  //if (peers.length === 0) {
    //return
  //} else {
    //node_send(node, peers.head, message)
    //node_broadcast(node, message, peers.tail)
  //}
//}

//function node_init(port: Nat) : IO<void> {
  //console.log("Initializing node...")
  //let time = Date.now();
  //let peers = Peer.map_from_list([
    //Peer.new(time, address_ipv4(127,0,0,1,42000))
    //Peer.new(time, address_ipv4(127,0,0,1,42001))
    //Peer.new(time, address_ipv4(127,0,0,1,42002))
    //Peer.new(time, address_ipv4(127,0,0,1,42003))
  //])
  //let state = State.genesis
  //let node = Node.new(port, peers, state)
  //node_loop(node, 0)
//}

//function node_loop(node: Node, iteration: BigInt) : IO<void> {
  //console.log("Looping node...")
  //let inbox = IO.recv_udp(node.port)
  //let node = node_handle_inbox(node, inbox)
  //let time = Date.now()
  //let body = Vector.create!(40, (i) if i =? 39 then time else 0#256)
  //let block = Block.new(node.state.tip.snd, 0, 0, body)
  //node_ping(node)
  //node_share_tip(node)
  //node_request_pendings(node)
  //let node = node_forget_inactive_peers(node)
  //let node = node_mine(node, block)
  //node_loop(node, BigInt(iteration + 1))
//}

function display(state: State) {
  let blocks = get_longest_chain(state)
  let blocks_length = blocks.length
  let blocks_indexed : Array<[bigint,Block]> = blocks.map((block, i) => [BigInt(i), block])
  console.log("index  | body[0]                                                          | hash                                                             | score") 
  for (let index_block of blocks_indexed) {
    let [index, block] = index_block
    let block_hash = hash_block(block)
    let score = state.score[block_hash] || 0n
    let show_index = BigInt(index).toString()
    let show_body = "0" // todo
    let show_hash = block_hash
    let show_score = score.toString()
    console.log(""
      + pad_left(6, '0', show_index) + " | "
      + pad_left(64, '0', show_body) + " | "
      + pad_left(64, '0', show_hash) + " | "
      + pad_left(8, '0', show_score))
  }
}

//function node_broadcast(node: Node, message: Message, peers: Array<Peer>) : IO<void> {
  //console.log("Broadcasting message...")
  //let peers = peers.map((peer) => peer.address)
  //let message = message
  //let node = node_send(node, peers, message)
  //return node
//}

//function node_init
  //(port: BigInt) : IO<void> {
  //console.log("Initializing node...")
  //let time = Date.now();
  //let peers = Peer.map_from_list([
    //Peer.new(time, address_ipv4(127,0,0,1,42000))
    //Peer.new(time, address_ipv4(127,0,0,1,42001))
    //Peer.new(time, address_ipv4(127,0,0,1,42002))
    //Peer.new(time, address_ipv4(127,0,0,1,42003))
  //])
  //let state = State.genesis
  //let node = Node.new(port, peers, state)
  //node_loop(node, 0)
//}

//function node_refresh_peer(node: Node, peer: Peer) : IO<Node> {
  //let time = Date.now()
  //let peer = {...peer, last_seen: time}
  //let node = {...node, peers: {...node.peers, [peer_show(peer)]: peer}}
  //return node
//}

//function node_add_block(node: Node, block: Block) : Node {
  //let node = {...
    //node,
    //state: {
      //...node.state,
      //block: {...node.state.block, [U256.show(Pair.snd!!(node.state.tip))]: block},
      //seen: {...node.state.seen, [U256.show(block.prev)]: 1},
      //children: {...node.state.children, [U256.show(block.prev)]: [U256.show(block.nonce)]},
      //pending: {...node.state.pending, [U256.show(block.nonce)]: []},
      //score: {...node.state.score, [U256.show(block.nonce)]: 0},
      //tip: [block.prev, U256.show(block.nonce)]
    //}
  //}
  //return node
//}

//function node_handle_inbox(node: Node, inbox: Array<IO.recv_udp.Message>) : IO<Node> {
  //console.log("Handling incoming UDP messages...")
  //return node_handle_inbox.go(node, inbox)
//}

//function node_handle_inbox_go(node: Node, inbox: Array<IO.recv_udp.Message>) : IO<Node> {
  //if (inbox.length === 0) {
    //return IO.pass
  //} else {
    //let time = Date.now()
    //let received = received_from_udp_message(time, inbox.head)
    //switch (received) {
      //case none:
        //return node_handle_inbox_go(node, inbox.tail)
      //case some:
        //return node_on_message(node, received.value)
        //.then(node => node_handle_inbox_go(node, inbox.tail))
    //}
  //}
//}

//function node_forget_inactive_peers(node: Node) : IO<Node> {
  //let time = Date.now()
  //let peers = Map.values!(node.peers)
  //let peers = List.filter<Peer>((peer) (peer.last_seen + 10000) >? time, peers)
  //return node.peers <- Peer.map_from_list(peers)
//}

//function node_ping(node: Node) : IO<void> {
  //console.log("Pinging peers...")
  //let peers = List.map<Peer>(peer_show, Map.values!(node.peers))
  //let message = Message.ping(List.mapped!(peers, peer_address))
  //node_broadcast(node, message, peers)
//}

//function node_share_tip(node: Node) : IO<void> {
  //console.log("Sharing tip with peers...")
  //let tip_block = node.state.block[U256.show(Pair.snd!!(node.state.tip))]
  //let message = Message.share_block(tip_block)
  //node_broadcast(node, message, List.map<Peer>(peer_show, Map.values!(node.peers)))
//}

//function node_mine(node: Node, block: Block) : Maybe<Node> {
  //console.log("Mining block...")
  //let target_score = 512#256
  //let mined_block = block_mine(block, target_score, target_score/2)
  //switch (mined_block) {
    //case none:
      //console.log("- Failure.")
      //return none
    //case some:
      //console.log("- Success!")
      //return some(node_add_block(node, mined_block.value))
  //}
//}

//function node_on_message(node: Node, received: Received) : IO<Node> {
  //let time = Date.now()
  //let sender = received.sender
  //let message = received.message
  //let node = node_refresh_peer(node, sender)
  //switch (message.ctor) {
    //case "Ping":
      //let addresses = List.map<Address>(address_show, message.addresses)
      //let node = node_send(node, sender, Message.pong(addresses))
      //return node
    //case "RequestBlock":
      //let block = node.state.block[message.block_hash]
      //let node = node_send(node, sender, Message.share_block(block))
      //return node
    //case "ShareBlock":
      //let block = message.block
      //let node = node_add_block(node, block)
      //let node = node_request_pendings(node)
      //return node
  //}
//}

//function node_request_pendings(node: Node) : IO<Node> {
  //console.log("Requesting pendings...")
  //let pendings = Map.keys!(node.state.pending)
  //let pendings = List.map<U256>(U256.read, pendings)
  //for pending in pendings:
    //case node.state.seen[U256.show(pending)] as seen {
      //case none:
        //let message = Message.request_block(pending)
        //let node = node_broadcast(node, message, List.map<Peer>(peer_show, Map.values!(node.peers)))
        //return node
      //case some:
        //IO.pass
    //}
  //}
  //return node
//}

//function node_get_random_peers(node: Node, count: number) : List<Peer> {
  //let peers = List.map<Peer>(peer_show, Map.values!(node.peers))
  //let peers = List.shuffle(peers)
  //return List.take(count, peers)
//}

