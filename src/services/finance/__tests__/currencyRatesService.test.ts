/**
 * currencyRatesService.ts 单元测试
 *
 * 验证：
 * 1. 默认常量的正确性
 * 2. fetchCurrencyRatesToNGN 多源聚合逻辑（含中位数计算）
 * 3. 降级逻辑（部分源失败时仍能返回结果）
 * 4. 全部源失败时返回 null
 * 5. 异常汇率拒绝（NGN < 100 表明数据异常）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CURRENCY_RATES,
  DEFAULT_INTERVAL,
  type CurrencyRates,
  fetchCurrencyRatesToNGN,
} from '../currencyRatesService';

// ─── Mock sharedDataService（避免 API 调用）──────────────────────────────────
vi.mock('@/services/finance/sharedDataService', () => ({
  loadSharedData: vi.fn().mockResolvedValue(null),
  saveSharedData: vi.fn().mockResolvedValue(undefined),
  getSharedDataSync: vi.fn().mockReturnValue(null),
  saveSharedDataSync: vi.fn(),
  subscribeToSharedData: vi.fn().mockReturnValue(() => {}),
}));

// ─── Mock EXTERNAL_API ────────────────────────────────────────────────────────
vi.mock('@/config/externalApis', () => ({
  EXTERNAL_API: {
    EXCHANGE_RATE_USD_ER_API: 'https://api.source1.test/rates',
    EXCHANGE_RATE_USD_EXCHANGERATE_API: 'https://api.source2.test/rates',
    EXCHANGE_RATE_USD_CURRENCY_PAGES: 'https://api.source3.test/rates',
  },
}));

// ─── 辅助：构造 fetch mock 响应 ───────────────────────────────────────────────
function makeSource1Response(ngnRate: number, extraRates: Record<string, number> = {}) {
  return {
    ok: true,
    json: async () => ({
      rates: {
        NGN: ngnRate,
        MYR: 4.7,
        GBP: 0.79,
        CAD: 1.36,
        EUR: 0.92,
        CNY: 7.24,
        ...extraRates,
      },
    }),
  };
}

function makeSource3Response(ngnRate: number) {
  return {
    ok: true,
    json: async () => ({
      usd: {
        ngn: ngnRate,
        myr: 4.7,
        gbp: 0.79,
        cad: 1.36,
        eur: 0.92,
        cny: 7.24,
      },
    }),
  };
}

function makeErrorResponse() {
  return { ok: false, json: async () => ({}) };
}

// ─── DEFAULT_CURRENCY_RATES ──────────────────────────────────────────────────

describe('DEFAULT_CURRENCY_RATES — 默认汇率常量', () => {
  it('has all required currency pairs', () => {
    const required: (keyof CurrencyRates)[] = [
      'USD_NGN', 'MYR_NGN', 'GBP_NGN', 'CAD_NGN', 'EUR_NGN', 'CNY_NGN', 'lastUpdated'
    ];
    for (const key of required) {
      expect(DEFAULT_CURRENCY_RATES).toHaveProperty(key);
    }
  });

  it('has positive rate values', () => {
    expect(DEFAULT_CURRENCY_RATES.USD_NGN).toBeGreaterThan(0);
    expect(DEFAULT_CURRENCY_RATES.MYR_NGN).toBeGreaterThan(0);
    expect(DEFAULT_CURRENCY_RATES.GBP_NGN).toBeGreaterThan(0);
    expect(DEFAULT_CURRENCY_RATES.CAD_NGN).toBeGreaterThan(0);
    expect(DEFAULT_CURRENCY_RATES.EUR_NGN).toBeGreaterThan(0);
    expect(DEFAULT_CURRENCY_RATES.CNY_NGN).toBeGreaterThan(0);
  });

  it('USD_NGN is a realistic NGN rate (100 to 10000)', () => {
    expect(DEFAULT_CURRENCY_RATES.USD_NGN).toBeGreaterThan(100);
    expect(DEFAULT_CURRENCY_RATES.USD_NGN).toBeLessThan(10000);
  });

  it('lastUpdated is a valid ISO string', () => {
    expect(() => new Date(DEFAULT_CURRENCY_RATES.lastUpdated)).not.toThrow();
    expect(new Date(DEFAULT_CURRENCY_RATES.lastUpdated).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});

// ─── DEFAULT_INTERVAL ────────────────────────────────────────────────────────

describe('DEFAULT_INTERVAL — 默认自动更新间隔', () => {
  it('is 2 hours in seconds', () => {
    expect(DEFAULT_INTERVAL).toBe(7200);
    expect(DEFAULT_INTERVAL).toBe(2 * 60 * 60);
  });
});

// ─── fetchCurrencyRatesToNGN ─────────────────────────────────────────────────

describe('fetchCurrencyRatesToNGN — 多源汇率采集', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns rates when all 3 sources succeed', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(1450))  // source 1
      .mockResolvedValueOnce(makeSource1Response(1440))  // source 2
      .mockResolvedValueOnce(makeSource3Response(1435)); // source 3

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).not.toBeNull();
    // Median of [1435, 1440, 1450] = 1440
    expect(result!.USD_NGN).toBe(1440);
    expect(result!.lastUpdated).toBeDefined();
  });

  it('returns rates when only 1 source succeeds', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(1450)) // source 1 OK
      .mockResolvedValueOnce(makeErrorResponse())         // source 2 fail
      .mockResolvedValueOnce(makeErrorResponse());        // source 3 fail

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).not.toBeNull();
    expect(result!.USD_NGN).toBe(1450);
  });

  it('returns rates when 2 of 3 sources succeed (median of 2)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(1450)) // source 1 OK
      .mockResolvedValueOnce(makeSource1Response(1440)) // source 2 OK
      .mockResolvedValueOnce(makeErrorResponse());       // source 3 fail

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).not.toBeNull();
    // Median of [1440, 1450] = (1440+1450)/2 = 1445
    expect(result!.USD_NGN).toBe(1445);
  });

  it('returns null when ALL sources fail', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse());

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).toBeNull();
  });

  it('returns null when sources return NGN < 100 (implausible rate)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(5)) // clearly wrong NGN rate
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse());

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).toBeNull();
  });

  it('returns null when fetch throws network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).toBeNull();
  });

  it('result has all required currency pairs', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(1450))
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse());

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('USD_NGN');
    expect(result).toHaveProperty('MYR_NGN');
    expect(result).toHaveProperty('GBP_NGN');
    expect(result).toHaveProperty('CAD_NGN');
    expect(result).toHaveProperty('EUR_NGN');
    expect(result).toHaveProperty('CNY_NGN');
    expect(result).toHaveProperty('lastUpdated');
  });

  it('cross rates are computed as USD_NGN / currency_per_USD', async () => {
    // NGN = 1500, GBP per USD = 0.75 → GBP_NGN = 1500/0.75 = 2000
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { NGN: 1500, MYR: 4.0, GBP: 0.75, CAD: 1.5, EUR: 1.0, CNY: 8.0 },
        }),
      })
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse());

    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchCurrencyRatesToNGN();

    expect(result).not.toBeNull();
    // GBP_NGN = 1500 / 0.75 = 2000
    expect(result!.GBP_NGN).toBeCloseTo(2000, 1);
    // MYR_NGN = 1500 / 4.0 = 375
    expect(result!.MYR_NGN).toBeCloseTo(375, 1);
  });

  it('result lastUpdated is recent ISO string', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeSource1Response(1450))
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeErrorResponse());

    vi.stubGlobal('fetch', mockFetch);
    const before = Date.now();
    const result = await fetchCurrencyRatesToNGN();
    const after = Date.now();

    const resultTime = new Date(result!.lastUpdated).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before - 1000);
    expect(resultTime).toBeLessThanOrEqual(after + 1000);
  });
});
