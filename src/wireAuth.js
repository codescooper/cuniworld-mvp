import { Auth } from './auth.js';
import { FarmService } from './farmService.js';
import { DB } from './db.js';
import { escapeHTML } from './utils.js';

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

// Timeout helper : rejette si la promesse prend trop longtemps
function _withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Délai dépassé (${label})`)), ms)
    ),
  ]);
}

// ── Point d'entrée : appelé au boot de l'app ──────────────────────
export async function bootWithAuth(ctx, onReady) {
  let session = null;
  try {
    session = await _withTimeout(Auth.getSession(), 8000, 'getSession');
  } catch (ex) {
    console.warn('[Auth] getSession échoué, mode hors-ligne activé :', ex.message);
    _goOffline(ctx, onReady);
    return;
  }

  if (session) {
    ctx.currentUser = session.user;
    await _selectFarm(ctx, onReady);
  } else {
    _showAuthScreen(ctx, onReady);
  }

  // Réagit aux changements d'état auth (déconnexion autre onglet, expiration)
  Auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      DB.unsubscribeAll();
      ctx.farmId = null;
      ctx.currentUser = null;
      _showAuthScreen(ctx, onReady);
    }
  });
}

// ── Fallback mode hors-ligne ──────────────────────────────────────
function _goOffline(ctx, onReady) {
  const overlay = document.getElementById('authOverlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
  onReady();
}

// ── Écran de connexion / inscription ─────────────────────────────
function _showAuthScreen(ctx, onReady) {
  const overlay = document.getElementById('authOverlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = _authShellHTML();

  overlay.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _renderAuthForm(overlay, tab.dataset.mode, ctx, onReady);
    });
  });

  _renderAuthForm(overlay, 'login', ctx, onReady);
}

function _renderAuthForm(overlay, mode, ctx, onReady) {
  const label = mode === 'login' ? 'Se connecter' : 'Créer le compte';
  overlay.querySelector('#authFormInner').innerHTML = `
    <form id="authSubmitForm" class="auth-form">
      <input name="email" type="email" class="input" placeholder="Adresse email" required autocomplete="email" />
      <input name="password" type="password" class="input" placeholder="Mot de passe (min. 6 caractères)" required minlength="6"
             autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" />
      <button type="submit" class="btn auth-btn">${label}</button>
    </form>`;

  const form = overlay.querySelector('#authSubmitForm');
  const errEl = overlay.querySelector('#authError');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = form.querySelector('[name=email]').value.trim();
    const password = form.querySelector('[name=password]').value;
    const btn      = form.querySelector('button[type=submit]');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '…';

    try {
      if (mode === 'login') {
        const { user } = await Auth.signIn(email, password);
        ctx.currentUser = user;
      } else {
        const { user } = await Auth.signUp(email, password);
        ctx.currentUser = user;
        // Supabase peut demander une confirmation email selon la config
        if (!user?.email_confirmed_at) {
          errEl.style.color = 'var(--color-primary)';
          errEl.textContent = 'Vérifiez votre email puis reconnectez-vous.';
          btn.disabled = false;
          btn.textContent = label;
          return;
        }
      }
      overlay.classList.add('hidden');
      await _selectFarm(ctx, onReady);
    } catch (ex) {
      errEl.style.color = '';
      errEl.textContent = _friendlyError(ex);
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

// ── Sélection / création / rejoindre une ferme ────────────────────
async function _selectFarm(ctx, onReady) {
  const overlay = document.getElementById('authOverlay');
  overlay.style.display = '';
  overlay.classList.remove('hidden');
  overlay.innerHTML = '<div class="auth-card"><p class="auth-loading">Chargement…</p></div>';

  let farms = [];
  try {
    farms = await _withTimeout(FarmService.getUserFarms(), 10000, 'getUserFarms');
  } catch (ex) {
    overlay.innerHTML = `
      <div class="auth-card">
        <p class="auth-error">${escapeHTML(ex.message || 'Impossible de contacter le serveur.')}</p>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn" id="btnRetryFarm" style="flex:1">Réessayer</button>
          <button class="btn secondary" id="btnOfflineFallback" style="flex:1">Mode hors-ligne</button>
        </div>
      </div>`;
    overlay.querySelector('#btnRetryFarm')?.addEventListener('click', () => _selectFarm(ctx, onReady));
    overlay.querySelector('#btnOfflineFallback')?.addEventListener('click', () => _goOffline(ctx, onReady));
    return;
  }

  overlay.innerHTML = _farmSelectorHTML(farms, ctx.currentUser?.email);
  _wireFarmSelector(overlay, ctx, onReady);
}

function _wireFarmSelector(overlay, ctx, onReady) {
  // Clic sur une ferme existante
  overlay.querySelectorAll('[data-farm-id]').forEach(btn => {
    btn.addEventListener('click', () => _loadFarm(btn.dataset.farmId, btn.dataset.farmName, ctx, onReady));
  });

  // Créer une ferme
  overlay.querySelector('#createFarmForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.target.querySelector('[name=farmName]').value.trim();
    if (!name) return;
    const btn = e.target.querySelector('button[type=submit]');
    const err = overlay.querySelector('#farmError');
    btn.disabled = true;
    err.textContent = '';
    try {
      const farm = await FarmService.createFarm(name);
      await _loadFarm(farm.id, farm.name, ctx, onReady, true);
    } catch (ex) {
      err.textContent = _friendlyError(ex);
      btn.disabled = false;
    }
  });

  // Rejoindre une ferme
  overlay.querySelector('#joinFarmForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const farmId = e.target.querySelector('[name=farmCode]').value.trim();
    const btn = e.target.querySelector('button[type=submit]');
    const err = overlay.querySelector('#farmError');
    btn.disabled = true;
    err.textContent = '';
    try {
      const farm = await FarmService.joinFarm(farmId);
      await _loadFarm(farm.id, farm.name, ctx, onReady);
    } catch (ex) {
      err.textContent = _friendlyError(ex);
      btn.disabled = false;
    }
  });

  // Déconnexion depuis l'écran ferme
  overlay.querySelector('#btnFarmLogout')?.addEventListener('click', async () => {
    await Auth.signOut();
    location.reload();
  });
}

async function _loadFarm(farmId, farmName, ctx, onReady, isNew = false) {
  const overlay = document.getElementById('authOverlay');
  overlay.style.display = '';
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="auth-card"><p class="auth-loading">Chargement de <strong>${escapeHTML(farmName)}</strong>…</p></div>`;

  try {
    ctx.farmId   = farmId;
    ctx.farmName = farmName;
    ctx.state    = await _withTimeout(DB.loadFarmState(farmId), 12000, 'loadFarmState');

    if (isNew) await _offerMigration(ctx);

    overlay.style.display = 'none';
    overlay.classList.add('hidden');
    _updateTopbar(ctx, onReady);
    DB.subscribeToFarm(farmId, ctx);
    onReady();
  } catch (ex) {
    overlay.innerHTML = `
      <div class="auth-card">
        <p class="auth-error">Erreur : ${escapeHTML(ex.message)}</p>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn" id="btnRetryLoad" style="flex:1">Réessayer</button>
          <button class="btn secondary" id="btnOfflineFallback2" style="flex:1">Mode hors-ligne</button>
        </div>
      </div>`;
    overlay.querySelector('#btnRetryLoad')?.addEventListener('click', () => _loadFarm(farmId, farmName, ctx, onReady, false));
    overlay.querySelector('#btnOfflineFallback2')?.addEventListener('click', () => _goOffline(ctx, onReady));
  }
}

