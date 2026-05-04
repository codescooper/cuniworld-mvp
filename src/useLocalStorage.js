/**
 * useLocalStorage.js – Hooks React pour la persistance localStorage
 *
 * Requiert React 18+. Importe storage.js pour la logique bas niveau.
 *
 * Hooks exportés :
 *   useLocalStorage(key, defaultValue)
 *     → [value, setValue, { reset }]
 *     Usage général : persiste n'importe quelle valeur sérialisable.
 *
 *   useAutoSave(key, defaultFields)
 *     → { fields, update, reset, isDirty, lastSaved }
 *     Usage formulaire : mise à jour champ par champ avec indicateur de sauvegarde.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { loadData, saveData, deleteData, watch, debounce } from "./storage.js";

// ─── useLocalStorage ──────────────────────────────────────────────────────────

/**
 * Persiste `value` dans localStorage et le synchronise entre onglets.
 *
 * @param {string} key
 * @param {*}      defaultValue  Valeur initiale si rien n'est stocké
 *
 * @example
 *   const [prenom, setPrenom, { reset }] = useLocalStorage("prenom", "");
 *   <input value={prenom} onChange={e => setPrenom(e.target.value)} />
 */
export function useLocalStorage(key, defaultValue) {
  // Initialisation lazy : lit localStorage une seule fois au montage
  const [state, setState] = useState(() => loadData(key, defaultValue));

  // Sauvegarde debouncée – ref stable, ne déclenchera pas de re-render
  const autoSave = useRef(debounce((data) => saveData(key, data), 300));

  // Persistance à chaque changement d'état
  useEffect(() => {
    autoSave.current(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchro cross-onglet via l'événement "storage"
  useEffect(() => {
    const unsubscribe = watch(key, (data) => {
      setState(data !== undefined ? data : defaultValue);
    });
    return unsubscribe; // cleanup au démontage
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = useCallback((valueOrUpdater) => {
    setState((prev) =>
      typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater
    );
  }, []);

  const reset = useCallback(() => {
    setState(defaultValue);
    saveData(key, defaultValue);
  }, [key, defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(() => {
    setState(defaultValue);
    deleteData(key);
  }, [key, defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps

  return [state, setValue, { reset, remove }];
}

// ─── useAutoSave ──────────────────────────────────────────────────────────────

/**
 * Gère un formulaire multi-champs avec auto-save et indicateur de statut.
 *
 * @param {string} key
 * @param {Object} defaultFields  Valeurs initiales du formulaire
 *
 * @example
 *   const { fields, update, reset, isDirty, lastSaved } = useAutoSave("profil", {
 *     nom: "", email: ""
 *   });
 *
 *   <input
 *     value={fields.nom}
 *     onChange={e => update("nom", e.target.value)}
 *   />
 *   {isDirty && <span>Sauvegarde en cours…</span>}
 *   {lastSaved && <span>Sauvegardé à {lastSaved.toLocaleTimeString()}</span>}
 */
export function useAutoSave(key, defaultFields) {
  const [fields, setFields] = useState(() => loadData(key, defaultFields));
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const autoSave = useRef(
    debounce((data) => {
      saveData(key, data);
      setIsDirty(false);
      setLastSaved(new Date());
    }, 300)
  );

  useEffect(() => {
    if (isDirty) autoSave.current(fields);
  }, [fields, isDirty]);

  // Synchro cross-onglet
  useEffect(() => {
    const unsubscribe = watch(key, (data) => {
      if (data !== undefined) {
        setFields(data);
        setIsDirty(false);
      }
    });
    return unsubscribe;
  }, [key]);

  const update = useCallback((name, value) => {
    setFields((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);
  }, []);

  const reset = useCallback(() => {
    autoSave.current.cancel();
    setFields(defaultFields);
    setIsDirty(false);
    setLastSaved(null);
    saveData(key, defaultFields);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force la sauvegarde avant un submit ou une navigation
  const flush = useCallback(() => {
    autoSave.current.flush();
  }, []);

  return { fields, update, reset, flush, isDirty, lastSaved };
}
