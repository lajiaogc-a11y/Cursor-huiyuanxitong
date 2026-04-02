import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setSpaNavigate, spaNavigate } from "./spaNavigation";

describe("spaNavigation", () => {
  beforeEach(() => {
    setSpaNavigate(null);
  });

  afterEach(() => {
    setSpaNavigate(null);
  });

  it("uses registered navigate for internal paths", () => {
    const nav = vi.fn();
    setSpaNavigate((to, o) => nav(to, o));
    spaNavigate("/staff/orders");
    expect(nav).toHaveBeenCalledWith("/staff/orders", undefined);
    spaNavigate("/x", { replace: true });
    expect(nav).toHaveBeenCalledWith("/x", { replace: true });
  });

  // jsdom 中 location.assign 不可 mock，回退行为在集成环境验证
});
