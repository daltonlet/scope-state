import { useEffect, useState, useCallback, useRef } from 'react';
import { subscribe } from '../core/listeners';
import { trackDependencies } from '../core/tracking';
import { pathUsageStats, selectorPaths } from '../core/proxy';
import { createReadonlySnapshot } from '../core/snapshot';
import type { ScopeSnapshot } from '../types';

/**
 * Hook to subscribe to the global store and re-render when specific data changes.
 * 
 * The hook tracks which store paths your selector function accesses and only
 * re-renders the component when those specific paths change. This provides
 * fine-grained reactivity without unnecessary renders.
 * 
 * The returned value is a read-only snapshot of the selected state. Mutate the
 * store through the main `$` proxy (or a proxy created explicitly for commands),
 * and use the hook return value only for rendering.
 * 
 * @example
 * // Subscribe to user data
 * const user = useScope(() => $.user);
 * 
 * // Mutate through the main store proxy
 * $.user.$merge({ name: 'New Name' });
 * 
 * // Subscribe to a specific property
 * const userName = useScope(() => $.user.name);
 * 
 * // Subscribe to a computed value
 * const isAdmin = useScope(() => $.user.role === 'admin');
 * 
 * @param selector - Function that returns the data you want to subscribe to
 * @returns A read-only snapshot of the selected data
 */
export function useScope<T>(
  selector: () => T
): ScopeSnapshot<T> {

  const snapshotCacheRef = useRef<{
    revision: number;
    source: unknown;
    snapshot: unknown;
  }>({
    revision: -1,
    source: undefined,
    snapshot: undefined,
  });

  // Track dependencies and get the selected value from the store
  const { value: selectedValue, paths: trackedPaths } = trackDependencies(selector);

  // Add tracked paths to selector paths for ultra-selective proxying
  trackedPaths.forEach(path => {
    selectorPaths.add(path);
    pathUsageStats.subscribedPaths.add(path);
  });

  // Use a counter to invalidate the cached snapshot only when this hook
  // receives a relevant store notification.
  const [revision, forceUpdate] = useState(0);

  // Create stable update handler that forces re-render
  const handleChange = useCallback(() => {
    try {
      forceUpdate(count => count + 1);
    } catch (error) {
      console.error('Error in useScope update:', error);
    }
  }, []);

  useEffect(() => {

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        handleChange();
      });
    } else {
      setTimeout(() => {
        handleChange();
      }, 16);
    }

    // Create path keys for subscription using the original approach
    // If trackedPaths is ['user', 'name'], create subscriptions for ['user', 'user.name']
    const pathKeys = trackedPaths.length > 0
      ? trackedPaths.map((_, index, array) => array.slice(0, index + 1).join('.'))
      : [''];

    // Subscribe to all relevant paths
    const unsubscribeFunctions = pathKeys.map(pathKey => {
      // Mark this path as subscribed for usage tracking
      pathUsageStats.subscribedPaths.add(pathKey);
      return subscribe(pathKey, handleChange);
    });

    // Clean up subscriptions on unmount or dependency change
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [trackedPaths.join(','), handleChange]); // Stable dependencies

  if (selectedValue === null || typeof selectedValue !== 'object') {
    return selectedValue as ScopeSnapshot<T>;
  }

  if (
    snapshotCacheRef.current.revision !== revision ||
    snapshotCacheRef.current.source !== selectedValue
  ) {
    snapshotCacheRef.current = {
      revision,
      source: selectedValue,
      snapshot: createReadonlySnapshot(selectedValue),
    };
  }

  return snapshotCacheRef.current.snapshot as ScopeSnapshot<T>;
} 