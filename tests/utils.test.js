import { describe, it, expect } from "vitest";
import { daysBetween, getRabbitStage, rabbitStatusBadge } from "../src/utils.js";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

describe("utils", () => {
  it.each(['UTC', 'Europe/Paris', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'addDays keeps calendar dates across DST and month boundaries in %s', (timezone) => {
      const moduleUrl = pathToFileURL(resolve('src/utils.js')).href;
      const script = `import {addDays} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify([
        addDays('2026-01-01',28), addDays('2026-02-15',28),
        addDays('2026-03-28',2), addDays('2026-10-24',2),
        addDays('2024-02-28',1), addDays('2026-01-01',-1)
      ]));`;
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: {...process.env, TZ: timezone}, encoding: 'utf8',
      });
      expect(JSON.parse(result)).toEqual(['2026-01-29','2026-03-15','2026-03-30','2026-10-26','2024-02-29','2025-12-31']);
    }
  );
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

  it("rabbitStatusBadge gère le statut vendu", () => {
    expect(rabbitStatusBadge("vendu")).toContain("Vendu");
  });
});
