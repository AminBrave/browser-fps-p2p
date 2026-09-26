// src/utils/CircularBuffer.js

/**
 * Fixed-size Circular Buffer (Ring Buffer) for storing historical client inputs
 * and predicted entity states for client-side prediction and server reconciliation.
 */
export class CircularBuffer {
  /**
   * @param {number} capacity - Maximum number of items the buffer can hold.
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  /**
   * Appends an item to the buffer. Overwrites the oldest item if full.
   * @param {*} item
   */
  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Peek at the oldest item without removing it.
   * @returns {*|null}
   */
  peek() {
    if (this.size === 0) return null;
    return this.buffer[this.tail];
  }

  /**
   * Remove and return the oldest item.
   * @returns {*|null}
   */
  shift() {
    if (this.size === 0) return null;
    const item = this.buffer[this.tail];
    this.buffer[this.tail] = null;
    this.tail = (this.tail + 1) % this.capacity;
    this.size--;
    return item;
  }

  /**
   * Retrieves an item relative to current head index (0 = newest item).
   * @param {number} offset
   * @returns {*|null}
   */
  get(offset = 0) {
    if (offset < 0 || offset >= this.size) return null;
    const index = (this.head - 1 - offset + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Returns a chronological array (oldest → newest) of all items.
   * Used by ClientReconcileSystem for re-simulation.
   * @returns {Array}
   */
  toArray() {
    const result = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.tail + i) % this.capacity;
      result.push(this.buffer[index]);
    }
    return result;
  }

  /**
   * Removes and discards all items for which predicate returns true (from oldest).
   * @param {function(item): boolean} predicate
   */
  discardUpTo(predicate) {
    while (this.size > 0) {
      const oldestItem = this.buffer[this.tail];
      if (predicate(oldestItem)) {
        this.buffer[this.tail] = null;
        this.tail = (this.tail + 1) % this.capacity;
        this.size--;
      } else {
        break;
      }
    }
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.buffer.fill(null);
  }
}
