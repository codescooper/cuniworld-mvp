import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowOnboarding,
  markOnboardingDone,
  resetOnboarding,
  showOnboardingIfNeeded,
} from "../src/onboarding.js";

beforeEach(() => {
  resetOnboarding();
  document.body.innerHTML = '<button id="btnNewRabbit"></button>';
});

describe("onboarding.js — déclenchement", () => {
  it("ne s'affiche pas si le state contient déjà des lapins", () => {
    expect(shouldShowOnboarding({ rabbits: [{ id: 'r1' }] })).toBe(false);
  });

  it("s'affiche si state vide ET pas encore vu", () => {
    expect(shouldShowOnboarding({ rabbits: [] })).toBe(true);
  });

  it("ne s'affiche plus après markOnboardingDone()", () => {
    markOnboardingDone();
    expect(shouldShowOnboarding({ rabbits: [] })).toBe(false);
  });

  it("rejette un state invalide sans throw", () => {
    expect(shouldShowOnboarding(null)).toBe(false);
    expect(shouldShowOnboarding({})).toBe(false);
    expect(shouldShowOnboarding({ rabbits: 'oups' })).toBe(false);
  });
});

describe("onboarding.js — overlay rendu", () => {
  it("insère l'overlay dans le DOM avec les 3 étapes", () => {
    const ctx = { state: { rabbits: [] } };
    const shown = showOnboardingIfNeeded(ctx);
    expect(shown).toBe(true);
    const overlay = document.getElementById('onboardingOverlay');
    expect(overlay).toBeTruthy();
    expect(overlay.querySelectorAll('.onboarding-step').length).toBe(3);
    // Seule l'étape 1 est visible
    expect(overlay.querySelector('[data-step="1"]').hidden).toBe(false);
    expect(overlay.querySelector('[data-step="2"]').hidden).toBe(true);
  });

  it("ne réaffiche pas l'overlay après dismissal", () => {
    const ctx = { state: { rabbits: [] } };
    showOnboardingIfNeeded(ctx);
    document.getElementById('onboardingSkip')?.click();
    expect(document.getElementById('onboardingOverlay')).toBeNull();
    // Tentative de réaffichage
    expect(showOnboardingIfNeeded(ctx)).toBe(false);
  });

  it("le bouton 'Nouveau lapin' délègue au btnNewRabbit existant", () => {
    const ctx = { state: { rabbits: [] } };
    let clicked = false;
    document.getElementById('btnNewRabbit').addEventListener('click', () => { clicked = true; });
    showOnboardingIfNeeded(ctx);
    // Avancer à l'étape 2
    document.getElementById('onboardingNext1').click();
    document.getElementById('onboardingCreate').click();
    expect(clicked).toBe(true);
    expect(document.getElementById('onboardingOverlay')).toBeNull();
  });
});
