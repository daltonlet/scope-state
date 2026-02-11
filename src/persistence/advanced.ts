
import { monitoringConfig, persistenceConfig } from '../config';
import { getStorageAdapter } from './storage';

// Storage constants
const PERSISTED_STATE_KEY = 'persisted_state';
const PERSISTENCE_CONFIG_KEY = 'persistence_config';

// Global store references — set by configure()
// The raw store is used for reading/serializing state during persistence.
// The proxy is used for writing during hydration so that set traps fire
// and components re-render with the hydrated values.
let globalStoreRef: any = null;
let globalProxyRef: any = null;

// Flag to suppress persistence during hydration — hydration writes through
// the proxy (to trigger re-renders), which also triggers the persistence
// callback. We skip that to avoid wastefully re-persisting the same data.
let isHydrating = false;

// Flag to block persistence until the first hydration has completed.
// This prevents React effects that fire between the initial render and
// hydration from persisting default values over the correct stored data.
let hasHydrated = false;

/**
 * Set the global store reference (raw object) for serialization during persistence.
 * Called internally by configure().
 */
export function setGlobalStoreRef(store: any): void {
  globalStoreRef = store;
}

/**
 * Set the global proxy reference for hydration writes.
 * Writing through the proxy ensures set traps fire and components re-render.
 * Called internally by configure() after the proxy is created.
 */
export function setGlobalProxyRef(proxy: any): void {
  globalProxyRef = proxy;
}

// Batch persistence state — stores persistence *roots* (e.g. "user", "todos"),
// not individual leaf paths like "user.preferences.theme".
const persistenceBatch = {
  roots: new Set<string>(),
  timeoutId: null as NodeJS.Timeout | null,
  isPersisting: false,
};

// Performance timing helpers
function logTimestamp(action: string): number {
  if (!monitoringConfig.enabled || !monitoringConfig.logTimings) return 0;
  const now = performance.now();
  console.log(`⏱️ [${now.toFixed(2)}ms] ${action}`);
  return now;
}

function logTimingEnd(action: string, startTime: number): number {
  if (!monitoringConfig.enabled || !monitoringConfig.logTimings) return 0;
  const now = performance.now();
  const duration = now - startTime;
  console.log(`⏱️ [${now.toFixed(2)}ms] ${action} completed in ${duration.toFixed(2)}ms`);
  return duration;
}

/**
 * Determine the "persistence root" for a given change path.
 *
 * When a deep property changes (e.g. "user.preferences.theme"), we don't
 * want to create a separate storage entry for every leaf — that leads to
 * fragmented, inconsistent data. Instead we figure out the appropriate
 * root-level slice and persist the entire object at that level.
 *
 * Rules:
 * 1. If `persistenceConfig.paths` lists specific paths, use the matching
 *    configured path as the root (e.g. if configured with "user.preferences",
 *    a change to "user.preferences.theme" persists at "user.preferences").
 * 2. Otherwise, use the first segment of the path (top-level key),
 *    so "user.preferences.theme" → "user".
 */
function getPersistenceRoot(changePath: string): string {
  const configuredPaths = persistenceConfig.paths;

  if (configuredPaths && configuredPaths.length > 0) {
    // Find the configured path that is a parent of (or equal to) the change path
    for (const configPath of configuredPaths) {
      if (changePath === configPath || changePath.startsWith(configPath + '.')) {
        return configPath;
      }
    }
    // The change path might itself be a parent of a configured path — in that
    // case we persist at the change path's top-level key
  }

  // Default: persist at the first-level key (e.g. "user", "todos", "counters")
  return changePath.split('.')[0];
}

/**
 * Check if a change path should be persisted (respects blacklist + paths config).
 */
function shouldPersistPath(path: string): boolean {
  if (!persistenceConfig.enabled) return false;

  // Check if path (or any of its ancestors) is blacklisted
  const segments = path.split('.');
  for (let i = 1; i <= segments.length; i++) {
    const ancestor = segments.slice(0, i).join('.');
    if (persistenceConfig.blacklist.some(b => b === ancestor)) {
      return false;
    }
  }

  // If paths array is empty/undefined, persist everything not blacklisted
  if (!persistenceConfig.paths || persistenceConfig.paths.length === 0) return true;

  // Check if path falls under one of the configured persistence paths
  return persistenceConfig.paths.some(persistedPath =>
    path === persistedPath ||
    path.startsWith(`${persistedPath}.`) ||
    persistedPath.startsWith(`${path}.`));
}

