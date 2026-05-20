import { validateEvent, applyEventSideEffects } from "./rules.js";
import { getReproInfo } from "./repro.js";
import { generateRabbitCode, num, numOrNull } from "./utils.js";
import { isNameFromPool, lockRabbitName, releaseRabbitName } from "./rabbitNameService.js";
import { DB } from "./db.js";
import { putPhotoData, deletePhotoData } from "./photoStorage.js";
import { uploadPhotoToCloud, deletePhotoFromCloud } from "./photoCloudStorage.js";
import { enqueueMutation } from "./mutationQueue.js";
import { enqueuePhotoUpload, startPhotoUploadAutoRetry } from "./photoUploadQueue.js";
import { photoLog } from "./photoDebug.js";
import { defaultActor, resolvePerformedBy } from "./membersService.js";

export function persist(ctx) {
  ctx.state = ctx.Store.save(ctx.state);
}

function fid(ctx) { return ctx.farmId || null; }
export function trackCloudWrite(ctx, promise, meta = null) {
  if (!promise || typeof promise.then !== "function") return promise;
  if (!ctx.syncManager) return promise;
  return ctx.syncManager.track(promise).catch((err) => {
    console.error("[sync] Cloud write failed:", err);
    if (meta?.type && meta?.payload) {
      enqueueMutation(meta.type, meta.payload, err);
      ctx.updatePendingMutations?.();
    }
    return undefined;
  });
}

export function addRabbit(ctx, data) {
  const { uid, nowISO } = ctx.Store.helpers;
  const nextCode = generateRabbitCode(ctx.state, data.sex || "U");
  // Si pas de date de naissance, on conserve le stade saisi par l'utilisateur ;
  // sinon on laisse getRabbitStage le calculer dynamiquement (champ stage vide).
  const hasBirth = !!(data.birthDate || "").trim();
  const storedStage = hasBirth
    ? ""
    : (["kit", "jeune", "adulte"].includes(data.stage) ? data.stage : "adulte");
  const rabbit = {
    id: uid("rb"),
    code:      (data.code  || "").trim() || nextCode,
    name:      (data.name  || "").trim() || "Sans nom",
    sex:       data.sex    || "U",
    breed:     (data.breed || "").trim(),
    birthDate: data.birthDate || "",
    cage:      (data.cage  || "").trim(),
    status:    data.status || "actif",
    stage:     storedStage,
    notes:     (data.notes || "").trim(),
    motherId:  data.motherId  || null,
    fatherId:  data.fatherId  || null,
    breedingOverride: data.breedingOverride || "auto",
    forSale:   !!data.forSale,
    salePrice: Number.isFinite(parseFloat(data.salePrice)) ? parseFloat(data.salePrice) : null,
    shopDescription: (data.shopDescription || "").trim(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  ctx.state.rabbits.unshift(rabbit);
  if (isNameFromPool(rabbit.name)) {
    lockRabbitName(ctx.state, rabbit.name, rabbit.id);
    if (fid(ctx)) trackCloudWrite(ctx, DB.setUsedName(fid(ctx), rabbit.name, rabbit.id), { type: "setUsedName", payload: { farmId: fid(ctx), name: rabbit.name, rabbitId: rabbit.id } });
  }

  // Pesée initiale optionnelle
  const initW = parseFloat(data.initialWeight);
  if (Number.isFinite(initW) && initW > 0) {
    const ev = {
      id:        uid("ev"),
      rabbitId:  rabbit.id,
      type:      "pesée",
      date:      new Date().toISOString().slice(0, 10),
      notes:     "Poids à l'inscription",
      data:      { weight: initW },
      createdAt: nowISO(),
    };
    ctx.state.events.unshift(ev);
    if (fid(ctx)) trackCloudWrite(ctx, DB.upsertEvent(fid(ctx), ev), { type: "upsertEvent", payload: { farmId: fid(ctx), event: ev } });
  }

  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.upsertRabbit(fid(ctx), rabbit), { type: "upsertRabbit", payload: { farmId: fid(ctx), rabbit } });
  ctx.selectedRabbitId = rabbit.id;
  if (ctx.navigate) {
    ctx.navigate("rabbits");
  } else {
    ctx.render();
  }
}

export function updateRabbit(ctx, id, patch) {
  const { nowISO } = ctx.Store.helpers;
  const i = ctx.state.rabbits.findIndex((r) => r.id === id);
  if (i === -1) return;

  // Stade : on stocke le stade choisi seulement quand il n'y a pas de date.
  // Si une date est saisie, on efface le stade pour laisser le calcul auto.
  if (Object.prototype.hasOwnProperty.call(patch, "stage") ||
      Object.prototype.hasOwnProperty.call(patch, "birthDate")) {
    const nextBirth = (patch.birthDate ?? ctx.state.rabbits[i].birthDate ?? "").toString().trim();
    if (nextBirth) {
      patch.stage = "";
    } else if (patch.stage !== undefined) {
      patch.stage = ["kit", "jeune", "adulte"].includes(patch.stage) ? patch.stage : "adulte";
    }
  }

  const oldName = ctx.state.rabbits[i].name;
  const newName = patch.name;
  if (newName && newName !== oldName) {
    if (isNameFromPool(oldName)) {
      releaseRabbitName(ctx.state, oldName);
      if (fid(ctx)) trackCloudWrite(ctx, DB.deleteUsedName(fid(ctx), oldName), { type: "deleteUsedName", payload: { farmId: fid(ctx), name: oldName } });
    }
    if (isNameFromPool(newName)) {
      lockRabbitName(ctx.state, newName, id);
      if (fid(ctx)) trackCloudWrite(ctx, DB.setUsedName(fid(ctx), newName, id), { type: "setUsedName", payload: { farmId: fid(ctx), name: newName, rabbitId: id } });
    }
  }

  ctx.state.rabbits[i] = { ...ctx.state.rabbits[i], ...patch, updatedAt: nowISO() };
  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.upsertRabbit(fid(ctx), ctx.state.rabbits[i]), { type: "upsertRabbit", payload: { farmId: fid(ctx), rabbit: ctx.state.rabbits[i] } });
  ctx.render();
}

