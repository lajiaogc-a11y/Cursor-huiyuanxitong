import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pauseTracking,
  isTrackingActive,
  getRemainingPauseTime,
  markInputActive,
  isUserTyping,
  resetInputActivity,
  debounce,
  throttle,
  measurePerformance,
  getPerformanceReport,
  clearPerformanceMetrics,
} from './performanceUtils';

describe('performanceUtils', () => {
  beforeEach(() => {
    resetInputActivity();
    clearPerformanceMetrics();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Pause Tracking ──
  describe('pauseTracking / isTrackingActive', () => {
    it('pauses tracking for the specified duration', () => {
      pauseTracking(1000);
      expect(isTrackingActive()).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(isTrackingActive()).toBe(true);
    });

    it('getRemainingPauseTime returns remaining ms', () => {
      pauseTracking(2000);
      vi.advanceTimersByTime(500);
      expect(getRemainingPauseTime()).toBeGreaterThan(0);
      expect(getRemainingPauseTime()).toBeLessThanOrEqual(1500);
    });

    it('getRemainingPauseTime returns 0 after pause expires', () => {
      vi.advanceTimersByTime(6000); // advance past the 5s pause from clearPerformanceMetrics
      expect(getRemainingPauseTime()).toBe(0);
    });
  });

  // ── Input Activity ──
  describe('markInputActive / isUserTyping', () => {
    it('marks input active and detects typing', () => {
      markInputActive();
      expect(isUserTyping(2000)).toBe(true);
    });

    it('stops detecting typing after threshold', () => {
      markInputActive();
      vi.advanceTimersByTime(3000);
      expect(isUserTyping(2000)).toBe(false);
    });

    it('resetInputActivity clears typing state', () => {
      markInputActive();
      resetInputActivity();
      expect(isUserTyping()).toBe(false);
    });
  });

  // ── Debounce ──
  describe('debounce', () => {
    it('delays execution until after wait period', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);
      debounced('a');
      debounced('b');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('b');
    });
  });

  // ── Throttle ──
  describe('throttle', () => {
    it('executes immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 500);
      throttled('first');
      expect(fn).toHaveBeenCalledWith('first');
    });

    it('queues subsequent calls within interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 500);
      throttled('first');
      throttled('second');
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('second');
    });
  });

  // ── measurePerformance ──
  describe('measurePerformance', () => {
    it('returns a stop function', () => {
      const stop = measurePerformance('test');
      expect(typeof stop).toBe('function');
    });
  });

  // ── Performance Report ──
  describe('getPerformanceReport / clearPerformanceMetrics', () => {
    it('returns empty array initially', () => {
      expect(getPerformanceReport()).toEqual([]);
    });
  });
});
