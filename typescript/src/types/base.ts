declare const tag: unique symbol;
export type Tag<T> = { readonly [tag]: T };

export type Dict<T> = Record<string, T>;
