import { describe, it, expect } from "vitest";
import { cleanPhoneNumber, validatePhoneLength, handlePhoneInput } from "./phoneValidation";

describe("cleanPhoneNumber", () => {
  it("keeps only digits", () => {
    expect(cleanPhoneNumber("+234 812-345-6789")).toBe("2348123456789");
    expect(cleanPhoneNumber("abc123def456")).toBe("123456");
    expect(cleanPhoneNumber("  ")).toBe("");
  });
  it("passes through pure digits", () => {
    expect(cleanPhoneNumber("12345678")).toBe("12345678");
  });
});

describe("validatePhoneLength", () => {
  it("accepts empty string", () => {
    expect(validatePhoneLength("").valid).toBe(true);
  });
  it("rejects < 8 digits", () => {
    expect(validatePhoneLength("1234567").valid).toBe(false);
  });
  it("accepts 8-18 digits", () => {
    expect(validatePhoneLength("12345678").valid).toBe(true);
    expect(validatePhoneLength("123456789012345678").valid).toBe(true);
  });
  it("rejects > 18 digits", () => {
    expect(validatePhoneLength("1234567890123456789").valid).toBe(false);
  });
});

describe("handlePhoneInput", () => {
  it("cleans input", () => {
    expect(handlePhoneInput("+1 (234) 567-8901")).toBe("12345678901");
  });
});
