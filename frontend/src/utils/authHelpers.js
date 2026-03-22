// src/utils/authHelpers.js
// Helper centralizzati per controllo ruoli

/**
 * True se il ruolo è admin o superadmin.
 * Usare per tutti i check generici di admin.
 */
export function isAdminRole(role) {
  return role === "admin" || role === "superadmin";
}

/**
 * True solo per superadmin (es. marco).
 * Usare per funzioni riservate come preconti.
 */
export function isSuperAdminRole(role) {
  return role === "superadmin";
}

/**
 * Legge il ruolo dal localStorage e ritorna le flag comode.
 */
export function getRoleFlags() {
  const role = localStorage.getItem("role") || "";
  return {
    role,
    isAdmin: isAdminRole(role),
    isSuperAdmin: isSuperAdminRole(role),
  };
}
