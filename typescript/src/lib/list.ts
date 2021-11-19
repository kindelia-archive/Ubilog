export type Cons<A> = { ctor: "Cons"; head: A; tail: List<A> };
export type Nil = { ctor: "Nil" };
export type List<A> = Cons<A> | Nil;

export const empty: Nil = { ctor: "Nil" };

export function cons<A>(head: A, tail: List<A>): List<A> {
  return { ctor: "Cons", head, tail };
}

export function nil<A>(): List<A> {
  return { ctor: "Nil" };
}

export function from_array<A>(array: A[], index = 0): List<A> {
  if (index === array.length) {
    return nil();
  } else {
    return cons(array[index], from_array(array, index + 1));
  }
}

export function to_array<A>(list: List<A>): Array<A> {
  const array = [];
  while (list.ctor !== "Nil") {
    array.push(list.head);
    list = list.tail;
  }
  return array;
}
