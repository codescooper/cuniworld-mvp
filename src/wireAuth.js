import { Auth } from './auth.js';
import { FarmService } from './farmService.js';
import { DB } from './db.js';
import { Store } from './store.js';
import { escapeHTML } from './utils.js';
import { hydrateAndMigratePhotos } from './photoStorage.js';
import { showToast, showConfirm } from './notifications.js';
import { fetchFarmMembers } from './membersService.js';
import { getMyProfile, saveMyProfile } from './profileService.js';
import { openModal, closeModal } from './modal.js';
import { loadFarmSettings, DEFAULT_SETTINGS } from './settingsService.js';

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

const SESSION_JOIN_KEY = 'cuniworld_pending_join';

function _withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Délai dépassé (${label})`)), ms)
    ),
  ]);
}

// Fields now synced to Supabase. _mergeLocalFields uses local data only as a
// fallback when the Supabase table returns null (SQL migration not run yet).
const SYNCED_FIELDS = ['buildings', 'lodges', 'lodgeDefects', 'lodgeEvents', 'stock', 'stockMovements', 'rounds', 'lotStatuses'];

function _mergeLocalFields(farmState, localState) {
  const merged = { ...farmState, version: Store.helpers.SCHEMA_VERSION };
  for (const key of SYNCED_FIELDS) {
    const cloudVal = farmState[key];
    // null = table unavailable (SQL migration not run yet) → use local as fallback
    if (cloudVal === null) {
      merged[key] = localState?.[key] ?? (key === 'lotStatuses' ? {} : []);
    }
    // non-null (even []) = Supabase has the table → trust cloud data
  }
  return merged;
}

// Extrait un UUID farm depuis un UUID brut ou une URL contenant ?join=UUID
function _extractFarmId(input) {
  const trimmed = input.trim();
  // UUID brut : 8-4-4-4-12
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  // URL avec paramètre ?join=
  const m = trimmed.match(/[?&]join=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : trimmed; // retourne tel quel si non reconnu (laisse le serveur rejeter)
}

// ── Point d'entrée : appelé au boot de l'app ──────────────────────
export async function bootWithAuth(ctx, onReady, joinFarmId = null) {
  // Récupère un joinFarmId mis en sessionStorage lors d'une inscription
  // (l'utilisateur a dû confirmer son email et est revenu sans le ?join= dans l'URL)
  const pendingJoin = sessionStorage.getItem(SESSION_JOIN_KEY);
  const effectiveJoinId = joinFarmId || (pendingJoin ? pendingJoin : null);

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
    await _selectFarm(ctx, onReady, effectiveJoinId);
  } else {
    _showAuthScreen(ctx, onReady, effectiveJoinId);
  }

  // Réagit aux changements d'état auth (déconnexion autre onglet, expiration)
  Auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      DB.unsubscribeAll();
      ctx.farmId = null;
      ctx.currentUser = null;
      sessionStorage.removeItem(SESSION_JOIN_KEY);
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
          // Conserver l'invitation en sessionStorage — l'utilisateur reviendra sans le ?join= dans l'URL
          if (joinFarmId) sessionStorage.setItem(SESSION_JOIN_KEY, joinFarmId);
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
  overlay.innerHTML = '<div class="auth-card" style="text-align:center"><span class="spinner spinner-lg" aria-hidden="true" style="color:var(--color-primary)"></span><p class="auth-loading">Chargement…</p></div>';

  // Auto-join via lien d'invitation
  if (joinFarmId) {
    try {
      const farm = await _withTimeout(FarmService.joinFarm(joinFarmId), 10000, 'joinFarm');
      sessionStorage.removeItem(SESSION_JOIN_KEY);
      _clearJoinParam();
      // isNew=true pour proposer la migration de données locales au membre rejoignant
      await _loadFarm(farm.id, farm.name, ctx, onReady, true);
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
      overlay.querySelector('#btnSkipJoin')?.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_JOIN_KEY);
        _clearJoinParam();
        _selectFarm(ctx, onReady, null);
      });
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

  // Recherche live (affichée seulement si > 3 fermes — cf. _farmSelectorHTML).
  // Filtre simple par sous-chaîne sur le nom (data-farm-search déjà
  // normalisé en minuscule dans le HTML).
  const search = overlay.querySelector('#farmSearch');
  if (search) {
    const empty = overlay.querySelector('#farmSearchEmpty');
    const items = overlay.querySelectorAll('[data-farm-id]');
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      items.forEach(btn => {
        const match = !q || (btn.dataset.farmSearch || '').includes(q);
        btn.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      if (empty) empty.style.display = visible === 0 ? '' : 'none';
    };
    search.addEventListener('input', filter);
    // Raccourci Esc dans le champ vide le filtre.
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; filter(); }
    });
  }

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

  // Rejoindre une ferme (accepte UUID brut ou URL complète avec ?join=)
  overlay.querySelector('#joinFarmForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const raw = e.target.querySelector('[name=farmCode]').value;
    const farmId = _extractFarmId(raw);
    const btn = e.target.querySelector('button[type=submit]');
    const err = overlay.querySelector('#farmError');
    btn.disabled = true;
    err.textContent = '';
    try {
      const farm = await FarmService.joinFarm(farmId);
      // Proposer migration si des données locales existent
      await _loadFarm(farm.id, farm.name, ctx, onReady, true);
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
  overlay.innerHTML = `<div class="auth-card" style="text-align:center"><span class="spinner spinner-lg" aria-hidden="true" style="color:var(--color-primary)"></span><p class="auth-loading">Chargement de <strong>${escapeHTML(farmName)}</strong>…</p></div>`;

  // Snapshot local-only data before Supabase load replaces ctx.state
  const preLoadLocal = ctx.state;

  try {
    ctx.farmId   = farmId;
    ctx.farmName = farmName;
    const farmState = await _withTimeout(DB.loadFarmState(farmId), 12000, 'loadFarmState');
    ctx.state = _mergeLocalFields(farmState, preLoadLocal);
    await hydrateAndMigratePhotos(ctx.state, farmId);

    // Charge mon profil + la liste des membres + les paramètres ferme.
    // Échec silencieux : on garde l'utilisateur courant comme seul membre
    // et les DEFAULT_SETTINGS si la table n'existe pas encore.
    Promise.all([
      getMyProfile(ctx.currentUser?.id).then(p => { ctx.myProfile = p; }).catch(() => {}),
      fetchFarmMembers(farmId, ctx.currentUser?.id)
        .then(members => {
          ctx.farmMembers = members;
          // Déduit mon rôle depuis la liste des membres.
          const me = members?.find(m => m.userId === ctx.currentUser?.id);
          ctx.myRole = me?.role || 'member';
        })
        .catch(() => { ctx.farmMembers = null; }),
      loadFarmSettings(farmId)
        .then(s => { ctx.farmSettings = s; })
        .catch(() => { ctx.farmSettings = { ...DEFAULT_SETTINGS }; }),
    ]).then(() => ctx.render?.());

    if (isNew) await _offerMigration(ctx);

    // Auto-migrate local-only data to the new Supabase tables (one-shot per farm).
    // Runs silently in background — does not block the UI.
    _autoMigrateLocalModules(ctx, farmState, preLoadLocal).catch(() => {});

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

// ── Migration automatique des modules locaux vers Supabase (one-shot) ────────
// Déclenché la première fois que la ferme est chargée après le déploiement de
// la migration SQL 002. Idempotent grâce aux upserts.
async function _autoMigrateLocalModules(ctx, freshCloud, localState) {
  // Les données de simulation ne doivent JAMAIS être poussées vers une vraie
  // ferme cloud. Elles sont fictives et marquées explicitement.
  if (localState?.meta?.simulation) return;
  const key = `cuniworld_sync2_${ctx.farmId}`;
  if (localStorage.getItem(key)) return; // déjà fait

  const fid = ctx.farmId;
  const ops = [];

  // Régénère les id du state local avant de pousser quoi que ce soit — même
  // raison que dans _offerMigration : éviter de réécrire le farm_id de lignes
  // appartenant à une autre ferme.
  const m = _remapStateIds(localState || {});

  // Pour chaque module : migrer seulement si Supabase est vide ET local a des données.
  // (freshCloud[key] === null signifie que la table SQL n'existe pas encore.)
  const needsArr = (cloudArr, localArr, fn) => {
    if (cloudArr === null) return; // table absente, pas de migration possible
    if (cloudArr.length > 0) return; // déjà des données cloud
    for (const item of (localArr || [])) ops.push(fn(item).catch(() => {}));
  };

  needsArr(freshCloud.buildings,      m.buildings,      b => DB.upsertBuilding(fid, b));
  needsArr(freshCloud.lodges,         m.lodges,         l => DB.upsertLodge(fid, l));
  needsArr(freshCloud.lodgeDefects,   m.lodgeDefects,   d => DB.upsertLodgeDefect(fid, d));
  needsArr(freshCloud.lodgeEvents,    m.lodgeEvents,    e => DB.upsertLodgeEvent(fid, e));
  needsArr(freshCloud.stock,          m.stock,          s => DB.upsertStockItem(fid, s));
  needsArr(freshCloud.stockMovements, m.stockMovements, mv => DB.upsertStockMovement(fid, mv));
  needsArr(freshCloud.rounds,         m.rounds,         r => DB.upsertRound(fid, r));

  const cloudStatuses = freshCloud.lotStatuses;
  if (cloudStatuses !== null && Object.keys(cloudStatuses).length === 0) {
    for (const [lotId, status] of Object.entries(m.lotStatuses)) {
      ops.push(DB.setLotStatus(fid, lotId, status).catch(() => {}));
    }
  }

  if (ops.length > 0) await Promise.all(ops);
  localStorage.setItem(key, '1');
}

// ── Régénération d'identifiants avant import dans une ferme cloud ────────────
// CRITIQUE : les id de `rabbits`, `events`, `buildings`, `lodges`, etc. sont
// des clés primaires GLOBALES (pas scopées par farm_id). Importer des données
// locales en réutilisant leurs id d'origine fait que l'`upsert ... onConflict
// 'id'` RÉÉCRIT le farm_id de lignes existantes — donc « vole » les lapins
// d'une autre ferme. On régénère donc tous les id et on remappe les références
// internes (généalogie, portées, saillies, loges, lots...).
function _remapStateIds(local) {
  const newId = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const rMap = new Map(), eMap = new Map(), bMap = new Map(), lMap = new Map(), sMap = new Map();

  for (const r of (local.rabbits   || [])) rMap.set(r.id, newId('rb'));
  for (const e of (local.events    || [])) eMap.set(e.id, newId('ev'));
  for (const b of (local.buildings || [])) bMap.set(b.id, newId('bld'));
  for (const l of (local.lodges    || [])) lMap.set(l.id, newId('lg'));
  for (const s of (local.stock     || [])) sMap.set(s.id, newId('st'));

  const rid = (id) => (id && rMap.get(id)) || id;
  const eid = (id) => (id && eMap.get(id)) || id;
  const bid = (id) => (id && bMap.get(id)) || id;
  const lid = (id) => (id && lMap.get(id)) || id;

  const rabbits = (local.rabbits || []).map((r) => {
    const d = { ...r, id: rMap.get(r.id) };
    if (d.motherId) d.motherId = rid(d.motherId);
    if (d.fatherId) d.fatherId = rid(d.fatherId);
    if (d.doeId)    d.doeId    = rid(d.doeId);
    if (d.buckId)   d.buckId   = rid(d.buckId);
    if (d.litterId) d.litterId = eid(d.litterId);
    return d;
  });

  const events = (local.events || []).map((e) => {
    const d = { ...e, id: eMap.get(e.id), rabbitId: rid(e.rabbitId), data: { ...(e.data || {}) } };
    if (d.data.maleId)   d.data.maleId   = rid(d.data.maleId);
    if (d.data.litterId) d.data.litterId = eid(d.data.litterId);
    if (Array.isArray(d.data.rabbitIds)) d.data.rabbitIds = d.data.rabbitIds.map(rid);
    return d;
  });

  const photos = (local.photos || []).map((p) => {
    const d = { ...p, id: newId('ph'), rabbitId: rid(p.rabbitId) };
    if (d.eventId) d.eventId = eid(d.eventId);
    return d;
  });

  const usedNames = {};
  for (const [name, rabbitId] of Object.entries(local.usedNames || {})) usedNames[name] = rid(rabbitId);

  const buildings = (local.buildings || []).map((b) => ({ ...b, id: bMap.get(b.id) }));
  const lodges = (local.lodges || []).map((l) => {
    const d = { ...l, id: lMap.get(l.id) };
    if (d.buildingId) d.buildingId = bid(d.buildingId);
    return d;
  });
  const lodgeDefects = (local.lodgeDefects || []).map((x) => {
    const d = { ...x, id: newId('ldf') };
    if (d.targetId) d.targetId = (d.targetType === 'batiment' ? bid(d.targetId) : lid(d.targetId));
    return d;
  });
  const lodgeEvents = (local.lodgeEvents || []).map((x) => {
    const d = { ...x, id: newId('lev') };
    if (d.lodgeId) d.lodgeId = lid(d.lodgeId);
    return d;
  });
  const stock = (local.stock || []).map((s) => ({ ...s, id: sMap.get(s.id) }));
  const stockMovements = (local.stockMovements || []).map((m) => {
    const d = { ...m, id: newId('mv') };
    if (d.stockItemId) d.stockItemId = (sMap.get(d.stockItemId) || d.stockItemId);
    return d;
  });
  const rounds = (local.rounds || []).map((r) => {
    const d = { ...r, id: newId('rd') };
    if (Array.isArray(d.feedings)) d.feedings = d.feedings.map((f) => ({ ...f, rabbitId: rid(f.rabbitId) }));
    return d;
  });
  // lotStatuses : clé = `lot_${eventId}` → on remappe l'id d'événement.
  const lotStatuses = {};
  for (const [lotId, status] of Object.entries(local.lotStatuses || {})) {
    const m = /^lot_(.+)$/.exec(lotId);
    lotStatuses[m ? `lot_${eid(m[1])}` : lotId] = status;
  }

  return { rabbits, events, photos, usedNames, buildings, lodges,
           lodgeDefects, lodgeEvents, stock, stockMovements, rounds, lotStatuses };
}