export function deleteRabbit(ctx, id) {
  const target = ctx.state.rabbits.find(r => r.id === id);
  if (target && isNameFromPool(target.name)) {
    releaseRabbitName(ctx.state, target.name);
    if (fid(ctx)) trackCloudWrite(ctx, DB.deleteUsedName(fid(ctx), target.name), { type: "deleteUsedName", payload: { farmId: fid(ctx), name: target.name } });
  }
  const photosToDelete = (ctx.state.photos || []).filter((p) => p.rabbitId === id);
  photosToDelete.forEach((p) => {
    deletePhotoData(p.localPhotoKey).catch((err) => {
      console.error("[photoStorage] Suppression rabbit photo impossible:", err);
    });
    if (fid(ctx) && p.storagePath) {
      deletePhotoFromCloud(p.storagePath).catch((err) => {
        console.error("[photoCloudStorage] Suppression rabbit photo cloud impossible:", err);
      });
    }
  });
  ctx.state.rabbits = ctx.state.rabbits.filter((r) => r.id !== id);
  ctx.state.events  = ctx.state.events.filter((e) => e.rabbitId !== id);
  if (ctx.state.photos) ctx.state.photos = ctx.state.photos.filter((p) => p.rabbitId !== id);
  if (ctx.selectedRabbitId === id) ctx.selectedRabbitId = null;
  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.deleteRabbit(fid(ctx), id), { type: "deleteRabbit", payload: { farmId: fid(ctx), rabbitId: id } });
  ctx.render();
}

