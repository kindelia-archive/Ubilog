import {keccak256} from "./keccak256.ts"
import {Heap, heap_push, heap_pop} from "./minheap.ts"

// Persistence:
// ~/.bitcons/blocks/HASH
// ~/.bitcons/longest

// Types
// =====

// Blockchain
// ----------

type Dict<T> = Record<string, T>

type F64 = number
type Nat = bigint

type U8 = F64
type U16 = F64
type U64 = Nat
type U256 = Nat

type Hash = string // 0x0000000000000000000000000000000000000000000000000000000000000000
type Body = Uint8Array // 1280 bytes

type Block = {
  prev: Hash
  targ: U64
  time: U64
  name: U64
  nonc: U64
  body: Body // 1280 bytes
}

type Chain = {
  block: Dict<Block>
  children: Dict<Array<Hash>>
  pending: Dict<Array<Block>>
  work: Dict<Nat>
  height: Dict<Nat>
  seen: Dict<1>
  tip: [U64, Hash]
}

// Network
// -------

type Bits = string

type IPv4 = { ctor: "IPv4", val0: U8, val1: U8, val2: U8, val3: U8, port: U16 }
type Address = IPv4

type Peer = {
  seen_at: Nat
  address: Address
}

type Cons<T> = { ctor: "Cons", head: T, tail: List<T> }
type Nil<T>  = { ctor: "Nil" }
type List<T> = Cons<T> | Nil<T>

type Slice = { nonc: U64, data: Bits }

type PutPeers = { ctor: "PutPeers", peers: Address[] }
type PutSlice = { ctor: "PutSlice", slice: Slice }
type PutBlock = { ctor: "PutBlock", block: Block }
type AskBlock = { ctor: "AskBlock", bhash: Hash }
type Message  = PutPeers | PutSlice | PutBlock | AskBlock

type Mail = {
  sent_by: Peer
  message: Message
}

type Node = {
  port: F64
  peers: Dict<Peer>
  chain: Chain
  slices: Heap<Slice>
}

function HASH(hash: Hash) {
  if (/^0x[0-9A-Fa-f]{64}$/.test(hash)) {
    return hash;
  } else {
    throw new Error("INCORRECT HASH FORMAT.");
  }
}

// Algorithms
// ==========

// String
// ------

function pad_left(length: F64, fill: string, str: string) {
  while (str.length < length) {
    str = fill + str;
  }
  return str.slice(0, length);
}

// Lists
// -----

function cons<T>(head: T, tail: List<T>): List<T> {
  return { ctor: "Cons", head, tail }
}

function nil<T>(): List<T> {
  return { ctor: "Nil" }
}

function array_to_list<T>(array: T[], index: number = 0): List<T> {
  if (index === array.length) {
    return nil();
  } else {
    return cons(array[index], array_to_list(array, index + 1));
  }
}

function list_to_array<T>(list: List<T>): Array<T> {
  var array = [];
  while (list.ctor !== "Nil") {
    array.push(list.head);
    list = list.tail;
  }
  return array;
}

// Bits
// ----

function bits_to_uint8array(bits: Bits): Uint8Array {
  if (bits.length < 2 ** 16) {
    var buff = new Uint8Array(2 + Math.ceil(bits.length / 8))
    var bits = serialize_bits(bits)
    //console.log("->", bits);
    for (var i = 0; i < bits.length; i += 8) {
      var numb = 0;
      for (var j = 0; j < 8; ++j) {
        numb *= 2;
        //console.log(i, j, "read", bits[i + 8 - j - 1]);
        if (bits[i + 8 - j - 1] === "1") {
          numb += 1;
        }
      }
      buff[Math.floor(i / 8)] = numb;
    }
    return buff;
  }
  throw new Error("bitstring too large")
}

function uint8array_to_bits(buff: Uint8Array): Bits {
  var size = (buff[0]||0) + ((buff[1]||0) * 256);
  var bits = "";
  for (var i = 2; i < buff.length; ++i) {
    var val = buff[i]||0;
    for (var j = 0; j < 8 && bits.length < size; ++j) {
      bits += (val >>> j) & 1 ? "1" : "0";
    }
  }
  return bits;
}

// Numbers
// -------

function compress_nat(numb: Nat): U64 {
  var exp = 0n;
  while (2n ** exp <= numb) {
    exp += 1n;
  }
  var drop = exp - 48n;
  var drop = drop < 0n ? 0n : drop;
  var numb = ((numb >> drop) << 16n) | drop;
  return numb & 0xFFFFFFFFFFFFFFFFn;
}