/**
 * Add a changed path to the persistence batch.
 *
 * The path is converted to its persistence root before being added,
 * so multiple changes within the same slice (e.g. "user.name" and
 * "user.preferences.theme") are deduplicated into a single "user" persist.
 */
export function addToPersistenceBatch(path: string[]): void {
  if (!persistenceConfig.enabled || isHydrating || !hasHydrated) return;

  const pathKey = path.join('.');
  if (shouldPersistPath(pathKey)) {
    const root = getPersistenceRoot(pathKey);
    persistenceBatch.roots.add(root);
    schedulePersistenceBatch();
  }
}

/**
 * Schedule batch persistence with debounce
 */
function schedulePersistenceBatch(): void {
  if (persistenceBatch.timeoutId) {
    clearTimeout(persistenceBatch.timeoutId);
  }

  persistenceBatch.timeoutId = setTimeout(() => {
    persistenceBatch.timeoutId = null;
    processPersistenceBatch();
  }, persistenceConfig.batchDelay);
}

/**
 * Process all roots in the batch — persist each root-level slice.
 */
function processPersistenceBatch(): void {
  if (typeof window === 'undefined') return;

  if (persistenceBatch.isPersisting || persistenceBatch.roots.size === 0) {
    return;
  }

  persistenceBatch.isPersisting = true;

  let startTime = 0;
  if (monitoringConfig.enabled && monitoringConfig.logPersistence) {
    startTime = logTimestamp(`💾 Batch persisting ${persistenceBatch.roots.size} slices`);
  }

  try {
    const roots = Array.from(persistenceBatch.roots);
    persistenceBatch.roots.clear();

    roots.forEach(root => {
      persistSlice(root);
    });
  } catch (e) {
    console.error('Error during batch persistence:', e);
  } finally {
    persistenceBatch.isPersisting = false;

    // If new roots were added during processing, schedule another batch
    if (persistenceBatch.roots.size > 0) {
      schedulePersistenceBatch();
    }

    if (monitoringConfig.enabled && monitoringConfig.logPersistence && startTime > 0) {
      logTimingEnd('Batch persistence', startTime);
    }
  }
}

/**
 * Persist a single slice of the store to storage.
 *
 * @param rootPath - Dot-separated path like "user" or "user.preferences".
 *                   The entire value at this path is serialized as one entry.
 */
function persistSlice(rootPath: string): void {
  if (!persistenceConfig.enabled) return;
  if (!globalStoreRef) {
    console.warn('Cannot persist state without store reference. Call configure() first.');
    return;
  }

  const adapter = getStorageAdapter();

  // Navigate to the value at this path in the store
  const segments = rootPath.split('.');
  let value: any = globalStoreRef;
  for (const segment of segments) {
    if (value === undefined || value === null) return;
    value = value[segment];
  }

  if (value === undefined) return;

  try {
    const serialized = JSON.stringify(value);
    const storageKey = `${PERSISTED_STATE_KEY}_${rootPath}`;
    const result = adapter.setItem(storageKey, serialized);
    if (result && typeof (result as any).catch === 'function') {
      (result as Promise<void>).catch(e => {
        console.error(`Error persisting slice "${rootPath}":`, e);
      });
    }
  } catch (e) {
    // JSON.stringify can fail on circular references or functions — that's fine,
    // non-serializable values just won't be persisted.
    if (monitoringConfig.enabled) {
      console.warn(`Could not serialize slice "${rootPath}" for persistence:`, e);
    }
  }
}

/**
 * Persist the entire store as one entry (used by persistenceAPI.persist).
 */
function persistEntireState(): void {
  if (!persistenceConfig.enabled || !globalStoreRef) return;

  const adapter = getStorageAdapter();

  try {
    const serialized = JSON.stringify(globalStoreRef);
    const result = adapter.setItem(PERSISTED_STATE_KEY, serialized);
    if (result && typeof (result as any).catch === 'function') {
      (result as Promise<void>).catch(e => {
        console.error('Error persisting entire state:', e);
      });
    }
  } catch (e) {
    console.error('Error persisting entire state:', e);
  }
}

/**
 * Check if a value is a Promise/thenable.
 */
function isPromiseLike(value: any): value is Promise<any> {
  return value !== null && value !== undefined && typeof value.then === 'function';
}

