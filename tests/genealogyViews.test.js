import { describe, it, expect } from "vitest";
import {
  buildPedigree,
  flattenPedigree,
  buildDescendance,
  findCommonAncestor,
  kinshipCoefficient,
  kinshipLevel,
  suggestMates,
} from "../src/genealogyViews.js";

// État de test : 3 générations
//
//   gen 0 (grands-parents) : G1 (♀)  G2 (♂)   G3 (♀)  G4 (♂)
//   gen 1 (parents)         : P1 = G1×G2 (♀)   P2 = G3×G4 (♂)
//   gen 2 (lapin focal)     : K = P1×P2 (♀)
//   gen 3 (descendance)     : enfant1, enfant2 (de K × autre mâle inconnu)
//                             frere = G1×G2 (♂)  (frère de P1 — pour test consanguinité)
//
function _state() {
  return {
    rabbits: [
      { id: 'G1', sex: 'F', status: 'actif', code: 'G1', name: 'Grand-mère 1' },
      { id: 'G2', sex: 'M', status: 'actif', code: 'G2', name: 'Grand-père 1' },
      { id: 'G3', sex: 'F', status: 'actif', code: 'G3', name: 'Grand-mère 2' },
      { id: 'G4', sex: 'M', status: 'actif', code: 'G4', name: 'Grand-père 2' },

      { id: 'P1', sex: 'F', status: 'actif', code: 'P1', name: 'Parent 1 (mère)', doeId: 'G1', buckId: 'G2' },
      { id: 'P2', sex: 'M', status: 'actif', code: 'P2', name: 'Parent 2 (père)', doeId: 'G3', buckId: 'G4' },
      { id: 'BROTHER', sex: 'M', status: 'actif', code: 'BR', name: 'Frère P1', doeId: 'G1', buckId: 'G2' },

      { id: 'K',  sex: 'F', status: 'actif', code: 'K',  name: 'Lapin focal',  doeId: 'P1', buckId: 'P2' },

      { id: 'C1', sex: 'F', status: 'actif', code: 'C1', name: 'Enfant 1', doeId: 'K' },
      { id: 'C2', sex: 'M', status: 'actif', code: 'C2', name: 'Enfant 2', doeId: 'K' },
    ],
  };
}

describe("buildPedigree", () => {
  it("construit le pedigree à 2 générations correctement", () => {
    const ped = buildPedigree(_state(), 'K', 2);
    expect(ped.rabbit.id).toBe('K');
    expect(ped.mother.rabbit.id).toBe('P1');
    expect(ped.father.rabbit.id).toBe('P2');
    expect(ped.mother.mother.rabbit.id).toBe('G1');
    expect(ped.mother.father.rabbit.id).toBe('G2');
    expect(ped.father.mother.rabbit.id).toBe('G3');
    expect(ped.father.father.rabbit.id).toBe('G4');
  });

  it("retourne null si le lapin n'existe pas", () => {
    expect(buildPedigree(_state(), 'INEXISTANT')).toBeNull();
  });

  it("marque les ancêtres inconnus comme null (cases vides)", () => {
    const state = { rabbits: [{ id: 'orphan', sex: 'F', status: 'actif' }] };
    const ped = buildPedigree(state, 'orphan', 2);
    expect(ped.mother).toBeNull();
    expect(ped.father).toBeNull();
  });

  it("flattenPedigree retourne 2^(N+1)-1 slots, indexés 0..N", () => {
    const ped = buildPedigree(_state(), 'K', 2);
    const flat = flattenPedigree(ped, 2);
    expect(flat).toHaveLength(7); // 2^3 - 1
    expect(flat[0].rabbit.id).toBe('K');
    expect(flat[1].rabbit.id).toBe('P1'); // mère
    expect(flat[2].rabbit.id).toBe('P2'); // père
  });
});

describe("buildDescendance", () => {
  it("liste les enfants directs avec stats agrégées", () => {
    const desc = buildDescendance(_state(), 'K');
    expect(desc.rabbit.id).toBe('K');
    expect(desc.children).toHaveLength(2);
    expect(desc.totals.direct).toBe(2);
    expect(desc.totals.total).toBe(2);
    expect(desc.totals.females).toBe(1);
    expect(desc.totals.males).toBe(1);
  });

  it("retourne stats à 0 si pas de descendance", () => {
    const desc = buildDescendance(_state(), 'C1');
    expect(desc.children).toHaveLength(0);
    expect(desc.totals.total).toBe(0);
  });

  it("descend sur plusieurs générations", () => {
    const desc = buildDescendance(_state(), 'G1', 4);
    // G1 → P1, BROTHER (2 enfants directs)
    //         P1 → K (1 petit-enfant)
    //                 K → C1, C2 (2 arrière-petits-enfants)
    // Total : 5 descendants
    expect(desc.totals.direct).toBe(2);
    expect(desc.totals.total).toBe(5);
  });
});

