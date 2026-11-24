// Small in-memory sliding-window rate limiter (single-process demo deployment).
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Returns true when allowed (and records the hit). */
  hit(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  reset() {
    this.hits.clear();
  }
}

type G = typeof globalThis & { __asLimiters?: Record<string, RateLimiter> };
const g = globalThis as G;
export function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  g.__asLimiters ??= {};
  g.__asLimiters[name] ??= new RateLimiter(limit, windowMs);
  return g.__asLimiters[name];
}
