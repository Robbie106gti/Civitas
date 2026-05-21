/** Map with max size; evicts least-recently-used entry on insert. */
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    private readonly maxSize: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value as K;
      const evicted = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.onEvict?.(oldest, evicted);
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    for (const [key, value] of this.map) {
      this.onEvict?.(key, value);
    }
    this.map.clear();
  }
}
