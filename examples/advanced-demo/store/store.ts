'use client';

import { configure, getDefaultAdapter } from '../../../src/index';

// Demo store schema
interface DemoState {
  user: {
    name: string;
    email: string;
    preferences: {
      theme: 'light' | 'dark';
      notifications: boolean;
      tags: string[];
    };
  };
  todos: Array<{
    id: number;
    text: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
  }>;
  counters: {
    global: number;
    user: number;
    todos: number;
  };
  demo: {
    renderCount: number;
    lastAction: string;
    timestamp: number;
  };
}

// Initialize demo store
export const $ = configure<DemoState>({
  initialState: {
    user: {
      name: '',
      email: '',
      preferences: {
        theme: 'dark',
        notifications: false,
        tags: []
      }
    },
    todos: [
      { id: 1, text: 'Learn Scope State', completed: true, priority: 'high' },
      { id: 2, text: 'Build amazing app', completed: false, priority: 'medium' },
      { id: 3, text: 'Share with community', completed: false, priority: 'low' }
    ],
    counters: {
      global: 0,
      user: 0,
      todos: 0
    },
    demo: {
      renderCount: 0,
      lastAction: 'App initialized',
      timestamp: Date.now()
    }
  },
  persistence: {
    enabled: true,
    paths: undefined,
    blacklist: ['demo'],
    batchDelay: 300,
    storageAdapter: getDefaultAdapter(),
    autoHydrate: true
  },
  monitoring: {
    enabled: true,
    autoLeakDetection: true,
    leakDetectionInterval: 15000,
    verboseLogging: true,
  },
  proxy: {
    maxDepth: 6,
    ultraSelectiveProxying: false,
    aggressiveMemoryManagement: false,
    lazyProxyDeepObjects: false,
    nonBlockingProxyCreation: false,
    smartArrayTracking: true,
    proxySelectorPaths: true,
    selectiveProxying: true,
    prioritizeUIObjects: true,
    maxPathLength: 10,
    disableProxyingUnderPressure: false,
    maxQueueSize: 1000,
    enabled: true,
    trackPathUsage: true,
  }
});