import { describe, it, expect, beforeEach } from "vitest";
import { spinnerHTML, beginFetch, endFetch, trackFetch, resetFetch } from "../src/loading.js";

beforeEach(() => {
  document.body.innerHTML = `<div id="appLoadingBar" aria-hidden="true"></div>`;
  resetFetch();
});

describe("spinnerHTML", () => {
  it("rend un spinner avec libellé échappé", () => {
    const html = spinnerHTML('Chargement <x>');
    expect(html).toContain('class="spinner"');
    expect(html).toContain('&lt;x&gt;');
    expect(html).not.toContain('<x>');
  });
  it("supporte les tailles", () => {
    expect(spinnerHTML('x', { size: 'lg' })).toContain('spinner spinner-lg');
    expect(spinnerHTML('x', { size: 'sm' })).toContain('spinner spinner-sm');
  });
});

describe("barre de chargement globale (compteur)", () => {
  const bar = () => document.getElementById("appLoadingBar");

  it("s'active au premier fetch et se désactive au dernier", () => {
    expect(bar().classList.contains("active")).toBe(false);
    beginFetch();
    expect(bar().classList.contains("active")).toBe(true);
    beginFetch(); // imbriqué
    endFetch();
    expect(bar().classList.contains("active")).toBe(true); // encore 1 en cours
    endFetch();
    expect(bar().classList.contains("active")).toBe(false);
  });

  it("trackFetch active puis désactive autour d'une promesse", async () => {
    const p = trackFetch(Promise.resolve(42));
    expect(bar().classList.contains("active")).toBe(true);
    const v = await p;
    expect(v).toBe(42);
    expect(bar().classList.contains("active")).toBe(false);
  });

  it("trackFetch se désactive même si la promesse échoue", async () => {
    await expect(trackFetch(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(bar().classList.contains("active")).toBe(false);
  });
});
