/**
 * photoCheck.js — Module de prise de photo assistée
 *
 * API publique :
 *   getRabbitsDueForPhotoCheck(state, thresholdDays)  → [{rabbit, lastPhoto}]
 *   openPhotoCheckModal(ctx)
 *   openSinglePhotoModal(ctx, rabbitId)
 */

import { getRabbitsDueForPhotoCheck as _getDue, getPhotoHistory, compressImage, rabbitThumbHTML } from './photos.js';
import { daysBetween, formatDate, escapeHTML, escapeAttr } from './utils.js';
import { addPhoto } from './actions.js';
import { openModal } from './modal.js';
import { sortByCage } from './cageSort.js';

function getRabbitsDueForPhotoCheck(state, thresholdDays) {
  const raw = _getDue(state, thresholdDays);
  return sortByCage(raw, x => x.rabbit.cage);
}

export { getRabbitsDueForPhotoCheck };

// ── Modal parcours complet ────────────────────────────────────────

export function openPhotoCheckModal(ctx) {
  const due = getRabbitsDueForPhotoCheck(ctx.state);

  if (due.length === 0) {
    openModal(ctx.el, 'Prise de photo', `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
        <p style="font-size:1.1rem;font-weight:600">Tous les lapins ont été photographiés récemment !</p>
        <p class="muted">Aucun lapin n'est en attente de photo (seuil : 7 jours).</p>
      </div>`);
    return;
  }

  const queue  = [...due];
  let   cursor = 0;

  openModal(ctx.el, 'Prise de photo assistée', '');
  _renderPhotoStep(ctx, queue, cursor, (n) => { cursor = n; });
}

// ── Modal photo unique (depuis la fiche lapin) ────────────────────

export function openSinglePhotoModal(ctx, rabbitId) {
  const r = ctx.state.rabbits.find(x => x.id === rabbitId);
  if (!r) return;

  const history  = getPhotoHistory(ctx.state, rabbitId);
  const lastPhoto = history[0] || null;

  openModal(ctx.el, `Photo — ${r.name}`, '');
  _renderSingleStep(ctx, r, lastPhoto);
}

// ── Rendu d'une étape parcours ────────────────────────────────────

