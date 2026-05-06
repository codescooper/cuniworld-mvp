import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/store.js";

describe("store backups", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a backup before reset", () => {
    const saved = Store.save({
      version: 3,
      meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      rabbits: [{ id: "R1" }],
      events: [],
      photos: [],
      usedNames: {},
    });

    expect(saved.rabbits).toHaveLength(1);
    Store.reset();

    const backups = Store.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe("reset");
    expect(backups[0].state.rabbits).toHaveLength(1);
  });

  it("creates a backup before import", () => {
    Store.save({
      version: 3,
      meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      rabbits: [{ id: "OLD" }],
      events: [],
      photos: [],
      usedNames: {},
    });

    const incoming = JSON.stringify({
      version: 3,
      meta: { createdAt: "2026-02-01", updatedAt: "2026-02-01" },
      rabbits: [{ id: "NEW" }],
      events: [],
      photos: [],
      usedNames: {},
    });

    Store.importJSON(incoming);

    const backups = Store.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe("import");
    expect(backups[0].state.rabbits[0].id).toBe("OLD");
    expect(Store.load().rabbits[0].id).toBe("NEW");
  });

  it("keeps at most 5 backups", () => {
    for (let i = 0; i < 7; i += 1) {
      Store.save({
        version: 3,
        meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rabbits: [{ id: `R${i}` }],
        events: [],
        photos: [],
        usedNames: {},
      });
      Store.reset();
    }

    const backups = Store.listBackups();
    expect(backups).toHaveLength(5);
    expect(backups[0].state.rabbits[0].id).toBe("R2");
    expect(backups[4].state.rabbits[0].id).toBe("R6");
  });

  it("restores a backup by id", () => {
    Store.save({
      version: 3,
      meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      rabbits: [{ id: "RESTORE_ME" }],
      events: [],
      photos: [],
      usedNames: {},
    });
    Store.reset();

    const [backup] = Store.listBackups();
    Store.restoreBackup(backup.id);

    expect(Store.load().rabbits[0].id).toBe("RESTORE_ME");
  });
});
