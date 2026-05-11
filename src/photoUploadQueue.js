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
