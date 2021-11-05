export type Ok<T> = { _: "Ok"; value: T };
export type Err<E> = { _: "Err"; err: E };

type Fn<E, T, R> = (x: T) => Result<R, E>;
type Then<E, T> = <R>(fn: Fn<E, T, R>) => Result<R, E>;

type Base<E, T> = {
  then: Then<E, T>;
};

export type Result<T, E> = (Ok<T> | Err<E>) & Base<E, T>;

export const then_ = <T, R, E>(fn: (x: T) => Result<R, E>) =>
  (r: Result<T, E>): Result<R, E> => {
    switch (r._) {
      case "Ok":
        return fn(r.value);
      case "Err":
        return Err(r.err);
    }
    // new Error("FAILURE");
  };

export function then<E, R, T>(
  this: Result<T, E>,
  fn: Fn<E, T, R>,
): Result<R, E> {
  return then_(fn)(this);
}

const base = {
  then,
};

export const Ok = <T, E>(value: T): Result<T, E> => ({ ...base, _: "Ok", value: value });

export const Err = <T, E>(err: E): Result<T, E> => ({ ...base, _: "Err", err: err });

export default Result;
