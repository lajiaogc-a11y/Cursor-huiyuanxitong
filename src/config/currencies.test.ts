import { describe, it, expect } from "vitest";
import { CURRENCIES, CURRENCY_CODES, getCurrencyDisplayName, getCurrencyBadgeColor, normalizeCurrencyCode, getCurrencyChineseName } from "./currencies";

describe("CURRENCIES config", () => {
  it("has 3 currencies", () => {
    expect(Object.keys(CURRENCIES)).toHaveLength(3);
    expect(CURRENCY_CODES).toEqual(["NGN", "GHS", "USDT"]);
  });
  it("each currency has required fields", () => {
    for (const c of Object.values(CURRENCIES)) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.name).toBeTruthy();
    }
  });
});

describe("getCurrencyDisplayName", () => {
  it("returns Chinese name by default", () => {
    expect(getCurrencyDisplayName("NGN")).toBe("奈拉");
  });
  it("returns English name", () => {
    expect(getCurrencyDisplayName("GHS", "en")).toBe("Cedi");
  });
});

describe("normalizeCurrencyCode", () => {
  it("normalizes code variants", () => {
    expect(normalizeCurrencyCode("ngn")).toBe("NGN");
    expect(normalizeCurrencyCode("Naira")).toBe("NGN");
    expect(normalizeCurrencyCode("奈拉")).toBe("NGN");
    expect(normalizeCurrencyCode("赛地")).toBe("GHS");
    expect(normalizeCurrencyCode("赛迪")).toBe("GHS");
    expect(normalizeCurrencyCode("USDT")).toBe("USDT");
  });
  it("returns null for unknown", () => {
    expect(normalizeCurrencyCode("EUR")).toBeNull();
  });
});

describe("getCurrencyBadgeColor", () => {
  it("returns badge for known currency", () => {
    expect(getCurrencyBadgeColor("NGN")).toContain("orange");
  });
  it("returns default for unknown", () => {
    expect(getCurrencyBadgeColor("XXX")).toContain("gray");
  });
});

describe("getCurrencyChineseName", () => {
  it("returns Chinese name", () => {
    expect(getCurrencyChineseName("USDT")).toBe("USDT");
  });
});
