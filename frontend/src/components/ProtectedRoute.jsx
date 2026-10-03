// Componente wrapper per proteggere le route in base ai permessi modulo/sotto-modulo
// Se l'utente non ha accesso, redirige alla Home

import React from "react";
import { Navigate } from "react-router-dom";
import useModuleAccess from "../hooks/useModuleAccess";

export default function ProtectedRoute({ module, sub, roles, children }) {
  const { canAccessModule, canAccessSub, loading } = useModuleAccess();

  // Durante il caricamento dei permessi, non bloccare (sarà rapido)
  if (loading) return children;

  // Check modulo
  if (!canAccessModule(module)) {
    return <Navigate to="/" replace />;
  }

  // Check ruoli espliciti (2026-10-03): per pagine che dentro lo stesso
  // sotto-modulo vanno chiuse a qualcuno (Menu Carta ai commis). Superadmin
  // eredita admin, come in useModuleAccess.roleMatch.
  if (roles) {
    const r = localStorage.getItem("role");
    if (!(roles.includes(r) || (r === "superadmin" && roles.includes("admin")))) {
      return <Navigate to="/" replace />;
    }
  }

  // Check sotto-modulo (se specificato)
  if (sub && !canAccessSub(module, sub)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
