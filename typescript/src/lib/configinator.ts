import * as R from "./func/result.ts";

import { compose2 } from "./func/mod.ts";
import { JSONObject, JSONValue } from "./json.ts";

type SResult<T> = R.Result<T, string>;

interface Validator<T> {
  from_string: (value: string) => SResult<T>;
  from_json?: (value: JSONValue) => SResult<T>;
}

const compose_sresult_arrows = <A, B>(f1: (v: A) => SResult<B>) =>
  <C>(f2: (v: B) => SResult<C>) => (x: A) => f1(x).then(f2);

// TODO: function to compose validators
// TODO: list validator
// TODO: `from_json` fallbacks to string parser

// TODO: move Validators to another file
export namespace Validators {
  export const yes_no: Validator<boolean> = {
    from_string: (x: string) => {
      if (["y", "yes", "true"].includes(x)) {
        return R.Ok(true);
      } else if (["n", "no", "false"].includes(x)) {
        return R.Ok(false);
      }
      return R.Err(`'${x}' is not a valid boolean.`);
    },
    from_json: (x: JSONValue) => {
      if (typeof x == "boolean") {
        return R.Ok(x);
      }
      return R.Err(`'${x}' is not a valid boolean.`);
    },
  };

  // export const list = <T>(inner: Validator<T>): Validator<T[]> => ({
  //   // TODO: implement list checking
  //   from_string: (x: string) => R.Ok(x.split(",").map(inner.from_string)),
  // });

  export const int: Validator<number> = {
    from_string: (x: string): SResult<number> => {
      const num = Number(x);
      if (x.length == 0 || isNaN(num)) {
        return R.Err(`'${x}' is not an integer.`);
      }
      return R.Ok(num);
    },
  };

  export const bigint: Validator<bigint> = {
    from_string: (x: string): SResult<bigint> => {
      const r_err: SResult<bigint> = R.Err(`'${x} is not an integer.`);
      if (x.length == 0) return r_err;
      try {
        const num = BigInt(x); // TODO: try/catch
        return R.Ok(num);
      } catch (err) {
        return r_err;
      }
    },
  };

  export const int_range = (min?: number, max?: number): Validator<number> => ({
    from_string: compose_sresult_arrows(int.from_string)(
      (x: number): SResult<number> => {
        if (min != undefined && x < min) {
          return R.Err(`'${x}' is less than '${min}'`);
        }
        if (max != undefined && x > max) {
          return R.Err(`'${x}' is greater than ${max}`);
        }
        return R.Ok(x);
      },
    ),
  });

  export const bigint_range = (min?: bigint, max?: bigint): Validator<bigint> => ({
    from_string: compose_sresult_arrows(bigint.from_string)(
      (x: bigint): SResult<bigint> => {
        if (min != undefined && x < min) {
          return R.Err(`'${x}' is less than '${min}'`);
        }
        if (max != undefined && x > max) {
          return R.Err(`'${x}' is greater than ${max}`);
        }
        return R.Ok(x);
      },
    ),
  });
}

// ========== //

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
          // TODO check error
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
            throw new Error(`invalid '${env_name}' environment variable value: ${res.err}`);
          }
        }
      }

      // Handle config file values
      if (config) {
        const config_val = config[key];
        if (config_val) {
          const txt = config_val.toString();
          const res = item_schema.validator.from_string(txt); // TODO: `from_json`
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
