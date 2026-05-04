import { describe, it, expect } from "vitest";
import {
  BREEDING_CONFIG,
  isRabbitMatureForBreeding,
  isFemaleAvailableAfterBirth,
  getBreedingStatus,
} from "../src/breeding.js";
import { addDays } from "../src/utils.js";
import { validateEvent } from "../src/rules.js";

const TODAY = "2026-05-04";

function makeState(events = []) {
  return { events };
}

function daysAgo(n) {
  return addDays(TODAY, -n);
}

// ─── isRabbitMatureForBreeding ───────────────────────────────────────────────

describe("isRabbitMatureForBreeding", () => {
  it("retourne true si pas de date de naissance", () => {
    expect(isRabbitMatureForBreeding({ id: "r1" }, TODAY)).toBe(true);
  });

  it("retourne false si lapin trop jeune (< 120j)", () => {
    const rabbit = { birthDate: daysAgo(90) };
    expect(isRabbitMatureForBreeding(rabbit, TODAY)).toBe(false);
  });

  it("retourne true exactement à 120j", () => {
    const rabbit = { birthDate: daysAgo(120) };
    expect(isRabbitMatureForBreeding(rabbit, TODAY)).toBe(true);
  });

  it("retourne true au-delà de 120j", () => {
    const rabbit = { birthDate: daysAgo(200) };
    expect(isRabbitMatureForBreeding(rabbit, TODAY)).toBe(true);
  });
});

// ─── isFemaleAvailableAfterBirth ─────────────────────────────────────────────

describe("isFemaleAvailableAfterBirth", () => {
  it("retourne true pour un mâle (pas de contrainte post-naissance)", () => {
    const buck = { id: "r1", sex: "M" };
    expect(isFemaleAvailableAfterBirth(buck, makeState(), TODAY)).toBe(true);
  });

  it("retourne true si aucune mise-bas enregistrée", () => {
    const doe = { id: "r1", sex: "F" };
    expect(isFemaleAvailableAfterBirth(doe, makeState(), TODAY)).toBe(true);
  });

  it("retourne false si dans le délai post-mise-bas (35+14j)", () => {
    const doe = { id: "r1", sex: "F" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "mise_bas", date: daysAgo(30) },
    ]);
    expect(isFemaleAvailableAfterBirth(doe, state, TODAY)).toBe(false);
  });

  it("retourne true après 49j depuis mise-bas", () => {
    const doe = { id: "r1", sex: "F" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "mise_bas", date: daysAgo(50) },
    ]);
    expect(isFemaleAvailableAfterBirth(doe, state, TODAY)).toBe(true);
  });

  it("utilise la date de sevrage réelle si disponible", () => {
    const doe = { id: "r1", sex: "F" };
    const birthDate = daysAgo(50);
    const weanDate  = daysAgo(10);
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "mise_bas", date: birthDate },
      { id: "e2", rabbitId: "r1", type: "sevrage",  date: weanDate },
    ]);
    // REST_DAYS (14) pas encore écoulés depuis sevrage (10j)
    expect(isFemaleAvailableAfterBirth(doe, state, TODAY)).toBe(false);
  });
});

// ─── getBreedingStatus ────────────────────────────────────────────────────────

