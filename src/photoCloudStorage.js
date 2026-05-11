import { supabase } from './supabase.js';

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',');
  if (!b64) throw new Error('Format image invalide.');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function buildPhotoStoragePath(farmId, rabbitId, photoId) {
  return `farms/${farmId}/rabbits/${rabbitId}/${photoId}.jpg`;
}

export async function uploadPhotoToCloud({ farmId, rabbitId, photoId, dataUrl }) {
  const storagePath = buildPhotoStoragePath(farmId, rabbitId, photoId);
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from('photos').upload(storagePath, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`Upload photo cloud échoué: ${error.message || error}`);
  return storagePath;
}

export async function deletePhotoFromCloud(storagePath) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from('photos').remove([storagePath]);
  if (error) throw new Error(`Suppression photo cloud échouée: ${error.message || error}`);
}

export async function getPhotoSignedUrl(storagePath, expiresIn = 3600) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(`URL signée photo indisponible: ${error.message || error}`);
  return data?.signedUrl || null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// Downloads the actual bytes (not a transient signed URL) so the result can be
// cached in IndexedDB without worrying about expiry.
export async function downloadPhotoAsDataUrl(storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from('photos').download(storagePath);
  if (error) throw new Error(`Téléchargement photo échoué: ${error.message || error}`);
  if (!data) return null;
  return blobToDataUrl(data);
}
