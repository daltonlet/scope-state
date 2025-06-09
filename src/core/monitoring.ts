import { pathListeners, monitoringStats } from './listeners';
import { monitoringConfig } from '../config';
import { pathUsageStats, selectorPaths, getProxyCacheStats, optimizeMemoryUsage } from './proxy';

/**
 * Perform automatic leak check
 */
function performAutoLeakCheck(): void {
  if (typeof window === 'undefined') return;

  if (!monitoringConfig.enabled || !monitoringConfig.autoLeakDetection ||
    monitoringStats.leakDetection.isLeakDetectionRunning) {
    return;
  }

  monitoringStats.leakDetection.isLeakDetectionRunning = true;

  try {
    console.log(`Running automatic leak detection (check #${monitoringStats.leakDetection.totalChecks + 1})`);
    const leakReport = monitorAPI.checkForLeaks(false);
    if (!leakReport) return;

    // Only show detailed report if threshold is exceeded
    if (leakReport.orphanedListeners >= monitoringConfig.leakAlertThreshold) {
      console.warn(`MEMORY LEAK ALERT: ${leakReport.orphanedListeners} orphaned listeners detected!`);
      console.log('Paths with potential leaks:');
      leakReport.mismatchedCounts.forEach(msg => console.log(`- ${msg}`));

      monitoringStats.leakDetection.leaksDetected++;

      // Auto-optimize if many leaks found
      if (leakReport.orphanedListeners > monitoringConfig.leakAlertThreshold * 2) {
        console.log('Auto-optimizing memory due to high leak count...');
        optimizeMemoryUsage(false);
      }
    }

    monitoringStats.leakDetection.lastCheckTime = Date.now();
    monitoringStats.leakDetection.totalChecks++;
    monitoringStats.leakDetection.renderCyclesSinceCheck = 0;
  } catch (e) {
    console.error('Error during automatic leak check:', e);
  } finally {
    monitoringStats.leakDetection.isLeakDetectionRunning = false;
  }
}

/**
 * Monitor API for debugging and memory leak detection
 */
