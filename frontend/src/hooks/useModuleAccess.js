// Hook centralizzato per controllo accesso moduli e sotto-moduli
// Carica modules.json dal backend e offre helpers per verificare i permessi

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE, apiFetch } from "../config/api";

// Cache globale — evita N fetch se più componenti usano l'hook
let _cache = null;
let _cachePromise = null;

function fetchModules() {
  if (_cachePromise) return _cachePromise;
  _cachePromise = apiFetch(`${API_BASE}/settings/modules/`)
    .then(r => r.json())
    .then(data => { _cache = data; return data; })
    .catch(() => { _cache = null; return null; });
  return _cachePromise;
}

// Invalida la cache (chiamare dopo un save in Impostazioni)
export function invalidateModulesCache() {
  _cache = null;
  _cachePromise = null;
}

export default function useModuleAccess() {
  const [modules, setModules] = useState(_cache);
  const role = localStorage.getItem("role") || "";

  useEffect(() => {
    if (_cache) { setModules(_cache); return; }
    fetchModules().then(data => { if (data) setModules(data); });
  }, []);

  const roleMatch = useCallback((roles) => {
    if (!roles || !Array.isArray(roles)) return false;
    if (roles.includes(role)) return true;
    // superadmin vede tutto ciò che admin vede
    if (role === "superadmin" && roles.includes("admin")) return true;
    return false;
  }, [role]);

  // Può accedere al modulo?
  const canAccessModule = useCallback((moduleKey) => {
    if (!modules) return true; // fallback permissivo durante il caricamento
    const mod = modules.find(m => m.key === moduleKey);
    if (!mod) return false;
    return roleMatch(mod.roles);
  }, [modules, roleMatch]);

  // Può accedere al sotto-modulo?
  // subKey è il segmento del path (es. "cc", "mance", "dashboard")
  const canAccessSub = useCallback((moduleKey, subKey) => {
    if (!modules) return true; // fallback permissivo
    const mod = modules.find(m => m.key === moduleKey);
    if (!mod) return false;
    // Se non ha sotto-moduli definiti, usa i permessi del modulo padre
    if (!mod.sub || mod.sub.length === 0) return roleMatch(mod.roles);
    const sub = mod.sub.find(s => s.key === subKey);
    if (!sub) return roleMatch(mod.roles); // sotto-modulo non mappato → permesso modulo
    return roleMatch(sub.roles);
  }, [modules, roleMatch]);

  // Filtra sotto-menu visibili per un modulo (per Header/Home)
  const visibleSubs = useCallback((moduleKey) => {
    if (!modules) return null; // non ancora caricato
    const mod = modules.find(m => m.key === moduleKey);
    if (!mod || !mod.sub) return null;
    return mod.sub.filter(s => roleMatch(s.roles)).map(s => s.key);
  }, [modules, roleMatch]);

  // Lista moduli visibili (chiavi)
  const visibleModules = useMemo(() => {
    if (!modules) return null;
    return modules
      .filter(m => roleMatch(m.roles))
      .map(m => m.key);
  }, [modules, roleMatch]);

  return {
    modules,
    role,
    canAccessModule,
    canAccessSub,
    visibleSubs,
    visibleModules,
    loading: !modules,
  };
}
