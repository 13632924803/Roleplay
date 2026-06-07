export interface StreamQueue<T> {
  push: (value: T) => void;
  close: () => void;
  fail: (error: Error) => void;
  iterable: AsyncIterable<T>;
}

/**
 * Convert a push-based callback stream into a pull-based async iterable
 * without polling. Producers call push/close/fail; the consumer awaits the
 * next value via a promise that resolves the moment something is pushed.
 */
export function createStreamQueue<T>(): StreamQueue<T> {
  const buffer: T[] = [];
  let done = false;
  let error: Error | null = null;
  let wake: (() => void) | null = null;

  const signal = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  async function* gen(): AsyncIterable<T> {
    while (true) {
      while (buffer.length) yield buffer.shift() as T;
      if (error) throw error;
      if (done) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return {
    push: (value) => {
      buffer.push(value);
      signal();
    },
    close: () => {
      done = true;
      signal();
    },
    fail: (e) => {
      error = e;
      signal();
    },
    iterable: gen(),
  };
}
