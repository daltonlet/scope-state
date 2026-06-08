import { proxyConfig } from '../config';
import { selectorPaths, pathUsageStats } from './proxy';

// Unique full dotted paths accessed during selector execution
let trackedPaths: Set<string> = new Set();
let isTracking = false;
let skipTrackingDepth = 0;

/**
 * Track dependencies during selector execution - tracks full dotted paths
 */
export function trackDependencies<T>(selector: () => T): { value: T, paths: string[] } {
  isTracking = true;
  trackedPaths = new Set();
  skipTrackingDepth = 0;

  const value = selector();

  isTracking = false;

  const paths = Array.from(trackedPaths).filter(path =>
    path && path.length < 500
  );

  trackedPaths = new Set();

  return { value, paths };
}

/**
 * Check if we're currently tracking dependencies
 */
export function isCurrentlyTracking(): boolean {
  return isTracking && skipTrackingDepth === 0;
}

/**
 * Temporarily skip tracking (for array method internals)
 */
export function skipTracking<T>(fn: () => T): T {
  skipTrackingDepth++;
  try {
    return fn();
  } finally {
    skipTrackingDepth--;
  }
}

/**
 * Run fn while capturing any newly tracked paths, then remove them from the main set.
 * Caller decides whether to re-add captured paths (e.g. on a matched find iteration).
 */
export function capturePathsDuring<T>(fn: () => T): { value: T; paths: string[] } {
  const snapshot = new Set(trackedPaths);
  const value = fn();
  const newPaths: string[] = [];

  trackedPaths.forEach(path => {
    if (!snapshot.has(path)) {
      newPaths.push(path);
      trackedPaths.delete(path);
    }
  });

  return { value, paths: newPaths };
}

/**
 * Add paths to the active tracking set (used by smart array method overrides)
 */
export function addTrackedPaths(paths: string[]): void {
  if (!isTracking) return;
  paths.forEach(path => trackedPaths.add(path));
}

/**
 * Get current tracking state (for debugging)
 */
export function getTrackingState(): {
  isTracking: boolean;
  trackedPaths: string[];
  skipDepth: number;
} {
  return {
    isTracking,
    trackedPaths: Array.from(trackedPaths),
    skipDepth: skipTrackingDepth,
  };
}

/**
 * Add a full path to tracking during proxy get operations
 */
export function trackPathAccess(path: string[]): void {
  if (!isTracking || skipTrackingDepth > 0) return;

  if (path.length <= proxyConfig.maxPathLength) {
    const fullPath = path.join('.');
    trackedPaths.add(fullPath);
    pathUsageStats.accessedPaths.add(fullPath);
    selectorPaths.add(fullPath);
  }
}

/**
 * Mark a path as modified during proxy set operations
 */
export function trackPathModification(path: string[]): void {
  const pathStr = path.join('.');

  pathUsageStats.modifiedPaths.add(pathStr);
  pathUsageStats.accessedPaths.add(pathStr);
}

/**
 * Reset tracking state (for testing/debugging)
 */
export function resetTracking(): void {
  isTracking = false;
  trackedPaths = new Set();
  skipTrackingDepth = 0;
}
