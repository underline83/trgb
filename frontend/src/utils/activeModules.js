// Modulo: platform/UI primitives (R8c, sessione 2026-05-02)
// Helper frontend per scoprire quali moduli sono attivi per il locale corrente.
//
// Backend: GET /system/modules ritorna {locale, active, frontend_menu_keys, ...}.
// Lato FE: chiavi MODULES_MENU (vini, vendite, ricette, tasks, ...) vengono
// filtrate via isMenuKeyActive(key).
//
// Backward-compat: se la chiamata fallisce o il backend è vecchio (pre-R8b),
// torna `wildcard=true` cosi' nessuna voce menu viene nascosta.
//
// Pattern speculare a localeStrings.js. Vedi docs/refactor_monorepo.md §3 R8.

import { useEffect, useState } from "react";
import { API_BASE } from "../config/api";

let _info = null;
let _loadPromise = null;
const _subscribers = new Set();

function _notifySubscribers() {
  for (const fn of _subscribers) {
    try { fn(_info); } catch (e) { console.warn("activeModules subscriber error:", e); }
  }
}

/**
 * Carica info moduli attivi (cached). Chiamare UNA volta al boot.
 * Restituisce Promise<info|null>.
 *
 * info shape: {
 *   locale: "tregobbi",
 *   active: ["vini","ricette",...],          // module_id backend
 *   frontend_menu_keys: ["vini","vendite",...], // chiavi MODULES_MENU del FE
 *   wildcard: true,                          // true = mostra tutto
 *   ...
 * }
 */
export function loadActiveModules() {
  if (_info) return Promise.resolve(_info);
  if (_loadPromise) return _loadPromise;

  _loadPromise = fetch(`${API_BASE}/system/modules`, {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-cache",
  })
    .then(r => {
      if (!r.ok) throw new Error(`/system/modules HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      _info = data || { wildcard: true, frontend_menu_keys: [], active: [] };
      _notifySubscribers();
      if (_info.wildcard) {
        console.log(`🧩 ActiveModules: ALL (locale=${_info.locale})`);
      } else {
        console.log(
          `🧩 ActiveModules: ${(_info.active || []).join(",")} ` +
          `(menu_keys: ${(_info.frontend_menu_keys || []).join(",")})`
        );
      }
      return _info;
    })
    .catch(err => {
      console.warn("⚠️ loadActiveModules fallita, fallback wildcard:", err);
      // Fallback safe: wildcard=true → niente filtro, tutti i menu visibili.
      // Cosi' un backend pre-R8b o errore di rete non rompe l'UI.
      _info = { wildcard: true, frontend_menu_keys: [], active: [] };
      return _info;
    });

  return _loadPromise;
}

/**
 * True se la chiave MODULES_MENU `menuKey` è attiva (o wildcard).
 * Default `true` se _info non è ancora caricato (no flicker UI durante boot).
 *
 * Esempio:
 *   isMenuKeyActive("vini")   // true se modulo vini è attivo
 *   isMenuKeyActive("tasks")  // true se modulo task_manager è attivo
 */
export function isMenuKeyActive(menuKey) {
  if (!_info) return true;        // pre-load: assume tutto attivo
  if (_info.wildcard) return true;
  return (_info.frontend_menu_keys || []).includes(menuKey);
}

/**
 * True se il modulo backend `moduleId` è attivo.
 * Esempio: isModuleActive("cassa"), isModuleActive("task_manager").
 */
export function isModuleActive(moduleId) {
  if (!_info) return true;
  if (_info.wildcard) return true;
  return (_info.active || []).includes(moduleId);
}

/**
 * Filtra un oggetto MODULES_MENU mantenendo solo le chiavi attive.
 * Ritorna sempre un nuovo oggetto. Conserva l'ordine originale delle chiavi.
 */
export function filterMenuByActive(modulesMenu) {
  if (!_info || _info.wildcard) return modulesMenu;
  const out = {};
  for (const k of Object.keys(modulesMenu)) {
    if (isMenuKeyActive(k)) out[k] = modulesMenu[k];
  }
  return out;
}

/**
 * Hook React: ritorna { info, isMenuKeyActive, isModuleActive, filterMenu }.
 * Re-renderizza quando i dati arrivano dal backend.
 *
 * Esempio:
 *   const { isMenuKeyActive, filterMenu } = useActiveModules();
 *   const menu = filterMenu(MODULES_MENU);
 */
export function useActiveModules() {
  const [info, setInfo] = useState(_info);
  useEffect(() => {
    if (_info) {
      if (info !== _info) setInfo(_info);
      return;
    }
    loadActiveModules().then(() => setInfo(_info));
    const onUpdate = (next) => setInfo(next);
    _subscribers.add(onUpdate);
    return () => { _subscribers.delete(onUpdate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    info,
    isMenuKeyActive,
    isModuleActive,
    filterMenu: filterMenuByActive,
  };
}
