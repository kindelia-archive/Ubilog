import { config_resolver, ConfigSchema, Validators as V } from "./lib/configinator.ts";
import { is_json_object, JSONValue } from "./lib/json.ts";

type ConfigTypes = {
  net_port: number;
  display: boolean;
  // peers: string[],
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
  // TODO initial peers
};

export const resolve_config = config_resolver<ConfigTypes>(config_schema);
