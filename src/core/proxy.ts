import { notifyListeners } from './listeners';
import { proxyConfig, monitoringConfig } from '../config';
import type { CustomMethods, CustomArrayMethods } from '../types';

// Track proxy to path mapping for type-safe activation
export const proxyPathMap = new WeakMap<object, string[]>();

// Store a deep clone of the initial store state for use with $reset
let initialStoreState: any = {};

// Path usage tracking
export const pathUsageStats = {
  accessedPaths: new Set<string>(),
  modifiedPaths: new Set<string>(),
  subscribedPaths: new Set<string>(),
};

// Selector paths for ultra-selective proxying
export const selectorPaths = new Set<string>();

// Proxy cache using WeakMap for garbage collection
let proxyCache = new WeakMap<object, any>();

// Proxy cache statistics
export const proxyCacheStats = {
  cacheHits: 0,
  cacheMisses: 0,
  totalProxiesCreated: 0,
  activeCachedProxies: 0
};

// LRU tracking for proxy cache
const proxyCacheLRU = {
  keys: [] as any[],
  timestamp: [] as number[],
  maxSize: proxyConfig.maxProxyCacheSize,

  add(key: any, proxy: any) {
    if (key && typeof key === 'object') {
      const index = this.keys.findIndex(k => k === key);
      if (index !== -1) {
        this.timestamp[index] = Date.now();
      } else {
        this.keys.push(key);
        this.timestamp.push(Date.now());

        if (this.keys.length > this.maxSize) {
          this.evictOldest();
        }
      }
    }
  },

  touch(key: any) {
    const index = this.keys.findIndex(k => k === key);
    if (index !== -1) {
      this.timestamp[index] = Date.now();
    }
  },

  evictOldest() {
    if (this.keys.length === 0) return;

    let oldestIndex = 0;
    let oldestTime = this.timestamp[0];

    for (let i = 1; i < this.timestamp.length; i++) {
      if (this.timestamp[i] < oldestTime) {
        oldestTime = this.timestamp[i];
        oldestIndex = i;
      }
    }

    const oldestKey = this.keys[oldestIndex];
    if (oldestKey && proxyCache.has(oldestKey)) {
      proxyCache.delete(oldestKey);
      proxyCacheStats.activeCachedProxies--;
    }

    this.keys.splice(oldestIndex, 1);
    this.timestamp.splice(oldestIndex, 1);
  },

  evictPercentage(percent: number) {
    const count = Math.ceil(this.keys.length * percent);
    if (count <= 0) return 0;

    const indices = Array.from({ length: this.keys.length }, (_, i) => i)
      .sort((a, b) => this.timestamp[a] - this.timestamp[b]);

    let evicted = 0;
    for (let i = 0; i < count && i < indices.length; i++) {
      const key = this.keys[indices[i]];
      if (key && proxyCache.has(key)) {
        proxyCache.delete(key);
        evicted++;
      }
    }

    const newKeys: any[] = [];
    const newTimestamps: number[] = [];

    for (let i = count; i < indices.length; i++) {
      const idx = indices[i];
      newKeys.push(this.keys[idx]);
      newTimestamps.push(this.timestamp[idx]);
    }

    this.keys = newKeys;
    this.timestamp = newTimestamps;
    proxyCacheStats.activeCachedProxies -= evicted;

    return evicted;
  },

  size() {
    return this.keys.length;
  },

  clear() {
    this.keys = [];
    this.timestamp = [];
  }
};

