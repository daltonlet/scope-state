export interface CustomMethods<T> {
  /**
   * Merges new properties into the current object without removing existing properties.
   * Triggers reactive updates for all components using this data.
   */
  $merge: (newProps: Partial<T>) => T;

  /**
   * Completely replaces the current object with new properties.
   * Removes all existing properties and adds only the new ones.
   */
  $set: (newProps: Partial<T>) => T;

  /**
   * Deletes one or more properties from the current object.
   * ⚠️ DANGER: This completely removes properties from the object.
   */
  $delete: (keys: keyof T | Array<keyof T>) => T;

  /**
   * Updates a specific property using an updater function.
   */
  $update: <K extends keyof T>(key: K, updater: (value: T[K]) => T[K]) => T;

  /**
   * Resets the object to its initial state as defined in store.ts.
   */
  $reset: () => T;

  /**
   * Returns a pure JavaScript object without proxies or custom methods.
   */
  raw: () => DeepUnproxied<T>;
}

export interface CustomArrayMethods<T> {
  /**
   * Adds one or more elements to the end of an array and returns the new length.
   */
  push: (...items: T[]) => number;

  /**
   * Changes the contents of an array by removing or replacing existing elements
   * and/or adding new elements in place.
   */
  splice: (start: number, deleteCount?: number, ...items: T[]) => T[];

  /**
   * Returns a pure JavaScript array without proxies or custom methods.
   */
  raw: () => DeepUnproxied<T[]>;
}

// Define enhanced types that include methods
export type EnhancedObject<T> = T & CustomMethods<T>;
export type EnhancedArray<T> = Array<T> & CustomArrayMethods<T>;

// Add DeepUnproxied type for proper typing
export type DeepUnproxied<T> = T extends Array<infer U>
  ? DeepUnproxied<U>[]
  : T extends object
  ? { [K in keyof T]: T[K] extends Function ? never : DeepUnproxied<T[K]> }
  : T;

/**
 * The main type for the global store that adds custom methods to all nested objects and arrays.
 */
export type StoreType<T> = {
  [K in keyof T]: T[K] extends Array<infer U>
  ? EnhancedArray<U>
  : T[K] extends object
  ? StoreType<T[K]> & CustomMethods<T[K]>
  : T[K]
} & CustomMethods<T>;

