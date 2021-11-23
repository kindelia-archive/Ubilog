type Nat = bigint;

// Don't accept blocks from 1 hour in the future
export const DELAY_TOLERANCE: Nat = 60n * 60n * 1000n;

// Readjusts difficulty every 20 blocks
export const BLOCKS_PER_PERIOD: Nat = 20n;

// 1 second per block
export const TIME_PER_BLOCK: Nat = 1000n;

// Readjusts difficulty every 60 seconds
export const TIME_PER_PERIOD: Nat = TIME_PER_BLOCK * BLOCKS_PER_PERIOD;

export const INITIAL_DIFFICULTY: Nat = 1024n;

// Block body size
export const BODY_SIZE = 1280;

// Default networking port
export const DEFAULT_PORT = 16936;

// Directories
export const DIR_BLOCKS = "data/blocks";
export const DIR_MINED = "data/mined";
