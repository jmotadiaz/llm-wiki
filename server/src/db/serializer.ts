/**
 * Serializes writes to a better-sqlite3 database to prevent SQLITE_BUSY
 * when multiple concurrent operations attempt mutations.
 *
 * better-sqlite3 in WAL mode supports concurrent reads safely, but
 * concurrent writes on the same connection raise SQLITE_BUSY. This
 * singleton queues write operations and executes them one at a time.
 *
 * In single-threaded contexts the overhead is negligible: when the queue
 * is empty, fn() is called immediately.
 */
class DbWriteSerializer {
  private queue: Array<{
    fn: () => unknown;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  private writing = false;

  run<T>(fn: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => unknown,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.writing || this.queue.length === 0) return;

    const next = this.queue.shift()!;
    this.writing = true;

    try {
      const result = next.fn();
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      this.writing = false;
      this.drain();
    }
  }
}

export const dbWriteSerializer = new DbWriteSerializer();
