import { daysBetween, escapeHTML, escapeAttr } from './utils.js';

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

// HTML d'un thumbnail rond standard pour représenter un lapin dans une liste,
// une tournée, un sélecteur, etc. Si la photo est en attente de sync (cloud
// download en cours) on affiche un placeholder ⏳, sinon 🐇.
//   size = pixels (carré). Optionnel `name` pour fallback initiales.
export function rabbitThumbHTML(state, rabbit, { size = 32 } = {}) {
  if (!rabbit) {
    return `<span class="rabbit-thumb rabbit-thumb--ph" style="width:${size}px;height:${size}px">🐇</span>`;
  }
  const photo = getProfilePhoto(state, rabbit.id);
  const alt   = escapeAttr(`Photo de ${rabbit.name || rabbit.code || ''}`);
  if (photo?.dataUrl) {
    return `<img class="rabbit-thumb" src="${escapeAttr(photo.dataUrl)}" alt="${alt}" loading="lazy" style="width:${size}px;height:${size}px">`;
  }
  if (photo) {
    return `<span class="rabbit-thumb rabbit-thumb--pending" title="Photo en attente de synchronisation" style="width:${size}px;height:${size}px">⏳</span>`;
  }
  // Fallback : emoji avec couleur dépendante du sexe pour différenciation rapide
  const tone = rabbit.sex === 'F' ? 'rabbit-thumb--f'
             : rabbit.sex === 'M' ? 'rabbit-thumb--m'
             : '';
  return `<span class="rabbit-thumb rabbit-thumb--ph ${tone}" style="width:${size}px;height:${size}px" aria-hidden="true">🐇</span>`;
}

// Utilitaire combiné : thumbnail + nom + code, pour les cellules d'une liste.
export function rabbitThumbWithName(state, rabbit, { size = 28 } = {}) {
  if (!rabbit) return '';
  return `
    <span class="rabbit-thumb-name" style="display:inline-flex;align-items:center;gap:6px">
      ${rabbitThumbHTML(state, rabbit, { size })}
      <span><strong>${escapeHTML(rabbit.name || '—')}</strong>${rabbit.code ? ` <span class="small muted">${escapeHTML(rabbit.code)}</span>` : ''}</span>
    </span>`;
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