// Configuration types
export interface ProxyConfig {
  /** Whether state tracking is enabled.
   * NOTE: Setting to ```false``` will disable reactive updates for all states.
   *  @default true */
  enabled: boolean;
  /** The maximum depth of nested objects to proxy.
   *  Higher values will increase memory usage (intended for large, complex state objects where you want to track all properties).
   *  Lower values will reduce memory usage (intended for simple state objects where you only want to track a few properties).
   *  In general, Scope works best when tracking shallow state objects.
   *  @summary { user: { name: string, age: number }, todos: Array<{ id: number, text: string, done: boolean }> }
   *  @default 5
   */
  maxDepth: number;
  /** Whether selective proxying is enabled.
   *  @default false @example true
   */
  selectiveProxying: boolean;
  /** Whether to track path usage (this is a monitoring feature that displays usage statistics in the console).
   *  @default true
   */
  trackPathUsage: boolean;
  /** Whether to proxy deep objects lazily (this is a performance optimization that prevents unnecessary proxy creation for deeply nested objects).
   *  @default false
   */
  lazyProxyDeepObjects: boolean;
  /** The paths to pre-proxy, EVEN if they are not accessed yet and/or a component which is using them is not mounted yet.
   *  @default [] @example ['user.name', 'theme']
   */
  preProxyPaths: string[];
  /** The maximum length of a path (number of nested objects / depth).
   *  @default 20
   */
  maxPathLength: number;
  /** Whether to track array changes.
   *  @default true
   */
  smartArrayTracking: boolean;
  /** Whether to create proxies in a non-blocking, asynchronous way (this is a performance optimization that prevents blocking the main thread for long periods of time).
   *  @default true
   */
  nonBlockingProxyCreation: boolean;
  /** The batch size for proxy creation (the number of proxies to create at once).
   *  @default 1
   */
  batchSize: number;
  /** Whether to prioritize UI objects. If ```true```, you must provide a ```priorityPaths``` array in this config object.
   *  @default true
   */
  prioritizeUIObjects: boolean;
  /** The paths to prioritize. Must be paired with ```prioritizeUIObjects``` being ```true```.
   *  @default [] @example ['user.name', 'theme']
   */
  priorityPaths: string[];
  /** The maximum size of the proxy queue (the number of proxies to create at once).
   *  @default 1000
   */
  maxQueueSize: number;
  /** Whether to limit the memory usage of the proxy cache.
   *  @default false
   */
  memoryLimit: boolean;
  /** The memory threshold for the proxy cache (the percentage of memory usage at which the proxy cache will be cleared).
   *  @default 1
   */
  memoryThreshold: number;
  /** The target memory usage (in megabytes - MB) for the proxy cache (the percentage of memory usage at which the proxy cache will be cleared).
   *  @default 3000
   */
  targetMemoryUsage: number;
  /** The eviction strategy for the proxy cache.
   *  @default 'lru'
   */
  proxyEvictionStrategy: 'lru';
  /** Whether to disable proxying under pressure (this is a performance optimization that prevents proxying under high memory usage).
   *  @default false
   */
  disableProxyingUnderPressure: boolean;
  /** The maximum size of the proxy cache (the number of proxies to create at once).
   *  @default 5000
   */
  maxProxyCacheSize: number;
  /** Whether to enable ultra selective proxying. This causes most proxies to be ignored, unless they are accessed explicitly by a component or marked as a priority path.
   *  @default false
   */
  ultraSelectiveProxying: boolean;
  /** Whether to proxy selector paths. If ```true```, the proxy will be created for all paths that are accessed by a component (including the parent paths of the target value).
   *  @default true
   */
  proxySelectorPaths: boolean;
  /** Whether to force a memory check.
   *  @default false
   */
  forceMemoryCheck: boolean;
  /** Whether to enable aggressive memory management. This causes the proxy cache to be cleared when the memory usage exceeds the target memory usage.
   *  @default false
   */
  aggressiveMemoryManagement: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  verboseLogging: boolean;
  logSubscriptions: boolean;
  logProxyCreation: boolean;
  logStateChanges: boolean;
  logPersistence: boolean;
  logTimings: boolean;
  autoLeakDetection: boolean;
  leakDetectionInterval: number;
  leakAlertThreshold: number;
  leakScanMinimumRenderCycles: number;
}

export interface PersistenceConfig {
  /** Whether persistence is enabled */
  enabled: boolean;
  /** The paths to persist. Set to ```undefined``` to persist all paths.
   *  @default undefined @example ['user.name', 'theme']
   */
  paths: string[] | undefined;
  /** The paths to never persist to storage.
   *  @default [] @example ['user.password', 'world_map.large_array_of_all_cities']
   */
  blacklist: string[];
  /** The delay in milliseconds before persisting changes.
   * All changes are non-blocking and will be persisted in the background.
   *  @default 300
   */
  batchDelay: number;
}

export interface ScopeConfig<T extends Record<string, any> = Record<string, any>> {
  /** Initial store state */
  initialState?: T;
  /** Proxy configuration */
  proxy?: Partial<ProxyConfig>;
  /** Monitoring and debugging configuration */
  monitoring?: Partial<MonitoringConfig>;
  /** Persistence configuration */
  persistence?: Partial<PersistenceConfig>;
  /** Storage instance for persistence */
  storage?: any;
}

// Utility types
export type Listener = () => void;
export type PathListeners = Map<string, Set<Listener>>;

// Statistics types
export interface MonitoringStats {
  proxyCount: number;
  totalSubscriptionsCreated: number;
  totalSubscriptionsRemoved: number;
  activeSubscriptions: number;
  pathSubscriptionCounts: Record<string, number>;
  timings: {
    lastNotifyTime: number;
    lastPersistTime: number;
    averageNotifyTime: number;
    averagePersistTime: number;
    notifyTimeTotal: number;
    persistTimeTotal: number;
    notifyCount: number;
    persistCount: number;
  };
  leakDetection: {
    lastCheckTime: number;
    totalChecks: number;
    leaksDetected: number;
    renderCyclesSinceCheck: number;
    isLeakDetectionRunning: boolean;
    leakDetectionTimer: NodeJS.Timeout | null;
  };
}

export interface ProxyCacheStats {
  cacheHits: number;
  cacheMisses: number;
  totalProxiesCreated: number;
  activeCachedProxies: number;
}

export interface PathUsageStats {
  accessedPaths: Set<string>;
  modifiedPaths: Set<string>;
  subscribedPaths: Set<string>;
} 