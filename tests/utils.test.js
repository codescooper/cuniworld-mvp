import { describe, it, expect } from "vitest";
import { daysBetween, getRabbitStage } from "../src/utils.js";

describe("utils", () => {
  it("daysBetween calcule correctement", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-01-02")).toBe(1);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
  });

  it("getRabbitStage calcule selon l'âge", () => {
    const today = new Date("2026-02-01T00:00:00Z");
    const realDate = Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) {
          return new realDate(today);
        }
        return new realDate(...args);
      }
      static now() {
        return new realDate(today).getTime();
      }
    };

    expect(getRabbitStage({ birthDate: "2026-01-20" })).toBe("kit");
    expect(getRabbitStage({ birthDate: "2025-12-01" })).toBe("jeune");
    expect(getRabbitStage({ birthDate: "2025-09-01" })).toBe("adulte");

    global.Date = realDate;
  });
});