function decompress_nat(pack: U64): Nat {
  var drop = pack & 0xFFFFn;
  var numb = (pack >> 16n) << drop;
  return numb;
}

// Hashing
// -------

const ZeroHash : Hash = HASH("0x0000000000000000000000000000000000000000000000000000000000000000");

function u64_to_uint8array(value: U64): Uint8Array {
  var bytes : F64[] = [];
  for (var i = 0; i < 8; ++i) {
    bytes.push(Number((value >> BigInt((8 - i - 1) * 8)) % 0x100n))
  }
  return new Uint8Array(bytes);
}

function u256_to_uint8array(value: U256): Uint8Array {
  var bytes : F64[] = [];
  for (var i = 0; i < 32; ++i) {
    bytes.push(Number((value >> BigInt((32 - i - 1) * 8)) % 0x100n))
  }
  return new Uint8Array(bytes);
}

function hash_to_uint8array(hash: Hash): Uint8Array {
  return u256_to_uint8array(BigInt(hash));
}

function get_hash_work(hash: Hash) : Nat {
  let value = BigInt(HASH(hash))
  if (value === 0n) {
    return 0n;
  } else {
    return (2n ** 256n) / (2n ** 256n - value)
  }
}

function hash_uint8array(words: Uint8Array) : Hash {
  return HASH(keccak256(Array.from(words)));
}

function hash_block(block: Block) : Hash {
  if ((block.prev === ZeroHash) && (block.targ === 0n) && (block.time === 0n) && (block.name === 0n) && (block.nonc === 0n)) {
    return ZeroHash;
  } else {
    return hash_uint8array(new Uint8Array([
      ...hash_to_uint8array(block.prev),
      ...u64_to_uint8array(block.targ),
      ...u64_to_uint8array(block.time),
      ...u64_to_uint8array(block.name),
      ...u64_to_uint8array(block.nonc),
      ...block.body,
    ]))
  }
}

function hash_slice(slice: Slice) : Hash {
  return hash_uint8array(bits_to_uint8array(serialize_slice(slice)));
}

function mine(block: Block, target_work: Nat, max_attempts: F64) : Block | null {
  for (var i = 0n; i < max_attempts; ++i) {
    var block = {...block, nonc: BigInt(Math.floor(Math.random() * (2 ** 48)))}
    var work = get_hash_work(hash_block(block))
    if (work >= target_work) {
      return block
    }
  }
  return null
}

// Chain
// -----

const ZeroBody : Body = new Uint8Array(1280);
const InitTarg : U64 = compress_nat(1000n);
const ZeroBlock : Block = {prev: ZeroHash, targ: InitTarg, time: 0n, name: 0n, nonc: 0n, body: ZeroBody};

function initial_chain() : Chain {
  let block : Dict<Block> = {[ZeroHash]: ZeroBlock}
  let children : Dict<Array<Hash>> = {[ZeroHash]: []}
  let pending : Dict<Array<Block>> = {}
  let work : Dict<Nat> = {[ZeroHash]: 0n}
  let height : Dict<Nat> = {[ZeroHash]: 0n}
  let seen : Dict<1> = {}
  let tip : [U256, Hash] = [0n, ZeroHash]
  return {block, children, pending, work, height, seen, tip}
}

function add_block(chain: Chain, block: Block) {
  let bhash = hash_block(block)
  if (chain.block[bhash] === undefined) {
    let phash = block.prev
    // If previous block is available, add the block
    if (chain.block[phash] !== undefined) {
      var work = get_hash_work(bhash)
      chain.block[bhash] = block
      chain.work[bhash] = 0n
      chain.height[bhash] = 0n
      chain.children[bhash] = []
      if (BigInt(bhash) >= chain.block[phash].targ) {
        chain.work[bhash] = chain.work[phash] + work
        chain.height[bhash] = chain.height[phash] + 1n
        chain.children[phash].push(bhash)
        if (chain.work[bhash] > chain.tip[0]) {
          chain.tip = [chain.work[bhash], bhash];
        }
      }
      // Add all blocks that were waiting for this block
      for (var pending of (chain.pending[bhash] || [])) {
        add_block(chain, pending)
      }
      delete chain.pending[bhash];
    // Otherwise, add this block to the previous block's pending list
    } else if (chain.seen[bhash] === undefined) {
      chain.pending[phash] = chain.pending[phash] || [];
      chain.pending[phash].push(block)
    }
    chain.seen[bhash] = 1
  }
}

