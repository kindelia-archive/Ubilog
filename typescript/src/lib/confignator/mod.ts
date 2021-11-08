import { JSONObject } from "../json.ts";

import { Validator } from "./types.ts";

export type { Address } from "./types.ts";
export { Validators } from "./validators/mod.ts";

export type ConfigItem<T> = {
  description?: string;
  validator: Validator<T>;
  env?: string;
  flag?: string;
  default: T;
  sensitive?: boolean;
};

export type ConfigSchema<M> = {
  [k in keyof M]: ConfigItem<M[k]>;
};

export const config_resolver = <R>(schema: ConfigSchema<R>) =>
  (
    flags?: Record<string, string>,
    config?: JSONObject,
    get_env?: (v: string) => string | undefined,
  ): R => {
    const result: any = {};
    for (const key in schema) {
      const item_schema = schema[key];

      // Handle flags
      const flag_name = item_schema.flag;
      if (flags && flag_name) {
        const flag_val = flags[flag_name];
        if (flag_val) {
          const txt = flag_val.toString();
          const res = item_schema.validator.from_string(txt);
          if (res._ == "Ok") {
            result[key] = res.value;
            continue;
          } else {
            throw new Error(`invalid '${flag_name}' flag value: ${res.err}`);
          }
        }
      }

      // Handle environment variables
      const env_name = item_schema.env;
      if (get_env && env_name) {
        const env_val = get_env(env_name);
        if (env_val) {
          const txt = env_val.toString();
          const res = item_schema.validator.from_string(txt);
          if (res._ == "Ok") {
            result[key] = res.value;
            continue;
          } else {
            throw new Error(
              `invalid '${env_name}' environment variable value: ${res.err}`,
            );
          }
        }
      }

      // Handle config file values
      if (config) {
        const config_val = config[key];
        if (config_val) {
          const res = item_schema.validator.from_json(config_val);
          if (res._ == "Ok") {
            result[key] = res.value;
            continue;
          } else {
            throw new Error(`invalid '${key}' config value: ${res.err}`);
          }
        }
      }

      // Default value if all of the above fails
      result[key] = item_schema.default;
    }

    return result;
  };
