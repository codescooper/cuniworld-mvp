import { validateEvent, applyEventSideEffects } from "./rules.js";

export function persist(ctx) {
  ctx.state = ctx.Store.save(ctx.state);
}

export function addRabbit(ctx, data) {
  const { uid, nowISO } = ctx.Store.helpers;
  const rabbit = {
    id: uid("rb"),
    code:
      (data.code || "").trim() ||
      `CW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: (data.name || "").trim() || "Sans nom",
    sex: data.sex || "U",
    breed: (data.breed || "").trim(),
    birthDate: data.birthDate || "",
    cage: (data.cage || "").trim(),
    status: data.status || "actif",
    notes: (data.notes || "").trim(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  ctx.state.rabbits.unshift(rabbit);
  persist(ctx);
  ctx.selectedRabbitId = rabbit.id;
  ctx.render();
}

export function updateRabbit(ctx, id, patch) {
  const { nowISO } = ctx.Store.helpers;
  const i = ctx.state.rabbits.findIndex((r) => r.id === id);
  if (i === -1) return;
  ctx.state.rabbits[i] = { ...ctx.state.rabbits[i], ...patch, updatedAt: nowISO() };
  persist(ctx);
  ctx.render();
}

export function deleteRabbit(ctx, id) {
  ctx.state.rabbits = ctx.state.rabbits.filter((r) => r.id !== id);
  ctx.state.events = ctx.state.events.filter((e) => e.rabbitId !== id);
  if (ctx.selectedRabbitId === id) ctx.selectedRabbitId = null;
  persist(ctx);
  ctx.render();
}

export function addEvent(ctx, rabbitId, data) {
  const { uid, nowISO } = ctx.Store.helpers;
  const ev = {
    id: uid("ev"),
    rabbitId,
    type: data.type || "autre",
    date: data.date || new Date().toISOString().slice(0, 10),
    notes: (data.notes || "").trim(),
    data: data.data || {},
    createdAt: nowISO(),
  };

  const check = validateEvent(ctx.state, rabbitId, ev);
  if (!check.ok) {
    const error = new Error(check.error);
    error.code = "EVENT_VALIDATION";
    throw error;
  }

  ctx.state.events.unshift(ev);
  applyEventSideEffects(ctx, ev);
  persist(ctx);
  ctx.render();
  return ev;
}

export function deleteEvent(ctx, eventId) {
  ctx.state.events = ctx.state.events.filter((e) => e.id !== eventId);
  persist(ctx);
  ctx.render();
}
