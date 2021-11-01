export { compose } from "https://deno.land/x/fae@v1.0.0/compose.ts";

export const break_list = <T>(p: (x: T) => boolean) =>
  (xs: T[]): [T[], T[]] => {
    const len = xs.length;
    let i = 0;
    while (i < len && !p(xs[i])) {
      i++;
    }
    return [xs.slice(0, i), xs.slice(i + 1)];
  };

export const drop_while = <T>(p: (x: T) => boolean) =>
  (xs: T[]): T[] => {
    const len = xs.length;
    let i = 0;
    while (i < len && p(xs[i])) {
      i++;
    }
    return xs.slice(i);
  };

export const default_ = <T>(d: T) => (x: T | undefined | null): T => x == null ? d : x;

export const default_or_convert = <T, R>(
  convert: (x: T) => R,
  valid: (y: R) => boolean = (y: R) => true,
) =>
  (default_val: R) =>
    (x: T | null | undefined): R | null => {
      if (x == null) {
        return default_val;
      }
      const result = convert(x);
      if (!valid(result)) {
        return null;
      }
      return result;
    };
