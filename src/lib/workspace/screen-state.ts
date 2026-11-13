/** Working context owned by one authenticated workspace session. */
export class ScreenState {
  private values = new Map<string, unknown>();
  private listeners = new Set<() => void>();

  get(key: string): unknown {
    return this.values.get(key);
  }

  set(key: string, value: unknown) {
    this.values.set(key, value);
    this.listeners.forEach((listener) => listener());
  }

  clear(prefix?: string) {
    if (prefix === undefined) {
      this.values.clear();
    } else {
      for (const key of this.values.keys()) {
        if (key.startsWith(prefix)) this.values.delete(key);
      }
    }
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
