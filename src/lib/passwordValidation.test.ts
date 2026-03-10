import { describe, it, expect } from "vitest";
import { validatePassword, getPasswordStrength } from "./passwordValidation";

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    const r = validatePassword("Aa1");
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it("rejects missing uppercase", () => {
    expect(validatePassword("abcdefg1").valid).toBe(false);
  });
  it("rejects missing lowercase", () => {
    expect(validatePassword("ABCDEFG1").valid).toBe(false);
  });
  it("rejects missing number", () => {
    expect(validatePassword("Abcdefgh").valid).toBe(false);
  });
  it("accepts valid password", () => {
    expect(validatePassword("Abcdefg1").valid).toBe(true);
    expect(validatePassword("Abcdefg1").errors).toHaveLength(0);
  });
});

describe("getPasswordStrength", () => {
  it("returns weak for short", () => {
    expect(getPasswordStrength("abc")).toBe("weak");
  });
  it("returns medium for basic valid", () => {
    expect(getPasswordStrength("Abcdefg1")).toBe("medium");
  });
  it("returns strong for complex", () => {
    expect(getPasswordStrength("Abcdefg1!@#$")).toBe("strong");
  });
});
