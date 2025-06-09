import { useEffect, useState, useCallback, useRef } from 'react';
import { subscribe } from '../core/listeners';
import { trackDependencies } from '../core/tracking';
import { pathUsageStats, selectorPaths } from '../core/proxy';
import type { CustomMethods, CustomArrayMethods } from '../types';

/**
 * Hook to subscribe to the global store and re-render when specific data changes.
 * 
 * The hook tracks which store paths your selector function accesses and only
 * re-renders the component when those specific paths change. This provides
 * fine-grained reactivity without unnecessary renders.
 * 
 * For objects, the returned value includes custom methods ($merge, $set, $delete, $update)
 * that allow you to modify the data directly and trigger reactive updates.
 * 
 * @example
 * // Subscribe to user data
 * const user = useScope(() => $.user);
 * 
 * // Update user data directly (triggers re-render only for components using $.user)
 * user.$merge({ name: 'New Name' });
 * 
 * // Subscribe to a specific property
 * const userName = useScope(() => $.user.name);
 * 
 * // Subscribe to a computed value
 * const isAdmin = useScope(() => $.user.role === 'admin');
 * 
 * @param selector - Function that returns the data you want to subscribe to
 * @returns The selected data, with custom methods attached if it's an object
 */
export function useScope<T>(
  selector: () => T
): T extends object
  ? T & CustomMethods<T>
  : T extends Array<infer U>
  ? U[] & CustomArrayMethods<U>
  : T {

  // Use ref to store the latest selector to avoid stale closures
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  // Track dependencies and get initial value with advanced tracking
  const { value: initialValue, paths: trackedPaths } = trackDependencies(selector);

  // Add tracked paths to selector paths for ultra-selective proxying
  trackedPaths.forEach(path => {
    selectorPaths.add(path);
    pathUsageStats.subscribedPaths.add(path);
  });

  // Use a counter to force re-renders instead of storing the value
  // This way we always return the fresh proxy object from the selector
  const [, forceUpdate] = useState(0);

  // Create stable update handler that forces re-render
  const handleChange = useCallback(() => {
    try {
      forceUpdate(count => count + 1);
    } catch (error) {
      console.error('Error in useScope update:', error);
    }
  }, []);

  useEffect(() => {
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

  // Always return the fresh result from the selector (preserves proxy and methods)
  return selectorRef.current() as (T extends object
    ? T & CustomMethods<T>
    : T extends Array<infer U>
    ? U[] & CustomArrayMethods<U>
    : T);
} 