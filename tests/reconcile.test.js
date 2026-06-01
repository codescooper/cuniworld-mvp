import { describe, it, expect } from 'vitest';
import { reconcileLocalToCloud, hasRecoverable } from '../src/reconcile.js';

const FARM = 'farm-A';

function cloud({ rabbits = [], events = [], usedNames = {} } = {}) {
  return { rabbits, events, usedNames };
}
function local({ rabbits = [], events = [], usedNames = {}, farmId = FARM, simulation = false } = {}) {
  return { meta: { farmId, ...(simulation ? { simulation: true } : {}) }, rabbits, events, usedNames };
}

describe('reconcileLocalToCloud', () => {
  it("récupère une pesée faite hors-ligne (event local absent du cloud) sur un lapin existant", () => {
    const c = cloud({ rabbits: [{ id: 'r1' }], events: [] });
    const l = local({
      rabbits: [{ id: 'r1' }],
      events: [{ id: 'ev_pesee', rabbitId: 'r1', type: 'pesée', date: '2026-06-01', data: { weight: 2.4 } }],
    });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].id).toBe('ev_pesee');
  });

  it("n'inclut pas un event déjà présent dans le cloud", () => {
    const c = cloud({ rabbits: [{ id: 'r1' }], events: [{ id: 'ev1', rabbitId: 'r1', type: 'pesée' }] });
    const l = local({ rabbits: [{ id: 'r1' }], events: [{ id: 'ev1', rabbitId: 'r1', type: 'pesée' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.events).toHaveLength(0);
    expect(hasRecoverable(out)).toBe(false);
  });

  it('récupère un lapin créé hors-ligne (local-only) si même ferme', () => {
    const c = cloud({ rabbits: [{ id: 'r1' }] });
    const l = local({ rabbits: [{ id: 'r1' }, { id: 'r2', name: 'Nouveau' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.rabbits.map(r => r.id)).toEqual(['r2']);
  });

  it('récupère un lapin local plus récent que le cloud (updatedAt)', () => {
    const c = cloud({ rabbits: [{ id: 'r1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' }] });
    const l = local({ rabbits: [{ id: 'r1', name: 'New', updatedAt: '2026-06-01T00:00:00Z' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.rabbits).toHaveLength(1);
    expect(out.rabbits[0].name).toBe('New');
  });

  it('ne récupère PAS un lapin local plus ancien que le cloud', () => {
    const c = cloud({ rabbits: [{ id: 'r1', updatedAt: '2026-06-01T00:00:00Z' }] });
    const l = local({ rabbits: [{ id: 'r1', updatedAt: '2026-01-01T00:00:00Z' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.rabbits).toHaveLength(0);
  });

  it("ne récupère PAS les rabbits d'une autre ferme (blob taggé farm-B)", () => {
    const c = cloud({ rabbits: [] }); // ferme A vide côté cloud
    const l = local({ farmId: 'farm-B', rabbits: [{ id: 'rX' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.rabbits).toHaveLength(0);
  });

  it("ne pousse PAS un event d'une autre ferme : lapin inconnu de cette ferme", () => {
    // blob d'une autre ferme, event sur un lapin absent du cloud A
    const c = cloud({ rabbits: [{ id: 'r1' }] });
    const l = local({ farmId: 'farm-B', events: [{ id: 'evX', rabbitId: 'autre-lapin', type: 'pesée' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.events).toHaveLength(0);
  });

  it("récupère un event (legacy: blob non taggé) si son lapin existe dans cette ferme", () => {
    const c = cloud({ rabbits: [{ id: 'r1' }] });
    const l = local({ farmId: undefined, events: [{ id: 'evP', rabbitId: 'r1', type: 'pesée' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].id).toBe('evP');
  });

  it('ignore totalement les données de simulation', () => {
    const c = cloud({ rabbits: [] });
    const l = local({ simulation: true, rabbits: [{ id: 'rSim' }], events: [{ id: 'evSim', rabbitId: 'rSim' }] });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(hasRecoverable(out)).toBe(false);
  });

  it('récupère les usedNames locaux absents du cloud (même ferme)', () => {
    const c = cloud({ usedNames: { Naruto: 'r1' } });
    const l = local({ usedNames: { Naruto: 'r1', Sasuke: 'r2' } });
    const out = reconcileLocalToCloud(c, l, FARM);
    expect(out.usedNames).toEqual({ Sasuke: 'r2' });
  });

  it('gère un localState vide / invalide sans planter', () => {
    expect(hasRecoverable(reconcileLocalToCloud(cloud(), null, FARM))).toBe(false);
    expect(hasRecoverable(reconcileLocalToCloud(cloud(), undefined, FARM))).toBe(false);
    expect(hasRecoverable(reconcileLocalToCloud(cloud(), {}, FARM))).toBe(false);
  });
});
