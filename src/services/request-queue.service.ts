import logger from '../config/logger';

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  description: string;
}

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxPerMinute = 250;
  private readonly minIntervalMs = 200;

  async enqueue<T>(fn: () => Promise<T>, description = 'unknown'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, description } as QueuedRequest<unknown>);
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      await this.waitIfNeeded();

      const request = this.queue.shift()!;
      const now = Date.now();

      if (now - this.windowStart > 60_000) {
        this.windowStart = now;
        this.requestCount = 0;
      }

      this.requestCount++;
      this.lastRequestTime = now;

      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.processing = false;
  }

  private async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }

    if (this.requestCount >= this.maxPerMinute) {
      const waitMs = 60_000 - (now - this.windowStart) + 1000;
      if (waitMs > 0) {
        logger.warn(`Rate limit approaching, waiting ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        this.windowStart = Date.now();
        this.requestCount = 0;
      }
    }
  }

  get queueSize(): number {
    return this.queue.length;
  }
}

export const crQueue = new RequestQueue();
