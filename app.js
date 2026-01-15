// app.js (racine)
import { Store } from "./src/store.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";

const el = getEls();

const ctx = {
  Store,
  el,
  state: Store.load(),
  selectedRabbitId: null,
  selectedLotId: null,

  render: () => {
    renderAll(ctx);
    wireDynamic(ctx); // re-wire après chaque render
  },
};

// Seed minimal si vide
function seedIfEmpty() {
  if (ctx.state.rabbits.length > 0) return;
  const { uid, nowISO } = Store.helpers;

  const a = {
    id: uid("rb"),
    code: "CW-F001",
    name: "Naya",
    sex: "F",
    breed: "Néo-zélandais",
    birthDate: "2025-11-20",
    cage: "A-01",
    status: "actif",
    notes: "Bonne mère, calme.",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  const b = {
    id: uid("rb"),
    code: "CW-M002",
    name: "Koda",
    sex: "M",
    breed: "Californien",
    birthDate: "2025-10-12",
    cage: "B-02",
    status: "actif",
    notes: "Reproducteur.",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  ctx.state.rabbits = [a, b];
  ctx.state.events = [
    { id: uid("ev"), rabbitId: a.id, type: "vaccin", date: "2026-01-10", notes: "Rappel", data: {}, createdAt: nowISO() },
    { id: uid("ev"), rabbitId: a.id, type: "mise_bas", date: "2026-01-12", notes: "Première portée", data: { born: 8, alive: 7, dead: 1 }, createdAt: nowISO() },
    { id: uid("ev"), rabbitId: b.id, type: "traitement", date: "2026-01-08", notes: "Vermifuge", data: {}, createdAt: nowISO() },
  ];

  ctx.state = Store.save(ctx.state);
}

wireStatic(ctx);

// ✅ IMPORTANT : désactiver le seed en e2e (page ouverte avec ?e2e=1)
const isE2E = new URLSearchParams(window.location.search).has("e2e");
if (!isE2E) seedIfEmpty();

ctx.render();
