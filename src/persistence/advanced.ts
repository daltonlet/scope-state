import { notifyListeners } from '../core/listeners';
import { monitoringConfig, persistenceConfig } from '../config';
import { storage, getStorage } from './storage';

// Storage constants
const PERSISTED_STATE_KEY = 'persisted_state';
const PERSISTENCE_CONFIG_KEY = 'persistence_config';

// Batch persistence state
const persistenceBatch = {
  paths: new Set<string>(),
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
 * Process all paths in the batch
 */
function processPersistenceBatch(): void {
  if (typeof window === 'undefined') return;

  if (persistenceBatch.isPersisting || persistenceBatch.paths.size === 0) {
    return;
  }

  persistenceBatch.isPersisting = true;

  let startTime = 0;
  if (monitoringConfig.enabled && monitoringConfig.logPersistence) {
    startTime = logTimestamp(`💾 Batch persisting ${persistenceBatch.paths.size} paths`);
  }

  try {
    // Convert set to array of path arrays
    const pathArrays = Array.from(persistenceBatch.paths).map(path => path.split('.'));

    // Persist entire state if we're persisting many paths
    if (pathArrays.length > 10) {
      persistState();
    } else {
      // Otherwise persist individual paths
      pathArrays.forEach(pathArray => {
        persistState(pathArray);
      });
    }

    // Clear the batch
    persistenceBatch.paths.clear();
  } catch (e) {
    console.error('Error during batch persistence:', e);
  } finally {
    persistenceBatch.isPersisting = false;

    // If new paths were added during processing, schedule another batch
    if (persistenceBatch.paths.size > 0) {
      schedulePersistenceBatch();
    }

    if (monitoringConfig.enabled && monitoringConfig.logPersistence && startTime > 0) {
      logTimingEnd('Batch persistence', startTime);
    }
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
 * Add a path to the persistence batch
 */
export function addToPersistenceBatch(path: string[]): void {
  if (!persistenceConfig.enabled) return;

  const pathKey = path.join('.');
  if (shouldPersistPath(pathKey)) {
    persistenceBatch.paths.add(pathKey);
    schedulePersistenceBatch();
  }
}

/**
 * Function to determine if a path should be persisted
 */
function shouldPersistPath(path: string): boolean {
  if (!persistenceConfig.enabled) return false;

  // Check if path is blacklisted
  if (persistenceConfig.blacklist.some(blacklistedPath =>
    path === blacklistedPath || path.startsWith(`${blacklistedPath}.`))) {
    return false;
  }

  // If paths array is empty, persist everything not blacklisted
  if (!persistenceConfig.paths || persistenceConfig.paths.length === 0) return true;

  // Check if path is in the persistence paths list
  return persistenceConfig.paths.some(persistedPath =>
    path === persistedPath || path.startsWith(`${persistedPath}.`));
}

/**
 * Save state to storage
 */
function persistState(path: string[] = []): void {
  if (typeof window === 'undefined') return;
  if (!persistenceConfig.enabled) return;

  const currentStorage = getStorage();
  if (!currentStorage) return;

  const pathKey = path.join('.');

  if (path.length === 0) {
    // We need access to the store to persist entire state
    // For now, we'll skip this and only support path-specific persistence
    console.warn('Cannot persist entire state without store reference');
    return;
  }

  if (shouldPersistPath(pathKey)) {
    // For individual path persistence, we'd need access to the store
    // This will be implemented when integrating with the main store
    try {
      currentStorage.setItem(`${PERSISTED_STATE_KEY}_${pathKey}`, JSON.stringify({}));
    } catch (e) {
      console.error(`Error persisting path ${pathKey}:`, e);
    }
  }
}

/**
 * Hydrate state from storage
 */
export async function hydrateState(store?: any): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!store) {
    console.warn('Cannot hydrate state without store reference');
    return false;
  }

  const currentStorage = getStorage();
  if (!currentStorage) return false;

  try {
    // First try to load entire state
    const savedState = await currentStorage.getItem(PERSISTED_STATE_KEY);
    if (savedState) {
      const parsedState = JSON.parse(savedState as string);

      // Direct replacement instead of merging
      Object.keys(parsedState).forEach(key => {
        if (key in store) {
          store[key] = parsedState[key];
        }
      });

      if (monitoringConfig.enabled) {
        console.log('🔄 State hydrated from storage');
      }
    }

    // Then try to load individual persisted paths
    const keys = await currentStorage.keys();
    if (!keys) return true;

    for (const key of keys) {
      if (key.startsWith(`${PERSISTED_STATE_KEY}_`)) {
        const path = key.replace(`${PERSISTED_STATE_KEY}_`, '').split('.');
        const value = await currentStorage.getItem(key);

        if (value) {
          try {
            const parsedValue = JSON.parse(value as string);

            // Set the value in the store
            let current: any = store;
            for (let i = 0; i < path.length - 1; i++) {
              if (!(path[i] in current)) {
                current[path[i]] = {};
              }
              current = current[path[i]];
            }

            const lastKey = path[path.length - 1];
            current[lastKey] = parsedValue;
          } catch (e) {
            console.error(`Error hydrating path ${path.join('.')}:`, e);
          }
        }
      }
    }

    if (monitoringConfig.enabled) {
      console.log(`🔄 Hydrated ${keys.length} individual paths`);
    }
  } catch (e) {
    console.error('Error hydrating state:', e);
    return false;
  }

  return true;
}

/**
 * Load persistence configuration
 */
export async function loadPersistenceConfig(): Promise<void> {
  if (typeof window === 'undefined') return;

  const currentStorage = getStorage();
  if (!currentStorage) return;

  try {
    const config = await currentStorage.getItem(PERSISTENCE_CONFIG_KEY);
    if (config) {
      const parsedConfig = JSON.parse(config as string);
      Object.assign(persistenceConfig, parsedConfig);
    }
  } catch (e) {
    console.error('Error loading persistence configuration:', e);
  }
}

/**
 * Save persistence configuration
 */
export function savePersistenceConfig(): void {
  if (typeof window === 'undefined') return;

  const currentStorage = getStorage();
  if (!currentStorage) return;

  try {
    currentStorage.setItem(PERSISTENCE_CONFIG_KEY, JSON.stringify(persistenceConfig));
  } catch (e) {
    console.error('Error saving persistence configuration:', e);
  }
}

/**
 * Persistence API - matches the original implementation
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
    const currentStorage = getStorage();
    if (currentStorage) {
      paths.forEach(path => {
        currentStorage.removeItem(`${PERSISTED_STATE_KEY}_${path}`);
      });
    }
  },

  // Add paths to blacklist
  blacklistPaths: (paths: string[]) => {
    persistenceConfig.blacklist = Array.from(new Set([...persistenceConfig.blacklist, ...paths]));
    savePersistenceConfig();
    // Remove from storage
    const currentStorage = getStorage();
    if (currentStorage) {
      paths.forEach(path => {
        currentStorage.removeItem(`${PERSISTED_STATE_KEY}_${path}`);
      });
    }
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

  // Reset persistence
  reset: async () => {
    const currentStorage = getStorage();
    if (!currentStorage) return;

    // Clear all persisted state
    const keys = await currentStorage.keys();
    if (keys) {
      for (const key of keys) {
        if (key.startsWith(PERSISTED_STATE_KEY)) {
          await currentStorage.removeItem(key);
        }
      }
    }

    // Reset configuration to defaults
    Object.assign(persistenceConfig, {
      enabled: true,
      paths: [],
      blacklist: [],
      batchDelay: 300,
    });
    savePersistenceConfig();
  },

  // Force persist current state
  persist: () => persistState(),

  // Force persist current batch immediately
  flushBatch: () => {
    if (persistenceBatch.timeoutId) {
      clearTimeout(persistenceBatch.timeoutId);
      persistenceBatch.timeoutId = null;
    }
    processPersistenceBatch();
  },

  // Force rehydrate state
  rehydrate: (store?: any) => hydrateState(store),

  // Get batch status
  getBatchStatus: () => ({
    pendingPaths: Array.from(persistenceBatch.paths),
    isPersisting: persistenceBatch.isPersisting,
    batchSize: persistenceBatch.paths.size,
  }),
};

/**
 * Initialize persistence system
 */
export function initializePersistence(): void {
  if (typeof window !== 'undefined') {
    loadPersistenceConfig();
    console.log('💾 Advanced persistence system initialized');
  }
}

// Initialize automatically
initializePersistence(); 