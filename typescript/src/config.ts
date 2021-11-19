import { ensureDirSync } from "https://deno.land/std@0.113.0/fs/mod.ts";

import { bits_mask } from "./lib/numbers/mod.ts";
import { JSONValue } from "./lib/json.ts";
import { ensure_text_file } from "./lib/files.ts";

import type { AddressOptPort, ConfigSchema } from "./lib/confignator/mod.ts";
import { config_resolver, V } from "./lib/confignator/mod.ts";

export type { GetEnv, AddressOptPort } from "./lib/confignator/mod.ts";
export * as cfg_nt from "./lib/confignator/mod.ts";

type ConfigTypes = {
  net_port: number;
  display: boolean;
  mine: boolean;
  secret_key: bigint;
  peers: AddressOptPort[];
};

const config_schema: ConfigSchema<ConfigTypes> = {
  net_port: {
    validator: V.int_range(1, 65535),
    env: "PORT",
    flag: "port",
    default: 16936,
  },
  display: {
    validator: V.yes_no,
    env: "DISPLAY",
    flag: "display",
    default: false,
  },
  mine: {
    validator: V.yes_no,
    env: "MINE",
    flag: "mine",
    default: false,
  },
  secret_key: {
    validator: V.bigint_range(0n, bits_mask(256n)),
    env: "SECRET_KEY",
    default: 0n,
    sensitive: true,
  },
  peers: {
    validator: V.list(V.address_opt_port),
    env: "PEERS",
    flag: "peers",
    default: [],
  },
};

export const DEFAULT_CONFIG = {
  peers: ["127.0.0.1:42000", "127.0.0.1:42001", "127.0.0.1:42002"],
};

export function load_config_file(base_dir: string): JSONValue {
  ensureDirSync(base_dir);
  const config_path = `${base_dir}/config.json`;
  ensure_text_file(config_path, JSON.stringify(DEFAULT_CONFIG));
  const config_file = Deno.readTextFileSync(config_path);
  const config_data = JSON.parse(config_file);
  return config_data;
}

export const resolve_config = config_resolver<ConfigTypes>(config_schema);