/**
 * Merge persisted data into the initial state object **before** the proxy is created.
 *
 * This is the fastest possible hydration path for synchronous adapters (localStorage,
 * memory). Because the merge happens on a plain object — not through the proxy —
 * there are no set traps, no `notifyListeners`, and no React re-renders. The proxy
 * is then created wrapping the already-correct state, so components render with
 * persisted values on their very first render.
 *
 * For async adapters (those wrapped in `createCachedAdapter`), this returns `null`
 * and the caller falls back to the async `hydrateState()` path.
 *
 * @param initialState - The default state from the user's config. Not mutated.
 * @returns A new state object with persisted data merged in, or `null` if the
 *          adapter is async and synchronous merge isn't possible.
 */
export function mergePersistedIntoState(
  initialState: Record<string, any>
): Record<string, any> | null {
  // No localStorage on the server
  if (typeof window === 'undefined') return null;

  const adapter = getStorageAdapter();

  // Cached/async adapters can't be read synchronously
  if (typeof (adapter as any).warmCache === 'function') return null;

  try {
    // Shallow clone — persisted slices replace entire top-level values
    const merged: Record<string, any> = { ...initialState };

    // --- Full state blob (from persistenceAPI.persist) ---
    const fullResult = adapter.getItem(PERSISTED_STATE_KEY);
    if (isPromiseLike(fullResult)) return null;

    if (fullResult) {
      try {
        const parsed = JSON.parse(fullResult as string);
        Object.keys(parsed).forEach(key => {
          if (key in merged) merged[key] = parsed[key];
        });
      } catch { /* skip malformed blob */ }
    }

    // --- Individual slice entries (persisted_state_user, etc.) ---
    const keysResult = adapter.keys();
    if (isPromiseLike(keysResult)) return null;

    const allKeys = keysResult as string[];
    const sliceKeys = allKeys
      .filter(key => key.startsWith(`${PERSISTED_STATE_KEY}_`))
      .sort((a, b) => a.split('.').length - b.split('.').length);

    const hydratedRoots = new Set<string>();

    for (const key of sliceKeys) {
      const pathStr = key.replace(`${PERSISTED_STATE_KEY}_`, '');

      // Respect blacklist
      if (!shouldPersistPath(pathStr)) continue;

      // Skip child entries if a parent was already merged
      const isChild = Array.from(hydratedRoots).some(root =>
        pathStr.startsWith(root + '.')
      );
      if (isChild) continue;

      const valueResult = adapter.getItem(key);
      if (isPromiseLike(valueResult)) return null;

      const value = valueResult as string | null;
      if (value) {
        try {
          const parsedValue = JSON.parse(value);
          const segments = pathStr.split('.');

          if (segments.length === 1) {
            // Top-level key (common case) — direct assignment
            merged[segments[0]] = parsedValue;
          } else {
            // Nested path — navigate with shallow copies to avoid mutating original
            let current: any = merged;
            for (let i = 0; i < segments.length - 1; i++) {
              const seg = segments[i];
              if (current[seg] && typeof current[seg] === 'object') {
                current[seg] = Array.isArray(current[seg])
                  ? [...current[seg]]
                  : { ...current[seg] };
              } else {
                current[seg] = {};
              }
              current = current[seg];
            }
            current[segments[segments.length - 1]] = parsedValue;
          }

          hydratedRoots.add(pathStr);
        } catch { /* skip malformed entries */ }
      }
    }

    hasHydrated = true;

    if (monitoringConfig.enabled && hydratedRoots.size > 0) {
      console.log(`🔄 Merged ${hydratedRoots.size} persisted slices into initial state`);
    }

    return merged;
  } catch {
    return null;
  }
}

/**
 * Hydrate state from storage using the configured StorageAdapter (async path).
 *
 * This is the fallback for asynchronous adapters (e.g. AsyncStorage wrapped in
 * `createCachedAdapter`). For synchronous adapters, `mergePersistedIntoState()`
 * is used instead — it's faster because it avoids proxy overhead entirely.
 *
 * @param store - The store object to hydrate into. If omitted, uses the
 *                global store set by `configure()`.
 */