// ── Migration localStorage → Supabase ────────────────────────────
async function _offerMigration(ctx) {
  try {
    const raw = localStorage.getItem('cuniworld_mvp_state');
    if (!raw) return;
    const local = JSON.parse(raw);
    // Refus catégorique de proposer la migration d'une simulation.
    if (local?.meta?.simulation) return;
    const rCount = local?.rabbits?.length || 0;
    const eCount = local?.events?.length  || 0;
    if (rCount === 0 && eCount === 0) return;

    const ok = await showConfirm({
      title: 'Importer les données locales',
      message: `Vous avez ${rCount} lapin(s) et ${eCount} événement(s) en mémoire locale.\nLes importer dans la ferme « ${ctx.farmName} » ?`,
      confirmLabel: 'Importer',
      cancelLabel: 'Ignorer',
    });
    if (!ok) return;

    // Régénération des id AVANT import — sinon on réécrit le farm_id de lignes
    // existantes et on « vole » les données d'une autre ferme.
    const m = _remapStateIds(local);

    for (const r of m.rabbits)        await DB.upsertRabbit(ctx.farmId, r).catch(() => {});
    for (const e of m.events)         await DB.upsertEvent(ctx.farmId, e).catch(() => {});
    for (const p of m.photos)         await DB.upsertPhoto(ctx.farmId, p).catch(() => {});
    for (const [n, rid] of Object.entries(m.usedNames)) await DB.setUsedName(ctx.farmId, n, rid).catch(() => {});
    for (const b of m.buildings)      await DB.upsertBuilding(ctx.farmId, b).catch(() => {});
    for (const l of m.lodges)         await DB.upsertLodge(ctx.farmId, l).catch(() => {});
    for (const d of m.lodgeDefects)   await DB.upsertLodgeDefect(ctx.farmId, d).catch(() => {});
    for (const e of m.lodgeEvents)    await DB.upsertLodgeEvent(ctx.farmId, e).catch(() => {});
    for (const s of m.stock)          await DB.upsertStockItem(ctx.farmId, s).catch(() => {});
    for (const mv of m.stockMovements) await DB.upsertStockMovement(ctx.farmId, mv).catch(() => {});
    for (const r of m.rounds)         await DB.upsertRound(ctx.farmId, r).catch(() => {});
    for (const [lid, st] of Object.entries(m.lotStatuses)) await DB.setLotStatus(ctx.farmId, lid, st).catch(() => {});

    // L'import couvre déjà tous les modules → on marque la migration auto comme
    // faite pour éviter un double-import par _autoMigrateLocalModules.
    try { localStorage.setItem(`cuniworld_sync2_${ctx.farmId}`, '1'); } catch (_) {}

    await new Promise(r => setTimeout(r, 800));
    const afterImport = await DB.loadFarmState(ctx.farmId);
    ctx.state = _mergeLocalFields(afterImport, ctx.state);
    showToast(`Import terminé : ${rCount} lapin(s) importé(s).`, 'success');
  } catch (_) {}
}

