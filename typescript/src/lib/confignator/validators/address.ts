import { break_list, default_or_convert, drop_while } from "../../functional/mod.ts";
import * as R from "../../functional/result.ts";

import { Address, Octuple, Quadruple, SResult, Validator } from "../types.ts";
import { BaseValidator } from "./base.ts";

const valid_port = (port: number) => !isNaN(port) && port >= 1 && port <= 0xffff;
const valid_octet = (octet: number) => !isNaN(octet) && octet >= 0 && octet <= 0xff;
const valid_segment = (segment: number) => !isNaN(segment) && segment >= 0 && segment <= 0xffff;

function check_len_4<T>(arr: T[]): arr is Quadruple<T> {
  return arr.length === 4;
}
function check_len_8<T>(arr: T[]): arr is Octuple<T> {
  return arr.length === 8;
}

export const address_validator: Validator<[Address, number?]> = new BaseValidator<
  [Address, number?]
>(
  (address_txt: string): SResult<[Address, number?]> => {
    address_txt = address_txt.trim();

    const ip_port_re = /((?:\d{1,3}(?:\.\d{1,3}){3,3})|(?:\[[0-9a-fA-F\:]+\]))(?:\:(\d+))?/;
    const match = address_txt.match(ip_port_re);
    if (match == null) {
      return R.Err(`'${address_txt}' is not a valid address`);
    }
    const ip_txt = match[1];
    const port_txt = match[2];

    let port: number | undefined;
    if (port_txt !== undefined) {
      port = Number(port_txt);
      if (!valid_port(port)) {
        return R.Err(`'${port_txt}' is not a valid port`);
      }
    }

    if (ip_txt[0] == "[") {
      // IPv6 address
      // TODO: dual (ipv4) format
      const txt = ip_txt.slice(1, -1);
      const segments_txt = txt.split(":");

      const is_empty = (x: string): boolean => !x;
      let [prefix_txt, suffix_txt] = break_list(is_empty)(segments_txt);
      prefix_txt = drop_while(is_empty)(prefix_txt);
      suffix_txt = drop_while(is_empty)(suffix_txt);

      const prefix_segments = prefix_txt.map((x) => parseInt(x, 16));
      const suffix_segments = suffix_txt.map((x) => parseInt(x, 16));
      const len = prefix_segments.length + suffix_segments.length;
      const fill: number[] = Array(8 - len).fill(0);
      const segments = prefix_segments.concat(fill).concat(suffix_segments);
      if (!check_len_8(segments)) {
        return R.Err(`'${ip_txt}' has more than 6 segments`);
      }
      if (segments.some((x) => !valid_segment(x))) {
        return R.Err(`invalid address: ${ip_txt}`);
      }
      return R.Ok([{ _: "IPv6", segments: segments }, port]);
    } else {
      const octets = ip_txt.split(".").map(Number);
      if (!check_len_4(octets)) {
        return R.Err(`'${ip_txt}' has more than 4 octets`);
      }
      if (octets.some((x) => !valid_octet(x))) {
        return R.Err(`invalid address: ${ip_txt}`);
      }
      return R.Ok([{ _: "IPv4", octets: octets }, port]);
    }
  },
);