export async function hydrateState(store?: any): Promise<boolean> {
  // Prefer writing through the proxy so that set traps fire and components
  // re-render with the hydrated values. Fall back to the raw store ref.
  const writeTarget = store || globalProxyRef || globalStoreRef;
  if (!writeTarget) {
    console.warn('Cannot hydrate state without store reference. Call configure() first or pass a store.');
    return false;
  }

  const adapter = getStorageAdapter();

  // If the adapter has a cache layer, warm it first so reads below are fast
  if (typeof (adapter as any).warmCache === 'function') {
    await (adapter as any).warmCache();
  }

  // Suppress persistence during hydration — writing through the proxy triggers
  // the persistence callback, but we don't want to re-persist data we just loaded.
  isHydrating = true;

  try {
    // First try to load the entire state blob (from persistenceAPI.persist)
    const savedState = await adapter.getItem(PERSISTED_STATE_KEY);
    if (savedState) {
      const parsedState = JSON.parse(savedState);

      Object.keys(parsedState).forEach(key => {
        if (key in writeTarget) {
          writeTarget[key] = parsedState[key];
        }
      });

      if (monitoringConfig.enabled) {
        console.log('🔄 Full state hydrated from storage');
      }
    }

    // Then load individual slice entries (persisted_state_user, persisted_state_todos, etc.)
    const allKeys = await adapter.keys();
    if (!allKeys) return true;

    // Collect slice keys and sort by depth (shortest first) so parent slices
    // are applied before child slices, ensuring correct overwrite order.
    const sliceKeys = allKeys
      .filter(key => key.startsWith(`${PERSISTED_STATE_KEY}_`))
      .sort((a, b) => a.split('.').length - b.split('.').length);

    // Track which root paths we've already hydrated so we don't
    // apply stale child entries from the old fragmented format.
    const hydratedRoots = new Set<string>();

    for (const key of sliceKeys) {
      const pathStr = key.replace(`${PERSISTED_STATE_KEY}_`, '');

      // Skip this entry if a parent slice was already hydrated
      // (prevents old fragmented entries from overwriting clean slice data)
      const isChildOfHydrated = Array.from(hydratedRoots).some(root =>
        pathStr.startsWith(root + '.')
      );
      if (isChildOfHydrated) continue;

      const path = pathStr.split('.');
      const value = await adapter.getItem(key);

      if (value) {
        try {
          const parsedValue = JSON.parse(value);

          // Navigate to the parent in the store, writing through the proxy
          // so that set traps fire and components re-render.
          let current: any = writeTarget;
          for (let i = 0; i < path.length - 1; i++) {
            if (current[path[i]] === undefined || current[path[i]] === null) {
              current[path[i]] = {};
            }
            current = current[path[i]];
          }

          const lastKey = path[path.length - 1];
          current[lastKey] = parsedValue;

          // Mark this path as hydrated
          hydratedRoots.add(pathStr);
        } catch (e) {
          console.error(`Error hydrating path "${pathStr}":`, e);
        }
      }
    }

    if (monitoringConfig.enabled && sliceKeys.length > 0) {
      console.log(`🔄 Hydrated ${hydratedRoots.size} slices from storage`);
    }
  } catch (e) {
    console.error('Error hydrating state:', e);
    return false;
  } finally {
    isHydrating = false;
    // Enable persistence now that the store has been hydrated.
    // Any writes from this point forward are intentional user changes.
    hasHydrated = true;
  }

  return true;
}

/**
 * Load persistence configuration
 */
export async function loadPersistenceConfig(): Promise<void> {
  const adapter = getStorageAdapter();

  try {
    const config = await adapter.getItem(PERSISTENCE_CONFIG_KEY);
    if (config) {
      const parsedConfig = JSON.parse(config);
      // Only restore serializable config fields (not the adapter itself, not autoHydrate)
      const { storageAdapter: _a, autoHydrate: _b, ...restConfig } = parsedConfig;
      Object.assign(persistenceConfig, restConfig);
    }
  } catch (e) {
    console.error('Error loading persistence configuration:', e);
  }
}

/**
 * Save persistence configuration (excluding non-serializable fields)
 */
export function savePersistenceConfig(): void {
  const adapter = getStorageAdapter();

  try {
    // Exclude the storageAdapter and autoHydrate from serialization
    const { storageAdapter: _a, autoHydrate: _b, ...serializableConfig } = persistenceConfig;
    const result = adapter.setItem(PERSISTENCE_CONFIG_KEY, JSON.stringify(serializableConfig));
    if (result && typeof (result as any).catch === 'function') {
      (result as Promise<void>).catch(e => {
        console.error('Error saving persistence configuration:', e);
      });
    }
  } catch (e) {
    console.error('Error saving persistence configuration:', e);
  }
}

/**
 * Persistence API — the public interface for controlling persistence at runtime.
 */
