import { compose2 } from "./func.ts";
import { JSONObject } from "./json.ts";

export namespace Validators {
  export const int = (x: string): number => {
    const num = Number(x);
    if (x.length == 0 || isNaN(num)) throw new Error(`'${x}' is not an integer.`);
    return num;
  };
  export const int_range = (min?: number, max?: number) =>
    compose2(int)((x: number): number => {
      if (min != undefined && x < min) throw new Error(`'${x}' is less than '${min}'`);
      if (max != undefined && x > max) throw new Error(`'${x}' is greater than ${max}`);
      return x;
    });
  export const nat = compose2(int)((x: number): number => {
    if (x < 0) throw new Error(`'${x}' is not a natural number.`);
    return x;
  });
  export const yes_no = (x: string): boolean => {
    if (["y", "yes", "true"].includes(x)) {
      return true;
    } else if (["n", "no", "false"].includes(x)) {
      return false;
    }
    throw new Error(`'${x}' is not a valid boolean.`);
  };
  // TODO validator of list of addresses
}

// ========== //

export type Validator<T> = (value: string) => T;

export type ConfigItem<T> = {
  description?: string;
  validator: Validator<T>;
  env?: string;
  flag?: string;
  default: T;
};

export type ConfigSchema<M> = {
  [k in keyof M]: ConfigItem<M[k]>;
};

export const config_resolver = <R>(
  schema: ConfigSchema<R>,
) =>
  (
    flags?: Record<string, string>,
    config?: JSONObject,
    get_env?: ((v: string) => string | undefined),
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
          try {
            const res = item_schema.validator(txt);
            result[key] = res;
            continue;
          } catch (err) {
            throw new Error(`invalid '${flag_name}' flag: ${err}`);
          }
        }
      }

      // Handle environment variables
      const env_name = item_schema.env;
      if (get_env && env_name) {
        const env_val = get_env(env_name);
        if (env_val) {
          const txt = env_val.toString();
          try {
            const res = item_schema.validator(txt);
            result[key] = res;
            continue;
          } catch (err) {
            throw new Error(`invalid '${env_name}' environment variable: ${err}`);
          }
        }
      }

      // Handle config file values
      if (config) {
        const config_val = config[key];
        if (config_val) {
          const txt = config_val.toString();
          try {
            const res = item_schema.validator(txt);
            result[key] = res;
            continue;
          } catch (err) {
            throw new Error(`invalid '${key} config value: ${err}`);
          }
        }
      }

      // Default value if all of the above fails
      result[key] = item_schema.default;
    }

    return result;
  };
