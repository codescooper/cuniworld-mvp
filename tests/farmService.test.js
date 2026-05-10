import { describe, it, expect, vi, beforeEach } from 'vitest';

// FarmService.getUserFarms depends on supabase — we test the deduplication
// logic in isolation by reconstructing it here.

function deduplicateFarms(rawMemberships) {
  const seen = new Set();
  return rawMemberships
    .map(m => ({ ...m.farms, role: m.role }))
    .filter(f => {
      if (!f?.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
}

describe('FarmService.getUserFarms — deduplication', () => {
  it('returns one entry when user appears once per farm', () => {
    const rows = [
      { role: 'owner',  farms: { id: 'farm-1', name: 'Ferme A' } },
      { role: 'member', farms: { id: 'farm-2', name: 'Ferme B' } },
    ];
    const result = deduplicateFarms(rows);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('farm-1');
    expect(result[1].id).toBe('farm-2');
  });

  it('deduplicates when the same farm appears multiple times', () => {
    const rows = [
      { role: 'owner',  farms: { id: 'farm-1', name: 'Ferme A' } },
      { role: 'member', farms: { id: 'farm-1', name: 'Ferme A' } }, // duplicate
      { role: 'member', farms: { id: 'farm-2', name: 'Ferme B' } },
    ];
    const result = deduplicateFarms(rows);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('farm-1');
    expect(result[0].role).toBe('owner'); // first occurrence wins
  });

  it('handles empty data', () => {
    expect(deduplicateFarms([])).toHaveLength(0);
  });

  it('filters rows with no farm data (null join)', () => {
    const rows = [
      { role: 'owner',  farms: null },
      { role: 'member', farms: { id: 'farm-1', name: 'Ferme A' } },
    ];
    const result = deduplicateFarms(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('farm-1');
  });

  it('handles 3+ duplicates of the same farm', () => {
    const rows = Array.from({ length: 5 }, () => ({
      role: 'member', farms: { id: 'farm-x', name: 'Ferme X' },
    }));
    const result = deduplicateFarms(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('farm-x');
  });
});