// ── Topbar : affichage ferme + utilisateur ────────────────────────
let _dropdownCleanup = null;

function _updateTopbar(ctx, onReady) {
  // Nettoyer les anciens listeners de dropdown pour éviter les doublons
  if (_dropdownCleanup) { _dropdownCleanup(); _dropdownCleanup = null; }

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
        <button class="user-dropdown-item" id="ddEditProfile">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.6"/>
            <path d="M2.5 13c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          Mon profil (prénom / nom)
        </button>
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

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg)
        .then(() => showToast("Message d'invitation copié ! Colle-le dans un email ou WhatsApp.", 'success'))
        .catch(() => _showInviteModal(msg));
    } else {
      _showInviteModal(msg);
    }
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

  const closeDropdown = () => {
    if (!dropdown.hidden) {
      dropdown.hidden = true;
      btnMenu?.setAttribute('aria-expanded', 'false');
    }
  };

  const onDocClick = () => closeDropdown();
  const onDocKey   = (e) => { if (e.key === 'Escape') closeDropdown(); };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);

  // Mon profil
  document.getElementById('ddEditProfile')?.addEventListener('click', () => {
    closeDropdown();
    _openProfileModal(ctx);
  });

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
    const ok = await showConfirm({ title: 'Déconnexion', message: 'Se déconnecter de CuniWorld ?', confirmLabel: 'Déconnexion', cancelLabel: 'Annuler', danger: true });
    if (!ok) return;
    DB.unsubscribeAll();
    await Auth.signOut();
    location.reload();
  });

  _dropdownCleanup = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKey);
  };
}

