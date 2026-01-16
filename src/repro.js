export function addDays(dateYYYYMMDD, days) {
  const d = new Date(dateYYYYMMDD + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

export function latestEventOf(state, rabbitId, type) {
  return state.events
    .filter(e => e.rabbitId === rabbitId && e.type === type)
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""))[0] || null;
}

export function getReproInfo(state, rabbit) {
  if (!rabbit || rabbit.sex !== "F" || rabbit.status !== "actif") return null;
  const lastMating = latestEventOf(state, rabbit.id, "saillie");
  const lastBirth = latestEventOf(state, rabbit.id, "mise_bas");
  if (!lastMating || !lastMating.date) return { lastMating: null, dueDate: null };
  const dueDate = addDays(lastMating.date, 31);
  return { lastMating, lastBirth, dueDate };
}