export function addEvent(ctx, rabbitId, data) {
  const { uid, nowISO } = ctx.Store.helpers;
  const evData = { ...(data.data || {}) };
  if (data.type === "mise_bas") {
    const born  = numOrNull(evData.born);
    const alive = num(evData.alive);
    const dead  = num(evData.dead);
    if (born === null) evData.born = alive + dead;
    else evData.dead = Math.max(born - alive, 0);
  }
  // performedBy : auteur de l'action (membre connecté par défaut, surchargeable
  // via le sélecteur du formulaire). Stocké en plein texte pour rester lisible
  // même si le membre quitte la ferme.
  const performedBy = data.performedBy && typeof data.performedBy === "object"
    ? data.performedBy
    : (data.performedByUserId !== undefined
      ? resolvePerformedBy(ctx, data.performedByUserId || null)
      : defaultActor(ctx));
  const ev = {
    id:       uid("ev"),
    rabbitId,
    type:     data.type || "autre",
    date:     data.date || new Date().toISOString().slice(0, 10),
    notes:    (data.notes || "").trim(),
    data:     evData,
    performedBy,
    createdAt: nowISO(),
  };

  const check = validateEvent(ctx.state, rabbitId, ev);
  if (!check.ok) {
    const error = new Error(check.error);
    error.code = "EVENT_VALIDATION";
    throw error;
  }

  ctx.state.events.unshift(ev);
  applyEventSideEffects(ctx, ev);
  persist(ctx);
  const farmId = fid(ctx);
  if (farmId) {
    trackCloudWrite(ctx, DB.upsertEvent(farmId, ev), { type: "upsertEvent", payload: { farmId, event: ev } });

    // applyEventSideEffects peut muter le statut du lapin (décès → mort,
    // vente → vendu) ou créer/modifier des lapereaux (mise_bas/sevrage).
    // Sans upsert de ces lapins, le cloud garde l'ancien état et l'écrase
    // au prochain sync. On pousse donc tous les lapins touchés.
    const touched = new Set([rabbitId]);
    if (ev.type === "mise_bas") {
      for (const k of ctx.state.rabbits) {
        if (k.litterId === ev.id) touched.add(k.id);
      }
    }
    if (ev.type === "sevrage" && ev.data?.litterId) {
      for (const k of ctx.state.rabbits) {
        if (k.litterId === ev.data.litterId) touched.add(k.id);
      }
    }
    for (const rid of touched) {
      const rabbit = ctx.state.rabbits.find(r => r.id === rid);
      if (!rabbit) continue;
      trackCloudWrite(ctx, DB.upsertRabbit(farmId, rabbit), {
        type: "upsertRabbit",
        payload: { farmId, rabbit },
      });
    }
  }
  ctx.render();
  return ev;
}

export function deleteEvent(ctx, eventId) {
  const photosToDelete = (ctx.state.photos || []).filter((p) => p.eventId === eventId);
  photosToDelete.forEach((p) => {
    deletePhotoData(p.localPhotoKey).catch((err) => {
      console.error("[photoStorage] Suppression event photo impossible:", err);
    });
    if (fid(ctx) && p.storagePath) {
      deletePhotoFromCloud(p.storagePath).catch((err) => {
        console.error("[photoCloudStorage] Suppression event photo cloud impossible:", err);
      });
    }
  });
  ctx.state.events = ctx.state.events.filter((e) => e.id !== eventId);
  if (ctx.state.photos) ctx.state.photos = ctx.state.photos.filter((p) => p.eventId !== eventId);
  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.deleteEvent(fid(ctx), eventId), { type: "deleteEvent", payload: { farmId: fid(ctx), eventId } });
  ctx.render();
}

/**
 * Prochain index de code lapereau pour une mère (suite de `${code}-K01`).
 */
function nextKitIndex(state, mother) {
  const prefix = `${(mother.code || "CW").trim()}-K`;
  const max = (state.rabbits || [])
    .map(r => r.code || "")
    .filter(code => code.startsWith(prefix))
    .map(code => Number(code.slice(prefix.length)))
    .filter(n => Number.isFinite(n))
    .reduce((acc, n) => Math.max(acc, n), 0);
  return max + 1;
}

/**
 * Ajoute `count` lapereaux à une portée existante (cas : la mère a mis bas
 * plus de lapereaux qu'initialement comptés, constaté après coup).
 * Met à jour les compteurs de la mise-bas pour garder les stats cohérentes.
 */
