import type { ScopeConfig } from '../types';

// Default store structure - can be overridden via configuration
const defaultStore = {
  user: {
    name: 'John Doe',
    age: 30,
  },
};

// The actual store that will be used - start with default but allow override
export let store = defaultStore;

// Store a deep clone of the initial store state for use with $reset
export let initialStoreState = JSON.parse(JSON.stringify(store));

// Type for the current store - will be updated when configure is called
export type CurrentStoreType = typeof store;

/**
 * Initialize the store with custom initial state
 * This function updates both the store and its type
 */
export function initializeStore<T extends Record<string, any>>(config: ScopeConfig<T> = {}): T extends Record<string, any> ? T : typeof defaultStore {
  if (config.initialState) {
    // Update the actual store with the new state
    store = { ...config.initialState } as any;
    initialStoreState = JSON.parse(JSON.stringify(store));

    if (typeof window !== 'undefined') {
      console.log('🏪 Store initialized with custom state');
    }

    return store as T extends Record<string, any> ? T : typeof defaultStore;
  } else {
    // Use default store
    store = { ...defaultStore };
    initialStoreState = JSON.parse(JSON.stringify(store));
    return store as T extends Record<string, any> ? T : typeof defaultStore;
  }
}

/**
 * Get the current store (for debugging)
 */
export function getStore() {
  return store;
}

/**
 * Get the initial store state (for debugging)
 */
export function getInitialStore() {
  return initialStoreState;
}

/**
 * Reset the entire store to its initial state
 */
export function resetStore(): void {
  // Clear current store
  Object.keys(store).forEach(key => {
    delete (store as any)[key];
  });

  // Restore initial state
  Object.assign(store, JSON.parse(JSON.stringify(initialStoreState)));

  if (typeof window !== 'undefined') {
    console.log('🔄 Store reset to initial state');
  }
} 