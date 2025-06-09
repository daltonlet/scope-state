// Main exports for the library
export { useScope } from './hooks/useScope';
export { useLocal } from './hooks/useLocal';
export { getConfig, resetConfig, presets } from './config';
export { initializeStore, getStore, resetStore } from './core/store';

// Advanced features exports
export { monitorAPI } from './core/monitoring';
export { persistenceAPI } from './persistence/advanced';
export {
  setInitialStoreState,
  createAdvancedProxy,
  pathUsageStats,
  selectorPaths,
  clearProxyCache,
  getProxyCacheStats,
  optimizeMemoryUsage,
  proxyPathMap
} from './core/proxy';

// Types
export type {
  ScopeConfig,
  ProxyConfig,
  MonitoringConfig,
  PersistenceConfig,
  CustomMethods,
  CustomArrayMethods,
  StoreType,
  MonitoringStats,
  ProxyCacheStats,
  PathUsageStats
} from './types';

// Core functionality
import { notifyListeners } from './core/listeners';
import { isCurrentlyTracking, trackDependencies } from './core/tracking';
import { proxyConfig, monitoringConfig, persistenceConfig } from './config';
import { createAdvancedProxy, setInitialStoreState, pathUsageStats, selectorPaths, proxyPathMap } from './core/proxy';
import { addToPersistenceBatch, hydrateState } from './persistence/advanced';
import type { StoreType, CustomMethods, CustomArrayMethods, ScopeConfig } from './types';

// Global state
let globalStore: any = {
  user: {
    name: 'John Doe',
    age: 30,
  },
};

let globalStoreProxy: any = null;

/**
 * Configure Scope with custom settings and return a properly typed store
 * This is the main way to set up Scope with TypeScript support
 */
export function configure<T extends Record<string, any>>(
  config: ScopeConfig<T>
): StoreType<T> {
  // Update configurations
  if (config.proxy) {
    Object.assign(proxyConfig, config.proxy);
  }
  if (config.monitoring) {
    Object.assign(monitoringConfig, config.monitoring);
  }
  if (config.persistence) {
    Object.assign(persistenceConfig, config.persistence);
  }

  // Update the global store
  if (config.initialState) {
    globalStore = { ...config.initialState };
    // Store initial state for reset functionality
    setInitialStoreState(globalStore);

    if (typeof window !== 'undefined' && monitoringConfig.enabled) {
      console.log('🏪 Store configured with custom state');
    }
  }

  // Create and cache the advanced proxy
  globalStoreProxy = createAdvancedProxy(globalStore);

  // Hydrate persisted state if persistence is enabled
  if (typeof window !== 'undefined' && persistenceConfig.enabled) {
    hydrateState(globalStore).then((success) => {
      if (success && monitoringConfig.enabled) {
        console.log('🔄 State hydrated from persistence');
      }
    });
  }

  if (typeof window !== 'undefined' && monitoringConfig.enabled) {
    console.log('🔧 Scope configured with advanced features');
  }

  return globalStoreProxy as StoreType<T>;
}

// Enhanced tracking that integrates with the advanced proxy system
export function trackDependenciesAdvanced<T>(selector: () => T): { value: T, paths: string[] } {
  // Clear tracking state
  const trackedPaths: string[] = [];

  // Set up tracking for selector paths (ultra-selective proxying)
  const originalTracking = isCurrentlyTracking();

  try {
    // Execute selector and track paths
    const result = trackDependencies(selector);

    // Add tracked paths to selector paths for ultra-selective proxying
    result.paths.forEach(path => {
      selectorPaths.add(path);
      pathUsageStats.subscribedPaths.add(path);
    });

    return result;
  } finally {
    // Cleanup any temporary tracking state
  }
}

// Default store for when configure() isn't called
if (!globalStoreProxy) {
  globalStoreProxy = createAdvancedProxy(globalStore);
  setInitialStoreState(globalStore);
}

