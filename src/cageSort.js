// Cage nomenclature: letter prefix + numeric suffix (A1, B3, C10, …)
// Sort order: alphabetical zone then numeric position

function parseCage(cage) {
  const m = String(cage || '').trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return { zone: '￿', num: 9999, raw: cage };
  return { zone: m[1].toUpperCase(), num: parseInt(m[2], 10), raw: cage };
}

export function sortByCage(items, getCage = (x) => x.cage) {
  return [...items].sort((a, b) => {
    const ca = parseCage(getCage(a));
    const cb = parseCage(getCage(b));
    if (ca.zone !== cb.zone) return ca.zone.localeCompare(cb.zone);
    if (ca.num  !== cb.num)  return ca.num - cb.num;
    return 0;
  });
}

// Validate that a cage name matches the nomenclature
export function isValidCage(cage) {
  return /^[A-Za-z]+\d+$/.test(String(cage || '').trim());
}
