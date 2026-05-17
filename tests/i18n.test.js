import { describe, it, expect, beforeEach } from "vitest";
import { t, getLocale, setLocale, available, _internals } from "../src/i18n.js";

beforeEach(() => {
  // Reset à fr entre les tests
  setLocale('fr');
});

describe("i18n.js", () => {
  it("retourne la traduction française par défaut", () => {
    expect(t('nav.dashboard')).toBe('Tableau de bord');
  });

  it("bascule en anglais via setLocale", () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('nav.dashboard')).toBe('Dashboard');
    expect(t('kpi.active')).toBe('Active');
  });

  it("rejette une locale non supportée", () => {
    expect(() => setLocale('it')).toThrow();
  });

  it("retourne la clé elle-même si traduction manquante", () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it("tombe sur la traduction FR si la clé existe en FR mais pas dans la locale active", () => {
    setLocale('en');
    // On simule une clé EN manquante en supprimant temporairement.
    const saved = _internals.DICT.en['nav.dashboard'];
    delete _internals.DICT.en['nav.dashboard'];
    expect(t('nav.dashboard')).toBe('Tableau de bord');
    _internals.DICT.en['nav.dashboard'] = saved;
  });

  it("interpole les variables {name}", () => {
    // On insère une clé de test
    _internals.DICT.fr['_test.hello'] = 'Bonjour, {name} !';
    expect(t('_test.hello', { name: 'Alice' })).toBe('Bonjour, Alice !');
    delete _internals.DICT.fr['_test.hello'];
  });

  it("liste les locales disponibles", () => {
    expect(available()).toEqual(['fr', 'en']);
  });
});
