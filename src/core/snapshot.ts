import type { ScopeSnapshot } from '../types';
import { proxyTargetMap } from './proxy';

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unwrapProxyTarget<T>(value: T): T {
  if (value && typeof value === 'object' && proxyTargetMap.has(value as object)) {
    return proxyTargetMap.get(value as object) as T;
  }

  return value;
}

/**
 * Create a read-only snapshot suitable for rendering.
 *
 * Snapshots are plain arrays/objects with no proxy methods, which makes them
 * safe for React Compiler memoization while keeping `$` as the mutable API.
 */
export function createReadonlySnapshot<T>(
  value: T,
  seen = new WeakMap<object, unknown>()
): ScopeSnapshot<T> {
  if (value === null || typeof value !== 'object') {
    return value as ScopeSnapshot<T>;
  }

  const source = unwrapProxyTarget(value) as object;

  if (seen.has(source)) {
    return seen.get(source) as ScopeSnapshot<T>;
  }

  if (Array.isArray(source)) {
    const snapshot: unknown[] = [];
    seen.set(source, snapshot);

    source.forEach(item => {
      snapshot.push(createReadonlySnapshot(item, seen));
    });

    return snapshot as ScopeSnapshot<T>;
  }

  if (!isPlainObject(source)) {
    return source as ScopeSnapshot<T>;
  }

  const snapshot: Record<string, unknown> = {};
  seen.set(source, snapshot);

  Object.keys(source).forEach(key => {
    const propertyValue = source[key];

    if (typeof propertyValue !== 'function') {
      snapshot[key] = createReadonlySnapshot(propertyValue, seen);
    }
  });

  return snapshot as ScopeSnapshot<T>;
}
