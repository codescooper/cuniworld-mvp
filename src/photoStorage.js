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

// Source de vérité unique pour matérialiser le `dataUrl` d'une photo, qu'elle
// vienne d'un upload local, d'un payload realtime, d'un load initial ou d'un
// replay offline. Stratégie : IndexedDB (cache durable) → téléchargement
// Storage (bytes mis en cache à leur tour) → signed URL transitoire pour
// affichage. Si rien ne réussit, ajoute `syncWarning` pour que l'UI puisse
// signaler la photo en attente sans afficher d'image cassée.
export async function hydrateCloudPhoto(photo) {
  if (!photo) return photo;
  if (!photo.localPhotoKey) photo.localPhotoKey = photo.id;

  // Un dataUrl `data:` est sûr. Un dataUrl `https:` est probablement une signed
  // URL expirée laissée en mémoire — on l'écarte pour forcer un refresh.
  if (photo.dataUrl && !/^https?:/i.test(photo.dataUrl)) return photo;
  if (photo.dataUrl) photo.dataUrl = null;

  const localKey = photo.localPhotoKey || photo.id;
  const local = await getPhotoData(localKey).catch(() => null);
  if (local) {
    photo.dataUrl = local;
    photo.syncWarning = null;
    return photo;
  }

  if (photo.storagePath) {
    const bytes = await downloadPhotoAsDataUrl(photo.storagePath).catch(() => null);
    if (bytes) {
      photo.dataUrl = bytes;
      photo.syncWarning = null;
      putPhotoData(localKey, bytes).catch(() => {});
      return photo;
    }
    const signed = await getPhotoSignedUrl(photo.storagePath).catch(() => null);
    if (signed) {
      photo.dataUrl = signed;
      photo.syncWarning = null;
      return photo;
    }
  }

  // Aucun moyen d'afficher la photo pour l'instant — marquage explicite.
  photo.dataUrl = null;
  photo.syncWarning = "photo_unavailable";
  return photo;
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
    // Sans farmId on est en pré-auth : seul l'IDB est consultable. Avec farmId
    // on délègue au pipeline central qui couvre IDB → Storage → signed URL.
    if (farmId) {
      await hydrateCloudPhoto(p);
    } else {
      p.dataUrl = await getPhotoData(p.localPhotoKey).catch(() => null);
    }
  }
  return photos;
}
