export type Ok<T> = { _: "Ok"; value: T };
export type Err<E> = { _: "Err"; err: E };

export type Result<T, E> = (Ok<T> | Err<E>) & ResultBase<E, T>;

type ResultBase<E, T> = {
  then: ThenFn<E, T>;  // TODO: should this be called `map` ?
};
type KleisliFn<E, T, R> = (x: T) => Result<R, E>;
type ThenFn<E, T> = <R>(fn: KleisliFn<E, T, R>) => Result<R, E>;

export const Ok = <T, E>(value: T): Result<T, E> => ({ ...base, _: "Ok", value: value });
export const Err = <T, E>(err: E): Result<T, E> => ({ ...base, _: "Err", err: err });

export default Result;

// Functions

const base = {
  then,
};

const map = <T, R, E>(fn: (x: T) => Result<R, E>) =>
  (r: Result<T, E>): Result<R, E> => {
    switch (r._) {
      case "Ok":
        return fn(r.value);
      case "Err":
        return Err(r.err);
    }
  };

export function then<E, T, R>(
  this: Result<T, E>,
  fn: KleisliFn<E, T, R>,
): Result<R, E> {
  return map(fn)(this);
}
