import { describe, it, expect } from "vitest";
import {
  calculateCardWorth,
  calculatePaymentValue,
  calculateProfit,
  calculateProfitRate,
  reverseCalculateActualPaid,
  calculateNormalOrderDerivedValues,
  calculateUsdtOrderDerivedValues,
} from "./orderCalculations";

describe("calculateCardWorth", () => {
  it("calculates card value × rate", () => {
    expect(calculateCardWorth(100, 1.5)).toBe(150);
    expect(calculateCardWorth(0, 1.5)).toBe(0);
  });
});

describe("calculatePaymentValue", () => {
  it("NGN mode: actualPaid / foreignRate + fee", () => {
    // 1000 / 2 + 50 = 550
    expect(calculatePaymentValue(1000, 2, 50, "NGN")).toBe(550);
  });
  it("GHS mode: actualPaid × foreignRate + fee", () => {
    // 100 × 3 + 10 = 310
    expect(calculatePaymentValue(100, 3, 10, "GHS")).toBe(310);
  });
  it("returns actualPaid + fee when rate is 0", () => {
    expect(calculatePaymentValue(100, 0, 10, "NGN")).toBe(110);
  });
});

describe("calculateProfit", () => {
  it("profit = cardWorth - paymentValue", () => {
    expect(calculateProfit(1000, 800)).toBe(200);
    expect(calculateProfit(500, 600)).toBe(-100);
  });
});

describe("calculateProfitRate", () => {
  it("profit rate as percentage of cardWorth", () => {
    expect(calculateProfitRate(200, 1000)).toBe(20);
  });
  it("returns 0 when cardWorth is 0", () => {
    expect(calculateProfitRate(100, 0)).toBe(0);
  });
});

describe("reverseCalculateActualPaid", () => {
  it("NGN: (paymentValue - fee) × rate", () => {
    // (550 - 50) × 2 = 1000
    expect(reverseCalculateActualPaid(550, 2, 50, "NGN")).toBe(1000);
  });
  it("GHS: (paymentValue - fee) / rate", () => {
    // (310 - 10) / 3 = 100
    expect(reverseCalculateActualPaid(310, 3, 10, "GHS")).toBe(100);
  });
});

describe("calculateNormalOrderDerivedValues", () => {
  it("computes all derived values for NGN order", () => {
    const result = calculateNormalOrderDerivedValues({
      cardValue: 100, cardRate: 10, actualPaid: 500, foreignRate: 2, fee: 50, currency: "NGN",
    });
    expect(result.cardWorth).toBe(1000);       // 100×10
    expect(result.paymentValue).toBe(300);      // 500/2 + 50
    expect(result.profit).toBe(700);            // 1000 - 300
    expect(result.profitRate).toBe(70);         // 700/1000×100
  });
});

describe("calculateUsdtOrderDerivedValues", () => {
  it("computes USDT order values", () => {
    const result = calculateUsdtOrderDerivedValues({
      cardValue: 100, cardRate: 10, usdtRate: 5, actualPaidUsdt: 100, feeUsdt: 10,
    });
    expect(result.cardWorth).toBe(1000);
    expect(result.totalValueUsdt).toBe(200);    // 1000/5
    expect(result.paymentValue).toBe(110);      // 100+10
    expect(result.profit).toBe(90);             // 200-110
    expect(result.profitRate).toBe(45);         // 90/200×100
  });
});
