import { describe, it, expect } from "vitest";
import { daysBetween } from "../src/utils.js";

describe("utils", () => {
  it("daysBetween calcule correctement", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-01-02")).toBe(1);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
  });
});