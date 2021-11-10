// Heap
// ----

// function heap_merge<A>(a: Heap<A>, b: Heap<A>): Heap<A> {
//   if (a.ctor === "Empty") {
//     return b
//   } else if (b.ctor === "Empty") {
//     return a
//   } else if (a.value[0] > b.value[0]) {
//     return {ctor: "HNode", value: a.value, child: {ctor: "Cons", head: b, tail: a.child}}
//   } else {
//     return {ctor: "HNode", value: b.value, child: {ctor: "Cons", head: a, tail: b.child}}
//   }
// }

// function heap_merge_pairs<A>(pairs: List<Heap<A>>): Heap<A> {
//   switch (pairs.ctor) {
//     case "Nil": return {ctor: "Empty"}
//     case "Cons": switch (pairs.tail.ctor) {
//       case "Nil": return pairs.head
//       case "Cons": return heap_merge(heap_merge(pairs.head, pairs.tail.head), heap_merge_pairs(pairs.tail.tail))
//     }
//   }
// }

// function heap_insert<A>(value: [bigint,A], heap: Heap<A>): Heap<A> {
//   return heap_merge({ctor: "HNode", value: value, child: {ctor: "Nil"}}, heap)
// }

// function heap_head<A>(heap: Heap<A>): [bigint,A] | null {
//   switch (heap.ctor) {
//     case "HNode": return heap.value
//     case "Empty": return null
//   }
// }

// function heap_tail<A>(heap: Heap<A>): Heap<A> {
//   switch (heap.ctor) {
//     case "HNode": return heap_merge_pairs(heap.child)
//     case "Empty": return heap
//   }
// }

//insert :: Ord a => a -> Heap a -> Heap a
//insert x = merge (Heap x [])

//deleteMin :: Ord a => Heap a -> Heap a
//deleteMin (Heap x hs) = mergePairs hs