// ── Modale "Mon profil" : prénom + nom (synchronisé via la table profiles) ──
function _openProfileModal(ctx) {
  const me = ctx.myProfile || { firstName: '', lastName: '' };
  openModal(ctx.el, 'Mon profil', `
    <form id="profileForm" class="form">
      <div class="row2">
        <div class="field">
          <div class="label">Prénom</div>
          <input class="input" name="firstName" placeholder="ex: Marie" value="${escapeHTML(me.firstName || '')}" />
        </div>
        <div class="field">
          <div class="label">Nom</div>
          <input class="input" name="lastName" placeholder="ex: Diop" value="${escapeHTML(me.lastName || '')}" />
        </div>
      </div>
      <p class="small muted" style="margin-top:8px">
        Ce nom apparaît dans le sélecteur « Effectué par » des autres membres de la ferme.
      </p>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button type="button" class="btn secondary" id="profileCancel">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>
  `);

  document.getElementById('profileCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const profile = await saveMyProfile(ctx.currentUser?.id, {
      firstName: fd.get('firstName'),
      lastName:  fd.get('lastName'),
    });
    ctx.myProfile = profile;
    // Recharge la liste des membres pour mettre à jour le libellé partout.
    if (ctx.farmId) {
      fetchFarmMembers(ctx.farmId, ctx.currentUser?.id)
        .then(members => { ctx.farmMembers = members; ctx.render?.(); })
        .catch(() => {});
    }
    closeModal(ctx.el);
    showToast('Profil enregistré.', 'success');
    ctx.render?.();
  });
}

