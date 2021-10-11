mod base;

#[cfg(test)]
mod tests {
    use hex_literal::hex;
    use sha3::{Digest, Keccak256};

    #[test]
    fn keccak256() {
        let src = hex!("0102ff017fcafe8879124567");
        let target =
            hex!("c9b5588fbab512ba723a18d506daf06fd5a4a6bb2d8a1ff512d577f8393c4405");
        let mut hasher = Keccak256::new();
        hasher.update(src);
        let result = hasher.finalize();
        assert_eq!(target, result[..]);
    }
}
