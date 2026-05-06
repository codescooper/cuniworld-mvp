function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const escaped = str.replaceAll('"', '""');
  if (/[",\n\r]/.test(str)) return `"${escaped}"`;
  return escaped;
}

function toCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function exportRabbitsCSV(state) {
  const headers = ["id", "code", "name", "sex", "breed", "birthDate", "cage", "status", "stage", "motherId", "fatherId", "createdAt", "updatedAt"];
  const rows = (state?.rabbits || []).map((r) => [
    r.id, r.code, r.name, r.sex, r.breed, r.birthDate, r.cage, r.status, r.stage,
    r.motherId, r.fatherId, r.createdAt, r.updatedAt,
  ]);
  const csv = toCSV(headers, rows);
  downloadTextFile(`cuniworld_rabbits_${todayStamp()}.csv`, csv);
}

export function exportEventsCSV(state) {
  const headers = ["id", "rabbitId", "type", "date", "notes", "data_json", "createdAt"];
  const rows = (state?.events || []).map((e) => [
    e.id, e.rabbitId, e.type, e.date, e.notes, JSON.stringify(e.data || {}), e.createdAt,
  ]);
  const csv = toCSV(headers, rows);
  downloadTextFile(`cuniworld_events_${todayStamp()}.csv`, csv);
}
