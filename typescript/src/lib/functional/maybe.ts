export type Just<T> = { _: "Just"; value: T };
export type Err = { _: "Nothing" };

export type Maybe<T> = (Just<T> | Err) & MaybeBase<T>;

export type MaybeBase<T> = {
    then: ThenFn<T>,  // TODO: should this be called `map` ?
}
type KleisliFn<T, R> = (x: T) => Maybe<R>;
type ThenFn<T> = <R>(fn: KleisliFn<T, R>) => Maybe<R>;

export const Just = <T>(value: T): Maybe<T> => ({ ...base, _: "Just", value: value });
export const Nothing = <T>(): Maybe<T> => ({ ...base, _: "Nothing" });

// Functions

const base = {
  then,
};

export const map = <T, R>(fn: (x: T) => Maybe<R>) =>
  (r: Maybe<T>): Maybe<R> => {
    switch (r._) {
      case "Just":
        return fn(r.value);
      case "Nothing":
        return Nothing(); 
    }
  };

export function then<T, R>(
  this: Maybe<T>,
  fn: KleisliFn<T, R>,
): Maybe<R> {
  return map(fn)(this);
}
