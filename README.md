Ubilog: a data-only, no-coin blockchain
=======================================

Ubilog is peer-to-peer network of nodes that synchronize via a Proof-of-Work to
implement a decentralized log of messages. In other words, it is essentially
Bitcoin, without the coin.

How it works?
-------------

Just like Bitcoin, except very, very simplified. Ubilog has no built-in
currency, transactions or fees. Instead, every second, a node will mine a block
containing 1280 bytes of pure data. This block will then propagate through the
network to be added to the blockchain. Forks are resolved via Nakamoto Consensus
(proof-of-work). Users can submit slices of data that they want miners to
include in a block, and miners can decide which slices to include based on
unspecified criteria.

Since there is no currency, one might wonder what would be the incentives to
mine a block, or to include slices in blocks. These incentives will emerge based
on what users do with Ubilog. For example, one could use Ubilog as the consensus
layer of a crypto-currency, and that currency could feature fees. This would
incentivize miners to use Ubilog, since that would let the miner profit in such
currency, even though the currency would not be part of Ubilog itself. In fact,
Ubilog could "host" several crypto-currencies at the same time.

Usage
-----

The primary implementation uses TypeScript. It can be installed via npm:

... TODO ...

To start running a full node, just type `ubilog`. This will synchronize with
other nodes in the network, will and will dump the active, longest chain to the
`~/.ubilog/blocks` directory.


