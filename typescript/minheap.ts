// TODO: replace by own implementation, or a MIT lib
// FROM https://stackoverflow.com/a/66511107/1031791
// FIXME: in many places, "as [number,T]" is used. This will ignore undefineds.

/* MinHeap:
 * A collection of functions that operate on an array 
 * of [key,...data] elements (nodes).
 */

export type Heap<T> = Array<[number, T]>

export function heap_empty<T>() : Heap<T> {
  return []
}

/* sift_down:
  * The node at the given index of the given heap is sifted down in  
  * its subtree until it does not have a child with a lesser value. 
  */
export function heap_sift_down<T>(heap : Heap<T>, i : number = 0, value : [number,T] = heap[i]) {
    if (i < heap.length) {
        let key = value[0]; // Grab the value to compare with
        while (true) {
            // Choose the child with the least value
            let j = i*2+1;
            if (j+1 < heap.length && heap[j][0] > heap[j+1][0]) j++;
            // If no child has lesser value, then we've found the spot!
            if (j >= heap.length || key <= heap[j][0]) break;
            // Copy the selected child node one level up...
            heap[i] = heap[j];
            // ...and consider the child slot for putting our sifted node
            i = j;
        }
        heap[i] = value; // Place the sifted node at the found spot
    }
}

/* heapify:
  * The given array is reordered in-place so that it becomes a valid heap.
  * Elements in the given array must have a [0] property (e.g. arrays). 
  * That [0] value serves as the key to establish the heap order. The rest 
  * of such an element is just payload. It also returns the heap.
  */
export function heap_heapify<T>(heap : Heap<T>) {
    // Establish heap with an incremental, bottom-up process
    for (let i = heap.length>>1; i--; ) heap_sift_down(heap, i);
    return heap;
}

/* pop:
  * Extracts the root of the given heap, and returns it (the subarray).
  * Returns undefined if the heap is empty
  */
export function heap_pop<T>(heap : Heap<T>) {
    // Pop the last leaf from the given heap, and exchange it with its root
    return heap_exchange(heap, heap.pop() as [number,T]); // Returns the old root
}

/* exchange:
  * Replaces the root node of the given heap with the given node, and 
  * returns the previous root. Returns the given node if the heap is empty.
  * This is similar to a call of pop and push, but is more efficient.
  */
export function heap_exchange<T>(heap : Heap<T>, value : [number,T]) {
    if (!heap.length) return value;
    // Get the root node, so to return it later
    let oldValue = heap[0] as [number,T];
    // Inject the replacing node using the sift-down process
    heap_sift_down(heap, 0, value);
    return oldValue;
}

/* push:
  * Inserts the given node into the given heap. It returns the heap.
  */
export function heap_push<T>(heap : Heap<T>, value : [number,T]) {
    let key = value[0],
        // First assume the insertion spot is at the very end (as a leaf)
        i = heap.length,
        j;
    // Then follow the path to the root, moving values down for as long 
    // as they are greater than the value to be inserted
    while ((j = (i-1)>>1) >= 0 && key < heap[j][0]) {
        heap[i] = heap[j];
        i = j;
    }
    // Found the insertion spot
    heap[i] = value;
    return heap;
}