// Memory pressure detection
export const memoryPressure = {
  isUnderPressure: false,
  lastCheckTime: 0,
  checkInterval: 5000,
  highUsageCount: 0,

  check() {
    const now = Date.now();
    if (!proxyConfig.forceMemoryCheck && now - this.lastCheckTime < this.checkInterval) {
      return this.isUnderPressure;
    }

    this.lastCheckTime = now;

    try {
      const estimatedUsageMB = this.estimateMemoryUsage();
      const thresholdMB = proxyConfig.targetMemoryUsage * proxyConfig.memoryThreshold;

      const wasUnderPressure = this.isUnderPressure;
      this.isUnderPressure = estimatedUsageMB > thresholdMB;

      if (proxyConfig.aggressiveMemoryManagement && estimatedUsageMB > thresholdMB * 0.8) {
        this.highUsageCount++;
        if (this.highUsageCount > 2) {
          this.isUnderPressure = true;
        }
      } else {
        this.highUsageCount = 0;
      }

      if (this.isUnderPressure !== wasUnderPressure && monitoringConfig.enabled) {
        if (this.isUnderPressure) {
          console.warn(`⚠️ High memory pressure detected: ${estimatedUsageMB.toFixed(1)}MB > ${thresholdMB.toFixed(1)}MB threshold`);
        } else {
          console.log(`✅ Memory pressure relieved: ${estimatedUsageMB.toFixed(1)}MB < ${thresholdMB.toFixed(1)}MB threshold`);
        }
      }
    } catch (e) {
      console.error('Error checking memory pressure:', e);
    }

    return this.isUnderPressure;
  },

  estimateMemoryUsage(): number {
    const proxyCacheSize = proxyCacheLRU.size() * 2;
    const pathStatsSize = (pathUsageStats.accessedPaths.size +
      pathUsageStats.modifiedPaths.size +
      pathUsageStats.subscribedPaths.size) * 0.2;
    const baseMB = 400;

    return baseMB + proxyCacheSize + pathStatsSize;
  }
};

/**
 * Set the initial store state for reset functionality
 */
export function setInitialStoreState(state: any): void {
  initialStoreState = JSON.parse(JSON.stringify(state));
}

/**
 * Check if a path is high priority
 */
function isHighPriorityPath(path: string[]): boolean {
  if (!proxyConfig.prioritizeUIObjects) return false;

  const pathStr = path.join('.');
  return proxyConfig.priorityPaths.some(p => pathStr === p || pathStr.startsWith(`${p}.`));
}

/**
 * Create an advanced proxy with all the features from the original code
 */
export function createAdvancedProxy<T extends object>(
  target: T,
  path: string[] = [],
  depth: number = 0
): T & (T extends any[] ? CustomArrayMethods<T[0]> : CustomMethods<T>) {
  if (target === null || typeof target !== 'object') {
    return target as any;
  }

  if (!proxyConfig.enabled) {
    return target as any;
  }

  const pathKey = path.join('.');

  // Check memory pressure
  const isUnderPressure = memoryPressure.check();
  if (isUnderPressure && proxyConfig.disableProxyingUnderPressure && depth > 0 && !isHighPriorityPath(path)) {
    return target as any;
  }

  // Ultra-selective proxying
  if (proxyConfig.ultraSelectiveProxying && depth > 0) {
    if (!selectorPaths.has(pathKey) &&
      !isHighPriorityPath(path) &&
      !proxyConfig.preProxyPaths.some(p => pathKey === p || pathKey.startsWith(`${p}.`))) {
      return target as any;
    }
  }

  // Check for cached proxy
  if (proxyCache.has(target)) {
    proxyCacheStats.cacheHits++;
    proxyCacheLRU.touch(target);
    return proxyCache.get(target);
  }

  // Check depth limit
  if (proxyConfig.selectiveProxying && depth > proxyConfig.maxDepth) {
    return target as any;
  }

  // Create new proxy
  proxyCacheStats.cacheMisses++;
  proxyCacheStats.totalProxiesCreated++;
  proxyCacheStats.activeCachedProxies++;

  // If target is not extensible, clone it
  if (!Object.isExtensible(target)) {
    target = Array.isArray(target) ? [...target] as any : { ...target };
  }

  // Add custom methods for objects
  if (typeof target === 'object' && !Array.isArray(target)) {
    addObjectMethods(target, path);
  }

  // Add custom methods for arrays
  if (Array.isArray(target)) {
    addArrayMethods(target, path);
  }

  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'symbol') {
        return Reflect.get(obj, prop, receiver);
      }

      const currentPropPath = [...path, prop.toString()];
      const propPathKey = currentPropPath.join('.');

      // Track path access during dependency tracking
      if (proxyConfig.trackPathUsage && propPathKey.split('.').length <= proxyConfig.maxPathLength) {
        pathUsageStats.accessedPaths.add(propPathKey);
        // Also add to selector paths for ultra-selective proxying
        selectorPaths.add(propPathKey);
      }

      // Track path access for dependency tracking (inline to avoid circular dependency)
      if (typeof require !== 'undefined') {
        try {
          const { trackPathAccess } = require('./tracking');
          trackPathAccess(currentPropPath);
        } catch (e) {
          // Skip tracking if module not available
        }
      }

      const value = obj[prop as keyof T];

      // For objects, create proxies for nested values
      if (value && typeof value === 'object' && path.length < proxyConfig.maxDepth) {
        const shouldProxy = !proxyConfig.lazyProxyDeepObjects ||
          pathUsageStats.accessedPaths.has(propPathKey) ||
          pathUsageStats.modifiedPaths.has(propPathKey) ||
          pathUsageStats.subscribedPaths.has(propPathKey) ||
          proxyConfig.preProxyPaths.some(p => propPathKey === p || propPathKey.startsWith(`${p}.`));

        if (shouldProxy) {
          return createAdvancedProxy(value as any, currentPropPath, depth + 1);
        }
      }

      return value;
    },

    set(obj, prop, value, receiver) {
      if (typeof prop === 'symbol') {
        return Reflect.set(obj, prop, value, receiver);
      }

      const propPath = [...path, prop.toString()];
      const propPathKey = propPath.join('.');

      // Track modification
      if (proxyConfig.trackPathUsage) {
        pathUsageStats.modifiedPaths.add(propPathKey);
      }

      // Handle object assignment with proxying
      if (value && typeof value === 'object' && !proxyCache.has(value)) {
        const newPath = [...path, prop.toString()];
        const proxiedValue = createAdvancedProxy(value as any, newPath, 0);
        const result = Reflect.set(obj, prop, proxiedValue, receiver);

        // Notify the specific property path and all parent/child paths
        notifyListeners(propPath);

        return result;
      }

      const result = Reflect.set(obj, prop, value, receiver);

      // Notify the specific property path (this will also notify parent/child paths)
      notifyListeners(propPath);

      return result;
    },

    deleteProperty(obj, prop) {
      if (typeof prop === 'string') {
        const propPath = [...path, prop];
        const propPathKey = propPath.join('.');
        if (proxyConfig.trackPathUsage) {
          pathUsageStats.modifiedPaths.add(propPathKey);
        }

        const result = Reflect.deleteProperty(obj, prop);
        if (result) {
          // Notify the deleted property path (this will also notify parent/child paths)
          notifyListeners(propPath);
        }
        return result;
      }

      return Reflect.deleteProperty(obj, prop);
    }
  });

  // Cache the proxy
  proxyCache.set(target, proxy);
  proxyCacheLRU.add(target, proxy);

  // Track the path for this proxy
  proxyPathMap.set(proxy, [...path]);

  return proxy as any;
}

