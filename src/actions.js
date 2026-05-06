import { validateEvent, applyEventSideEffects } from "./rules.js";
import { generateRabbitCode, getRabbitStage, num, numOrNull } from "./utils.js";
import { isNameFromPool, lockRabbitName, releaseRabbitName } from "./rabbitNameService.js";
import { DB } from "./db.js";
import { putPhotoData, deletePhotoData } from "./photoStorage.js";
import { uploadPhotoToCloud, deletePhotoFromCloud } from "./photoCloudStorage.js";
import { enqueueMutation } from "./mutationQueue.js";

export function persist(ctx) {
  ctx.state = ctx.Store.save(ctx.state);
}

function fid(ctx) { return ctx.farmId || null; }
function trackCloudWrite(ctx, promise, meta = null) {
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
  const rabbit = {
    id: uid("rb"),
    code:      (data.code  || "").trim() || nextCode,
    name:      (data.name  || "").trim() || "Sans nom",
    sex:       data.sex    || "U",
    breed:     (data.breed || "").trim(),
    birthDate: data.birthDate || "",
    cage:      (data.cage  || "").trim(),
    status:    data.status || "actif",
    stage:     data.stage  || getRabbitStage({ birthDate: data.birthDate, stage: data.stage }),
    notes:     (data.notes || "").trim(),
    motherId:  data.motherId  || null,
    fatherId:  data.fatherId  || null,
    breedingOverride: data.breedingOverride || "auto",
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
  ctx.render();
}

export function updateRabbit(ctx, id, patch) {
  const { nowISO } = ctx.Store.helpers;
  const i = ctx.state.rabbits.findIndex((r) => r.id === id);
  if (i === -1) return;

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
  const ev = {
    id:       uid("ev"),
    rabbitId,
    type:     data.type || "autre",
    date:     data.date || new Date().toISOString().slice(0, 10),
    notes:    (data.notes || "").trim(),
    data:     evData,
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
  if (fid(ctx)) trackCloudWrite(ctx, DB.upsertEvent(fid(ctx), ev), { type: "upsertEvent", payload: { farmId: fid(ctx), event: ev } });
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

export async function addPhoto(ctx, rabbitId, { dataUrl, date, source = "profile", eventId = null, note = "" }) {
  const { uid, nowISO } = ctx.Store.helpers;
  if (!ctx.state.photos) ctx.state.photos = [];
  const photoId = uid("ph");
  const localPhotoKey = uid("phdat");
  if (!dataUrl) throw new Error("Image manquante.");
  await putPhotoData(localPhotoKey, dataUrl).catch((err) => {
    throw new Error(`Erreur stockage photo local (IndexedDB) : ${err?.message || err}`);
  });
  let storagePath = null;
  if (fid(ctx)) {
    storagePath = await uploadPhotoToCloud({
      farmId: fid(ctx), rabbitId, photoId, dataUrl,
    }).catch((err) => {
      throw new Error(`Erreur sync photo cloud : ${err?.message || err}`);
    });
  }
  const photo = {
    id:       photoId,
    rabbitId,
    date:     date || new Date().toISOString().slice(0, 10),
    source,
    eventId,
    note:     (note || "").trim(),
    createdAt: nowISO(),
    localPhotoKey,
    storagePath,
    dataUrl,
  };
  ctx.state.photos.unshift(photo);
  persist(ctx);
  if (fid(ctx)) trackCloudWrite(ctx, DB.upsertPhoto(fid(ctx), photo), { type: "upsertPhoto", payload: { farmId: fid(ctx), photo } });
  ctx.render();
  return photo;
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