// Fallback quand le clipboard est bloqué : modale avec texte sélectionnable
function _showInviteModal(text) {
  const existing = document.getElementById('_inviteModal');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = '_inviteModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  wrap.innerHTML = `
    <div style="background:var(--color-surface,#fff);border-radius:12px;padding:24px;max-width:480px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <h3 style="margin:0 0 12px;font-size:1rem">Message d'invitation</h3>
      <p style="margin:0 0 10px;font-size:.85rem;color:var(--color-muted,#666)">Copiez ce texte et collez-le dans un email ou WhatsApp :</p>
      <textarea readonly style="width:100%;height:140px;font-size:.82rem;border:1px solid var(--color-border,#ddd);border-radius:8px;padding:10px;resize:none;box-sizing:border-box">${escapeHTML(text)}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button id="_inviteModalClose" class="btn">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('textarea')?.select();
  wrap.querySelector('#_inviteModalClose')?.addEventListener('click', () => wrap.remove());
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
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
  // Tri alphabétique pour stabilité visuelle (les API peuvent renvoyer dans
  // un ordre arbitraire selon le backend / les ajouts de membres).
  const sorted = [...(farms || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
  );
  // Recherche visible uniquement au-delà de 3 fermes (sinon bruit visuel).
  const showSearch = sorted.length > 3;

  const list = sorted.length
    ? sorted.map(f => `
        <button class="farm-item" data-farm-id="${escAttr(f.id)}" data-farm-name="${escAttr(f.name)}" data-farm-search="${escAttr((f.name || '').toLowerCase())}">
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

      ${showSearch ? `
        <div class="field" style="margin-bottom:8px">
          <input id="farmSearch" class="input" type="search" placeholder="🔍 Filtrer (${sorted.length} fermes)" autocomplete="off" />
        </div>
        <div id="farmSearchEmpty" class="muted small" style="text-align:center;padding:6px 0;display:none">Aucune ferme ne correspond.</div>
      ` : ''}

      <div class="farm-list" id="farmList">${list}</div>

      <div class="farm-sep"><span>Créer</span></div>
      <form id="createFarmForm" class="auth-form">
        <input name="farmName" class="input" placeholder="Nom de la ferme" required maxlength="60" />
        <button type="submit" class="btn auth-btn">+ Créer une nouvelle ferme</button>
      </form>

      <div class="farm-sep"><span>ou rejoindre</span></div>
      <form id="joinFarmForm" class="auth-form">
        <input name="farmCode" class="input" placeholder="Lien d'invitation ou identifiant de ferme" required />
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