/**
 * Add custom methods to object targets
 */
function addObjectMethods<T extends object>(target: T, path: string[]): void {
  const methodsToDefine: Record<string, PropertyDescriptor> = {};

  if (!('$merge' in target)) {
    methodsToDefine.$merge = {
      value: function (newProps: Partial<T>) {
        const currentPath = proxyPathMap.get(this) || path;

        Object.keys(newProps).forEach(key => {
          if (proxyConfig.trackPathUsage) {
            const propPath = [...currentPath, key].join('.');
            pathUsageStats.modifiedPaths.add(propPath);
          }

          const newValue = (newProps as any)[key];
          if (newValue && typeof newValue === 'object' && !proxyCache.has(newValue)) {
            const newPath = [...currentPath, key];
            // Use Reflect.set with this proxy as the receiver to trigger the set handler
            Reflect.set(this, key, createAdvancedProxy(newValue, newPath, 0), this);
          } else {
            // Use Reflect.set with this proxy as the receiver to trigger the set handler
            Reflect.set(this, key, newValue, this);
          }
        });

        return this;
      },
      enumerable: false
    };
  }

  if (!('$set' in target)) {
    methodsToDefine.$set = {
      value: function (newProps: Partial<T>) {
        const currentPath = proxyPathMap.get(this) || path;

        // Clear existing properties
        Object.keys(this).forEach(key => {
          if (typeof (this as any)[key] !== 'function') {
            Reflect.deleteProperty(this, key);
          }
        });

        // Set new properties
        Object.keys(newProps || {}).forEach(key => {
          if (proxyConfig.trackPathUsage) {
            const propPath = [...currentPath, key].join('.');
            pathUsageStats.modifiedPaths.add(propPath);
          }

          const newValue = (newProps as any)[key];
          if (newValue && typeof newValue === 'object' && !proxyCache.has(newValue)) {
            const newPath = [...currentPath, key];
            // Use Reflect.set with this proxy as the receiver to trigger the set handler
            Reflect.set(this, key, createAdvancedProxy(newValue, newPath, 0), this);
          } else {
            // Use Reflect.set with this proxy as the receiver to trigger the set handler
            Reflect.set(this, key, newValue, this);
          }
        });

        return this;
      },
      enumerable: false
    };
  }

  if (!('$delete' in target)) {
    methodsToDefine.$delete = {
      value: function (keys: keyof T | Array<keyof T>) {
        const currentPath = proxyPathMap.get(this) || path;
        const keysToDelete = Array.isArray(keys) ? keys : [keys];

        keysToDelete.forEach(key => {
          // Use Reflect.deleteProperty to trigger the deleteProperty handler
          Reflect.deleteProperty(this, key as string | symbol);
        });

        return this;
      },
      enumerable: false
    };
  }

  if (!('$update' in target)) {
    methodsToDefine.$update = {
      value: function <K extends keyof T>(key: K, updater: (value: T[K]) => T[K]) {
        const currentPath = proxyPathMap.get(this) || path;

        if (proxyConfig.trackPathUsage && currentPath.length > 0) {
          const propPath = [...currentPath, key as string].join('.');
          pathUsageStats.modifiedPaths.add(propPath);
        }

        const currentValue = (this as any)[key];
        let newValue = updater(currentValue);

        if (newValue && typeof newValue === 'object' && !proxyCache.has(newValue)) {
          const newPath = [...currentPath, key as string];
          newValue = createAdvancedProxy(newValue as any, newPath, 0);
        }

        // Use Reflect.set with this proxy as the receiver to trigger the set handler
        Reflect.set(this, key as string | symbol, newValue, this);

        return this;
      },
      enumerable: false
    };
  }

  if (!('$reset' in target)) {
    methodsToDefine.$reset = {
      value: function () {
        const currentPath = proxyPathMap.get(this) || path;

        let initialValue: any = initialStoreState;
        for (const segment of currentPath) {
          if (initialValue && typeof initialValue === 'object' && segment in initialValue) {
            initialValue = initialValue[segment];
          } else {
            initialValue = undefined;
            break;
          }
        }

        if (initialValue !== undefined) {
          // Clear existing properties
          Object.keys(this).forEach((key: string) => {
            if (typeof (this as any)[key] !== 'function') {
              Reflect.deleteProperty(this, key);
            }
          });

          // Set new properties
          if (initialValue && typeof initialValue === 'object') {
            Object.entries(initialValue).forEach(([key, value]) => {
              // Use Reflect.set with this proxy as the receiver to trigger the set handler
              Reflect.set(this, key, JSON.parse(JSON.stringify(value)), this);
            });
          }
        }

        return this;
      },
      enumerable: false
    };
  }

  if (!('raw' in target)) {
    methodsToDefine.raw = {
      value: function () {
        return JSON.parse(JSON.stringify(this));
      },
      enumerable: false,
      configurable: true
    };
  }

  if (Object.keys(methodsToDefine).length > 0) {
    Object.defineProperties(target, methodsToDefine);
  }
}