// ── Migration localStorage → Supabase ────────────────────────────
async function _offerMigration(ctx) {
  try {
    const raw = localStorage.getItem('cuniworld_mvp_state');
    if (!raw) return;
    const local = JSON.parse(raw);
    const rCount = local?.rabbits?.length || 0;
    const eCount = local?.events?.length  || 0;
    if (rCount === 0 && eCount === 0) return;

    const ok = window.confirm(
      `Vous avez ${rCount} lapin(s) et ${eCount} événement(s) en mémoire locale.\n` +
      `Les importer dans la ferme "${ctx.farmName}" ?`
    );
    if (!ok) return;

    for (const r of (local.rabbits   || [])) DB.upsertRabbit(ctx.farmId, r);
    for (const e of (local.events    || [])) DB.upsertEvent(ctx.farmId, e);
    for (const p of (local.photos    || [])) DB.upsertPhoto(ctx.farmId, p);
    for (const [n, rid] of Object.entries(local.usedNames || {})) DB.setUsedName(ctx.farmId, n, rid);

    // Courte pause pour laisser les upserts se propager
    await new Promise(r => setTimeout(r, 800));
    ctx.state = await DB.loadFarmState(ctx.farmId);
    alert(`Import terminé : ${rCount} lapin(s) importé(s).`);
  } catch (_) {}
}