// Export the main $ proxy - will be properly typed if configure() is called first
export const $: StoreType<any> = globalStoreProxy;

// Utility functions from the original code
export function createReactive<T extends object>(obj: T): T & (T extends any[] ? CustomArrayMethods<T[0]> : CustomMethods<T>) {
  return createAdvancedProxy(obj);
}

// Legacy alias - use useLocal() hook instead for proper React integration
export const $local = createReactive;

// Development helper to check if an object is reactive
export function isReactive(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.$merge === 'function';
}

// Type-safe activation functions from the original
export function activate<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  const path = proxyPathMap.get(obj as any);
  if (!path) {
    console.warn('⚠️ Could not determine path for object. Make sure it\'s from the $ tree.');
    return obj;
  }

  if (monitoringConfig.enabled && monitoringConfig.verboseLogging) {
    console.log(`🔄 Type-safe activation of path: ${path.join('.')}`);
  }

  // Add to selector paths
  selectorPaths.add(path.join('.'));

  // Add parent paths
  for (let i = 1; i < path.length; i++) {
    const parentPath = path.slice(0, i).join('.');
    selectorPaths.add(parentPath);
  }

  return obj;
}

export function $activate<T>(obj: T): T {
  return activate(obj);
}

export function getProxy<T = any>(path: string | string[] | any): T {
  // Handle case where an object from $ is passed directly
  if (path !== null && typeof path === 'object') {
    return activate(path) as unknown as T;
  }

  const pathArray = typeof path === 'string' ? path.split('.') : path;
  const pathKey = pathArray.join('.');

  // Add to selector paths
  selectorPaths.add(pathKey);

  if (monitoringConfig.enabled && monitoringConfig.verboseLogging) {
    console.log(`🔄 Explicitly activating proxy for path: ${pathKey}`);
  }

  // Navigate to the target
  let target = globalStore;
  for (let i = 0; i < pathArray.length; i++) {
    if (target === undefined || target === null) break;
    target = target[pathArray[i] as keyof typeof target];
  }

  if (target === undefined || target === null) {
    console.warn(`⚠️ Path not found: ${pathKey}`);
    return null as unknown as T;
  }

  // Force create an immediate proxy for this specific path
  const immediateProxy = createAdvancedProxy(target, pathArray, 0);

  // Add parent paths
  for (let i = 1; i < pathArray.length; i++) {
    const parentPath = pathArray.slice(0, i).join('.');
    selectorPaths.add(parentPath);
  }

  return immediateProxy as unknown as T;
}

export function $get<T = any>(path: string | string[] | T): T {
  if (path !== null && typeof path === 'object') {
    return activate(path as T);
  }
  return getProxy<T>(path as string | string[]);
}

// Enhanced tracking that updates path usage and integrates with persistence
function enhancedNotifyListeners(path: string[]): void {
  // Call the original notify function
  notifyListeners(path);

  // Add to persistence batch if enabled
  if (persistenceConfig.enabled) {
    addToPersistenceBatch(path);
  }
}

// For debugging - matches original API
export const debugInfo = {
  getListenerCount: () => {
    const { getListenerCount } = require('./core/listeners');
    return getListenerCount();
  },
  getPathCount: () => {
    const { pathListeners } = require('./core/listeners');
    return pathListeners.size;
  },
  getActivePaths: () => {
    const { getActivePaths } = require('./core/listeners');
    return getActivePaths();
  }
};

// Expose raw store for debugging
export const rawStore = globalStore;

// Initialize library with enhanced features
if (typeof window !== 'undefined') {
  console.log('🎯 Scope State initialized with advanced features - ready for reactive state management');
  console.log('💡 Tip: Call configure() with your initialState for full TypeScript support');
  console.log('🔧 Advanced features: WeakMap caching, leak detection, batch persistence, memory management');

  // Initialize auto-hydration if persistence is enabled
  if (persistenceConfig.enabled) {
    setTimeout(() => {
      hydrateState(globalStore);
    }, 100);
  }
} 