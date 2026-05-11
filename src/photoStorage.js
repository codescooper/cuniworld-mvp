import { getPhotoSignedUrl, downloadPhotoAsDataUrl } from "./photoCloudStorage.js";
const DB_NAME = "cuniworld_mvp_photos";
const STORE_NAME = "photos";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible sur ce navigateur."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Impossible d'ouvrir IndexedDB pour les photos."));
  });
}

async function run(mode, action) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);
      tx.onabort = () => reject(new Error("Opération IndexedDB annulée."));
      tx.onerror = () => reject(new Error("Erreur IndexedDB pendant la gestion des photos."));
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Erreur IndexedDB sur une image."));
      } else {
        tx.oncomplete = () => resolve(undefined);
      }
    });
  } finally {
    db.close();
  }
}

export function putPhotoData(localPhotoKey, dataUrl) {
  if (!localPhotoKey) return Promise.reject(new Error("Clé photo locale manquante."));
  return run("readwrite", (store) => store.put(dataUrl, localPhotoKey));
}

export function getPhotoData(localPhotoKey) {
  if (!localPhotoKey) return Promise.resolve(null);
  return run("readonly", (store) => store.get(localPhotoKey)).then((v) => v || null);
}

export function deletePhotoData(localPhotoKey) {
  if (!localPhotoKey) return Promise.resolve();
  return run("readwrite", (store) => store.delete(localPhotoKey));
}

export async function hydrateAndMigratePhotos(state, farmId = null) {
  const photos = state?.photos || [];
  for (const p of photos) {
    if (!p.localPhotoKey) p.localPhotoKey = p.id;
    if (p.dataUrl && !/^https?:/i.test(p.dataUrl)) {
      // Legacy state may carry a real data:URL embedded inline — persist it to IDB.
      await putPhotoData(p.localPhotoKey, p.dataUrl);
      delete p.dataUrl;
    } else if (p.dataUrl) {
      // An expired signed URL leaked into state — drop it; reload below.
      delete p.dataUrl;
    }
    if (!p.dataUrl) {
      p.dataUrl = await getPhotoData(p.localPhotoKey);
    }
    if (!p.dataUrl && farmId && p.storagePath) {
      // Prefer downloading the actual bytes so the cached value is durable.
      const downloaded = await downloadPhotoAsDataUrl(p.storagePath).catch(() => null);
      if (downloaded) {
        p.dataUrl = downloaded;
        await putPhotoData(p.localPhotoKey, downloaded).catch(() => {});
      } else {
        // Transient fallback for display only; not cached.
        p.dataUrl = await getPhotoSignedUrl(p.storagePath).catch(() => null);
      }
    }
  }
  return photos;
}
