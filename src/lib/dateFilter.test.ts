import { describe, it, expect } from 'vitest';
import {
  getTimeRangeDates,
  toLocalISOString,
  parseDate,
  isDateInRange,
  filterByDateRange,
  formatDateForDisplay,
  formatDateRangeForDisplay,
} from './dateFilter';

describe('dateFilter', () => {
  // ── getTimeRangeDates ──
  describe('getTimeRangeDates', () => {
    it('"全部" returns null range', () => {
      const range = getTimeRangeDates('全部');
      expect(range.start).toBeNull();
      expect(range.end).toBeNull();
    });

    it('"今日" returns today boundaries', () => {
      const range = getTimeRangeDates('今日');
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.start!.getHours()).toBe(0);
      expect(range.end!.getHours()).toBe(23);
      expect(range.end!.getMinutes()).toBe(59);
    });

    it('"昨日" returns yesterday boundaries', () => {
      const range = getTimeRangeDates('昨日');
      const now = new Date();
      const expectedDate = now.getDate() - 1;
      // Handle month boundary
      expect(range.start).toBeInstanceOf(Date);
      expect(range.start!.getHours()).toBe(0);
      expect(range.end!.getHours()).toBe(23);
    });

    it('"近7天" spans 7 days ending today', () => {
      const range = getTimeRangeDates('近7天');
      const diffMs = range.end!.getTime() - range.start!.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThan(7.1);
    });

    it('"自定义" with dates returns those dates', () => {
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 0, 31);
      const range = getTimeRangeDates('自定义', start, end);
      expect(range.start!.getFullYear()).toBe(2025);
      expect(range.end!.getDate()).toBe(31);
    });

    it('"自定义" without dates returns null', () => {
      const range = getTimeRangeDates('自定义');
      expect(range.start).toBeNull();
    });
  });

  // ── toLocalISOString ──
  describe('toLocalISOString', () => {
    it('formats date as local ISO string', () => {
      const date = new Date(2025, 5, 15, 14, 30, 0, 0);
      const result = toLocalISOString(date);
      expect(result).toBe('2025-06-15T14:30:00.000');
    });
  });

  // ── parseDate ──
  describe('parseDate', () => {
    it('parses ISO format', () => {
      const date = parseDate('2025-06-15T10:30:00.000Z');
      expect(date).toBeInstanceOf(Date);
    });

    it('parses zh-CN format (YYYY/M/D HH:mm:ss)', () => {
      const date = parseDate('2025/6/15 10:30:00');
      expect(date).toBeInstanceOf(Date);
      expect(date!.getMonth()).toBe(5); // June
    });

    it('parses date-only format', () => {
      const date = parseDate('2025-6-15');
      expect(date).toBeInstanceOf(Date);
    });

    it('returns null for empty string', () => {
      expect(parseDate('')).toBeNull();
    });

    it('returns null for invalid string', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  // ── isDateInRange ──
  describe('isDateInRange', () => {
    it('returns true when no range set', () => {
      expect(isDateInRange('2025-01-01', { start: null, end: null })).toBe(true);
    });

    it('returns true when date is within range', () => {
      const range = { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) };
      expect(isDateInRange('2025-06-15', range)).toBe(true);
    });

    it('returns false when date is before range', () => {
      const range = { start: new Date(2025, 6, 1), end: new Date(2025, 11, 31) };
      expect(isDateInRange('2025-01-01', range)).toBe(false);
    });

    it('returns false for unparseable date', () => {
      const range = { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) };
      expect(isDateInRange('invalid', range)).toBe(false);
    });
  });

  // ── filterByDateRange ──
  describe('filterByDateRange', () => {
    const data = [
      { id: 1, created_at: '2025-01-15T00:00:00' },
      { id: 2, created_at: '2025-06-15T00:00:00' },
      { id: 3, created_at: '2025-12-15T00:00:00' },
    ];

    it('returns all data when no range', () => {
      const result = filterByDateRange(data, 'created_at', { start: null, end: null });
      expect(result).toHaveLength(3);
    });

    it('filters correctly within range', () => {
      const range = { start: new Date(2025, 5, 1), end: new Date(2025, 6, 1) };
      const result = filterByDateRange(data, 'created_at', range);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });
  });

  // ── Display formatting ──
  describe('formatDateForDisplay', () => {
    it('formats date in zh-CN locale', () => {
      const date = new Date(2025, 0, 5);
      const result = formatDateForDisplay(date);
      expect(result).toContain('2025');
    });
  });

  describe('formatDateRangeForDisplay', () => {
    it('returns "全部时间" for null range', () => {
      expect(formatDateRangeForDisplay({ start: null, end: null })).toBe('全部时间');
    });

    it('formats range with dates', () => {
      const range = { start: new Date(2025, 0, 1), end: new Date(2025, 0, 31) };
      const result = formatDateRangeForDisplay(range);
      expect(result).toContain(' - ');
    });
  });
});
