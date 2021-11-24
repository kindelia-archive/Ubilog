import * as path from "https://deno.land/std@0.115.1/path/mod.ts";
import { parse as parse_flags } from "https://deno.land/std@0.115.1/flags/mod.ts";

import { is_json_object } from "./lib/json.ts";

import { GetEnv, load_config_file, resolve_config } from "./config.ts";
import { start_node } from "./ubilog.ts";

export function main(args: string[], get_env: GetEnv): void {
  const parsed_flags = parse_flags(args, {
    string: ["port"],
    boolean: ["display"],
  });

  // TODO: fix ENV("HOME") ?? ""
  const base_dir = get_env("UBILOG_DIR") ?? path.join(get_env("HOME") ?? "", ".ubilog");
  const config_file_data = load_config_file(base_dir);
  if (!is_json_object(config_file_data)) {
    throw new Error(`invalid config file, content is not a JSON object`);
  }

  const config = resolve_config(parsed_flags, config_file_data, get_env);

  // TODO: pass entire config object?
  // (needs fixed size numbers on config)
  start_node(base_dir, {
    port: config.net_port,
    display: config.display,
    mine: config.mine,
    // secret_key: config.secret_key,
    peers: config.peers,
  });
}

if (import.meta.main) {
  main(Deno.args, Deno.env.get);
}
