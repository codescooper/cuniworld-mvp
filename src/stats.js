import { daysBetween, escapeHTML } from './utils.js';
import { getRabbitWeightHistory } from './weightService.js';
import { rankFemales, rankMales } from './breederStats.js';
import { computeConsumptionIndex } from './feedTracking.js';
import { deathCauseLabel } from './lots.js';

/**
 * Agrège la mortalité par cause à partir des événements `décès` (data.cause)
 * + les mort-nés (mise_bas : nés - nés vivants), regroupés sous une catégorie.
 * @returns {{ rows: Array<{cause, label, count}>, total: number }}
 */
export function mortalityByCause(state) {
  const counts = new Map();
  for (const e of (state.events || [])) {
    if (e.type !== 'décès' && e.type !== 'deces') continue;
    const cause = e.data?.cause || 'inconnu';
    counts.set(cause, (counts.get(cause) || 0) + 1);
  }
  let stillborn = 0;
  for (const e of (state.events || [])) {
    if (e.type !== 'mise_bas') continue;
    stillborn += Math.max(0, (Number(e.data?.born) || 0) - (Number(e.data?.alive) || 0));
  }
  if (stillborn > 0) counts.set('__stillborn', stillborn);

  const rows = [...counts.entries()]
    .map(([cause, count]) => ({
      cause,
      label: cause === '__stillborn' ? 'Mort-né (naissance)' : deathCauseLabel(cause),
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  return { rows, total };
}

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
  const mortsRecords = rabbits.filter(r => r.status === 'mort').length;
  const survivalRate = total > 0 ? Math.round((actifs / total) * 100) : 0;

  // ── Reproduction ──────────────────────────────────────────────────────────────
  const birthEvents  = events.filter(e => e.type === 'mise_bas');
  const totalBirths  = birthEvents.length;
  const totalAlive   = birthEvents.reduce((s, e) => s + (Number(e.data?.alive) || 0), 0);
  const totalBorn    = birthEvents.reduce((s, e) => s + (Number(e.data?.born)  || 0), 0);
  // Mort-nés : nés - nés vivants, agrégés sur toutes les portées.
  const stillborn = birthEvents.reduce((s, e) => s + Math.max(0, (Number(e.data?.born) || 0) - (Number(e.data?.alive) || 0)), 0);
  // Mortalité totale = décès enregistrés (records) + mort-nés (jamais créés).
  const morts = mortsRecords + stillborn;
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
        ${kpi(morts, 'Morts', morts > 0 ? 'warn' : '', stillborn > 0 ? `Dont ${stillborn} mort-né${stillborn > 1 ? 's' : ''} + ${mortsRecords} décès enregistrés` : '')}
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

      ${_renderMortalityByCause(state)}
      ${_renderBreederRankings(state)}
      ${_renderConsumptionIndex(state)}

    </div>
  `;
}

// ── Mortalité par cause ──────────────────────────────────────────────────────
function _renderMortalityByCause(state) {
  const { rows, total } = mortalityByCause(state);
  if (!rows.length) return '';
  const max = rows[0].count;
  return `
    <div class="stats-card">
      <div class="stats-card-title">💀 Mortalité par cause (${total})</div>
      ${rows.map(r => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return `
        <div class="stats-hbar-row">
          <div class="stats-hbar-label">${escapeHTML(r.label)}</div>
          <div class="stats-hbar-track"><div class="stats-hbar-fill fill-warn" style="width:${Math.round((r.count / max) * 100)}%"></div></div>
          <div class="stats-hbar-val">${r.count}<span class="muted small"> · ${pct}%</span></div>
        </div>`;
      }).join('')}
      <div class="stats-card-footer">Renseigne la cause à chaque déclaration de perte (lot ou fiche lapin) pour affiner ce suivi.</div>
    </div>`;
}

// ── Classements reproducteurs (item roadmap 4.5) ────────────────────────────
function _renderBreederRankings(state) {
  const does  = rankFemales(state).slice(0, 8);
  const bucks = rankMales(state).slice(0, 8);
  if (does.length === 0 && bucks.length === 0) return '';

  const doesHTML = does.length === 0
    ? '<div class="muted small">Aucune femelle avec portée enregistrée.</div>'
    : `<table style="width:100%;font-size:.85rem;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--color-border)">
          <th style="text-align:left;padding:4px">Femelle</th>
          <th style="text-align:right;padding:4px" title="Nombre de portées">Por.</th>
          <th style="text-align:right;padding:4px" title="Sevrés / portée">S/P</th>
          <th style="text-align:right;padding:4px" title="Taux de survie naissance → vivants">Surv.</th>
          <th style="text-align:right;padding:4px" title="Portées extrapolées sur 1 an">Por./an</th>
          <th style="text-align:right;padding:4px" title="Score composite (plus haut = meilleure)">Score</th>
        </tr></thead>
        <tbody>${does.map(d => `
          <tr>
            <td style="padding:4px"><strong>${escapeHTML(d.rabbit.name)}</strong> <span class="muted small">${escapeHTML(d.rabbit.code || '')}</span></td>
            <td style="text-align:right;padding:4px">${d.litters}</td>
            <td style="text-align:right;padding:4px">${d.weanedPerLitter}</td>
            <td style="text-align:right;padding:4px">${d.survival}%</td>
            <td style="text-align:right;padding:4px">${d.littersPerYear ?? '—'}</td>
            <td style="text-align:right;padding:4px;font-weight:700">${d.score}</td>
          </tr>`).join('')}</tbody>
      </table>`;

  const bucksHTML = bucks.length === 0
    ? '<div class="muted small">Aucun mâle avec saillie ou descendance enregistrée.</div>'
    : `<table style="width:100%;font-size:.85rem;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--color-border)">
          <th style="text-align:left;padding:4px">Mâle</th>
          <th style="text-align:right;padding:4px" title="Saillies enregistrées">Saillies</th>
          <th style="text-align:right;padding:4px" title="Descendants confirmés (buckId des lapereaux)">Descend.</th>
        </tr></thead>
        <tbody>${bucks.map(m => `
          <tr>
            <td style="padding:4px"><strong>${escapeHTML(m.rabbit.name)}</strong> <span class="muted small">${escapeHTML(m.rabbit.code || '')}</span></td>
            <td style="text-align:right;padding:4px">${m.matings}</td>
            <td style="text-align:right;padding:4px;font-weight:700">${m.offspring}</td>
          </tr>`).join('')}</tbody>
      </table>`;

  return `
    <div class="stats-two-col">
      <div class="stats-card">
        <div class="stats-card-title">🏆 Top reproductrices</div>
        ${doesHTML}
      </div>
      <div class="stats-card">
        <div class="stats-card-title">🏆 Top mâles reproducteurs</div>
        ${bucksHTML}
      </div>
    </div>`;
}

// ── Indice de consommation (item roadmap 4.4) ──────────────────────────────
function _renderConsumptionIndex(state) {
  const r = computeConsumptionIndex(state);
  if (r.feedKg === 0 && r.producedKg === 0) return '';
  const ic = r.indice;
  const cls = ic == null ? '' : (ic <= 3.5 ? 'ok' : ic <= 4.5 ? 'warn' : 'bad');
  return `
    <div class="stats-card">
      <div class="stats-card-title">🌾 Indice de consommation</div>
      <div class="stats-kpi-row" style="grid-template-columns:repeat(3,1fr)">
        <div class="stats-kpi"><div class="stats-kpi-n">${r.feedKg.toFixed(1)} kg</div><div class="stats-kpi-t">Aliments consommés</div></div>
        <div class="stats-kpi"><div class="stats-kpi-n">${r.producedKg.toFixed(1)} kg</div><div class="stats-kpi-t">Vif produit (ventes + cheptel)</div></div>
        <div class="stats-kpi${cls ? ' stats-kpi--' + cls : ''}"><div class="stats-kpi-n">${ic == null ? '—' : ic}</div><div class="stats-kpi-t">IC (kg aliment / kg vif)</div></div>
      </div>
      <div class="stats-card-footer">
        Un IC entre 3 et 4 est attendu en cuniculture saine.
        L'unité "sac" est convertie à 25 kg par défaut.
      </div>
    </div>`;
}

function kpi(value, label, cls = '', title = '') {
  const t = title ? ` title="${escapeHTML(title)}"` : '';
  return `<div class="stats-kpi${cls ? ' stats-kpi--' + cls : ''}"${t}>
    <div class="stats-kpi-n">${value}</div>
    <div class="stats-kpi-t">${label}</div>
  </div>`;
}
