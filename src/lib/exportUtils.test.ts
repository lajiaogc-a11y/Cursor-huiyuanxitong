import { describe, it, expect } from 'vitest';
import {
  formatNumberForExport,
  formatPercentForExport,
  formatDateTimeForExport,
  maskPhone,
  maskBankCard,
  maskName,
  createMaskedFormatter,
} from './exportUtils';

describe('exportUtils', () => {
  // ── formatNumberForExport ──
  describe('formatNumberForExport', () => {
    it('formats number with 2 decimals', () => {
      expect(formatNumberForExport(123.456)).toBe('123.46');
    });

    it('returns 0.00 for null', () => {
      expect(formatNumberForExport(null)).toBe('0.00');
    });

    it('returns 0.00 for undefined', () => {
      expect(formatNumberForExport(undefined)).toBe('0.00');
    });

    it('returns 0.00 for NaN', () => {
      expect(formatNumberForExport(NaN)).toBe('0.00');
    });

    it('handles zero', () => {
      expect(formatNumberForExport(0)).toBe('0.00');
    });
  });

  // ── formatPercentForExport ──
  describe('formatPercentForExport', () => {
    it('converts ratio to percentage', () => {
      expect(formatPercentForExport(0.1234)).toBe('12.34%');
    });

    it('returns 0.00% for null', () => {
      expect(formatPercentForExport(null)).toBe('0.00%');
    });

    it('returns 0.00% for NaN', () => {
      expect(formatPercentForExport(NaN)).toBe('0.00%');
    });
  });

  // ── formatDateTimeForExport ──
  describe('formatDateTimeForExport', () => {
    it('formats valid ISO date', () => {
      const result = formatDateTimeForExport('2025-06-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty for null', () => {
      expect(formatDateTimeForExport(null)).toBe('');
    });

    it('returns empty for undefined', () => {
      expect(formatDateTimeForExport(undefined)).toBe('');
    });
  });

  // ── PII Masking ──
  describe('maskPhone', () => {
    it('masks middle digits of phone number', () => {
      const result = maskPhone('13812345678');
      expect(result).toContain('****');
      expect(result.startsWith('138')).toBe(true);
      expect(result.endsWith('5678')).toBe(true);
    });

    it('returns empty for null', () => {
      expect(maskPhone(null)).toBe('');
    });

    it('returns short strings as-is', () => {
      expect(maskPhone('1234')).toBe('1234');
    });
  });

  describe('maskBankCard', () => {
    it('masks middle digits', () => {
      const result = maskBankCard('6222021234567890');
      expect(result).toBe('6222****7890');
    });

    it('returns empty for null', () => {
      expect(maskBankCard(null)).toBe('');
    });

    it('returns short cards as-is', () => {
      expect(maskBankCard('12345678')).toBe('12345678');
    });
  });

  describe('maskName', () => {
    it('masks all but first character', () => {
      expect(maskName('张三')).toBe('张*');
    });

    it('handles single character', () => {
      expect(maskName('张')).toBe('张');
    });

    it('returns empty for null', () => {
      expect(maskName(null)).toBe('');
    });

    it('masks English names', () => {
      expect(maskName('John')).toBe('J***');
    });
  });

  // ── createMaskedFormatter ──
  describe('createMaskedFormatter', () => {
    it('masks when enabled', () => {
      const fmt = createMaskedFormatter(true);
      expect(fmt.phone('13812345678')).toContain('****');
      expect(fmt.bankCard('6222021234567890')).toContain('****');
      expect(fmt.name('张三')).toBe('张*');
    });

    it('does not mask when disabled', () => {
      const fmt = createMaskedFormatter(false);
      expect(fmt.phone('13812345678')).toBe('13812345678');
      expect(fmt.name('张三')).toBe('张三');
    });
  });
});
