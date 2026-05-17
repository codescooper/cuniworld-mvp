/**
 * statusPage.js — health-check minimaliste accessible via `?status=1`.
 *
 * Affiche la version applicative, le commit, l'horodatage de build, et
 * une mesure de latence vers Supabase. Utilisé par les outils de monitoring
 * externes (UptimeRobot, BetterStack, Vercel Healthchecks…) pour vérifier
 * qu'une page sert bien le dernier build et que la BDD répond.
 *
 * Pas d'auth, pas de chargement de l'app : la page est self-contained.
 */

import { supabase, supabaseConfigured } from './supabase.js';

const STATUS_CSS = `
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  .status-wrap { max-width: 540px; margin: 40px auto; padding: 24px; }
  .status-card { background: #1e293b; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
  h1 { margin: 0 0 18px; font-size: 1.3rem; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid #334155; font-size: 14px; }
  .row:first-of-type { border-top: 0; }
  .row .k { color: #94a3b8; }
  .row .v { font-family: ui-monospace, monospace; }
  .ok    { color: #4ade80; }
  .warn  { color: #fbbf24; }
  .err   { color: #f87171; }
  .small { font-size: 12px; color: #64748b; margin-top: 14px; text-align: center; }
`;

export async function renderStatusPage() {
  // On vide complètement le DOM existant pour que la page soit autonome :
  // pas de styles globaux qui interfèrent, pas de scripts résiduels.
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = STATUS_CSS;
  document.head.appendChild(style);

  const version  = (typeof __APP_VERSION__    !== 'undefined') ? __APP_VERSION__    : 'dev';
  const commit   = (typeof __APP_COMMIT__     !== 'undefined') ? __APP_COMMIT__     : 'local';
  const buildIso = (typeof __APP_BUILD_TIME__ !== 'undefined') ? __APP_BUILD_TIME__ : null;

  const wrap = document.createElement('div');
  wrap.className = 'status-wrap';
  wrap.innerHTML = `
    <div class="status-card">
      <h1>CuniWorld — Status</h1>
      <div class="row"><span class="k">Version</span><span class="v">${version}</span></div>
      <div class="row"><span class="k">Commit</span><span class="v">${commit}</span></div>
      <div class="row"><span class="k">Build</span><span class="v">${buildIso || '—'}</span></div>
      <div class="row"><span class="k">Supabase</span><span class="v" id="supaStatus">…</span></div>
      <div class="row"><span class="k">Service Worker</span><span class="v" id="swStatus">…</span></div>
      <div class="row"><span class="k">Online</span><span class="v ${navigator.onLine ? 'ok' : 'warn'}">${navigator.onLine ? 'oui' : 'non'}</span></div>
      <div class="small">Page utilisée pour les sondes de monitoring (UptimeRobot, BetterStack…).</div>
    </div>`;
  document.body.appendChild(wrap);

  // Ping Supabase : on tape un endpoint léger (`/auth/v1/health`) qui répond
  // sans auth et reste rapide. Si supabase n'est pas configuré, on l'affiche.
  const supaEl = document.getElementById('supaStatus');
  if (!supabaseConfigured) {
    supaEl.textContent = 'non configuré';
    supaEl.className = 'v warn';
  } else {
    const t0 = performance.now();
    try {
      const url = (supabase.supabaseUrl || '').replace(/\/$/, '') + '/auth/v1/health';
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        supaEl.textContent = `ok (${ms} ms)`;
        supaEl.className = 'v ok';
      } else {
        supaEl.textContent = `HTTP ${res.status} (${ms} ms)`;
        supaEl.className = 'v err';
      }
    } catch (err) {
      supaEl.textContent = `erreur — ${err.message || err}`;
      supaEl.className = 'v err';
    }
  }

  // SW : juste pour info, ne bloque rien.
  const swEl = document.getElementById('swStatus');
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const reg = regs[0];
      if (reg?.active) { swEl.textContent = 'actif'; swEl.className = 'v ok'; }
      else if (reg)    { swEl.textContent = 'installation'; swEl.className = 'v warn'; }
      else             { swEl.textContent = 'non installé'; swEl.className = 'v warn'; }
    } catch (_) {
      swEl.textContent = 'inconnu';
    }
  } else {
    swEl.textContent = 'non supporté';
    swEl.className = 'v warn';
  }
}