function _renderPhotoStep(ctx, queue, cursor, setCursor) {
  const body = document.getElementById('modalBody');
  if (!body) return;

  const total = queue.length;

  if (cursor >= total) {
    body.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:2.5rem;margin-bottom:12px">🎉</div>
        <p style="font-size:1.1rem;font-weight:600">Toutes les photos ont été prises !</p>
        <p class="muted">Session terminée — ${total} lapin(s) traité(s).</p>
        <button class="btn" id="pcDone" style="margin-top:16px">Fermer</button>
      </div>`;
    document.getElementById('pcDone')?.addEventListener('click', () => {
      document.getElementById('modalClose')?.click();
    });
    return;
  }

  const { rabbit: r, lastPhoto } = queue[cursor];
  _renderStepContent(ctx, r, lastPhoto, {
    showProgress: true,
    current: cursor + 1,
    total,
    onSave: () => {
      const next = cursor + 1;
      setCursor(next);
      _renderPhotoStep(ctx, queue, next, setCursor);
    },
    onSkip: () => {
      const skipped = queue.splice(cursor, 1)[0];
      queue.push(skipped);
      _renderPhotoStep(ctx, queue, cursor, setCursor);
    },
  });
}

function _renderSingleStep(ctx, r, lastPhoto) {
  _renderStepContent(ctx, r, lastPhoto, {
    showProgress: false,
    onSave: () => { document.getElementById('modalClose')?.click(); },
    onSkip: () => { document.getElementById('modalClose')?.click(); },
  });
}

// ── Contenu partagé d'une étape ───────────────────────────────────

function _renderStepContent(ctx, r, lastPhoto, { showProgress, current, total, onSave, onSkip }) {
  const body = document.getElementById('modalBody');
  if (!body) return;

  const today      = new Date().toISOString().slice(0, 10);
  const lastDate   = lastPhoto ? formatDate(lastPhoto.date) : 'Jamais';
  const daysSince  = lastPhoto ? daysBetween(lastPhoto.date, today) : null;
  const sinceTxt   = daysSince !== null ? ` (il y a ${daysSince} j)` : '';
  const ageText    = _ageText(r.birthDate, today);

  const progressHTML = showProgress
    ? `<div class="wc-progress">
        <span class="wc-step">Lapin ${current} sur ${total}</span>
        <div class="wc-bar"><div class="wc-fill" style="width:${Math.round(((current - 1) / total) * 100)}%"></div></div>
       </div>`
    : '';

  const thumbHTML = lastPhoto
    ? `<div class="pc-last-photo">
        <img class="pc-thumb" src="${escapeAttr(lastPhoto.dataUrl)}" alt="Dernière photo" loading="lazy">
        <div class="pc-thumb-label">Dernière photo : <strong>${lastDate}${sinceTxt}</strong></div>
       </div>`
    : `<div class="pc-no-photo">📷 Aucune photo enregistrée</div>`;

  body.innerHTML = `
    ${progressHTML}

    <div class="wc-rabbit-card">
      <div class="wc-name" style="display:flex;align-items:center;gap:8px">
        ${rabbitThumbHTML(ctx.state, r, { size: 40 })}
        <span>${escapeHTML(r.name)}</span>
        <span class="badge">${r.sex === 'F' ? 'Femelle' : r.sex === 'M' ? 'Mâle' : '?'}</span>
      </div>
      <div class="wc-id-row">
        <span class="wc-code">📋 ${escapeHTML(r.code || '—')}</span>
        <span class="wc-cage">🏠 Cage <strong>${escapeHTML(r.cage || '—')}</strong></span>
        ${r.breed ? `<span class="wc-breed">🐰 ${escapeHTML(r.breed)}</span>` : ''}
        ${ageText ? `<span>🎂 ${escapeHTML(ageText)}</span>` : ''}
      </div>
      ${thumbHTML}
    </div>

    <div class="pc-upload-zone" id="pcUploadZone">
      <label class="pc-upload-label" id="pcUploadLabel">
        <span id="pcUploadText">📷 Choisir ou prendre une photo</span>
        <input type="file" id="pcFileInput" accept="image/*" style="display:none">
      </label>
      <img id="pcPreview" class="pc-preview" style="display:none" alt="Aperçu">
      <button type="button" id="pcClearPhoto" class="btn secondary" style="display:none;margin-top:6px;font-size:.8rem">Retirer</button>
    </div>
    <div id="pcError" style="color:var(--color-danger);font-size:.85rem;min-height:1.2em;margin-top:4px"></div>

    <div class="field" style="margin-top:12px">
      <div class="label">Note <span style="font-weight:normal;color:var(--color-muted)">(optionnelle)</span></div>
      <input id="pcNote" class="input" type="text" placeholder="ex: Après vermifuge, bonne condition…" maxlength="120">
    </div>

    <div class="row" style="justify-content:space-between;margin-top:16px;gap:10px">
      <button class="btn secondary" id="pcSkip" style="flex:1">${showProgress ? 'Passer →' : 'Annuler'}</button>
      <button class="btn" id="pcSave" style="flex:2" disabled>Enregistrer ✓</button>
    </div>`;

  // ── Gestion du fichier ─────────────────────────────────────────
  let selectedDataUrl = null;
  const fileInput  = document.getElementById('pcFileInput');
  const preview    = document.getElementById('pcPreview');
  const uploadText = document.getElementById('pcUploadText');
  const clearBtn   = document.getElementById('pcClearPhoto');
  const saveBtn    = document.getElementById('pcSave');
  const errEl      = document.getElementById('pcError');

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      errEl.textContent = 'Fichier invalide — choisissez une image (JPG, PNG, WEBP…).';
      fileInput.value = '';
      return;
    }

    errEl.textContent    = '';
    uploadText.textContent = '⏳ Compression…';
    saveBtn.disabled     = true;

    try {
      selectedDataUrl = await compressImage(file);
      if (preview) { preview.src = selectedDataUrl; preview.style.display = 'block'; }
      if (clearBtn) clearBtn.style.display = '';
      uploadText.textContent = '✓ Photo sélectionnée — changez si besoin';
      saveBtn.disabled = false;
    } catch (err) {
      errEl.textContent    = 'Impossible de lire cette image : ' + (err?.message || err);
      uploadText.textContent = '📷 Choisir ou prendre une photo';
      selectedDataUrl = null;
    } finally {
      fileInput.value = '';
    }
  });

  clearBtn?.addEventListener('click', () => {
    selectedDataUrl = null;
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    clearBtn.style.display = 'none';
    uploadText.textContent = '📷 Choisir ou prendre une photo';
    saveBtn.disabled = true;
  });

  // ── Enregistrement ─────────────────────────────────────────────
  async function save() {
    if (!selectedDataUrl) {
      errEl.textContent = 'Sélectionnez une photo avant d\'enregistrer.';
      return;
    }
    const note = (document.getElementById('pcNote')?.value || '').trim();
    try {
      await addPhoto(ctx, r.id, {
        dataUrl: selectedDataUrl,
        date:    today,
        source:  'profil',
        note,
      });
    } catch (err) {
      errEl.textContent = err.message || 'Erreur.';
      return;
    }
    onSave();
  }

  document.getElementById('pcSave')?.addEventListener('click', save);
  document.getElementById('pcSkip')?.addEventListener('click', onSkip);
}

// ── Helper ────────────────────────────────────────────────────────

function _ageText(birthDate, today) {
  if (!birthDate) return '';
  const days = daysBetween(birthDate, today);
  if (days < 0)   return '';
  if (days < 30)  return `${days} j`;
  if (days < 365) return `${Math.floor(days / 7)} sem`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} mois`;
  return `${Math.floor(days / 365)} ans`;
}
