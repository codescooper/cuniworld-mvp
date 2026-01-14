import { daysBetween } from "./utils.js";

export function getReminders(state, { todayISO, windowDays = 7 } = {}) {
  const today = todayISO || new Date().toISOString().slice(0, 10);

  const rabbitsById = new Map(state.rabbits.map(r => [r.id, r]));
  const reminders = [];

  for (const e of state.events) {
    if (e.type !== "vaccin" && e.type !== "traitement") continue;

    const nextDate = (e.data?.nextDate || "").slice(0, 10);
    if (!nextDate) continue;

    const rabbit = rabbitsById.get(e.rabbitId);
    if (!rabbit) continue;

    // Option : ignorer vendus/morts (recommandé)
    if (rabbit.status !== "actif") continue;

    const daysLeft = daysBetween(today, nextDate); // aujourd'hui -> nextDate
    reminders.push({
      eventId: e.id,
      rabbitId: rabbit.id,
      rabbitName: rabbit.name,
      rabbitCode: rabbit.code,
      type: e.type,
      nextDate,
      daysLeft,
      product: e.data?.product || "",
      dose: e.data?.dose || "",
    });
  }

  const overdue = reminders.filter(r => r.daysLeft < 0).sort((a,b) => a.daysLeft - b.daysLeft);
  const upcoming = reminders
    .filter(r => r.daysLeft >= 0 && r.daysLeft <= windowDays)
    .sort((a,b) => a.daysLeft - b.daysLeft);

  return { today, reminders, overdue, upcoming };
}

export function reminderLabel(r) {
  const t = r.type === "vaccin" ? "Vaccin" : "Traitement";
  const who = `${r.rabbitName} (${r.rabbitCode})`;
  const when = r.daysLeft < 0 ? `en retard (J${r.daysLeft})` : `J-${r.daysLeft}`;
  const extra = [r.product, r.dose].filter(Boolean).join(" · ");
  return `${t} — ${who} — ${r.nextDate} — ${when}${extra ? " — " + extra : ""}`;
}