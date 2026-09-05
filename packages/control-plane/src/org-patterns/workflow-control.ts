/** Abort-aware waits remove their listener on both success and failure. */
export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new Error('Workflow cancelled'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Acquire only for leaves; containers never hold a permit while awaiting children. */
export class LeafSemaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly limit: number) {}

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.active >= this.limit) {
      let grant!: () => void;
      const granted = new Promise<void>((resolve) => {
        grant = resolve;
      });
      this.waiters.push(grant);
      try {
        await abortable(granted, signal);
      } catch (error) {
        const index = this.waiters.indexOf(grant);
        if (index >= 0) this.waiters.splice(index, 1);
        else this.release(); // A permit was handed to this waiter during abort.
        throw error;
      }
    } else this.active++;
    try {
      signal?.throwIfAborted();
      return await work();
    } finally {
      this.release();
    }
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }
}
