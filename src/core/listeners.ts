import type { PathListeners, Listener, MonitoringStats } from '../types';
import { monitoringConfig } from '../config';

// Path-specific listeners
export const pathListeners: PathListeners = new Map();

// Statistics for monitoring
export let monitoringStats: MonitoringStats = {
  proxyCount: 0,
  totalSubscriptionsCreated: 0,
  totalSubscriptionsRemoved: 0,
  activeSubscriptions: 0,
  pathSubscriptionCounts: {},
  timings: {
    lastNotifyTime: 0,
    lastPersistTime: 0,
    averageNotifyTime: 0,
    averagePersistTime: 0,
    notifyTimeTotal: 0,
    persistTimeTotal: 0,
    notifyCount: 0,
    persistCount: 0,
  },
  leakDetection: {
    lastCheckTime: 0,
    totalChecks: 0,
    leaksDetected: 0,
    renderCyclesSinceCheck: 0,
    isLeakDetectionRunning: false,
    leakDetectionTimer: null,
  }
};

/**
 * Subscribe to changes on a specific path
 */
export function subscribe(path: string, listener: Listener): () => void {
  if (!pathListeners.has(path)) {
    pathListeners.set(path, new Set());
  }

  pathListeners.get(path)?.add(listener);
  logSubscriptionAdded(path);

  // Return unsubscribe function
  return () => {
    pathListeners.get(path)?.delete(listener);
    logSubscriptionRemoved(path);

    // Clean up empty listener sets
    if (pathListeners.get(path)?.size === 0) {
      pathListeners.delete(path);
      if (monitoringConfig.enabled && monitoringConfig.logSubscriptions) {
        console.log(`🧹 Removed empty listener set for ${path}`);
      }
    }
  };
}

/**
 * Notify all listeners for a given path and its parents/children
 */
export function notifyListeners(path: string[]): void {
  if (typeof window === 'undefined') return;

  const pathKey = path.join('.');

  let startTime = 0;
  if (monitoringConfig.enabled && monitoringConfig.logStateChanges) {
    startTime = logTimestamp(`⚡️ Notifying path: ${pathKey}`);
  }

  // Track render cycle for leak detection
  if (monitoringConfig.enabled && monitoringConfig.autoLeakDetection) {
    monitoringStats.leakDetection.renderCyclesSinceCheck++;
  }

  // Notify exact path listeners
  if (pathListeners.has(pathKey)) {
    const listeners = pathListeners.get(pathKey);
    if (monitoringConfig.enabled && monitoringConfig.verboseLogging) {
      console.log(`🔔 Notifying ${listeners?.size} exact listeners for ${pathKey}`);
    }
    listeners?.forEach(listener => listener());
  }

  // Special handling for array index changes - notify the array itself too
  const lastSegment = path.length > 0 ? path[path.length - 1] : '';
  if (lastSegment && !isNaN(Number(lastSegment))) {
    // This is an array index update, also notify about the array
    const arrayPath = path.slice(0, -1).join('.');
    if (pathListeners.has(arrayPath)) {
      const listeners = pathListeners.get(arrayPath);
      if (monitoringConfig.enabled && monitoringConfig.verboseLogging) {
        console.log(`🔔 Notifying ${listeners?.size} array listeners for ${arrayPath} (index change)`);
      }
      listeners?.forEach(listener => listener());
    }
  }

  // Also notify parent paths (more granular update notifications)
  for (let i = path.length - 1; i >= 0; i--) {
    const parentPath = path.slice(0, i).join('.');
    if (pathListeners.has(parentPath)) {
      const listeners = pathListeners.get(parentPath);
      if (monitoringConfig.enabled && monitoringConfig.verboseLogging) {
        console.log(`🔔 Notifying ${listeners?.size} parent listeners for ${parentPath}`);
      }
      listeners?.forEach(listener => listener());
    }
  }

  // Notify child paths (if an object was completely replaced)
  const prefix = pathKey + '.';
  let childListenerCount = 0;
  pathListeners.forEach((listeners, key) => {
    if (key.startsWith(prefix)) {
      childListenerCount += listeners.size;
      listeners.forEach(listener => listener());
    }
  });

  if (monitoringConfig.enabled && monitoringConfig.verboseLogging && childListenerCount > 0) {
    console.log(`🔔 Notified ${childListenerCount} child listeners for paths starting with ${prefix}`);
  }

  if (monitoringConfig.enabled && monitoringConfig.logStateChanges && startTime > 0) {
    const duration = logTimingEnd('Notification cycle', startTime);
    updateTimingStat('notify', duration);
  }
}

/**
 * Get total number of active listeners
 */
export function getListenerCount(): number {
  let total = 0;
  pathListeners.forEach(listeners => {
    total += listeners.size;
  });
  return total;
}

/**
 * Get all active paths
 */
export function getActivePaths(): string[] {
  return Array.from(pathListeners.keys());
}

/**
 * Clear all listeners (for cleanup)
 */
export function clearAllListeners(): void {
  pathListeners.clear();
  if (monitoringConfig.enabled) {
    console.log('🧹 All listeners cleared');
  }
}

// Logging helper functions
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

function updateTimingStat(type: 'notify' | 'persist', duration: number) {
  if (!monitoringConfig.enabled) return;

  if (type === 'notify') {
    monitoringStats.timings.lastNotifyTime = duration;
    monitoringStats.timings.notifyTimeTotal += duration;
    monitoringStats.timings.notifyCount++;
    monitoringStats.timings.averageNotifyTime =
      monitoringStats.timings.notifyTimeTotal / monitoringStats.timings.notifyCount;
  } else {
    monitoringStats.timings.lastPersistTime = duration;
    monitoringStats.timings.persistTimeTotal += duration;
    monitoringStats.timings.persistCount++;
    monitoringStats.timings.averagePersistTime =
      monitoringStats.timings.persistTimeTotal / monitoringStats.timings.persistCount;
  }
}

function logSubscriptionAdded(path: string) {
  if (!monitoringConfig.enabled || !monitoringConfig.logSubscriptions) return;

  monitoringStats.totalSubscriptionsCreated++;
  monitoringStats.activeSubscriptions++;
  monitoringStats.pathSubscriptionCounts[path] = (monitoringStats.pathSubscriptionCounts[path] || 0) + 1;

  console.log(`📈 Subscription ADDED to ${path}. Total: ${monitoringStats.activeSubscriptions}, Path count: ${monitoringStats.pathSubscriptionCounts[path]}`);
}

function logSubscriptionRemoved(path: string) {
  if (!monitoringConfig.enabled || !monitoringConfig.logSubscriptions) return;

  monitoringStats.totalSubscriptionsRemoved++;
  monitoringStats.activeSubscriptions--;
  monitoringStats.pathSubscriptionCounts[path] = (monitoringStats.pathSubscriptionCounts[path] || 0) - 1;

  console.log(`📉 Subscription REMOVED from ${path}. Total: ${monitoringStats.activeSubscriptions}, Path count: ${monitoringStats.pathSubscriptionCounts[path]}`);

  // Alert if a path has no subscribers but still exists in the map
  if (monitoringStats.pathSubscriptionCounts[path] <= 0) {
    const actualListeners = pathListeners.get(path)?.size || 0;
    if (actualListeners > 0) {
      console.warn(`⚠️ Path ${path} shows ${actualListeners} listeners but tracking shows ${monitoringStats.pathSubscriptionCounts[path]}`);
    }
  }
} 