function get_longest_chain(chain: Chain) : Array<Block> {
  var longest = [];
  var bhash = chain.tip[1];
  while (chain.block[bhash] !== undefined && bhash !== ZeroHash) {
    var block = chain.block[bhash];
    longest.push(block);
    bhash = block.prev;
  }
  return longest.reverse();
}

// Stringification
// ---------------

function get_address_hostname(address: Address) : string {
  switch (address.ctor) {
    case "IPv4": return address.val0 + "." + address.val1 + "." + address.val2 + "." + address.val3;
  }
  return "";
}

function show_chain(chain: Chain) {
  let blocks = get_longest_chain(chain)
  let blocks_length = blocks.length
  let blocks_indexed : Array<[Nat,Block]> = blocks.map((block, i) => [BigInt(i), block])
  var text = "index  | body[0]                                                          | hash                                                             | work\n";
  for (let index_block of blocks_indexed) {
    let [index, block] = index_block
    let bhash = hash_block(block)
    let work = chain.work[bhash] || 0n
    let show_index = BigInt(index).toString()
    let show_body = pad_left(64,"0",[].slice.call(block.body,0,32).map((x:number) => pad_left(2,"0",x.toString(16))).join(""))
    let show_hash = bhash
    let show_work = work.toString()
    text += ""
      + pad_left(6, '0', show_index) + " | "
      + pad_left(64, '0', show_body) + " | "
      + pad_left(64, '0', show_hash) + " | "
      + pad_left(8, '0', show_work) + "\n";
  }
  return text;
}

// Serialization
// -------------

function serialize_fixlen(size: F64, value: Nat): Bits {
  if (size > 0) {
    var head = (value % 2n) === 0n ? "0" : "1"
    var tail = serialize_fixlen(size - 1, value / 2n)
    return head + tail
  } else {
    return "";
  }
}

function deserialize_fixlen(size: F64, bits: Bits): [Bits, Nat] {
  if (size === 0) {
    return [bits, 0n]
  } else {
    if (bits[0] === "0") {
      var [bits,x] = deserialize_fixlen(size - 1, bits.slice(1))
      return [bits, x * 2n]
    } else if (bits[0] === "1") {
      var [bits,x] = deserialize_fixlen(size - 1, bits.slice(1))
      return [bits, x * 2n + 1n]
    } else {
      return ["", 0n]
    }
  }
}

function serialize_list<T>(item: (x:T) => Bits, list: List<T>) : Bits {
  switch (list.ctor) {
    case "Nil":
      return "0"
    case "Cons":
      return "1" + item(list.head) + serialize_list(item, list.tail)
  }
}

function deserialize_list<T>(item: (x:Bits) => [Bits,T], bits: Bits) : [Bits, List<T>] {
  if (bits[0] === "0") {
    return [bits.slice(1), nil()]
  } else if (bits[0] === "1") {
    var [bits, head] = item(bits.slice(1))
    var [bits, tail] = deserialize_list(item, bits)
    return [bits, cons(head, tail)]
  } else {
    return ["", nil()]
  }
}

function serialize_address(address: Address) : Bits {
  switch (address.ctor) {
    case "IPv4":
      var val0 = serialize_fixlen(8, BigInt(address.val0))
      var val1 = serialize_fixlen(8, BigInt(address.val1))
      var val2 = serialize_fixlen(8, BigInt(address.val2))
      var val3 = serialize_fixlen(8, BigInt(address.val3))
      var port = serialize_fixlen(16, BigInt(address.port))
      return "0" + val0 + val1 + val2 + val3 + port;
  }
  return "";
}

function deserialize_address(bits: Bits) : [Bits, Address] {
  if (bits[0] === "0") {
    var [bits,val0] = deserialize_fixlen(8, bits.slice(1))
    var [bits,val1] = deserialize_fixlen(8, bits)
    var [bits,val2] = deserialize_fixlen(8, bits)
    var [bits,val3] = deserialize_fixlen(8, bits)
    var [bits,port] = deserialize_fixlen(16, bits)
    return [bits, {ctor: "IPv4", val0: Number(val0), val1: Number(val1), val2: Number(val3), val3: Number(val3), port: Number(port)}];
  } else {
    throw "Bad address deserialization."
  }
}

function serialize_bits(data: Bits) : Bits {
  var size = serialize_fixlen(16, BigInt(data.length))
  return size + data;
}