export const monitorAPI = {
  // Enable or disable monitoring
  setEnabled: (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    monitoringConfig.enabled = enabled;
  },

  // Set verbose logging
  setVerboseLogging: (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    monitoringConfig.verboseLogging = enabled;
  },

  // Configure specific monitoring features
  configure: (config: Partial<typeof monitoringConfig>) => {
    Object.assign(monitoringConfig, config);
  },

  // Get current stats
  getStats: () => ({ ...monitoringStats }),

  // Get detailed listener info
  getListenerInfo: () => {
    const info: Record<string, number> = {};
    pathListeners.forEach((listeners, path) => {
      info[path] = listeners.size;
    });
    return info;
  },

  // Check for potential memory leaks
  checkForLeaks: (logReport = true) => {
    if (typeof window === 'undefined') return null;

    const leakReport = {
      orphanedListeners: 0,
      mismatchedCounts: [] as string[],
      emptyPaths: [] as string[],
      totalListeners: 0,
      summary: ''
    };

    // Check for paths with listeners but no subscribers in our tracking
    pathListeners.forEach((listeners, path) => {
      leakReport.totalListeners += listeners.size;
      const trackedCount = monitoringStats.pathSubscriptionCounts[path] || 0;

      if (listeners.size > 0 && trackedCount <= 0) {
        leakReport.orphanedListeners += listeners.size;
        leakReport.mismatchedCounts.push(`Path ${path}: actual=${listeners.size}, tracked=${trackedCount}`);
      }

      if (listeners.size === 0) {
        leakReport.emptyPaths.push(path);
      }
    });

    leakReport.summary = `Found ${leakReport.orphanedListeners} potential leaked listeners across ${leakReport.mismatchedCounts.length} paths. Total listeners: ${leakReport.totalListeners}`;

    if (logReport) {
      console.log('LEAK CHECK REPORT:');
      console.log(leakReport.summary);
      if (leakReport.mismatchedCounts.length > 0) {
        console.log('Paths with potential leaks:');
        leakReport.mismatchedCounts.forEach(msg => console.log(`- ${msg}`));
      }
    }

    return leakReport;
  },

  // Start automatic leak detection
  startAutoLeakDetection: (interval = 30000) => {
    if (typeof window === 'undefined') return false;

    monitoringConfig.autoLeakDetection = true;
    monitoringConfig.leakDetectionInterval = interval;

    // Clear any existing timer
    if (monitoringStats.leakDetection.leakDetectionTimer) {
      clearInterval(monitoringStats.leakDetection.leakDetectionTimer);
    }

    // Set up periodic leak detection
    monitoringStats.leakDetection.leakDetectionTimer = setInterval(() => {
      if (monitoringStats.leakDetection.renderCyclesSinceCheck >= monitoringConfig.leakScanMinimumRenderCycles) {
        performAutoLeakCheck();
      }
    }, interval);

    console.log(`Automatic leak detection started (interval: ${interval}ms)`);
    return true;
  },

  // Stop automatic leak detection
  stopAutoLeakDetection: () => {
    if (typeof window === 'undefined') return false;

    monitoringConfig.autoLeakDetection = false;

    if (monitoringStats.leakDetection.leakDetectionTimer) {
      clearInterval(monitoringStats.leakDetection.leakDetectionTimer);
      monitoringStats.leakDetection.leakDetectionTimer = null;
    }

    console.log('Automatic leak detection stopped');
    return true;
  },

  // Configure leak detection
  configureLeakDetection: (config: {
    enabled?: boolean;
    interval?: number;
    alertThreshold?: number;
    minimumRenderCycles?: number;
  }) => {
    if (typeof window === 'undefined') return;

    if (config.enabled !== undefined) {
      monitoringConfig.autoLeakDetection = config.enabled;
    }

    if (config.interval !== undefined) {
      monitoringConfig.leakDetectionInterval = config.interval;
    }

    if (config.alertThreshold !== undefined) {
      monitoringConfig.leakAlertThreshold = config.alertThreshold;
    }

    if (config.minimumRenderCycles !== undefined) {
      monitoringConfig.leakScanMinimumRenderCycles = config.minimumRenderCycles;
    }

    // Restart if enabled
    if (monitoringConfig.autoLeakDetection) {
      monitorAPI.startAutoLeakDetection(monitoringConfig.leakDetectionInterval);
    } else {
      monitorAPI.stopAutoLeakDetection();
    }

    console.log('Leak detection configuration updated:', {
      enabled: monitoringConfig.autoLeakDetection,
      interval: monitoringConfig.leakDetectionInterval,
      alertThreshold: monitoringConfig.leakAlertThreshold,
      minimumRenderCycles: monitoringConfig.leakScanMinimumRenderCycles
    });
  },

  // Get leak detection stats
  getLeakDetectionStats: () => ({
    isEnabled: monitoringConfig.autoLeakDetection,
    interval: monitoringConfig.leakDetectionInterval,
    checksPerformed: monitoringStats.leakDetection.totalChecks,
    leaksDetected: monitoringStats.leakDetection.leaksDetected,
    alertThreshold: monitoringConfig.leakAlertThreshold
  }),

  // Reset statistics
  resetStats: () => {
    monitoringStats.proxyCount = 0;
    monitoringStats.totalSubscriptionsCreated = 0;
    monitoringStats.totalSubscriptionsRemoved = 0;
    monitoringStats.activeSubscriptions = 0;
    monitoringStats.pathSubscriptionCounts = {};
    monitoringStats.timings = {
      lastNotifyTime: 0,
      lastPersistTime: 0,
      averageNotifyTime: 0,
      averagePersistTime: 0,
      notifyTimeTotal: 0,
      persistTimeTotal: 0,
      notifyCount: 0,
      persistCount: 0,
    };
    console.log('Monitoring statistics reset');
  },

  // Force cleanup of empty listener sets
  cleanupEmptyListeners: () => {
    let cleanedCount = 0;
    pathListeners.forEach((listeners, path) => {
      if (listeners.size === 0) {
        pathListeners.delete(path);
        cleanedCount++;
      }
    });
    console.log(`Cleaned up ${cleanedCount} empty listener sets`);
    return cleanedCount;
  },

  // Get proxy cache stats (delegated to proxy module)
  getProxyCacheStats,

  // Get proxy usage stats
  getProxyUsageStats: () => ({
    accessedPaths: Array.from(pathUsageStats.accessedPaths),
    modifiedPaths: Array.from(pathUsageStats.modifiedPaths),
    subscribedPaths: Array.from(pathUsageStats.subscribedPaths),
    totalAccessedPaths: pathUsageStats.accessedPaths.size,
    totalModifiedPaths: pathUsageStats.modifiedPaths.size,
    totalSubscribedPaths: pathUsageStats.subscribedPaths.size,
  }),

  // Reset usage stats
  resetProxyUsageStats: () => {
    pathUsageStats.accessedPaths.clear();
    pathUsageStats.modifiedPaths.clear();
    // Don't clear subscribedPaths as they're used for optimization
    console.log('Proxy usage statistics reset (except subscriptions)');
  },

  // Generate report of most accessed/modified paths for optimization
  generatePathUsageReport: () => {
    const report = {
      mostAccessedPaths: Array.from(pathUsageStats.accessedPaths).slice(0, 20),
      mostModifiedPaths: Array.from(pathUsageStats.modifiedPaths).slice(0, 20),
      subscribedPaths: Array.from(pathUsageStats.subscribedPaths),
      recommendations: [] as string[]
    };

    // Generate recommendations
    if (pathUsageStats.accessedPaths.size > 100) {
      report.recommendations.push(`Consider adding frequently accessed paths to preProxyPaths: ${report.mostAccessedPaths.slice(0, 5).join(', ')}`);
    }

    return report;
  },

  // Memory-optimized leak detection
  optimizeMemoryUsage,

  // Get selector path statistics
  getSelectorPathStats: () => {
    return {
      totalSelectorPaths: selectorPaths.size,
      paths: Array.from(selectorPaths),
      mostAccessedSelectorPaths: Array.from(selectorPaths).slice(0, 20),
    };
  },

  // Clear selector paths (force rebuilding)
  clearSelectorPaths: () => {
    const count = selectorPaths.size;
    selectorPaths.clear();
    console.log(`Cleared ${count} selector paths. They will be rebuilt as components render.`);
    return count;
  },

  // Get comprehensive system status
  getSystemStatus: () => {
    const proxyCacheStats = getProxyCacheStats();
    const leakStats = monitorAPI.getLeakDetectionStats();

    return {
      monitoring: {
        enabled: monitoringConfig.enabled,
        verboseLogging: monitoringConfig.verboseLogging,
        autoLeakDetection: monitoringConfig.autoLeakDetection,
      },
      listeners: {
        total: monitoringStats.activeSubscriptions,
        pathCount: pathListeners.size,
      },
      proxies: {
        cacheSize: proxyCacheStats.estimatedCacheSize,
        hitRatio: proxyCacheStats.hitRatio,
        totalCreated: proxyCacheStats.totalProxiesCreated,
      },
      paths: {
        accessed: pathUsageStats.accessedPaths.size,
        modified: pathUsageStats.modifiedPaths.size,
        subscribed: pathUsageStats.subscribedPaths.size,
        selectors: selectorPaths.size,
      },
      leakDetection: leakStats,
      performance: {
        averageNotifyTime: monitoringStats.timings.averageNotifyTime,
        averagePersistTime: monitoringStats.timings.averagePersistTime,
        totalNotifications: monitoringStats.timings.notifyCount,
        totalPersistOperations: monitoringStats.timings.persistCount,
      }
    };
  },

  // Force a comprehensive health check
  performHealthCheck: () => {
    console.log('Performing comprehensive health check...');

    const leakReport = monitorAPI.checkForLeaks(true);
    const systemStatus = monitorAPI.getSystemStatus();
    const cleanedListeners = monitorAPI.cleanupEmptyListeners();

    const recommendations = [];

    if (leakReport && leakReport.orphanedListeners > 5) {
      recommendations.push('🚨 High number of orphaned listeners detected - consider running optimizeMemoryUsage()');
    }

    if (systemStatus.proxies.hitRatio < 0.8) {
      recommendations.push('📈 Low proxy cache hit ratio - consider reviewing proxy configuration');
    }

    if (systemStatus.paths.accessed > 1000) {
      recommendations.push('📊 High number of accessed paths - consider enabling ultraSelectiveProxying');
    }

    const healthScore = Math.max(0, 100 -
      (leakReport ? leakReport.orphanedListeners * 5 : 0) -
      (systemStatus.proxies.hitRatio < 0.8 ? 20 : 0) -
      (systemStatus.paths.accessed > 1000 ? 15 : 0)
    );

    console.log(`Health Check Complete - Score: ${healthScore}/100`);
    if (recommendations.length > 0) {
      console.log('Recommendations:');
      recommendations.forEach(rec => console.log(`  ${rec}`));
    }

    return {
      healthScore,
      recommendations,
      systemStatus,
      leakReport,
      cleanedListeners
    };
  }
};

// Initialize auto leak detection if configured
if (typeof window !== 'undefined' && monitoringConfig.enabled && monitoringConfig.autoLeakDetection) {
  setTimeout(() => monitorAPI.startAutoLeakDetection(), 5000); // Start after 5 seconds
} 