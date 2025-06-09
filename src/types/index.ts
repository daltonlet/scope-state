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
  trackPathUsage: boolean;
  lazyProxyDeepObjects: boolean;
  preProxyPaths: string[];
  maxPathLength: number;
  smartArrayTracking: boolean;
  nonBlockingProxyCreation: boolean;
  batchSize: number;
  prioritizeUIObjects: boolean;
  maxQueueSize: number;
  memoryLimit: boolean;
  memoryThreshold: number;
  targetMemoryUsage: number;
  proxyEvictionStrategy: 'lru';
  disableProxyingUnderPressure: boolean;
  maxProxyCacheSize: number;
  ultraSelectiveProxying: boolean;
  proxySelectorPaths: boolean;
  forceMemoryCheck: boolean;
  aggressiveMemoryManagement: boolean;
  priorityPaths: string[];
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