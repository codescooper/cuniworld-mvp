// Rendu + câblage du panneau "Paramètres ferme" : économie, reproduction,
// soins, identité, et gestion des membres (avec rôles).

import { escapeHTML, escapeAttr } from './utils.js';
import {
  DEFAULT_SETTINGS, COMMON_CURRENCIES, saveFarmSettings, getSettings,
} from './settingsService.js';
import { ROLES, ROLE_LABELS, can, isOwner } from './permissions.js';
import { supabase } from './supabase.js';
import { fetchFarmMembers } from './membersService.js';
import { showToast, showConfirm } from './notifications.js';

export function renderSettings(ctx) {
  const host = document.getElementById('settingsContent');
  if (!host) return;

  if (!ctx.farmId) {
    host.innerHTML = `
      <div class="section-card">
        <div class="muted">
          Les paramètres avancés (devise, prix de référence, rôles, membres)
          ne sont disponibles qu'en mode cloud, après connexion à une ferme.
        </div>
      </div>`;
    return;
  }

  const s = getSettings(ctx);
  const editable = can(ctx, 'manage_settings');
  const canMembers = can(ctx, 'manage_members');

  host.innerHTML = `
    ${_identitySection(ctx, s, editable)}
    ${_economySection(s, editable)}
    ${_reproSection(s, editable)}
    ${_caresSection(s, editable)}
    ${_membersSection(ctx, canMembers)}
    <div id="settingsSaveBar" style="display:${editable ? 'flex' : 'none'};justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn" id="settingsSave" data-testid="settings-save">Enregistrer les paramètres</button>
    </div>
    ${!editable ? `<div class="muted" style="margin-top:14px">Seuls les rôles « Propriétaire » et « Administrateur » peuvent modifier ces paramètres.</div>` : ''}
  `;

  _wireSettings(ctx, host);
}

// ── Sections ────────────────────────────────────────────────────────────────

function _identitySection(ctx, s, editable) {
  return `
    <div class="section-card" style="margin-bottom:12px">
      <div class="settings-section-title">🏡 Identité de la ferme</div>
      <div class="kv" style="grid-template-columns:1fr">
        <div class="field">
          <div class="label">Nom (lecture seule — modifiable via "Changer de ferme")</div>
          <input class="input" value="${escapeAttr(ctx.farmName || '')}" disabled>
        </div>
        <div class="field">
          <div class="label">Description publique (visible sur la boutique)</div>
          <textarea class="input" name="description" rows="2" ${editable ? '' : 'disabled'}
            placeholder="Élevage familial, race XYZ, livraison Dakar…">${escapeHTML(s.description || '')}</textarea>
        </div>
        <div class="row2">
          <div class="field">
            <div class="label">Téléphone</div>
            <input class="input" name="phone" value="${escapeAttr(s.phone || '')}" ${editable ? '' : 'disabled'} placeholder="+221 77 …">
          </div>
          <div class="field">
            <div class="label">WhatsApp (avec indicatif, ex : 221770000000)</div>
            <input class="input" name="whatsapp" value="${escapeAttr(s.whatsapp || '')}" ${editable ? '' : 'disabled'} placeholder="221770000000">
          </div>
        </div>
      </div>
    </div>
  `;
}

function _economySection(s, editable) {
  const currencyOptions = COMMON_CURRENCIES.map(c =>
    `<option value="${c.code}" data-symbol="${escapeAttr(c.symbol)}" ${s.currencyCode === c.code ? 'selected' : ''}>${escapeHTML(c.label)}</option>`
  ).join('');
  // Si la devise courante n'est pas dans la liste, on ajoute une option « personnalisée ».
  const customOpt = COMMON_CURRENCIES.find(c => c.code === s.currencyCode)
    ? ''
    : `<option value="${escapeAttr(s.currencyCode)}" selected>${escapeHTML(s.currencyCode)} (personnalisée)</option>`;

  return `
    <div class="section-card" style="margin-bottom:12px">
      <div class="settings-section-title">💰 Économie</div>
      <div class="row2">
        <div class="field">
          <div class="label">Devise (code ISO)</div>
          <select class="input" name="currencyCode" id="currencyCodeSel" ${editable ? '' : 'disabled'}>
            ${currencyOptions}${customOpt}
          </select>
        </div>
        <div class="field">
          <div class="label">Symbole affiché</div>
          <input class="input" name="currencySymbol" id="currencySymbolInput" value="${escapeAttr(s.currencySymbol)}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <div class="label">Prix poids vif (<span data-currency-label>${escapeHTML(s.currencySymbol)}</span> / kg)</div>
          <input class="input" name="priceLivePerKg" type="number" min="0" step="any" value="${s.priceLivePerKg}" ${editable ? '' : 'disabled'}>
        </div>
        <div class="field">
          <div class="label">Prix carcasse (<span data-currency-label>${escapeHTML(s.currencySymbol)}</span> / kg)</div>
          <input class="input" name="priceCarcassPerKg" type="number" min="0" step="any" value="${s.priceCarcassPerKg}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
      <div class="field">
        <div class="label">Rendement carcasse (fraction du poids vif, ex : 0.55 = 55 %)</div>
        <input class="input" name="carcassYield" type="number" min="0.2" max="1" step="0.01" value="${s.carcassYield}" ${editable ? '' : 'disabled'}>
      </div>
    </div>
  `;
}

