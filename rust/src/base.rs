#![allow(dead_code)]

use std::collections::BinaryHeap;
use std::collections::HashMap;

use bitvec::prelude as bv;
use num_bigint;
use num_traits::{One, Zero};
use primitive_types::U256;
use sha3::Digest;

type Nat = num_bigint::BigUint;
type Bits = bv::BitVec<bv::Lsb0, u8>;

// Sizes

pub const HASH_SIZE: usize = 32; // 256 bits
pub const WORD_SIZE: usize = 64 / 8;
pub const BODY_SIZE: usize = 1280;
pub const BLOCK_SIZE: usize = HASH_SIZE + (WORD_SIZE * 4) + BODY_SIZE;

pub const IPV4_SIZE: usize = 4;
pub const IPV6_SIZE: usize = 16;
pub const PORT_SIZE: usize = 2;

// Types
// =====

// Blockchain
// ----------

type U256Map<T> = HashMap<U256, T>;

#[derive(Debug, Clone, PartialEq)]
pub struct Body {
    val: [u8; BODY_SIZE],
}

#[derive(Debug, Default, PartialEq)]
pub struct Block {
    prev: U256, // previous block (32 bytes)
    time: U256,
    body: Body, // block contents (1280 bytes)
}

struct Chain {
    block: U256Map<Block>,
    children: U256Map<Vec<U256>>,
    pending: U256Map<Vec<Block>>,
    work: U256Map<U256>,
    height: U256Map<U256>,
    target: U256Map<U256>,
    seen: U256Map<()>,
    tip: (u64, U256),
}

impl Default for Body {
    fn default() -> Self {
        Body {
            val: [0u8; BODY_SIZE],
        }
    }
}

impl From<[u8; BODY_SIZE]> for Body {
    fn from(val: [u8; BODY_SIZE]) -> Self {
        Body { val }
    }
}

// Network
// -------

#[derive(Debug, PartialEq)]
enum Address {
    IP(std::net::IpAddr, u16),
}

struct Peer {
    seen_at: Nat,
    address: Address,
}

#[derive(Debug, PartialEq)]
struct Slice {
    work: u64,
    data: Bits,
}

#[derive(Debug, PartialEq)]
enum Message {
    PutPeers(Vec<Address>),
    PutSlice(Slice),
    PutBlock(Block),
    AskBlock(U256),
}

pub const MESSAGE_PUT_PEERS: u8 = 0;
pub const MESSAGE_PUT_SLICE: u8 = 1;
pub const MESSAGE_PUT_BLOCK: u8 = 2;
pub const MESSAGE_ASK_BLOCK: u8 = 3;

struct Mail {
    sent_by: Peer,
    message: Message,
}

struct Node {
    port: u16,
    peers: HashMap<String, Peer>,
    chain: Chain,
    slices: BinaryHeap<Slice>,
}

// Algorithms
// ==========

// Numbers
// -------

fn nat_from_u256(n: &U256) -> Nat {
    let mut n = n.clone();
    let mut res: Nat = Zero::zero();
    let mut i: usize = 0;
    while !n.is_zero() {
        res = res + (Nat::from(n.low_u64()) << (64 * i));
        n = n >> 64;
        i += 1;
    }
    res
}

fn compress_nat(numb: Nat) -> u64 {
    let exp: i64 = numb.bits() as i64;
    let drop = exp - 48;
    let drop = std::cmp::max(drop, 0);
    let drop_nat = Nat::from(drop as u64);
    let numb: Nat = (numb >> drop) << 16 | drop_nat;
    numb.to_u64_digits()[0]
}

fn decompress_nat(pack: u64) -> Nat {
    let drop = pack & 0xffff;
    let numb = Nat::from(pack >> 16) << drop;
    numb
}

// String
// ------

fn pad_left(len: usize, fill: &str, str: &str) -> String {
    let dif = len - str.len();
    let num = dif / fill.len();
    let num = if dif % fill.len() != 0 { num + 1 } else { num };
    let mut result = String::new();
    for _ in 0..num {
        result += fill;
    }
    result += str;
    result.chars().take(len).collect()
}

// Hashing
// -------

fn compute_difficulty(hash: Nat) -> Nat {
    let one: Nat = One::one();
    let b256: Nat = one << 256;
    b256.clone() / (b256 - hash)
}

fn compute_target(difficulty: Nat) -> Nat {
    let one: Nat = One::one();
    let b256: Nat = one << 256;
    b256.clone() - (b256 / difficulty)
}

// Computes next target by scaling the current difficulty by a `scale` factor
// Since the factor is an integer, it is divided by 2^32 to allow integer division
// - compute_next_target(t, 2n**32n / 2n): difficulty halves
// - compute_next_target(t, 2n**32n * 1n): nothing changes
// - compute_next_target(t, 2n**32n * 2n): difficulty doubles
fn compute_next_target(last_target: Nat, scale: Nat) -> Nat {
    let last_difficulty = compute_difficulty(last_target);
    let next_difficulty = 1u32 + (last_difficulty * scale - 1u32) >> 32;
    compute_target(next_difficulty)
}

fn get_hash_work(hash: &U256) -> Nat {
    let val = nat_from_u256(hash);
    if val.is_zero() {
        Zero::zero()
    } else {
        compute_difficulty(val)
    }
}

fn hash_block(block: &Block) -> U256 {
    if block.prev.is_zero() && block.time.is_zero() {
        return U256::zero();
    }
    let mut hasher = sha3::Keccak256::new();

    let mut buf_hash = [0u8; HASH_SIZE];
    block.prev.to_little_endian(&mut buf_hash);
    hasher.update(&buf_hash);
    block.time.to_little_endian(&mut buf_hash);
    hasher.update(&buf_hash);

    hasher.update(&block.body.val);

    let hash = hasher.finalize();
    U256::from_little_endian(&hash)
}

fn hash_slice(slice: &Slice) -> U256 {
    let mut hasher = sha3::Keccak256::new();

    let buf = slice.work.to_le_bytes();
    hasher.update(&buf);
    let buf = slice.data[..].as_slice();
    hasher.update(&buf);

    let hash = hasher.finalize();
    U256::from_little_endian(&hash)
}

// Tests
// =====

#[cfg(test)]
mod tests {
    use super::*;
    // use hex_literal::hex;
    // use rand::prelude::*;

    #[test]
    fn post_hash_score() {
        let prev = U256::from_little_endian(&[
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
            24, 25, 26, 27, 28, 29, 30, 31,
        ]);
        // let work = U256::from(0x04050607u64);
        let nonc = 0x04050607u64;
        let body: Body = Body::from([0x42; BODY_SIZE]);

        let block = Block {
            prev,
            time: U256::zero(),
            body,
        };
        let hash = hash_block(&block);
        println!("HASH: {:x}", hash);
        println!("SCORE: {}", get_hash_work(&hash));
    }
}