/**
 * Add custom methods to array targets
 */
function addArrayMethods<T>(target: T[], path: string[]): void {
  const originalPush = target.push;
  const originalSplice = target.splice;

  // Override push
  Object.defineProperty(target, 'push', {
    value: function (...items: T[]) {
      const currentPath = proxyPathMap.get(this) || path;
      const processedItems = items.map(item => {
        if (item && typeof item === 'object' && !proxyCache.has(item)) {
          const itemPath = [...currentPath, '_item'];
          return createAdvancedProxy(item as any, itemPath, 0);
        }
        return item;
      });

      const result = originalPush.apply(this, processedItems);

      if (currentPath.length > 0) {
        if (proxyConfig.trackPathUsage) {
          pathUsageStats.modifiedPaths.add(currentPath.join('.'));
        }
        notifyListeners(currentPath);
      }

      return result;
    },
    writable: true,
    configurable: true
  });

  // Override splice
  Object.defineProperty(target, 'splice', {
    value: function (start: number, deleteCount?: number, ...items: T[]) {
      const currentPath = proxyPathMap.get(this) || path;
      const arrayLength = this.length;

      const processedItems = items.map((item, index) => {
        if (item && typeof item === 'object' && !proxyCache.has(item)) {
          const itemPath = [...currentPath, (start + index).toString()];
          return createAdvancedProxy(item as any, itemPath, 0);
        }
        return item;
      });

      const actualDeleteCount = deleteCount === undefined ? (arrayLength - start) : deleteCount;
      const result = originalSplice.apply(this, [start, actualDeleteCount, ...processedItems]);

      if (currentPath.length > 0) {
        if (proxyConfig.trackPathUsage) {
          pathUsageStats.modifiedPaths.add(currentPath.join('.'));
        }

        // Notify the array itself
        notifyListeners(currentPath);

        // Also notify about each index that was affected
        for (let i = start; i < arrayLength; i++) {
          const indexPath = [...currentPath, i.toString()];
          notifyListeners(indexPath);
        }
      }

      return result;
    },
    writable: true,
    configurable: true
  });

  // Add $set method for arrays
  if (!('$set' in target)) {
    Object.defineProperty(target, '$set', {
      value: function (newArray: T[]) {
        if (!Array.isArray(newArray)) {
          console.error('$set on array must be called with an array');
          return this;
        }

        const currentPath = proxyPathMap.get(this) || path;
        this.length = 0;

        const processedItems = newArray.map((item, index) => {
          if (item && typeof item === 'object' && !proxyCache.has(item)) {
            const itemPath = [...currentPath, index.toString()];
            return createAdvancedProxy(item as any, itemPath, 0);
          }
          return item;
        });

        originalPush.apply(this, processedItems);

        if (currentPath.length > 0) {
          if (proxyConfig.trackPathUsage) {
            pathUsageStats.modifiedPaths.add(currentPath.join('.'));
          }
          notifyListeners(currentPath);
        }

        return this;
      },
      enumerable: false,
      configurable: true
    });
  }

  // Add $reset method for arrays
  if (!('$reset' in target)) {
    Object.defineProperty(target, '$reset', {
      value: function () {
        const currentPath = proxyPathMap.get(this) || path;

        let initialValue: any = initialStoreState;
        for (const segment of currentPath) {
          if (initialValue && typeof initialValue === 'object' && segment in initialValue) {
            initialValue = initialValue[segment];
          } else {
            initialValue = [];
            break;
          }
        }

        if (!Array.isArray(initialValue)) {
          initialValue = [];
        }

        this.length = 0;

        const processedItems = initialValue.map((item: any, index: number) => {
          if (item && typeof item === 'object' && !proxyCache.has(item)) {
            const itemPath = [...currentPath, index.toString()];
            return createAdvancedProxy(item as any, itemPath, 0);
          }
          return item;
        });

        if (processedItems.length > 0) {
          originalPush.apply(this, processedItems);
        }

        if (currentPath.length > 0) {
          notifyListeners(currentPath);
        }

        return this;
      },
      enumerable: false,
      configurable: true
    });
  }

  // Add raw method
  if (!('raw' in target)) {
    Object.defineProperty(target, 'raw', {
      value: function () {
        return JSON.parse(JSON.stringify(this));
      },
      enumerable: false,
      configurable: true
    });
  }
}