function _reproSection(s, editable) {
  return `
    <div class="section-card" style="margin-bottom:12px">
      <div class="settings-section-title">🤰 Reproduction</div>
      <div class="row2">
        <div class="field">
          <div class="label">Durée de gestation (j)</div>
          <input class="input" name="gestationDays" type="number" min="20" max="40" value="${s.gestationDays}" ${editable ? '' : 'disabled'}>
        </div>
        <div class="field">
          <div class="label">Âge maturité saillie (j)</div>
          <input class="input" name="maturityDays" type="number" min="60" max="240" value="${s.maturityDays}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <div class="label">Sevrage min (j)</div>
          <input class="input" name="minWeanDays" type="number" min="20" max="50" value="${s.minWeanDays}" ${editable ? '' : 'disabled'}>
        </div>
        <div class="field">
          <div class="label">Sevrage recommandé (j)</div>
          <input class="input" name="recommendedWeanDays" type="number" min="20" max="50" value="${s.recommendedWeanDays}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
      <div class="field">
        <div class="label">Sevrage en retard à partir de (j)</div>
        <input class="input" name="overdueWeanDays" type="number" min="25" max="60" value="${s.overdueWeanDays}" ${editable ? '' : 'disabled'}>
      </div>
    </div>
  `;
}

function _caresSection(s, editable) {
  return `
    <div class="section-card" style="margin-bottom:12px">
      <div class="settings-section-title">🩺 Soins & rappels</div>
      <div class="row2">
        <div class="field">
          <div class="label">Pesée en retard après (j)</div>
          <input class="input" name="weightCheckOverdueDays" type="number" min="1" max="30" value="${s.weightCheckOverdueDays}" ${editable ? '' : 'disabled'}>
        </div>
        <div class="field">
          <div class="label">Photo à reprendre après (j)</div>
          <input class="input" name="photoCheckOverdueDays" type="number" min="1" max="60" value="${s.photoCheckOverdueDays}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <div class="label">Fenêtre rappel vaccin/traitement (j)</div>
          <input class="input" name="healthReminderWindowDays" type="number" min="1" max="30" value="${s.healthReminderWindowDays}" ${editable ? '' : 'disabled'}>
        </div>
        <div class="field">
          <div class="label">Inspection loge par défaut (j)</div>
          <input class="input" name="inspectionDefaultDays" type="number" min="1" max="60" value="${s.inspectionDefaultDays}" ${editable ? '' : 'disabled'}>
        </div>
      </div>
    </div>
  `;
}

function _membersSection(ctx, canMembers) {
  const members = Array.isArray(ctx.farmMembers) ? ctx.farmMembers : [];
  const rows = members.length === 0
    ? `<div class="muted small">Chargement des membres…</div>`
    : members.map(m => {
      const sel = canMembers && !m.isMe
        ? `<select class="input" data-set-role="${escapeAttr(m.userId)}" style="width:auto;padding:3px 8px">
            ${ROLES.map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
          </select>`
        : `<span class="badge">${ROLE_LABELS[m.role] || m.role}</span>`;
      const removeBtn = canMembers && !m.isMe
        ? `<button class="btn ghost" data-remove-member="${escapeAttr(m.userId)}" title="Retirer ce membre">🗑️</button>`
        : '';
      return `
        <div class="item" style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <strong>${escapeHTML(m.label || m.email || 'Membre')}</strong>
            ${m.email && m.email !== m.label ? `<div class="small muted">${escapeHTML(m.email)}</div>` : ''}
          </div>
          ${sel}
          ${removeBtn}
        </div>`;
    }).join('');

  const inviteBlock = canMembers ? `
    <div class="sep"></div>
    <div class="field">
      <div class="label">Inviter un nouveau membre</div>
      <div class="row" style="gap:8px;align-items:center">
        <button class="btn" id="btnCopyInvite">📋 Copier le lien d'invitation</button>
        <span class="small muted" id="inviteHint">Partagez ce lien par email ou WhatsApp.</span>
      </div>
    </div>
  ` : '';

  return `
    <div class="section-card" style="margin-bottom:12px">
      <div class="settings-section-title">👥 Membres de la ferme</div>
      <div class="list">${rows}</div>
      ${inviteBlock}
    </div>
  `;
}

