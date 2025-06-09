import { proxyConfig } from '../config';
import { selectorPaths, pathUsageStats } from './proxy';

// Track the current path we're accessing during a selector function
let currentPath: string[] = [];
let isTracking = false;
let skipTrackingDepth = 0;

/**
 * Track dependencies during selector execution - tracks individual path segments
 */
export function trackDependencies<T>(selector: () => T): { value: T, paths: string[] } {
  // Start tracking
  isTracking = true;
  currentPath = [];
  skipTrackingDepth = 0;

  // Execute selector to track dependencies
  const value = selector();

  // Stop tracking and get the tracked paths
  isTracking = false;

  // Clean up and return individual path segments (not full paths)
  const cleanedPaths = [...currentPath].filter(segment => {
    // Filter out segments that would create overly long paths
    return segment && segment.length < 100; // Basic length check for individual segments
  });

  currentPath = [];

  return { value, paths: cleanedPaths };
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
 * Get current tracking state (for debugging)
 */
export function getTrackingState(): {
  isTracking: boolean;
  currentPath: string[];
  skipDepth: number;
} {
  return {
    isTracking,
    currentPath: [...currentPath],
    skipDepth: skipTrackingDepth,
  };
}

/**
 * Add a path segment to tracking during proxy get operations
 */
export function trackPathAccess(path: string[]): void {
  if (!isTracking || skipTrackingDepth > 0) return;

  // Track only the last property name (individual segment)
  const prop = path[path.length - 1];

  // Only track if prop exists and path isn't too deep
  if (prop && path.length <= proxyConfig.maxPathLength) {
    currentPath.push(prop);

    // Add full path to usage stats and selector paths for ultra-selective proxying
    const fullPath = path.join('.');
    pathUsageStats.accessedPaths.add(fullPath);
    selectorPaths.add(fullPath);
  }
}

/**
 * Mark a path as modified during proxy set operations
 */
export function trackPathModification(path: string[]): void {
  const pathStr = path.join('.');

  // Add to modification tracking
  pathUsageStats.modifiedPaths.add(pathStr);

  // Also mark as accessed
  pathUsageStats.accessedPaths.add(pathStr);
}

/**
 * Reset tracking state (for testing/debugging)
 */
export function resetTracking(): void {
  isTracking = false;
  currentPath = [];
  skipTrackingDepth = 0;
} 