// ── Topbar : affichage ferme + utilisateur ────────────────────────
function _updateTopbar(ctx, onReady) {
  const info = document.getElementById('userInfo');
  if (!info) return;

  // Code de partage = UUID brut (à copier-coller pour rejoindre)
  info.innerHTML = `
    <button id="btnCopyFarmId" class="btn secondary" title="Copier l'identifiant de la ferme pour inviter un collègue">
      🏡 ${escapeHTML(ctx.farmName || '')}
    </button>
    <span class="user-email-chip">${escapeHTML(ctx.currentUser?.email || '')}</span>
    <button id="btnSwitchFarm" class="btn secondary" title="Changer de ferme">⇄</button>
    <button id="btnLogout" class="btn danger">Déconnexion</button>`;

  info.classList.remove('hidden');

  document.getElementById('btnCopyFarmId')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(ctx.farmId).then(() => alert(`Identifiant copié :\n${ctx.farmId}\n\nPartagez-le à vos collègues pour qu'ils rejoignent la ferme.`));
  });

  document.getElementById('btnSwitchFarm')?.addEventListener('click', async () => {
    DB.unsubscribeAll();
    ctx.farmId = null;
    ctx.farmName = null;
    await _selectFarm(ctx, onReady);
  });

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (!window.confirm('Se déconnecter ?')) return;
    DB.unsubscribeAll();
    await Auth.signOut();
    location.reload();
  });
}

// ── HTML templates ────────────────────────────────────────────────
function _authShellHTML() {
  return `
    <div class="auth-card">
      <div class="auth-logo">🐇</div>
      <h1 class="auth-title">CuniWorld</h1>
      <p class="auth-sub">Gestion d'élevage collaboratif</p>
      <div class="auth-tabs">
        <button class="auth-tab active" data-mode="login">Se connecter</button>
        <button class="auth-tab" data-mode="signup">Créer un compte</button>
      </div>
      <div id="authFormInner"></div>
      <p id="authError" class="auth-error"></p>
    </div>`;
}

function _farmSelectorHTML(farms, email) {
  const list = farms.length
    ? farms.map(f => `
        <button class="farm-item" data-farm-id="${escAttr(f.id)}" data-farm-name="${escAttr(f.name)}">
          <span class="farm-item-icon">🏡</span>
          <span class="farm-item-name">${escapeHTML(f.name)}</span>
          <span class="badge farm-item-role">${f.role === 'owner' ? 'Propriétaire' : 'Membre'}</span>
        </button>`).join('')
    : '<p class="muted" style="text-align:center;padding:8px 0">Aucune ferme — créez-en une ci-dessous.</p>';

  return `
    <div class="auth-card farm-card">
      <div class="auth-logo">🏡</div>
      <h2 class="auth-title" style="font-size:1.3rem">Choisir une ferme</h2>
      <p class="auth-sub">${escapeHTML(email || '')}</p>

      <div class="farm-list">${list}</div>

      <div class="farm-sep"><span>Créer</span></div>
      <form id="createFarmForm" class="auth-form">
        <input name="farmName" class="input" placeholder="Nom de la ferme" required maxlength="60" />
        <button type="submit" class="btn auth-btn">+ Créer une nouvelle ferme</button>
      </form>

      <div class="farm-sep"><span>ou rejoindre</span></div>
      <form id="joinFarmForm" class="auth-form">
        <input name="farmCode" class="input" placeholder="Identifiant de ferme (UUID)" required />
        <button type="submit" class="btn secondary auth-btn">Rejoindre</button>
      </form>

      <p id="farmError" class="auth-error"></p>
      <button id="btnFarmLogout" class="auth-logout-link">Déconnexion</button>
    </div>`;
}

function _friendlyError(ex) {
  const msg = ex?.message || '';
  if (msg.includes('Invalid login')) return 'Email ou mot de passe incorrect.';
  if (msg.includes('Email not confirmed')) return 'Email non confirmé — vérifiez votre boîte mail.';
  if (msg.includes('already registered')) return 'Cet email est déjà utilisé.';
  return msg || 'Une erreur est survenue.';
}
