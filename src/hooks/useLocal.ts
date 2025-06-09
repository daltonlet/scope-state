import { useState } from 'react';
import { createAdvancedProxy } from '../core/proxy';
import type { CustomMethods, CustomArrayMethods } from '../types';

/**
 * Hook to create reactive local state that persists across component re-renders.
 * 
 * This creates a reactive proxy object with custom methods ($merge, $set, $update, etc.)
 * that can be used to update local component state. Unlike the global store,
 * this state is isolated to the component instance.
 * 
 * The state persists across re-renders but is reset when the component unmounts.
 * 
 * @example
 * function MyComponent() {
 *   const localState = useLocal({ count: 0, name: 'John' });
 * 
 *   return (
 *     <div>
 *       <p>Count: {localState.count}</p>
 *       <button onClick={() => localState.$merge({ count: localState.count + 1 })}>
 *         Increment
 *       </button>
 *       <button onClick={() => localState.$update('name', name => name.toUpperCase())}>
 *         Uppercase Name
 *       </button>
 *     </div>
 *   );
 * }
 * 
 * @param initialState - The initial state object
 * @returns A reactive proxy object with custom methods for state updates
 */
export function useLocal<T extends object>(
  initialState: T
): T extends any[]
  ? T & CustomArrayMethods<T[0]>
  : T & CustomMethods<T> {

  // Create the reactive state only once using lazy initialization
  const [localState] = useState(() => createAdvancedProxy(initialState));

  return localState as T extends any[]
    ? T & CustomArrayMethods<T[0]>
    : T & CustomMethods<T>;
} 