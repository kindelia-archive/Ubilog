#![allow(dead_code)]

use std::collections::HashMap;

use bitvec::prelude as bv;
use primitive_types::U256;
use sha3::Digest;

// sizes

pub const HASH_SIZE: usize = 32; // 256 bits
pub const WORD_SIZE: usize = 64 / 8;
pub const BODY_SIZE: usize = 1280;
pub const POST_SIZE: usize = WORD_SIZE + (WORD_SIZE * 4) + BODY_SIZE;

// ipv6 address size
pub const IPV6_SIZE: usize = 16;
pub const PORT_SIZE: usize = 2;
pub const ADDRESS_SIZE: usize = IPV6_SIZE + PORT_SIZE;

// Blockchain

#[derive(Debug, Clone, PartialEq)]
pub struct Body {
    val: [u8; BODY_SIZE],
}

impl Default for Body {
    fn default() -> Self {
        Body {
            val: [0u8; BODY_SIZE], // TODO Vec ?
        }
    }
}

impl From<[u8; BODY_SIZE]> for Body {
    fn from(val: [u8; BODY_SIZE]) -> Self {
        Body { val }
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct Block {
    prev: U256,     // previous block (32 bytes)
    targ: u64,
    time: u64,
    name: u64,
    nonc: u64,
    body: Body,     // block contents (1280 bytes)
}

impl Block {
    fn hash(&self) -> U256 {
        if self.prev.is_zero()
            && self.targ == 0
            && self.time == 0
            && self.name == 0
            && self.nonc == 0
        {
            return U256::zero();
        }
        let sered: Vec<u8> = vec![]; // TODO
        let hasher = sha3::Keccak256::new();
        let hash = hasher.chain(&sered).finalize();
        let res = U256::from_little_endian(&hash);
        res
    }
}

fn hash_score(hash: U256) -> U256 {
    if hash.is_zero() {
        // redundant. keep for clarity?
        U256::zero()
    } else {
        let u256_max: U256 = U256::max_value();
        u256_max.checked_div(u256_max - hash).unwrap_or(U256::zero())
    }
}

struct Chain {
    block: HashMap<U256, Block>,
    children: HashMap<U256, Vec<U256>>,
    pending: HashMap<U256, Vec<Block>>,
    work: HashMap<U256, U256>,
    height: HashMap<U256, U256>,
    seen: HashMap<U256, ()>,
    tip: (u64, U256),
}

// Address

#[derive(Debug, PartialEq)]
enum Address {
    IP(std::net::IpAddr, u16),
}

// Message

#[derive(Debug, PartialEq)]
struct Slice {
    nonc: u64,
    data: bv::BitVec,
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

#[cfg(test)]
mod tests {
    use super::*;
    // use hex_literal::hex;
    // use rand::prelude::*;

    #[test]
    fn post_hash_score() {
        let prev = U256::from_little_endian(&[
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
            19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
        ]);
        // let work = U256::from(0x04050607u64);
        let nonc = 0x04050607u64;
        let body: Body = Body::from([0x42; BODY_SIZE]);

        let block = Block{prev, targ: 0, time: 0, name: 0, nonc, body};
        let hash = block.hash();
        println!("HASH: {:x}", hash);
        println!("SCORE: {}", hash_score(hash));
    }
}
