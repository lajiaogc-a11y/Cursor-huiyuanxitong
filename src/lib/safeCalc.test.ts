import { describe, it, expect } from "vitest";
import { safeNumber, safeDivide, safeMultiply, safeAdd, safeSubtract, safePercentage, safeToFixed, safeCurrency } from "./safeCalc";

describe("safeNumber", () => {
  it("converts valid numbers", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber("3.14")).toBe(3.14);
    expect(safeNumber(0)).toBe(0);
  });
  it("returns fallback for invalid values", () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber("")).toBe(0);
    expect(safeNumber("abc")).toBe(0);
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber(Infinity)).toBe(0);
  });
  it("uses custom fallback", () => {
    expect(safeNumber(null, 5)).toBe(5);
  });
});

describe("safeDivide", () => {
  it("divides normally", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(7, 3)).toBeCloseTo(2.333, 2);
  });
  it("returns fallback on divide by zero", () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });
  it("handles invalid inputs", () => {
    expect(safeDivide(null, 2)).toBe(0);
    expect(safeDivide("abc", 2)).toBe(0);
  });
});

describe("safeMultiply", () => {
  it("multiplies values", () => {
    expect(safeMultiply(2, 3)).toBe(6);
    expect(safeMultiply(2, 3, 4)).toBe(24);
  });
  it("returns 0 for empty args", () => {
    expect(safeMultiply()).toBe(0);
  });
});

describe("safeAdd", () => {
  it("adds values", () => {
    expect(safeAdd(1, 2, 3)).toBe(6);
    expect(safeAdd(null, 5, undefined)).toBe(5);
  });
});

describe("safeSubtract", () => {
  it("subtracts values", () => {
    expect(safeSubtract(10, 3)).toBe(7);
    expect(safeSubtract(null, 5)).toBe(-5);
  });
});

describe("safePercentage", () => {
  it("calculates percentage", () => {
    expect(safePercentage(25, 100)).toBe(25);
    expect(safePercentage(1, 3)).toBeCloseTo(33.33, 1);
  });
  it("returns fallback for zero total", () => {
    expect(safePercentage(10, 0)).toBe(0);
  });
});

describe("safeToFixed", () => {
  it("formats numbers", () => {
    expect(safeToFixed(3.14159, 2)).toBe("3.14");
    expect(safeToFixed(null)).toBe("0.00");
  });
});

describe("safeCurrency", () => {
  it("formats currency", () => {
    expect(safeCurrency(1234.5)).toBe("1,234.50");
    expect(safeCurrency(null)).toBe("0.00");
  });
});