export function addKitsToLitter(ctx, litterEventId, count, { reason = "", date = null } = {}) {
  const { uid, nowISO } = ctx.Store.helpers;
  const n = Math.max(0, parseInt(count, 10) || 0);
  if (!n) return [];

  const ev = ctx.state.events.find(e => e.id === litterEventId && e.type === "mise_bas");
  if (!ev) throw new Error("Portée introuvable.");
  const mother = ctx.state.rabbits.find(r => r.id === ev.rabbitId);
  if (!mother) throw new Error("Mère introuvable.");

  const repro = getReproInfo(ctx.state, mother);
  const sibling = ctx.state.rabbits.find(k => k.litterId === ev.id);
  const fatherId = repro?.lastMating?.data?.maleId
    || sibling?.buckId || sibling?.fatherId || null;

  // Alignement sur la fratrie : même stade et même cage que les lapereaux du lot.
  const stage = sibling?.stage || "kit";
  const cage  = sibling?.cage  || mother.cage || "";
  const birthDate = date || ev.date || nowISO().slice(0, 10);

  const created = [];
  let idx = nextKitIndex(ctx.state, mother);
  for (let i = 0; i < n; i++) {
    const code = `${mother.code}-K${String(idx).padStart(2, "0")}`;
    const label = String(idx).padStart(2, "0");
    idx++;
    const kit = {
      id: uid("rb"),
      code,
      name: `Lapereau ${label}`,
      sex: "U",
      breed: mother.breed || "",
      birthDate,
      cage,
      status: "actif",
      stage,
      notes: `Ajouté à la portée du ${ev.date}${reason ? " — " + reason : ""}`,
      doeId: mother.id,
      buckId: fatherId,
      litterId: ev.id,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    ctx.state.rabbits.unshift(kit);
    created.push(kit);
  }

  // Mise à jour des compteurs de la mise-bas (nés + nés vivants).
  ev.data = ev.data || {};
  ev.data.born  = num(ev.data.born)  + n;
  ev.data.alive = num(ev.data.alive) + n;
  ev.data.kitsCount = num(ev.data.kitsCount) + n;
  ev.data.additions = [ ...(ev.data.additions || []), { date: birthDate, count: n, reason: (reason || "").trim() } ];

  persist(ctx);
  const farmId = fid(ctx);
  if (farmId) {
    trackCloudWrite(ctx, DB.upsertEvent(farmId, ev), { type: "upsertEvent", payload: { farmId, event: ev } });
    for (const kit of created) {
      trackCloudWrite(ctx, DB.upsertRabbit(farmId, kit), { type: "upsertRabbit", payload: { farmId, rabbit: kit } });
    }
  }
  ctx.render();
  return created;
}

/**
 * Applique un même événement à plusieurs lapins (traitement par lot).
 * Chaque lapin est validé individuellement ; les échecs sont collectés sans
 * bloquer les autres. Persiste et synchronise une seule fois.
 *
 * @returns {{ ok: number, failed: Array<{id, code?, error}> }}
 */
export function applyBulkEvent(ctx, rabbitIds, { type, date = null, notes = "", data = {} } = {}) {
  const { uid, nowISO } = ctx.Store.helpers;
  const day = date || new Date().toISOString().slice(0, 10);
  const actor = defaultActor(ctx);
  const cleanNotes = (notes || "").trim();
  const created = [];
  const failed = [];
  const touched = new Set();

  for (const rid of (rabbitIds || [])) {
    const r = ctx.state.rabbits.find(x => x.id === rid);
    if (!r) { failed.push({ id: rid, error: "Lapin introuvable." }); continue; }

    const evData = { ...(data || {}) };
    if (type === "mise_bas") {
      const born  = numOrNull(evData.born);
      const alive = num(evData.alive);
      const dead  = num(evData.dead);
      if (born === null) evData.born = alive + dead;
      else evData.dead = Math.max(born - alive, 0);
    }

    const ev = {
      id: uid("ev"),
      rabbitId: rid,
      type: type || "autre",
      date: day,
      notes: cleanNotes,
      data: evData,
      performedBy: actor,
      createdAt: nowISO(),
    };

    const check = validateEvent(ctx.state, rid, ev);
    if (!check.ok) { failed.push({ id: rid, code: r.code, error: check.error }); continue; }

    ctx.state.events.unshift(ev);
    applyEventSideEffects(ctx, ev);
    created.push(ev);
    touched.add(rid);
    // Lapereaux créés/modifiés par effet de bord (mise_bas/sevrage).
    if (type === "mise_bas") for (const k of ctx.state.rabbits) if (k.litterId === ev.id) touched.add(k.id);
    if (type === "sevrage" && ev.data?.litterId) for (const k of ctx.state.rabbits) if (k.litterId === ev.data.litterId) touched.add(k.id);
  }

  if (created.length) {
    persist(ctx);
    const farmId = fid(ctx);
    if (farmId) {
      for (const ev of created) {
        trackCloudWrite(ctx, DB.upsertEvent(farmId, ev), { type: "upsertEvent", payload: { farmId, event: ev } });
      }
      for (const rid of touched) {
        const rb = ctx.state.rabbits.find(r => r.id === rid);
        if (rb) trackCloudWrite(ctx, DB.upsertRabbit(farmId, rb), { type: "upsertRabbit", payload: { farmId, rabbit: rb } });
      }
    }
    ctx.render();
  }
  return { ok: created.length, failed };
}

/**
 * Applique une même modification de champs (cage, race, dispo repro, boutique…)
 * à plusieurs lapins. Seuls les champs présents dans `patch` sont modifiés.
 * @returns {number} nombre de lapins modifiés
 */
export function applyBulkEdit(ctx, rabbitIds, patch = {}) {
  const { nowISO } = ctx.Store.helpers;
  const keys = Object.keys(patch);
  if (!keys.length) return 0;

  const touched = [];
  for (const rid of (rabbitIds || [])) {
    const r = ctx.state.rabbits.find(x => x.id === rid);
    if (!r) continue;
    Object.assign(r, patch);
    // Cohérence boutique : retirer de la vente nettoie prix + description.
    if (patch.forSale === false) { r.salePrice = null; r.shopDescription = ""; }
    r.updatedAt = nowISO();
    touched.push(r);
  }

  if (touched.length) {
    persist(ctx);
    const farmId = fid(ctx);
    if (farmId) {
      for (const r of touched) {
        trackCloudWrite(ctx, DB.upsertRabbit(farmId, r), { type: "upsertRabbit", payload: { farmId, rabbit: r } });
      }
    }
    ctx.render();
  }
  return touched.length;
}

/**
 * Déclare une perte (décès) pour un ou plusieurs lapereaux d'un lot, avec
 * cause et condition détaillée. S'appuie sur applyBulkEvent → met le statut à
 * "mort" et se répercute sur TOUTES les stats (compteur global, survie portée,
 * classement reproductrice).
 */
export function declareLotLoss(ctx, rabbitIds, { cause = "inconnu", condition = "", date = null } = {}) {
  const detail = (condition || "").trim();
  const ids = (rabbitIds || []).filter(rid => {
    const r = ctx.state.rabbits.find(x => x.id === rid);
    return r && r.status === "actif";
  });
  const res = applyBulkEvent(ctx, ids, { type: "décès", date, notes: detail, data: { cause, condition: detail } });
  return res.ok;
}

/**
 * Affecte des loges individuelles aux lapereaux d'un lot et passe le lot au
 * statut "loges". `assignments` : [{ id, cage }].
 */
export function assignLotLodges(ctx, lotId, assignments) {
  const { nowISO } = ctx.Store.helpers;
  const farmId = fid(ctx);
  const touched = [];
  for (const { id, cage } of (assignments || [])) {
    const r = ctx.state.rabbits.find(x => x.id === id);
    if (!r) continue;
    const c = (cage || "").trim();
    if (!c || r.cage === c) continue;
    r.cage = c;
    r.updatedAt = nowISO();
    touched.push(r);
  }

  ctx.state.lotStatuses = { ...(ctx.state.lotStatuses || {}), [lotId]: "loges" };
  persist(ctx);
  if (farmId) {
    for (const r of touched) {
      trackCloudWrite(ctx, DB.upsertRabbit(farmId, r), { type: "upsertRabbit", payload: { farmId, rabbit: r } });
    }
    trackCloudWrite(ctx, DB.setLotStatus(farmId, lotId, "loges"), { type: "setLotStatus", payload: { farmId, lotId, status: "loges" } });
  }
  ctx.render();
  return touched.length;
}

export async function addPhoto(ctx, rabbitId, { dataUrl, date, source = "profile", eventId = null, note = "" }) {
  const { uid, nowISO } = ctx.Store.helpers;
  if (!ctx.state.photos) ctx.state.photos = [];
  const photoId = uid("ph");
  const localPhotoKey = uid("phdat");
  if (!dataUrl) throw new Error("Image manquante.");

  // Offline-first: local IndexedDB save is the only blocking step.
  await putPhotoData(localPhotoKey, dataUrl).catch((err) => {
    throw new Error(`Erreur stockage photo local (IndexedDB) : ${err?.message || err}`);
  });
  photoLog("local.saved", { photoId, rabbitId, localPhotoKey, bytes: dataUrl.length });

  const photo = {
    id:       photoId,
    rabbitId,
    date:     date || new Date().toISOString().slice(0, 10),
    source,
    eventId,
    note:     (note || "").trim(),
    createdAt: nowISO(),
    localPhotoKey,
    storagePath: null,
    dataUrl,
  };
  ctx.state.photos.unshift(photo);
  persist(ctx);
  ctx.render();

  // Cloud upload + DB write in background (non-blocking).
  const farmId = fid(ctx);
  if (farmId) {
    _uploadAndSyncPhoto(ctx, photo).catch(() => {});
  }
  return photo;
}

async function _uploadAndSyncPhoto(ctx, photo) {
  const farmId = fid(ctx);
  if (!farmId) return;
  const tracked = ctx.syncManager?.track ? ctx.syncManager.track(
    uploadPhotoToCloud({
      farmId, rabbitId: photo.rabbitId, photoId: photo.id, dataUrl: photo.dataUrl,
    })
  ) : uploadPhotoToCloud({
      farmId, rabbitId: photo.rabbitId, photoId: photo.id, dataUrl: photo.dataUrl,
  });
  try {
    const storagePath = await tracked;
    photo.storagePath = storagePath;
    photoLog("upload.success", { photoId: photo.id, storagePath });
    persist(ctx);
    trackCloudWrite(
      ctx,
      DB.upsertPhoto(farmId, photo).then((r) => { photoLog("db.upsert.success", { photoId: photo.id }); return r; }),
      { type: "upsertPhoto", payload: { farmId, photo } },
    );
  } catch (err) {
    photoLog("upload.failed", { photoId: photo.id, error: String(err?.message || err) });
    console.warn("[photoUploadQueue] Upload différé:", err?.message || err);
    // Pas d'upsert SQL ici : pousser une ligne `photos` sans `storagePath` la
    // rendrait inaccessible aux autres appareils. Le photoUploadQueue effectue
    // upload + upsert atomiquement à la prochaine connexion réussie, ce qui
    // garantit que la ligne cloud n'apparaît qu'avec un `storagePath` valide.
    enqueuePhotoUpload({ farmId, rabbitId: photo.rabbitId, photoId: photo.id, localPhotoKey: photo.localPhotoKey }, err);
    ctx.updatePendingMutations?.();
    // Relance immédiate du poller pour ne pas attendre le tick suivant.
    startPhotoUploadAutoRetry(ctx, 30000);
  }
}

export function deletePhoto(ctx, photoId) {
  if (!ctx.state.photos) return;
  const target = ctx.state.photos.find((p) => p.id === photoId);
  ctx.state.photos = ctx.state.photos.filter((p) => p.id !== photoId);
  deletePhotoData(target?.localPhotoKey).catch((err) => {
    console.error("[photoStorage] Suppression photo impossible:", err);
  });
  if (fid(ctx) && target?.storagePath) {
    deletePhotoFromCloud(target.storagePath).catch((err) => {
      console.error("[photoCloudStorage] Suppression photo cloud impossible:", err);
    });
  }
  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.deletePhoto(fid(ctx), photoId), { type: "deletePhoto", payload: { farmId: fid(ctx), photoId } });
  ctx.render();
}
