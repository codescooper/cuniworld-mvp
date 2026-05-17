import { describe, it, expect, vi, beforeEach } from "vitest";
import { initMonitoring, captureException, _monitoringState } from "../src/monitoring.js";

describe("monitoring.js", () => {
  beforeEach(() => {
    // Reset l'état du module entre les tests : `_monitoringState` ne réinit
    // pas vraiment, donc on s'assure que chaque test couvre un cas distinct.
    globalThis.navigator = { userAgent: "vitest", sendBeacon: vi.fn(() => true) };
  });

  it("reste désactivé sans DSN fourni", () => {
    initMonitoring({ dsn: "" });
    expect(_monitoringState().enabled).toBe(false);
  });

  it("ignore un DSN mal formé sans crasher", () => {
    initMonitoring({ dsn: "pas-une-url" });
    expect(_monitoringState().enabled).toBe(false);
  });

  it("captureException est no-op tant que monitoring n'est pas init", () => {
    // Volontairement sans init préalable : doit ne rien faire.
    expect(() => captureException(new Error("test"))).not.toThrow();
    expect(globalThis.navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it("initialise correctement un DSN Sentry valide", () => {
    initMonitoring({
      dsn: "https://abc123@o12345.ingest.sentry.io/678",
      release: "cuniworld@1.2.3",
      environment: "test",
    });
    const state = _monitoringState();
    expect(state.enabled).toBe(true);
    expect(state.endpoint).toMatch(/^https:\/\/o12345\.ingest\.sentry\.io\/api\/678\/store\/\?sentry_version=7/);
    expect(state.endpoint).toContain("sentry_key=abc123");
    expect(state.release).toBe("cuniworld@1.2.3");
  });
});
