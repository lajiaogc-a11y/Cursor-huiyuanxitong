// ============= Performance Utilities =============
// Debounce, throttle, and input activity tracking for optimized data entry

// Global input activity tracker
let lastInputTime = 0;
let isInputActive = false;

// ============= Tracking Pause Control =============
// Allows temporarily pausing all metric collection (e.g., after clearing data)
let isTrackingPaused = false;
let pauseEndTime = 0;

// Pause tracking for a duration (default 5 seconds)
export function pauseTracking(durationMs: number = 5000): void {
  isTrackingPaused = true;
  pauseEndTime = Date.now() + durationMs;
  console.log(`[PerfMonitor] Tracking paused for ${durationMs}ms`);
}

// Check if tracking is currently active
export function isTrackingActive(): boolean {
  if (isTrackingPaused) {
    if (Date.now() < pauseEndTime) {
      return false;
    }
    // Pause period ended, resume tracking
    isTrackingPaused = false;
    console.log('[PerfMonitor] Tracking resumed');
  }
  return true;
}

// Get remaining pause time in ms (0 if not paused)
export function getRemainingPauseTime(): number {
  if (!isTrackingPaused) return 0;
  const remaining = pauseEndTime - Date.now();
  return remaining > 0 ? remaining : 0;
}

// Update input activity (call on every keystroke)
export function markInputActive(): void {
  lastInputTime = Date.now();
  isInputActive = true;
}

// Check if user is actively typing (within threshold)
export function isUserTyping(thresholdMs: number = 2000): boolean {
  if (!isInputActive) return false;
  const elapsed = Date.now() - lastInputTime;
  if (elapsed > thresholdMs) {
    isInputActive = false;
    return false;
  }
  return true;
}

// Reset input activity state
export function resetInputActivity(): void {
  isInputActive = false;
  lastInputTime = 0;
}

// Debounce function with configurable delay
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

// Throttle function - execute at most once per interval
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastExecution = 0;
  let pendingArgs: Parameters<T> | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const elapsed = now - lastExecution;
    
    if (elapsed >= interval) {
      lastExecution = now;
      fn(...args);
    } else {
      // Store pending args for delayed execution
      pendingArgs = args;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (pendingArgs) {
            lastExecution = Date.now();
            fn(...pendingArgs);
            pendingArgs = null;
          }
          timeoutId = null;
        }, interval - elapsed);
      }
    }
  };
}

// Deferred execution - skip if input is active, queue for later
export function deferWhileTyping<T extends (...args: any[]) => any>(
  fn: T,
  checkInterval: number = 500
): (...args: Parameters<T>) => void {
  let pendingArgs: Parameters<T> | null = null;
  let checkTimeoutId: NodeJS.Timeout | null = null;
  
  const executeWhenIdle = () => {
    if (isUserTyping()) {
      // Still typing, check again later
      checkTimeoutId = setTimeout(executeWhenIdle, checkInterval);
    } else if (pendingArgs) {
      fn(...pendingArgs);
      pendingArgs = null;
      checkTimeoutId = null;
    }
  };
  
  return (...args: Parameters<T>) => {
    pendingArgs = args;
    
    if (!isUserTyping()) {
      // Not typing, execute immediately
      fn(...args);
      pendingArgs = null;
    } else if (!checkTimeoutId) {
      // Start checking for idle
      checkTimeoutId = setTimeout(executeWhenIdle, checkInterval);
    }
  };
}

// Create a debounced async function that also tracks input activity
export function createDebouncedSearch<T>(
  searchFn: (query: string) => Promise<T>,
  delay: number = 600
): {
  search: (query: string) => void;
  cancel: () => void;
  getResult: () => Promise<T> | null;
} {
  let timeoutId: NodeJS.Timeout | null = null;
  let currentPromise: Promise<T> | null = null;
  
  return {
    search: (query: string) => {
      markInputActive();
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        currentPromise = searchFn(query);
        timeoutId = null;
      }, delay);
    },
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    getResult: () => currentPromise,
  };
}

// Performance timing utility
export function measurePerformance(label: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (duration > 16) {
      console.warn(`[Perf] ${label} took ${duration.toFixed(2)}ms`);
    }
  };
}

// ============= Performance Monitoring =============

interface RenderMetrics {
  componentName: string;
  renderCount: number;
  lastRenderTime: number;
  avgRenderTime: number;
  totalRenderTime: number;
  unnecessaryRenders: number; // Renders within short window (likely duplicates)
}

const renderMetricsMap = new Map<string, RenderMetrics>();
const UNNECESSARY_RENDER_THRESHOLD_MS = 100; // Renders within 100ms are likely unnecessary

// Track component render (dev only)
export function trackRender(componentName: string): void {
  // Skip entirely in production for zero overhead
  if (!import.meta.env.DEV) return;
  // Skip tracking if paused
  if (!isTrackingActive()) return;
  
  const now = performance.now();
  const existing = renderMetricsMap.get(componentName);
  
  if (existing) {
    const timeSinceLastRender = now - existing.lastRenderTime;
    const isUnnecessary = timeSinceLastRender < UNNECESSARY_RENDER_THRESHOLD_MS;
    
    renderMetricsMap.set(componentName, {
      ...existing,
      renderCount: existing.renderCount + 1,
      lastRenderTime: now,
      unnecessaryRenders: isUnnecessary 
        ? existing.unnecessaryRenders + 1 
        : existing.unnecessaryRenders,
    });
  } else {
    renderMetricsMap.set(componentName, {
      componentName,
      renderCount: 1,
      lastRenderTime: now,
      avgRenderTime: 0,
      totalRenderTime: 0,
      unnecessaryRenders: 0,
    });
  }
}

// Track render duration
export function trackRenderDuration(componentName: string, duration: number): void {
  const existing = renderMetricsMap.get(componentName);
  if (existing) {
    const newTotal = existing.totalRenderTime + duration;
    renderMetricsMap.set(componentName, {
      ...existing,
      totalRenderTime: newTotal,
      avgRenderTime: newTotal / existing.renderCount,
    });
  }
}

// Get performance report
export function getPerformanceReport(): RenderMetrics[] {
  return Array.from(renderMetricsMap.values())
    .sort((a, b) => b.unnecessaryRenders - a.unnecessaryRenders);
}

// Log performance summary to console
export function logPerformanceSummary(): void {
  const report = getPerformanceReport();
  if (report.length === 0) {
    console.log('[PerfMonitor] No render data collected yet');
    return;
  }
  
  console.group('[PerfMonitor] Component Render Summary');
  console.table(report.map(m => ({
    Component: m.componentName,
    'Total Renders': m.renderCount,
    'Unnecessary Renders': m.unnecessaryRenders,
    'Avg Time (ms)': m.avgRenderTime.toFixed(2),
    'Waste %': m.renderCount > 0 
      ? ((m.unnecessaryRenders / m.renderCount) * 100).toFixed(1) + '%'
      : '0%',
  })));
  console.groupEnd();
}

// Clear metrics and pause tracking
export function clearPerformanceMetrics(): void {
  renderMetricsMap.clear();
  pauseTracking(5000); // Pause for 5 seconds after clearing
  console.log('[PerfMonitor] Metrics cleared, tracking paused for 5s');
}

// Hook-like helper for tracking renders in functional components
export function useRenderTracker(componentName: string): void {
  trackRender(componentName);
}

// Expose to window for debugging in browser console (dev only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__perfMonitor = {
    getReport: getPerformanceReport,
    logSummary: logPerformanceSummary,
    clear: clearPerformanceMetrics,
  };
}
