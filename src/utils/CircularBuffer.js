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
    this.head = 0; // Points to the next write position
    this.tail = 0; // Points to the oldest item
    this.size = 0;
  }

  /**
   * Appends an item to the buffer. Overwrites the oldest item if full.
   * @param {*} item - Data frame to push.
   */
  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full; advance tail to drop oldest entry
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Retrieves an item relative to current head index (0 = newest item).
   * @param {number} offset - Offset backwards from newest item.
   * @returns {*} Item stored at index, or null if offset is out of bounds.
   */
  get(offset = 0) {
    if (offset < 0 || offset >= this.size) return null;
    const index = (this.head - 1 - offset + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Removes and discards all items up to and including the specified sequence/tick number.
   * @param {function(item): boolean} predicate - Callback returning true for items to discard.
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

  /**
   * Resets the buffer state without reallocating array memory.
   */
  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.buffer.fill(null);
  }
}