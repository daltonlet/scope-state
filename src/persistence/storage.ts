import localforage from 'localforage';
import * as memoryDriver from 'localforage-driver-memory';

export let storage: LocalForage | null = null;

/**
 * Initialize storage for persistence
 */
export function initializeStorage(): void {
  try {
    if (typeof window !== 'undefined') {
      storage = localforage.createInstance({
        name: 'SCOPE_STATE',
        description: 'Scope state management storage'
      });

      // Add memory driver as fallback
      localforage.defineDriver(memoryDriver);
      localforage.setDriver([
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL,
        memoryDriver._driver
      ]);

      console.log('💾 Storage initialized successfully');
    }
  } catch (error) {
    console.error('❌ Error creating storage instance:', error);
    storage = null;
  }
}

/**
 * Get the current storage instance
 */
export function getStorage(): LocalForage | null {
  return storage;
}

/**
 * Set a custom storage instance
 */
export function setStorage(customStorage: LocalForage): void {
  storage = customStorage;
}

// Initialize storage by default
if (typeof window !== 'undefined') {
  initializeStorage();
} 