import { uploadPhotoToCloud } from "./photoCloudStorage.js";
import { getPhotoData, hydrateCloudPhoto } from "./photoStorage.js";
import { DB } from "./db.js";

const KEY = "cuniworld_mvp_photo_upload_queue";
const MAX_RETRIES = 5;

function loadQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueuePhotoUpload({ farmId, rabbitId, photoId, localPhotoKey }, error = null) {
  const queue = loadQueue();
  if (queue.some(e => e.photoId === photoId)) return queue.length;
  queue.push({
    id: `pq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    farmId, rabbitId, photoId, localPhotoKey,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: error ? String(error?.message || error) : null,
  });
  saveQueue(queue);
  return queue.length;
}

export function getPendingPhotoUploadCount() {
  return loadQueue().length;
}

async function uploadOne(entry, ctx) {
  const dataUrl = await getPhotoData(entry.localPhotoKey);
  if (!dataUrl) throw new Error("Image locale introuvable (IndexedDB).");
  // Upload puis upsert SQL : on ne crée jamais une ligne `photos` cloud sans
  // `storagePath` (sinon les autres appareils auraient des photos invisibles).
  const storagePath = await uploadPhotoToCloud({
    farmId: entry.farmId, rabbitId: entry.rabbitId, photoId: entry.photoId, dataUrl,
  });
  if (ctx?.state?.photos) {
    const photo = ctx.state.photos.find(p => p.id === entry.photoId);
    if (photo) {
      photo.storagePath = storagePath;
      photo.dataUrl = dataUrl; // assure que la fiche se ré-affiche aussitôt
      photo.syncWarning = null;
      ctx.state = ctx.Store.save(ctx.state);
      await DB.upsertPhoto(entry.farmId, photo);
      // Hydratation centralisée pour conserver l'invariant final.
      await hydrateCloudPhoto(photo);
    } else {
      // Photo absente du state (reload après offline) : on upsert quand même
      // pour que le cloud reflète l'upload et que les autres appareils la voient.
      await DB.upsertPhoto(entry.farmId, {
        id: entry.photoId, rabbitId: entry.rabbitId,
        localPhotoKey: entry.localPhotoKey, storagePath,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        source: "profile",
      });
    }
  }
  return storagePath;
}

// Répare les photos déjà présentes côté SQL (donc partagées entre appareils)
// mais dont l'upload Storage n'a jamais abouti — détectées par `storagePath`
// null/absent dans la ligne cloud. Cas typique : photos créées avant le fix
// qui interdit d'upsert SQL sans `storagePath` (Phase 2 historique). Ces lignes
// sont invisibles sur les autres appareils car `hydrateCloudPhoto` n'a aucun
// chemin Storage où aller chercher les bytes.
//
// La réparation n'est possible QUE depuis l'appareil qui possède encore les
// bytes en IndexedDB (typiquement celui qui a pris la photo). Sur les autres
// appareils, on signale au caller que la photo doit être réparée ailleurs.
//
// Retour : { repaired, missingBytes, failed, errors: [{photoId, reason}] }.
export async function repairPhotosWithoutStoragePath(ctx) {
  const farmId = ctx?.farmId;
  if (!farmId) throw new Error("Mode local — aucune ferme cloud connectée.");

  const photos = ctx.state?.photos || [];
  const broken = photos.filter(p => !p.storagePath);

  const out = { repaired: 0, missingBytes: 0, failed: 0, errors: [], total: broken.length };
  if (broken.length === 0) return out;

  for (const photo of broken) {
    const localKey = photo.localPhotoKey || photo.id;
    try {
      const dataUrl = await getPhotoData(localKey).catch(() => null);
      if (!dataUrl) {
        out.missingBytes += 1;
        out.errors.push({ photoId: photo.id, reason: "bytes absents de l'IndexedDB local" });
        continue;
      }
      const storagePath = await uploadPhotoToCloud({
        farmId, rabbitId: photo.rabbitId, photoId: photo.id, dataUrl,
      });
      photo.storagePath = storagePath;
      photo.dataUrl = dataUrl;
      photo.syncWarning = null;
      ctx.state = ctx.Store.save(ctx.state);
      await DB.upsertPhoto(farmId, photo);
      await hydrateCloudPhoto(photo);
      out.repaired += 1;
    } catch (err) {
      out.failed += 1;
      out.errors.push({ photoId: photo.id, reason: String(err?.message || err) });
    }
  }
  return out;
}

export async function replayPhotoUploadQueue(ctx = null) {
  const queue = loadQueue();
  if (!queue.length) return { remaining: 0, replayed: 0 };

  const next = [];
  let replayed = 0;

  for (const entry of queue) {
    try {
      await uploadOne(entry, ctx);
      replayed += 1;
    } catch (err) {
      const retryCount = (entry.retryCount || 0) + 1;
      if (retryCount <= MAX_RETRIES) {
        next.push({ ...entry, retryCount, lastError: String(err?.message || err) });
      }
    }
  }

  saveQueue(next);
  return { remaining: next.length, replayed };
}

// ── Retry périodique automatique ─────────────────────────────────────────────
// Démarre un poller qui réessaie le queue toutes les `intervalMs` ms tant qu'il
// reste des entrées non synchronisées. S'arrête de lui-même quand le queue est
// vide. Re-démarre automatiquement à chaque appel si déjà arrêté.
let _autoRetryTimer = null;
let _autoRetryRunning = false;

export function startPhotoUploadAutoRetry(ctx, intervalMs = 30000) {
  if (_autoRetryTimer) return; // déjà programmé
  if (typeof window === 'undefined') return;

  const tick = async () => {
    _autoRetryTimer = null;
    if (_autoRetryRunning) return;
    if (!navigator.onLine) {
      _scheduleNext(intervalMs);
      return;
    }
    const queue = loadQueue();
    if (!queue.length) return; // s'arrête tout seul

    _autoRetryRunning = true;
    try {
      const result = await replayPhotoUploadQueue(ctx);
      ctx?.updatePendingMutations?.();
      if (result.replayed > 0) ctx?.render?.();
    } catch (_) { /* on retentera plus tard */ }
    finally { _autoRetryRunning = false; }

    if (loadQueue().length > 0) _scheduleNext(intervalMs);
  };

  const _scheduleNext = (ms) => {
    if (_autoRetryTimer) return;
    _autoRetryTimer = setTimeout(tick, ms);
  };

  // Déclencheurs supplémentaires : retour en ligne, retour de visibilité.
  // Idempotents grâce à _autoRetryRunning + _autoRetryTimer.
  if (!startPhotoUploadAutoRetry._wiredGlobals) {
    startPhotoUploadAutoRetry._wiredGlobals = true;
    window.addEventListener('online',           () => _scheduleNext(1000));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) _scheduleNext(1000);
    });
  }

  _scheduleNext(intervalMs);
}
