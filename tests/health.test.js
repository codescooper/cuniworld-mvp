import { describe, it, expect } from "vitest";
import { getReminders as getRemindersFn } from "../src/health.js";

describe("health reminders", () => {
  it("sépare upcoming et overdue", () => {
    const state = {
      rabbits: [{ id: "R1", name: "Naya", code: "CW-F001", status: "actif" }],
      events: [
        { id: "E1", rabbitId: "R1", type: "vaccin", date: "2026-01-01", data: { nextDate: "2026-01-10" } },
        { id: "E2", rabbitId: "R1", type: "traitement", date: "2026-01-01", data: { nextDate: "2025-12-30" } }
      ]
    };

    const { upcoming, overdue } = getRemindersFn(state, { todayISO: "2026-01-05", windowDays: 7 });
    expect(upcoming.length).toBe(1);
    expect(overdue.length).toBe(1);
  });

  it("ignore les lapins non actifs", () => {
    const state = {
      rabbits: [{ id: "R1", name: "Naya", code: "CW-F001", status: "vendu" }],
      events: [
        { id: "E1", rabbitId: "R1", type: "vaccin", date: "2026-01-01", data: { nextDate: "2026-01-10" } }
      ]
    };

    const { upcoming, overdue } = getRemindersFn(state, { todayISO: "2026-01-05", windowDays: 7 });
    expect(upcoming.length).toBe(0);
    expect(overdue.length).toBe(0);
  });
});
