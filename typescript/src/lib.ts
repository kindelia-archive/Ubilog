export const default_ = <T>(d: T) => (x: T | undefined | null): T => x == null ? d : x;

export const default_or_convert =
  <T, R>(convert: (x: T) => R, valid: (y: R) => boolean = (y: R) => true) =>
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