function deserialize_bits(bits: Bits) : [Bits, Bits] {
  var [bits,size] = deserialize_fixlen(16, bits)
  var [bits,data] = [bits.slice(Number(size)), bits.slice(0, Number(size))]
  return [bits, data]
}

function serialize_slice(slice: Slice) : Bits {
  var nonc = serialize_fixlen(64, slice.nonc);
  var data = serialize_bits(slice.data);
  return nonc + data;
}

function deserialize_slice(bits: Bits) : [Bits, Slice] {
  var [bits,nonc] = deserialize_fixlen(64, bits);
  var [bits,data] = deserialize_bits(bits);
  return [bits, {nonc, data}];
}

function serialize_uint8array(bytes: number, array: Uint8Array) : Bits {
  var bits = "";
  for (var i = 0; i < bytes; ++i) {
    bits += serialize_fixlen(8, BigInt(array[i]));
  }
  return bits;
}

function deserialize_uint8array(bytes: number, bits: Bits) : [Bits, Uint8Array] {
  var vals = [];
  for (var i = 0; i < bytes; ++i) {
    var [bits, val] = deserialize_fixlen(8, bits);
    vals.push(Number(val));
  }
  return [bits, new Uint8Array(vals)];
}

function serialize_hash(hash: Hash): Bits {
  return serialize_fixlen(256, BigInt(HASH(hash)));
}

function deserialize_hash(bits: Bits): [Bits, Hash] {
  var [bits,nat] = deserialize_fixlen(256,bits);
  return [bits, HASH("0x" + pad_left(64, "0", nat.toString(16)))];
}

function serialize_block(block: Block) : Bits {
  var prev = serialize_hash(block.prev);
  var targ = serialize_fixlen(64, block.targ);
  var time = serialize_fixlen(64, block.time);
  var name = serialize_fixlen(64, block.name);
  var nonc = serialize_fixlen(64, block.nonc);
  var body = serialize_uint8array(1280, block.body);
  return prev + targ + time + name + nonc + body;
}

function deserialize_block(bits: Bits) : [Bits, Block] {
  var [bits,prev] = deserialize_hash(bits);
  var [bits,targ] = deserialize_fixlen(64, bits);
  var [bits,time] = deserialize_fixlen(64, bits);
  var [bits,name] = deserialize_fixlen(64, bits);
  var [bits,nonc] = deserialize_fixlen(64, bits);
  var [bits,body] = deserialize_uint8array(1280, bits);
  return [bits, {prev, targ, time, name, nonc, body}];
}

function serialize_message(message: Message) : Bits {
  switch (message.ctor) {
    case "PutPeers":
      var peers = serialize_list(serialize_address, array_to_list(message.peers));
      return "00" + peers;
    case "PutSlice":
      var slice = serialize_slice(message.slice);
      return "10" + slice;
    case "PutBlock":
      var block = serialize_block(message.block);
      return "01" + block;
    case "AskBlock":
      var bhash = serialize_hash(message.bhash);
      return "11" + bhash;
  }
  return "";
}

function deserialize_message(bits: Bits) : [Bits, Message] {
  switch (bits.slice(0,2)) {
    case "00":
      var [bits, peers] = deserialize_list(deserialize_address, bits.slice(2));
      return [bits, {ctor: "PutPeers", peers: list_to_array(peers)}];
    case "10":
      var [bits, slice] = deserialize_slice(bits.slice(2));
      return [bits, {ctor: "PutSlice", slice}];
    case "01":
      var [bits, block] = deserialize_block(bits.slice(2));
      return [bits, {ctor: "PutBlock", block}];
    case "11": 
      var [bits, bhash] = deserialize_hash(bits.slice(2));
      return [bits, {ctor: "AskBlock", bhash}];
  }
  throw "Bad message deserialization."
}

// Networking
// ----------

const DEFAULT_PORT : number = 16936;

function address_to_deno(address: Address) {
  return {transport: "udp", hostname: get_address_hostname(address), port: address.port};
}

function deno_to_address(deno: any) : Address {
  var [val0,val1,val2,val3] = deno.hostname.split(".");
  return {ctor: "IPv4", val0: Number(val0), val1: Number(val1), val2: Number(val2), val3: Number(val3), port: Number(deno.port)};
}

function udp_init(port : number = DEFAULT_PORT) {
  console.log("init", port);
  return Deno.listenDatagram({port, transport: "udp"});
}

function udp_send(udp: any, address: Address, message: Message) { 
  //console.log("send", address, message);
  udp.send(bits_to_uint8array(serialize_message(message)), address_to_deno(address));
}

