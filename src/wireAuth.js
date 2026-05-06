import { Auth } from './auth.js';
import { FarmService } from './farmService.js';
import { DB } from './db.js';
import { escapeHTML } from './utils.js';
import { hydrateAndMigratePhotos } from './photoStorage.js';

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
export async function bootWithAuth(ctx, onReady, joinFarmId = null) {
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
    await _selectFarm(ctx, onReady, joinFarmId);
  } else {
    _showAuthScreen(ctx, onReady, joinFarmId);
  }

  // Réagit aux changements d'état auth (déconnexion autre onglet, expiration)
  Auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      DB.unsubscribeAll();
      ctx.farmId = null;
      ctx.currentUser = null;
      _showAuthScreen(ctx, onReady, null);
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
function _showAuthScreen(ctx, onReady, joinFarmId = null) {
  const overlay = document.getElementById('authOverlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = _authShellHTML(joinFarmId);

  overlay.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _renderAuthForm(overlay, tab.dataset.mode, ctx, onReady, joinFarmId);
    });
  });

  _renderAuthForm(overlay, 'login', ctx, onReady, joinFarmId);
}

function _renderAuthForm(overlay, mode, ctx, onReady, joinFarmId = null) {
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
      await _selectFarm(ctx, onReady, joinFarmId);
    } catch (ex) {
      errEl.style.color = '';
      errEl.textContent = _friendlyError(ex);
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

// ── Sélection / création / rejoindre une ferme ────────────────────
async function _selectFarm(ctx, onReady, joinFarmId = null) {
  const overlay = document.getElementById('authOverlay');
  overlay.style.display = '';
  overlay.classList.remove('hidden');
  overlay.innerHTML = '<div class="auth-card"><p class="auth-loading">Chargement…</p></div>';

  // Auto-join via lien d'invitation
  if (joinFarmId) {
    try {
      const farm = await _withTimeout(FarmService.joinFarm(joinFarmId), 10000, 'joinFarm');
      _clearJoinParam();
      await _loadFarm(farm.id, farm.name, ctx, onReady);
    } catch (ex) {
      overlay.innerHTML = `
        <div class="auth-card">
          <p class="auth-error">Impossible de rejoindre la ferme : ${escapeHTML(ex.message || 'Lien invalide ou ferme introuvable.')}</p>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn" id="btnRetryJoin" style="flex:1">Réessayer</button>
            <button class="btn secondary" id="btnSkipJoin" style="flex:1">Mes fermes</button>
          </div>
        </div>`;
      overlay.querySelector('#btnRetryJoin')?.addEventListener('click', () => _selectFarm(ctx, onReady, joinFarmId));
      overlay.querySelector('#btnSkipJoin')?.addEventListener('click', () => { _clearJoinParam(); _selectFarm(ctx, onReady, null); });
    }
    return;
  }

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

function _clearJoinParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  history.replaceState(null, '', url.toString());
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
    await hydrateAndMigratePhotos(ctx.state, farmId);

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

  const initials = (ctx.currentUser?.email || '?')[0].toUpperCase();

  info.innerHTML = `
    <button class="farm-chip" id="btnInviteFarm" title="Copier le lien d'invitation">
      <svg class="farm-chip-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
        <rect x="7" y="7" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
        <path d="M6 4h3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 7l3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span class="farm-chip-name">${escapeHTML(ctx.farmName || '')}</span>
    </button>
    <div class="user-avatar-wrap">
      <button class="user-avatar" id="btnUserMenu" aria-label="Menu utilisateur" aria-expanded="false">
        ${escapeHTML(initials)}
      </button>
      <div class="user-dropdown" id="userDropdown" hidden>
        <div class="user-dropdown-header">
          <span class="user-dropdown-email">${escapeHTML(ctx.currentUser?.email || '')}</span>
        </div>
        <div class="user-dropdown-divider"></div>
        <button class="user-dropdown-item" id="ddSwitchFarm">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path d="M2.5 5.5h10M2.5 9.5h10M9.5 2.5l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Changer de ferme
        </button>
        <div class="user-dropdown-divider"></div>
        <button class="user-dropdown-item danger" id="ddLogout">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path d="M5.5 13H3a1 1 0 01-1-1V3a1 1 0 011-1h2.5M10 10.5l3-3-3-3M13 7.5H5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Déconnexion
        </button>
      </div>
    </div>`;

  info.classList.remove('hidden');

  // Farm chip — copier message d'invitation
  document.getElementById('btnInviteFarm')?.addEventListener('click', () => {
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const link = `${base}?join=${ctx.farmId}`;
    const msg  =
      `Bonjour,\n\n` +
      `Je t'invite à rejoindre ma ferme « ${ctx.farmName} » sur CuniWorld, l'application de gestion d'élevage de lapins.\n\n` +
      `Clique sur ce lien pour rejoindre (ou crée un compte gratuitement si tu n'en as pas) :\n` +
      `${link}\n\nÀ bientôt !`;
    navigator.clipboard?.writeText(msg).then(() =>
      alert('Message d\'invitation copié !\nColle-le dans un email ou WhatsApp.')
    );
  });

  // Avatar — ouvrir / fermer le dropdown
  const btnMenu  = document.getElementById('btnUserMenu');
  const dropdown = document.getElementById('userDropdown');

  btnMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    btnMenu.setAttribute('aria-expanded', String(!isOpen));
  });

  // Fermer en cliquant ailleurs
  const closeDropdown = () => {
    if (!dropdown.hidden) {
      dropdown.hidden = true;
      btnMenu?.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', closeDropdown);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

  // Switch farm
  document.getElementById('ddSwitchFarm')?.addEventListener('click', async () => {
    closeDropdown();
    DB.unsubscribeAll();
    ctx.farmId   = null;
    ctx.farmName = null;
    await _selectFarm(ctx, onReady);
  });

  // Logout
  document.getElementById('ddLogout')?.addEventListener('click', async () => {
    closeDropdown();
    if (!window.confirm('Se déconnecter ?')) return;
    DB.unsubscribeAll();
    await Auth.signOut();
    location.reload();
  });
}

// ── HTML templates ────────────────────────────────────────────────
function _authShellHTML(joinFarmId = null) {
  const inviteBanner = joinFarmId
    ? `<p class="auth-invite-banner">Vous avez été invité à rejoindre une ferme. Connectez-vous ou créez un compte pour continuer.</p>`
    : '';
  return `
    <div class="auth-card">
      <div class="auth-logo">🐇</div>
      <h1 class="auth-title">CuniWorld</h1>
      <p class="auth-sub">Gestion d'élevage collaboratif</p>
      ${inviteBanner}
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
