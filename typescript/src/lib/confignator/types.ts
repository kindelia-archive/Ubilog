import { JSONValue } from '../json.ts'
import * as R from '../functional/result.ts'

export type SResult<T> = R.Result<T, string>;

export type Quadruple<T> = [T, T, T, T];
export type Sextuple<T> = [T, T, T, T, T, T];

export type Octets = Quadruple<number>;
export type Segments = Sextuple<number>;

export type IPv4 = { _: "IPv4"; octets: Octets };
export type IPv6 = { _: "IPv6"; segments: Segments };
export type Address = IPv4 | IPv6;

export interface Validator<T> {
  from_string(v: string): SResult<T>;
  from_json(v: JSONValue): SResult<T>;
}
