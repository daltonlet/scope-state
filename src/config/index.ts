import type {
  ProxyConfig,
  MonitoringConfig,
  PersistenceConfig,
  ScopeConfig
} from '../types';

// Default configurations
export const defaultProxyConfig: ProxyConfig = {
  enabled: true,
  maxDepth: 5,
  selectiveProxying: false,
  trackPathUsage: true,
  lazyProxyDeepObjects: false,
  preProxyPaths: [],
  maxPathLength: 20,
  smartArrayTracking: true,
  nonBlockingProxyCreation: true,
  batchSize: 1,
  prioritizeUIObjects: true,
  maxQueueSize: 1000,
  memoryLimit: false,
  memoryThreshold: 1,
  targetMemoryUsage: 3000,
  proxyEvictionStrategy: 'lru',
  disableProxyingUnderPressure: false,
  maxProxyCacheSize: 5000,
  ultraSelectiveProxying: false,
  proxySelectorPaths: true,
  forceMemoryCheck: true,
  aggressiveMemoryManagement: false,
  priorityPaths: [],
};

export const defaultMonitoringConfig: MonitoringConfig = {
  enabled: true,
  verboseLogging: false,
  logSubscriptions: false,
  logProxyCreation: false,
  logStateChanges: false,
  logPersistence: false,
  logTimings: false,
  autoLeakDetection: false,
  leakDetectionInterval: 30000,
  leakAlertThreshold: 0,
  leakScanMinimumRenderCycles: 3,
};

export const defaultPersistenceConfig: PersistenceConfig = {
  enabled: true,
  paths: [],
  blacklist: [],
  batchDelay: 300,
};

// Current active configurations (will be modified by configure())
export let proxyConfig = { ...defaultProxyConfig };
export let monitoringConfig = { ...defaultMonitoringConfig };
export let persistenceConfig = { ...defaultPersistenceConfig };

// Note: The main configure function is now in src/index.ts to avoid circular dependencies
// These configuration objects are still exported for internal use

/**
 * Get current configuration
 */
export function getConfig(): {
  proxy: ProxyConfig;
  monitoring: MonitoringConfig;
  persistence: PersistenceConfig;
} {
  return {
    proxy: { ...proxyConfig },
    monitoring: { ...monitoringConfig },
    persistence: { ...persistenceConfig },
  };
}

/**
 * Reset all configuration to defaults
 */
export function resetConfig(): void {
  proxyConfig = { ...defaultProxyConfig };
  monitoringConfig = { ...defaultMonitoringConfig };
  persistenceConfig = { ...defaultPersistenceConfig };
}

/**
 * Quick presets for common use cases
 */
export const presets = {
  /**
   * Development preset: Enhanced debugging and monitoring
   */
  development: <T extends Record<string, any> = Record<string, any>>(): ScopeConfig<T> => ({
    monitoring: {
      enabled: true,
      verboseLogging: true,
      logSubscriptions: true,
      logStateChanges: true,
      autoLeakDetection: true,
    },
    proxy: {
      maxDepth: 6,
      smartArrayTracking: true,
    },
  }),

  /**
   * Production preset: Optimized for performance
   */
  production: <T extends Record<string, any> = Record<string, any>>(): ScopeConfig<T> => ({
    monitoring: {
      enabled: false,
      verboseLogging: false,
      logSubscriptions: false,
      logStateChanges: false,
      autoLeakDetection: false,
    },
    proxy: {
      maxDepth: 6,
      ultraSelectiveProxying: false,
      aggressiveMemoryManagement: false,
    },
  }),

  /**
   * Memory-constrained preset: Minimal memory usage
   */
  minimal: <T extends Record<string, any> = Record<string, any>>(): ScopeConfig<T> => ({
    monitoring: {
      enabled: false,
    },
    proxy: {
      maxDepth: 1,
      ultraSelectiveProxying: true,
      aggressiveMemoryManagement: true,
      maxProxyCacheSize: 1000,
      maxQueueSize: 100,
    },
    persistence: {
      enabled: false,
    },
  }),

  /**
   * Full-featured preset: All features enabled
   */
  full: <T extends Record<string, any> = Record<string, any>>(): ScopeConfig<T> => ({
    monitoring: {
      enabled: true,
      verboseLogging: true,
      autoLeakDetection: true,
    },
    proxy: {
      maxDepth: 5,
      selectiveProxying: false,
    },
    persistence: {
      enabled: true,
    },
  }),
}; 