export const persistenceAPI = {
  // Enable or disable persistence
  setEnabled: (enabled: boolean) => {
    persistenceConfig.enabled = enabled;
    savePersistenceConfig();
  },

  // Add paths to be persisted
  persistPaths: (paths: string[]) => {
    if (!persistenceConfig.paths) {
      persistenceConfig.paths = [];
    }
    persistenceConfig.paths = Array.from(new Set([...persistenceConfig.paths, ...paths]));
    savePersistenceConfig();
    // Force persist current state for these paths
    paths.forEach(path => addToPersistenceBatch(path.split('.')));
  },

  // Remove paths from persistence
  unpersistPaths: (paths: string[]) => {
    if (persistenceConfig.paths) {
      persistenceConfig.paths = persistenceConfig.paths.filter(p => !paths.includes(p));
      savePersistenceConfig();
    }
    // Remove from storage
    const adapter = getStorageAdapter();
    paths.forEach(path => {
      const result = adapter.removeItem(`${PERSISTED_STATE_KEY}_${path}`);
      if (result && typeof (result as any).catch === 'function') {
        (result as Promise<void>).catch(e => {
          console.error(`Error removing persisted path "${path}":`, e);
        });
      }
    });
  },

  // Add paths to blacklist
  blacklistPaths: (paths: string[]) => {
    persistenceConfig.blacklist = Array.from(new Set([...persistenceConfig.blacklist, ...paths]));
    savePersistenceConfig();
    // Remove from storage
    const adapter = getStorageAdapter();
    paths.forEach(path => {
      const result = adapter.removeItem(`${PERSISTED_STATE_KEY}_${path}`);
      if (result && typeof (result as any).catch === 'function') {
        (result as Promise<void>).catch(e => {
          console.error(`Error removing blacklisted path "${path}":`, e);
        });
      }
    });
  },

  // Remove paths from blacklist
  unblacklistPaths: (paths: string[]) => {
    persistenceConfig.blacklist = persistenceConfig.blacklist.filter(p => !paths.includes(p));
    savePersistenceConfig();
  },

  // Get current persistence configuration
  getConfig: () => ({ ...persistenceConfig }),

  // Set the batch delay (in ms)
  setBatchDelay: (delay: number) => {
    persistenceConfig.batchDelay = delay;
    savePersistenceConfig();
  },

  // Reset persistence — clears all persisted data and resets config to defaults
  reset: async () => {
    const adapter = getStorageAdapter();

    // Use clear() if available, otherwise iterate and remove
    if (adapter.clear) {
      await adapter.clear();
    } else {
      const keys = await adapter.keys();
      if (keys) {
        for (const key of keys) {
          if (key.startsWith(PERSISTED_STATE_KEY)) {
            await adapter.removeItem(key);
          }
        }
      }
    }

    // Reset configuration to defaults (preserve the current storageAdapter and autoHydrate)
    const currentAdapter = persistenceConfig.storageAdapter;
    const currentAutoHydrate = persistenceConfig.autoHydrate;
    Object.assign(persistenceConfig, {
      enabled: true,
      paths: [],
      blacklist: [],
      batchDelay: 300,
      storageAdapter: currentAdapter,
      autoHydrate: currentAutoHydrate,
    });
    savePersistenceConfig();
  },

  // Force persist the entire store as one blob
  persist: () => persistEntireState(),

  // Force persist current batch immediately
  flushBatch: () => {
    if (persistenceBatch.timeoutId) {
      clearTimeout(persistenceBatch.timeoutId);
      persistenceBatch.timeoutId = null;
    }
    processPersistenceBatch();
  },

  /**
   * Manually hydrate state from the backing storage adapter.
   *
   * Use this when `autoHydrate` is `false` and you want to control
   * exactly when persisted data is loaded (e.g., after a splash screen).
   *
   * @param store - Optional store to hydrate into. Defaults to the global store.
   */
  rehydrate: (store?: any) => hydrateState(store),

  // Get batch status
  getBatchStatus: () => ({
    pendingRoots: Array.from(persistenceBatch.roots),
    isPersisting: persistenceBatch.isPersisting,
    batchSize: persistenceBatch.roots.size,
  }),
};

/**
 * Initialize persistence system.
 *
 * @param willAutoHydrate - Whether hydrateState will be called automatically.
 *   If false (autoHydrate disabled), persistence is enabled immediately since
 *   the developer will manually call rehydrate() when ready.
 */
export function initializePersistence(willAutoHydrate: boolean = true): void {
  loadPersistenceConfig();

  // If auto-hydration is disabled, the developer is in control.
  // Enable persistence immediately so state changes before manual rehydrate()
  // are captured. When they call rehydrate(), hasHydrated will be set again.
  if (!willAutoHydrate) {
    hasHydrated = true;
  }

  if (typeof window !== 'undefined' && monitoringConfig.enabled) {
    console.log('💾 Persistence system initialized');
  }
}
