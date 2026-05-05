import { daysBetween } from './utils.js';

export function compressImage(file, maxDim = 600, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide ou format non supporté"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cx = canvas.getContext("2d");
        cx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function getPhotoHistory(state, rabbitId) {
  return (state.photos || [])
    .filter(p => p.rabbitId === rabbitId)
    .sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") ||
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );
}

export function getProfilePhoto(state, rabbitId) {
  const history = getPhotoHistory(state, rabbitId);
  return history.find(p => p.source === "profile") || history[0] || null;
}

/**
 * Retourne les lapins actifs non photographiés depuis ≥ thresholdDays jours
 * (ou jamais photographiés), triés par urgence.
 */
export function getRabbitsDueForPhotoCheck(state, thresholdDays = 7) {
  const today = new Date().toISOString().slice(0, 10);
  return (state.rabbits || [])
    .filter(r => r.status === 'actif')
    .map(r => {
      const history   = getPhotoHistory(state, r.id); // tri DESC → [0] = plus récente
      const lastPhoto = history[0] || null;
      return { rabbit: r, lastPhoto };
    })
    .filter(({ lastPhoto }) =>
      !lastPhoto || daysBetween(lastPhoto.date, today) >= thresholdDays
    )
    .sort((a, b) => {
      if (!a.lastPhoto && b.lastPhoto)  return -1;
      if (a.lastPhoto && !b.lastPhoto)  return  1;
      if (!a.lastPhoto && !b.lastPhoto) return 0;
      return a.lastPhoto.date.localeCompare(b.lastPhoto.date);
    });
}
