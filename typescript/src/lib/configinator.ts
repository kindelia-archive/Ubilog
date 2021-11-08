import * as R from "./functional/result.ts";
import { JSONObject, JSONValue } from "./json.ts";

type SResult<T> = R.Result<T, string>;

interface Validator<T> {
  from_string(v: string): SResult<T>;
  from_json(v: JSONValue): SResult<T>;
}

class BaseValidator<T> implements Validator<T> {
  private readonly fn_from_string: (value: string) => SResult<T>;
  private readonly fn_from_json?: (value: JSONValue) => SResult<T>;
  constructor(
    from_string: (v: string) => SResult<T>,
    from_json?: (v: JSONValue) => SResult<T>,
  ) {
    this.fn_from_string = from_string;
    this.fn_from_json = from_json;
  }
  from_string(v: string): SResult<T> {
    return this.fn_from_string(v);
  }
  from_json(v: JSONValue): SResult<T> {
    if (this.fn_from_json !== undefined) {
      return this.fn_from_json(v);
    } else {
      if (typeof v === "string") {
        return this.from_string(v);
      }
      return R.Err("is not a string");
    }
  }

  compose<Re>(fn: (x: T) => SResult<Re>): Validator<Re> {
    return new ComposedValidator<T, Re>(this, fn);
  }
}

class ComposedValidator<B, T> implements Validator<T> {
  private readonly base_validator: Validator<B>;
  private readonly fn: (x: B) => SResult<T>;
  constructor(base_validator: Validator<B>, fn: (x: B) => SResult<T>) {
    this.base_validator = base_validator;
    this.fn = fn;
  }
  from_string(v: string) {
    return this.base_validator.from_string(v).then(this.fn);
  }
  from_json(v: JSONValue) {
    return this.base_validator.from_json(v).then(this.fn);
  }
}

const compose_sresult_arrows = <A, B>(f1: (v: A) => SResult<B>) =>
  <C>(f2: (v: B) => SResult<C>) => (x: A) => f1(x).then(f2);

// TODO: function to compose validators
// TODO: list validator
// TODO: `from_json` fallbacks to string parser

// TODO: move Validators to another file

export namespace Validators {
  export const yes_no = new BaseValidator<boolean>(
    (x: string) => {
      if (["y", "yes", "true"].includes(x)) {
        return R.Ok(true);
      } else if (["n", "no", "false"].includes(x)) {
        return R.Ok(false);
      }
      return R.Err(`'${x}' is not a valid boolean`);
    },
    (x: JSONValue) => {
      if (typeof x == "boolean") {
        return R.Ok(x);
      }
      return R.Err(`'${x}' is not a valid boolean`);
    },
  );

  // export const list = <T>(inner: Validator<T>): Validator<T[]> => ({
  //   // TODO: implement list checking
  //   from_string: (x: string) => R.Ok(x.split(",").map(inner.from_string)),
  // });

  export const int = new BaseValidator<number>(
    // TODO: check integerness
    (x: string): SResult<number> => {
      const num = Number(x);
      if (x.length == 0 || isNaN(num)) {
        return R.Err(`'${x}' is not an integer`);
      }
      return R.Ok(num);
    },
    (x: JSONValue): SResult<number> => {
      if (typeof x == "number") {
        return R.Ok(x);
      }
      return R.Err(`'${x}' is not a valid number`);
    },
  );

  export const bigint = new BaseValidator<bigint>(
    (x: string): SResult<bigint> => {
      const r_err: SResult<bigint> = R.Err(`'${x} is not an integer.`);
      if (x.length == 0) return r_err;
      try {
        const num = BigInt(x);
        return R.Ok(num);
      } catch (err) {
        return r_err;
      }
    },
    (x: JSONValue): SResult<bigint> => {
      if (typeof x == "number") {
        // TODO: check integerness
        return R.Ok(BigInt(x));
      }
      return R.Err(`'${x}' is not a valid number)`);
    },
  );

  export const int_range = (min?: number, max?: number): Validator<number> =>
    int.compose((x: number): SResult<number> => {
      if (min != undefined && x < min) {
        return R.Err(`'${x}' is less than '${min}'`);
      }
      if (max != undefined && x > max) {
        return R.Err(`'${x}' is greater than ${max}`);
      }
      return R.Ok(x);
    });

  export const bigint_range = (min?: bigint, max?: bigint): Validator<bigint> =>
    bigint.compose((x: bigint): SResult<bigint> => {
      if (min != undefined && x < min) {
        return R.Err(`'${x}' is less than '${min}'`);
      }
      if (max != undefined && x > max) {
        return R.Err(`'${x}' is greater than ${max}`);
      }
      return R.Ok(x);
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
