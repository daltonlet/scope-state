import type { StorageAdapter } from '../types';
import { getDefaultAdapter, createCachedAdapter } from './adapters';

/**
 * The active storage adapter used by the persistence layer.
 *
 * Defaults to a localStorage adapter in browsers or a memory adapter in SSR/Node.
 * Can be overridden via `configure()` or `setStorageAdapter()`.
 *
 * All adapters are automatically wrapped in an in-memory cache layer
 * to prevent hydration mismatches and provide instant reads.
 */
let storageAdapter: (StorageAdapter & { warmCache?(): Promise<void> }) | null = null;

/**
 * Get the current storage adapter, lazily initializing the default if needed.
 */
export function getStorageAdapter(): StorageAdapter & { warmCache?(): Promise<void> } {
  if (!storageAdapter) {
    // Default adapters (localStorage, memory) are already fast/sync,
    // so we don't need to wrap them in a cache — they ARE the cache.
    storageAdapter = getDefaultAdapter();
  }
  return storageAdapter;
}

/**
 * Set a custom storage adapter.
 *
 * Synchronous adapters (like `createLocalStorageAdapter` and `createMemoryAdapter`)
 * are stored directly — this enables **synchronous hydration** during `configure()`,
 * so components render with persisted values on the very first render (no flash of
 * default values).
 *
 * For asynchronous adapters (AsyncStorage, MMKV with async API), wrap them in
 * `createCachedAdapter()` before passing to `configure()`. The cache layer provides
 * instant reads after the initial warm-up.
 *
 * @param adapter - A StorageAdapter implementation
 */
export function setStorageAdapter(adapter: StorageAdapter): void {
  storageAdapter = adapter as StorageAdapter & { warmCache?(): Promise<void> };
}

/**
 * Reset the storage adapter to the environment default.
 */
export function resetStorageAdapter(): void {
  storageAdapter = null;
}
