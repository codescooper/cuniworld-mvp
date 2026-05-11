import { daysBetween, escapeHTML } from './utils.js';
import { getRabbitWeightHistory } from './weightService.js';

export function renderStats(ctx) {
  const host = document.getElementById('statsDash');
  if (!host) return;
  const { state } = ctx;
  const rabbits = state.rabbits || [];
  const events  = state.events  || [];

  if (!rabbits.length) {
    host.innerHTML = '<div class="muted" style="padding:32px;text-align:center">Aucun lapin enregistré.</div>';
    return;
  }

  const _today = new Date().toISOString().slice(0, 10);

  // ── Cheptel ──────────────────────────────────────────────────────────────────
  const total   = rabbits.length;
  const actifs  = rabbits.filter(r => r.status === 'actif').length;
  const vendus  = rabbits.filter(r => r.status === 'vendu').length;
  const morts   = rabbits.filter(r => r.status === 'mort').length;
  const survivalRate = total > 0 ? Math.round((actifs / total) * 100) : 0;

  // ── Reproduction ──────────────────────────────────────────────────────────────
  const birthEvents  = events.filter(e => e.type === 'mise_bas');
  const totalBirths  = birthEvents.length;
  const totalAlive   = birthEvents.reduce((s, e) => s + (Number(e.data?.alive) || 0), 0);
  const totalBorn    = birthEvents.reduce((s, e) => s + (Number(e.data?.born)  || 0), 0);
  const avgAlive     = totalBirths > 0 ? (totalAlive / totalBirths).toFixed(1) : '—';
  const birthSurvival = totalBorn > 0 ? Math.round((totalAlive / totalBorn) * 100) : 0;

  const saillies = events.filter(e => e.type === 'saillie').length;
  const successRate = saillies > 0 ? Math.round((totalBirths / saillies) * 100) : null;

  // Top reproductrices
  const femelles = rabbits.filter(r => r.sex === 'F');
  const topDoes = femelles
    .map(r => ({ r, count: birthEvents.filter(e => e.rabbitId === r.id).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxDoeCount = topDoes.length > 0 ? topDoes[0].count : 1;

  // ── Poids & GDQ ──────────────────────────────────────────────────────────────
  let totalGDQ = 0, gdqCount = 0;
  const currentWeights = [];
  for (const r of rabbits) {
    if (r.status !== 'actif') continue;
    const hist = getRabbitWeightHistory(state, r.id);
    if (hist.length === 0) continue;
    currentWeights.push(hist[hist.length - 1].weightKg);
    if (hist.length < 2) continue;
    const days = daysBetween(hist[0].date, hist[hist.length - 1].date);
    if (days <= 0) continue;
    totalGDQ += (hist[hist.length - 1].weightKg - hist[0].weightKg) / days;
    gdqCount++;
  }
  const avgGDQ = gdqCount > 0 ? (totalGDQ / gdqCount * 1000).toFixed(0) : null;
  const rabbitsWeighed = currentWeights.length;

  // ── Mortalité par race ────────────────────────────────────────────────────────
  const breedMap = new Map();
  for (const r of rabbits) {
    const breed = r.breed || 'Inconnue';
    if (!breedMap.has(breed)) breedMap.set(breed, { actif: 0, mort: 0, vendu: 0 });
    breedMap.get(breed)[r.status] = (breedMap.get(breed)[r.status] || 0) + 1;
  }
  const breedStats = [...breedMap.entries()]
    .map(([breed, s]) => {
      const t = (s.actif || 0) + (s.mort || 0) + (s.vendu || 0);
      return { breed, total: t, actif: s.actif || 0, mort: s.mort || 0, vendu: s.vendu || 0,
               mortalityRate: t > 0 ? Math.round(((s.mort || 0) / t) * 100) : 0 };
    })
    .sort((a, b) => b.total - a.total);
  const maxBreedTotal = breedStats.length > 0 ? breedStats[0].total : 1;

  // ── Activité mensuelle ────────────────────────────────────────────────────────
  const monthCounts = {};
  const typeCounts  = {};
  for (const e of events) {
    const m = (e.date || '').slice(0, 7);
    if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  const months      = Object.keys(monthCounts).sort().slice(-12);
  const monthValues = months.map(m => monthCounts[m]);
  const maxMonth    = Math.max(...monthValues, 1);

  const FRENCH_MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const monthLabel = (m) => {
    const parts = m.split('-');
    return FRENCH_MONTHS[parseInt(parts[1], 10) - 1] || m.slice(5);
  };

  // ── Event type breakdown ──────────────────────────────────────────────────────
  const TYPE_LABELS = {
    pesée: '⚖️ Pesée', vaccin: '💉 Vaccin', traitement: '💊 Traitement',
    mise_bas: '🐣 Mise-bas', saillie: '❤️ Saillie', sevrage: '🐇 Sevrage',
    photo: '📷 Photo', note: '📝 Note',
  };
  const typeEntries = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, label: TYPE_LABELS[type] || type, count }))
    .sort((a, b) => b.count - a.count);
  const maxTypeCount = typeEntries.length > 0 ? typeEntries[0].count : 1;

  host.innerHTML = `
    <div class="stats-container">

      <!-- ── KPI row ── -->
      <div class="stats-kpi-row">
        ${kpi(actifs, 'Actifs')}
        ${kpi(survivalRate + '%', 'Taux survie', survivalRate < 70 ? 'warn' : 'ok')}
        ${kpi(totalBirths, 'Portées')}
        ${kpi(avgAlive, 'Vivants/portée')}
        ${kpi(successRate !== null ? successRate + '%' : '—', 'Taux mise-bas')}
        ${kpi(avgGDQ !== null ? '+' + avgGDQ + 'g/j' : '—', 'Gain poids/j')}
        ${kpi(vendus, 'Vendus')}
        ${kpi(morts, 'Morts', morts > 0 ? 'warn' : '')}
      </div>

      <!-- ── Activité mensuelle ── -->
      ${months.length > 1 ? `
      <div class="stats-card">
        <div class="stats-card-title">📅 Événements par mois</div>
        <div class="stats-barchart">
          ${months.map((m, i) => `
            <div class="sbc-col">
              <div class="sbc-val">${monthValues[i]}</div>
              <div class="sbc-track"><div class="sbc-bar" style="height:${Math.round((monthValues[i] / maxMonth) * 100)}%"></div></div>
              <div class="sbc-label">${monthLabel(m)}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="stats-two-col">

        <!-- ── Top reproductrices ── -->
        <div class="stats-card">
          <div class="stats-card-title">🐰 Reproductrices (portées)</div>
          ${topDoes.length === 0
            ? '<div class="muted small">Aucune portée enregistrée.</div>'
            : topDoes.slice(0, 8).map(({ r, count }) => `
                <div class="stats-hbar-row">
                  <div class="stats-hbar-label">${escapeHTML(r.name)}<span class="muted"> ${escapeHTML(r.code)}</span></div>
                  <div class="stats-hbar-track"><div class="stats-hbar-fill" style="width:${Math.round((count / maxDoeCount) * 100)}%"></div></div>
                  <div class="stats-hbar-val">${count}</div>
                </div>
              `).join('')
          }
          ${totalBorn > 0 ? `
            <div class="stats-card-footer">
              Naissances totales: <strong>${totalBorn}</strong> · Vivants: <strong>${totalAlive}</strong> (${birthSurvival}%)
            </div>
          ` : ''}
        </div>

        <!-- ── Races ── -->
        <div class="stats-card">
          <div class="stats-card-title">🏷️ Cheptel par race</div>
          ${breedStats.map(b => `
            <div class="stats-hbar-row">
              <div class="stats-hbar-label">${escapeHTML(b.breed)}</div>
              <div class="stats-hbar-track">
                <div class="stats-hbar-fill${b.mortalityRate >= 30 ? ' fill-warn' : ''}" style="width:${Math.round((b.total / maxBreedTotal) * 100)}%"></div>
              </div>
              <div class="stats-hbar-val">${b.actif}<span class="muted">/${b.total}</span></div>
            </div>
          `).join('')}
        </div>

      </div>

      <!-- ── Types d'événements ── -->
      ${typeEntries.length > 0 ? `
      <div class="stats-card">
        <div class="stats-card-title">📋 Répartition des événements (${events.length} au total)</div>
        <div class="stats-type-grid">
          ${typeEntries.map(({ label, count }) => `
            <div class="stats-type-cell">
              <div class="stats-type-label">${label}</div>
              <div class="stats-type-bar-wrap">
                <div class="stats-type-bar" style="width:${Math.round((count / maxTypeCount) * 100)}%"></div>
              </div>
              <div class="stats-type-count">${count}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- ── Pesée résumé ── -->
      ${rabbitsWeighed > 0 ? `
      <div class="stats-card">
        <div class="stats-card-title">⚖️ Couverture pesée</div>
        <div class="stats-progress-row">
          <div class="stats-progress-label">${rabbitsWeighed} / ${actifs} lapins actifs pesés</div>
          <div class="stats-progress-track">
            <div class="stats-progress-fill" style="width:${actifs > 0 ? Math.round((rabbitsWeighed / actifs) * 100) : 0}%"></div>
          </div>
          <div class="stats-progress-pct">${actifs > 0 ? Math.round((rabbitsWeighed / actifs) * 100) : 0}%</div>
        </div>
        ${avgGDQ !== null ? `<div class="stats-card-footer">Gain journalier moyen : <strong>+${avgGDQ} g/j</strong> sur ${gdqCount} lapin${gdqCount > 1 ? 's' : ''} avec historique</div>` : ''}
      </div>
      ` : ''}

    </div>
  `;
}

function kpi(value, label, cls = '') {
  return `<div class="stats-kpi${cls ? ' stats-kpi--' + cls : ''}">
    <div class="stats-kpi-n">${value}</div>
    <div class="stats-kpi-t">${label}</div>
  </div>`;
}
