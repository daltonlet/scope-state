import type { StorageAdapter } from '../types';

/**
 * Creates a localStorage-based storage adapter.
 *
 * This is the default adapter used in browser environments.
 * All methods are synchronous (localStorage is synchronous by nature).
 *
 * @param prefix - Optional key prefix to namespace all stored keys. Defaults to 'scope_state:'.
 * @returns A StorageAdapter backed by window.localStorage
 *
 * @example
 * import { configure, createLocalStorageAdapter } from 'scope-state';
 *
 * configure({
 *   initialState: { ... },
 *   persistence: {
 *     enabled: true,
 *     storageAdapter: createLocalStorageAdapter('myapp:'),
 *   },
 * });
 */
export function createLocalStorageAdapter(prefix: string = 'scope_state:'): StorageAdapter {
  return {
    getItem(key: string): string | null {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },

    setItem(key: string, value: string): void {
      try {
        localStorage.setItem(prefix + key, value);
      } catch (e) {
        console.error(`[scope-state] localStorage.setItem failed for key "${key}":`, e);
      }
    },

    removeItem(key: string): void {
      try {
        localStorage.removeItem(prefix + key);
      } catch (e) {
        console.error(`[scope-state] localStorage.removeItem failed for key "${key}":`, e);
      }
    },

    keys(): string[] {
      try {
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            allKeys.push(key.slice(prefix.length));
          }
        }
        return allKeys;
      } catch {
        return [];
      }
    },

    clear(): void {
      try {
        // Only remove keys with our prefix, not the entire localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (e) {
        console.error('[scope-state] localStorage.clear failed:', e);
      }
    },
  };
}

/**
 * Creates an in-memory storage adapter.
 *
 * Useful for:
 * - Server-side rendering (SSR) where no persistent storage is available
 * - Testing environments
 * - Ephemeral state that should not survive page reloads
 *
 * All methods are synchronous.
 *
 * @returns A StorageAdapter backed by an in-memory Map
 *
 * @example
 * import { configure, createMemoryAdapter } from 'scope-state';
 *
 * configure({
 *   initialState: { ... },
 *   persistence: {
 *     enabled: true,
 *     storageAdapter: createMemoryAdapter(),
 *   },
 * });
 */
export function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      store.set(key, value);
    },

    removeItem(key: string): void {
      store.delete(key);
    },

    keys(): string[] {
      return Array.from(store.keys());
    },

    clear(): void {
      store.clear();
    },
  };
}

/**
 * Wraps any StorageAdapter in an in-memory cache layer.
 *
 * This is automatically applied to all adapters by the persistence system.
 * The cache prevents hydration mismatches by ensuring:
 *
 * 1. **On startup**: the cache is empty, so reads return `null` and the app
 *    renders with `initialState` (matching SSR output).
 * 2. **After hydration**: data is pulled from the backing store into the cache,
 *    and components re-render with persisted data.
 * 3. **On writes**: both the cache and the backing store are updated, so
 *    subsequent reads are instant from memory.
 *
 * @param backingAdapter - The underlying storage adapter (MMKV, AsyncStorage, etc.)
 * @returns A StorageAdapter with an in-memory cache in front of the backing store
 */
export function createCachedAdapter(backingAdapter: StorageAdapter): StorageAdapter & { warmCache(): Promise<void> } {
  const cache = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      // Always read from the in-memory cache (instant, sync)
      return cache.get(key) ?? null;
    },

    setItem(key: string, value: string) {
      // Write-through: update cache immediately, then persist to backing store
      cache.set(key, value);
      return backingAdapter.setItem(key, value);
    },

    removeItem(key: string) {
      cache.delete(key);
      return backingAdapter.removeItem(key);
    },

    keys(): string[] {
      // Return keys from cache (this is the source of truth after warmup)
      return Array.from(cache.keys());
    },

    clear() {
      cache.clear();
      if (backingAdapter.clear) {
        return backingAdapter.clear();
      }
    },

    /**
     * Pre-populate the in-memory cache from the backing store.
     * Called automatically during hydration. After this completes,
     * all reads are served instantly from memory.
     */
    async warmCache(): Promise<void> {
      const keys = await backingAdapter.keys();
      for (const key of keys) {
        const value = await backingAdapter.getItem(key);
        if (value !== null) {
          cache.set(key, value);
        }
      }
    },
  };
}

/**
 * Returns the default storage adapter for the current environment.
 *
 * - In browsers: returns a localStorage adapter
 * - In non-browser environments (Node, SSR): returns a memory adapter
 */
export function getDefaultAdapter(): StorageAdapter {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return createLocalStorageAdapter();
  }
  return createMemoryAdapter();
}