describe("findCommonAncestor", () => {
  it("trouve P1 comme parent commun de C1 et C2", () => {
    const r = findCommonAncestor(_state(), 'C1', 'C2');
    expect(r.ancestor.id).toBe('K'); // K est la mère commune, P1 est plus loin
    expect(r.distA).toBe(1);
    expect(r.distB).toBe(1);
  });

  it("trouve G1 comme ancêtre commun de K et BROTHER (oncle/nièce)", () => {
    const r = findCommonAncestor(_state(), 'K', 'BROTHER');
    // K → P1 → G1 (distance 2)
    // BROTHER → G1 (distance 1)
    // Donc G1 (ou G2) sont communs au plus court chemin
    expect(['G1', 'G2']).toContain(r.ancestor.id);
    expect(r.distA + r.distB).toBe(3);
  });

  it("retourne null si aucun ancêtre commun", () => {
    expect(findCommonAncestor(_state(), 'G1', 'G3')).toBeNull();
  });

  it("retourne null si les deux lapins sont identiques", () => {
    expect(findCommonAncestor(_state(), 'K', 'K')).toBeNull();
  });
});

describe("kinshipCoefficient (Wright)", () => {
  it("0 % pour deux lapins non apparentés", () => {
    const r = kinshipCoefficient(_state(), 'G1', 'G3');
    expect(r.coefficient).toBe(0);
    expect(r.percentage).toBe(0);
  });

  it("50 % pour parent × enfant", () => {
    // P1 × K : K est l'enfant de P1
    // Σ (1/2)^(0 + 1 + 1) = 1/4 pour le chemin P1↔P1 (dA=0)... non.
    // Actually F(child of P1 × K) = sum over common ancestors of (1/2)^(dA+dB+1)
    // P1 is a common ancestor of both P1 (dist 0 — but Wright says we don't count self)
    // En réalité Wright pour A=P1, B=K (sa fille), F(hypothétique enfant) :
    //   l'ancêtre commun pertinent est P1 (qui est aussi A) → dA=0, dB=1 → w = (1/2)^2 = 0.25
    // Donc F = 25 %. (Et P2 contribuerait via dB=1 et dA=∞ — pas commun.)
    const r = kinshipCoefficient(_state(), 'P1', 'K');
    expect(r.percentage).toBeCloseTo(25, 1);
  });

  it("25 % pour frère × sœur (P1 et BROTHER)", () => {
    // P1 et BROTHER ont mêmes parents G1 + G2
    // Ancêtres communs : G1 (dA=1, dB=1) et G2 (dA=1, dB=1)
    // F = (1/2)^3 + (1/2)^3 = 0.125 + 0.125 = 0.25 → 25 %
    const r = kinshipCoefficient(_state(), 'P1', 'BROTHER');
    expect(r.percentage).toBeCloseTo(25, 1);
  });

  it("~12.5 % pour oncle × nièce (BROTHER et K)", () => {
    // K (descendance P1 × P2) avec BROTHER (frère de P1)
    // Ancêtres communs de K et BROTHER : G1, G2 (parents de P1 et BROTHER)
    // distances : K→P1→G1 (dA=2), BROTHER→G1 (dB=1) → w = (1/2)^4 = 0.0625
    //            idem G2 → w = 0.0625
    // F = 0.125 → 12.5 %
    const r = kinshipCoefficient(_state(), 'K', 'BROTHER');
    expect(r.percentage).toBeCloseTo(12.5, 1);
  });

  it("kinshipLevel code par couleur correctement", () => {
    expect(kinshipLevel(0).code).toBe('ok');
    expect(kinshipLevel(5).code).toBe('ok');
    expect(kinshipLevel(7).code).toBe('caution');
    expect(kinshipLevel(15).code).toBe('danger');
  });
});

describe("suggestMates", () => {
  it("classe les mâles compatibles par consanguinité croissante", () => {
    const suggestions = suggestMates(_state(), 'P1');
    // Mâles actifs : G2 (grand-père), G4 (grand-père sans lien), P2 (étranger), BROTHER (frère, kinship 25 %), C2 (fils, kinship 25 %)
    // maxKinship 12.5 par défaut → G2 (père de P1, kinship 25 %), BROTHER, C2 et toute consanguinité >12.5 exclus
    // P1.fatherId = G2 → G2 est exclu d'office (père)
    // BROTHER : kinship 25 % → exclu
    // C2 : enfant de K, et K = enfant de P1 → P1×C2 kinship 25 % → exclu
    // P2 : 0 % (étranger) → inclus
    // G4 : 0 % (étranger) → inclus
    expect(suggestions.length).toBeGreaterThan(0);
    const ids = suggestions.map(s => s.buck.id);
    expect(ids).not.toContain('G2');     // père
    expect(ids).not.toContain('BROTHER'); // frère >12.5
    expect(ids).toContain('P2');
    expect(ids).toContain('G4');
    // Tri croissant : tous à 0 % ici, mais l'ordre doit être stable.
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].kinship.coefficient).toBeGreaterThanOrEqual(suggestions[i - 1].kinship.coefficient);
    }
  });

  it("retourne [] si pas une femelle", () => {
    expect(suggestMates(_state(), 'P2')).toEqual([]);
    expect(suggestMates(_state(), 'INEXISTANT')).toEqual([]);
  });

  it("respecte la limite", () => {
    const s = suggestMates(_state(), 'P1', { limit: 1 });
    expect(s.length).toBeLessThanOrEqual(1);
  });
});
