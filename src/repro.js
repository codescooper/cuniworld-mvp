import { addDays } from "./utils.js";

export function latestEventOf(state, rabbitId, type) {
  return (
    state.events
      .filter((e) => e.rabbitId === rabbitId && e.type === type)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null
  );
}

export function getReproInfo(state, rabbit) {
  if (!rabbit || rabbit.sex !== "F" || rabbit.status !== "actif") return null;

  const lastMating = latestEventOf(state, rabbit.id, "saillie");
  const lastBirth = latestEventOf(state, rabbit.id, "mise_bas");

  if (!lastMating || !lastMating.date) {
    return { lastMating: null, lastBirth, dueDate: null };
  }

  const dueDate = addDays(lastMating.date, 31);
  return { lastMating, lastBirth, dueDate };
}