// ── Câblage ─────────────────────────────────────────────────────────────────

function _wireSettings(ctx, host) {
  const canEdit = can(ctx, 'manage_settings');

  // Synchronise le symbole quand on choisit une devise standard, et met à jour
  // en direct les libellés "Prix … (<symbole> / kg)".
  const codeSel = host.querySelector('#currencyCodeSel');
  const symInp  = host.querySelector('#currencySymbolInput');
  const refreshCurrencyLabels = () => {
    const sym = (symInp?.value || 'FCFA').trim() || 'FCFA';
    host.querySelectorAll('[data-currency-label]').forEach(el => { el.textContent = sym; });
  };
  codeSel?.addEventListener('change', () => {
    const opt = codeSel.selectedOptions[0];
    const sym = opt?.dataset?.symbol;
    if (sym && symInp) symInp.value = sym;
    refreshCurrencyLabels();
  });
  symInp?.addEventListener('input', refreshCurrencyLabels);

  // Enregistrement global
  host.querySelector('#settingsSave')?.addEventListener('click', async () => {
    if (!canEdit) return;
    const next = { ...(ctx.farmSettings || DEFAULT_SETTINGS) };
    const fields = host.querySelectorAll('[name]');
    for (const f of fields) {
      const name = f.name;
      if (!(name in DEFAULT_SETTINGS)) continue;
      const def = DEFAULT_SETTINGS[name];
      if (typeof def === 'number') {
        const v = parseFloat(f.value);
        next[name] = Number.isFinite(v) ? v : def;
      } else {
        next[name] = (f.value || '').toString();
      }
    }
    try {
      await saveFarmSettings(ctx.farmId, next);
      ctx.farmSettings = next;
      showToast('Paramètres enregistrés.', 'success');
      ctx.render?.();
    } catch (err) {
      showToast('Échec enregistrement : ' + (err?.message || err), 'error');
    }
  });

  // Lien d'invitation
  host.querySelector('#btnCopyInvite')?.addEventListener('click', () => {
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const link = `${base}?join=${ctx.farmId}`;
    const msg  =
      `Bonjour,\n\nJe t'invite à rejoindre ma ferme « ${ctx.farmName} » sur CuniWorld.\n\n` +
      `Lien : ${link}\n\nÀ bientôt !`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg)
        .then(() => showToast("Lien d'invitation copié.", 'success'))
        .catch(() => showToast(link, 'info'));
    } else {
      showToast(link, 'info');
    }
  });

  // Changement de rôle
  host.querySelectorAll('[data-set-role]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (!isOwner(ctx)) {
        showToast('Seul le propriétaire peut changer les rôles.', 'warn');
        return;
      }
      const userId = sel.dataset.setRole;
      const role   = sel.value;
      try {
        const { error } = await supabase.rpc('set_farm_member_role', {
          p_farm_id: ctx.farmId, p_user_id: userId, p_role: role,
        });
        if (error) throw error;
        showToast('Rôle mis à jour.', 'success');
        ctx.farmMembers = await fetchFarmMembers(ctx.farmId, ctx.currentUser?.id);
        ctx.render?.();
      } catch (err) {
        showToast('Échec : ' + (err?.message || err), 'error');
      }
    });
  });

  // Retrait d'un membre
  host.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.removeMember;
      const ok = await showConfirm({
        title: 'Retirer le membre',
        message: 'Retirer ce membre de la ferme ? Il pourra rejoindre à nouveau via un lien d\'invitation.',
        confirmLabel: 'Retirer', cancelLabel: 'Annuler', danger: true,
      });
      if (!ok) return;
      try {
        const { error } = await supabase.rpc('remove_farm_member', {
          p_farm_id: ctx.farmId, p_user_id: userId,
        });
        if (error) throw error;
        showToast('Membre retiré.', 'success');
        ctx.farmMembers = await fetchFarmMembers(ctx.farmId, ctx.currentUser?.id);
        ctx.render?.();
      } catch (err) {
        showToast('Échec : ' + (err?.message || err), 'error');
      }
    });
  });
}