describe("getBreedingStatus", () => {
  it('retourne "indisponible" si lapin mort', () => {
    const r = { id: "r1", sex: "F", status: "mort" };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("indisponible");
  });

  it('retourne "trop_jeune" si âge < MIN_AGE_DAYS', () => {
    const r = { id: "r1", sex: "F", status: "actif", birthDate: daysAgo(90) };
    const result = getBreedingStatus(r, makeState(), TODAY);
    expect(result.status).toBe("trop_jeune");
    expect(result.availableFrom).toBeDefined();
  });

  it('retourne "disponible" si âge >= MIN_AGE_DAYS sans événements', () => {
    const r = { id: "r1", sex: "F", status: "actif", birthDate: daysAgo(160) };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("disponible");
  });

  it('retourne "disponible" si pas de date de naissance', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("disponible");
  });

  it('retourne "gestante" si dernière saillie sans mise-bas suivante', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie", date: daysAgo(15) },
    ]);
    const result = getBreedingStatus(r, state, TODAY);
    expect(result.status).toBe("gestante");
    expect(result.availableFrom).toBeDefined();
  });

  it('retourne "allaitement" si mise-bas récente (< WEAN_DAYS)', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const matingDate = daysAgo(45);
    const birthDate  = daysAgo(20);
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie",  date: matingDate },
      { id: "e2", rabbitId: "r1", type: "mise_bas", date: birthDate  },
    ]);
    const result = getBreedingStatus(r, state, TODAY);
    expect(result.status).toBe("allaitement");
    expect(result.availableFrom).toBeDefined();
  });

  it('retourne "repos" entre WEAN_DAYS et WEAN_DAYS+REST_DAYS', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const birthDate = daysAgo(40); // 40j > WEAN_DAYS(35), < 35+14=49
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(80) },
      { id: "e2", rabbitId: "r1", type: "mise_bas", date: birthDate   },
    ]);
    const result = getBreedingStatus(r, state, TODAY);
    expect(result.status).toBe("repos");
    expect(result.availableFrom).toBeDefined();
  });

  it('retourne "repos" après sevrage enregistré si REST_DAYS non écoulés', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(80) },
      { id: "e2", rabbitId: "r1", type: "mise_bas", date: daysAgo(50) },
      { id: "e3", rabbitId: "r1", type: "sevrage",  date: daysAgo(10) },
    ]);
    const result = getBreedingStatus(r, state, TODAY);
    expect(result.status).toBe("repos");
  });

  it('retourne "disponible" après 49j depuis mise-bas (sans sevrage enregistré)', () => {
    const r = { id: "r1", sex: "F", status: "actif" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(85) },
      { id: "e2", rabbitId: "r1", type: "mise_bas", date: daysAgo(50) },
    ]);
    const { status } = getBreedingStatus(r, state, TODAY);
    expect(status).toBe("disponible");
  });

  it('retourne "disponible" pour un mâle mature', () => {
    const r = { id: "r1", sex: "M", status: "actif", birthDate: daysAgo(200) };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("disponible");
  });

  it("availableFrom est correctement calculé pour trop_jeune", () => {
    const birthDate = daysAgo(90);
    const r = { id: "r1", sex: "F", status: "actif", birthDate };
    const result = getBreedingStatus(r, makeState(), TODAY);
    const expected = addDays(birthDate, BREEDING_CONFIG.MIN_AGE_DAYS);
    expect(result.availableFrom).toBe(expected);
  });
});

// ─── breedingOverride ─────────────────────────────────────────────────────────

describe("getBreedingStatus – breedingOverride", () => {
  it('override "indisponible" bloque même si lapin mature', () => {
    const r = { id: "r1", sex: "M", status: "actif", birthDate: daysAgo(200), breedingOverride: "indisponible" };
    const { status, reason } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("indisponible");
    expect(reason).toContain("manuellement");
  });

  it('override "disponible" bypass le check d\'âge', () => {
    const r = { id: "r1", sex: "F", status: "actif", birthDate: daysAgo(60), breedingOverride: "disponible" };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("disponible");
  });

  it('override "disponible" ne bypass PAS gestation/allaitement', () => {
    const r = { id: "r1", sex: "F", status: "actif", breedingOverride: "disponible" };
    const state = makeState([
      { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(50) },
      { id: "e2", rabbitId: "r1", type: "mise_bas", date: daysAgo(10) },
    ]);
    const { status } = getBreedingStatus(r, state, TODAY);
    expect(status).toBe("allaitement");
  });

  it('override "auto" (défaut) conserve le comportement normal', () => {
    const r = { id: "r1", sex: "F", status: "actif", birthDate: daysAgo(60), breedingOverride: "auto" };
    const { status } = getBreedingStatus(r, makeState(), TODAY);
    expect(status).toBe("trop_jeune");
  });
});

// ─── Validation règles via validateEvent ─────────────────────────────────────

describe("validateEvent – saillie avec règles breeding", () => {
  it("rejette saillie si femelle trop jeune", () => {
    const doe  = { id: "r1", sex: "F", status: "actif", birthDate: daysAgo(90) };
    const buck = { id: "r2", sex: "M", status: "actif" };
    const state = { rabbits: [doe, buck], events: [] };

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: TODAY,
      data: { maleId: "r2" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("trop jeune");
  });

  it("rejette saillie si femelle en allaitement", () => {
    const doe  = { id: "r1", sex: "F", status: "actif" };
    const buck = { id: "r2", sex: "M", status: "actif" };
    const state = {
      rabbits: [doe, buck],
      events: [
        { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(50) },
        { id: "e2", rabbitId: "r1", type: "mise_bas", date: daysAgo(20) },
      ],
    };

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: TODAY,
      data: { maleId: "r2" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("allaitement");
  });

  it("rejette saillie si femelle en repos post-sevrage", () => {
    const doe  = { id: "r1", sex: "F", status: "actif" };
    const buck = { id: "r2", sex: "M", status: "actif" };
    const state = {
      rabbits: [doe, buck],
      events: [
        { id: "e1", rabbitId: "r1", type: "saillie",  date: daysAgo(85) },
        { id: "e2", rabbitId: "r1", type: "mise_bas", date: daysAgo(40) },
      ],
    };

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: TODAY,
      data: { maleId: "r2" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("repos");
  });
});
