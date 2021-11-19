import { JSONValue } from "../json.ts";
import * as R from "../functional/result.ts";

export type GetEnv = (name: string) => string | undefined;

export type SResult<T> = R.Result<string, T>;

export interface Validator<T> {
  from_string(v: string): SResult<T>;
  from_json(v: JSONValue): SResult<T>;
}
