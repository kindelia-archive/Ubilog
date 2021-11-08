import { config_resolver, ConfigSchema, Validators as V } from "./lib/configinator.ts";
import { bits_mask } from "./lib/numbers.ts";

type ConfigTypes = {
  net_port: number;
  display: boolean;
  secret_key: bigint;
  // peers: string[],
};

const config_schema: ConfigSchema<ConfigTypes> = {
  net_port: {
    validator: V.int_range(1, 65535),
    env: "PORT",
    flag: "port",
    default: 16936,
  },
  secret_key: {
    validator: V.bigint_range(0n, bits_mask(256n)),
    env: "SECRET_KEY",
    default: 0n,
    sensitive: true,
  },
  display: {
    validator: V.yes_no,
    env: "DISPLAY",
    flag: "display",
    default: false,
  },
  // TODO: initial peers config
};

export const resolve_config = config_resolver<ConfigTypes>(config_schema);