function udp_receive<T>(udp: any, callback: (address: Address, message: Message) => T) {
  setTimeout(async () => {
    for await (var [buff,deno] of udp) {
      var bits = uint8array_to_bits(buff);
      var addr = deno_to_address(deno);
      var [bits,msg] = deserialize_message(bits);
      callback(addr, msg);
    }
  }, 0);
}

// Node
// ----

export function start_node(port: number = DEFAULT_PORT) {
  // Initializes the node
  var peers : Dict<Peer> = {};
  for (let peer_port of [42000, 42001, 42002]) {
    var addr : Address = {ctor: "IPv4", val0: 127, val1: 0, val2: 0, val3: 1, port: peer_port};
    var seen : Nat = BigInt(Date.now());
    peers[serialize_address(addr)] = {seen_at: seen, address: addr}
  }
  var chain : Chain = initial_chain();
  var slices : Heap<Slice> = [];
  var node : Node = { port, peers, chain, slices };

  var body : Body = ZeroBody;
  body[0] = (port % 42000);

  // Initializes sockets
  var udp = udp_init(port);

  // TODO: improve performance
  function random_peers(count: number) : Array<Peer> {
    var keys = Object.keys(node.peers);
    var peers = [];
    for (var i = 0; i < count; ++i) {
      peers.push(node.peers[keys[keys.length * Math.random() << 0]]);
    }
    return peers;
  }

  function send(to: Address, message: Message) {
    if (!(get_address_hostname(to) === "127.0.0.1" && to.port === port)) {
      udp_send(udp, to, message);
    }
  }

  function all_peers() : Array<Peer> {
    return Object.values(node.peers);
  }

  // Handles incoming messages
  function handle_message(sender: Address, message: Message) {
    switch (message.ctor) {
      case "PutPeers":
        //console.log("PutPeers", message.peers.length);
        for (var address of message.peers) {
          node.peers[serialize_address(address)] = {seen_at: BigInt(Date.now()), address};
        }
        break;
      case "PutSlice":
        var priority = get_hash_work(hash_slice(message.slice));
        heap_push(node.slices, [-Number(priority), message.slice]);
        break;
      case "PutBlock":
        //console.log("PutBlock", hash_block(message.block));
        add_block(node.chain, message.block);
        break;
      case "AskBlock":
        //console.log("AskBlock", message.bhash);
        var block = node.chain.block[message.bhash];
        if (block) {
          send(sender, {ctor: "PutBlock", block});
        }
        break;
    }
  }
  udp_receive(udp, handle_message)

  // Attempts to mine a new block
  function miner() {
    setTimeout(() => {
      var tip_hash = node.chain.tip[1]
      var tip_block = node.chain.block[tip_hash];
      var new_block = mine({...ZeroBlock, body, prev: tip_hash}, decompress_nat(tip_block.targ), 1000);
      if (new_block !== null) {
        add_block(node.chain, new_block as Block);
        displayer();
      }
    }, 50);
  }
  setInterval(miner, 2000);

  // Sends our tip block to random peers
  function gossiper() {
    var block = node.chain.block[node.chain.tip[1]];
    for (var peer of all_peers()) {
      //console.log("send PutBlock", hash_block(block));
      send(peer.address, { ctor: "PutBlock", block });
    }
  }
  setInterval(gossiper, 1000 / 4);

  // Requests missing blocks
  function requester() {
    for (var bhash in node.chain.pending) {
      for (var peer of all_peers()) {
        send(peer.address, { ctor: "AskBlock", bhash });
      }
    }
  }
  setInterval(requester, 1000 / 16);

  // Displays status
  function displayer() {
    console.clear();
    console.log(show_chain(node.chain));
  }
  setInterval(displayer, 2000);
}

//var port = Number(Deno.args[0]) || 42000;
//start_node(port);

function test_0() {
  var block_0 = mine({...ZeroBlock, prev: ZeroHash}, 1000n, 999999) || ZeroBlock;
  var block_1 = mine({...ZeroBlock, prev: hash_block(block_0)}, 1000n, 999999) || ZeroBlock;
  var block_2 = mine({...ZeroBlock, prev: hash_block(block_1)}, 1000n, 999999) || ZeroBlock;

  var chain = initial_chain();
  add_block(chain, block_0);
  add_block(chain, block_1);
  add_block(chain, block_2);
  console.log(show_chain(chain));

  console.log(serialize_block(block_2));
}

//test_0()