/**
 * Clear proxy cache
 */
export function clearProxyCache(): void {
  proxyCache = new WeakMap<object, any>();
  proxyCacheLRU.clear();
  proxyCacheStats.cacheHits = 0;
  proxyCacheStats.cacheMisses = 0;
  proxyCacheStats.activeCachedProxies = 0;

  if (monitoringConfig.enabled) {
    console.log('🧹 Proxy cache cleared');
  }
}

/**
 * Get proxy cache statistics
 */
export function getProxyCacheStats() {
  return {
    ...proxyCacheStats,
    hitRatio: proxyCacheStats.cacheHits / (proxyCacheStats.cacheHits + proxyCacheStats.cacheMisses || 1),
    estimatedCacheSize: proxyCacheLRU.size()
  };
}

/**
 * Optimize memory usage
 */
export function optimizeMemoryUsage(aggressive = false): any {
  pathUsageStats.accessedPaths.clear();
  pathUsageStats.modifiedPaths.clear();

  const evictedCount = aggressive ?
    proxyCacheLRU.evictPercentage(0.8) :
    proxyCacheLRU.evictPercentage(0.4);

  if (aggressive && typeof (global as any).gc === 'function') {
    try {
      (global as any).gc();
      if (monitoringConfig.enabled) {
        console.log('🧹 Forced garbage collection');
      }
    } catch (e) {
      console.error('Failed to force garbage collection:', e);
    }
  }

  if (monitoringConfig.enabled) {
    console.log(`🧹 Memory optimization complete. Evicted ${evictedCount} cached proxies`);
  }

  return {
    proxiesEvicted: evictedCount,
    currentMemoryEstimate: memoryPressure.estimateMemoryUsage(),
    selectorPathsRemaining: selectorPaths.size
  };
} 