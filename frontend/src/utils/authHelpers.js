// src/utils/authHelpers.js
// Helper centralizzati per controllo ruoli + modalità gestione

/**
 * True se il ruolo è admin, contabile o superadmin.
 * Usare per tutti i check generici di admin.
 */
export function isAdminRole(role) {
  return role === "admin" || role === "superadmin" || role === "contabile";
}

/**
 * True solo se l'utente è superadmin E ha la modalità gestione attiva.
 * Usare per funzioni riservate come preconti.
 *
 * La modalità gestione è un toggle segreto: l'utente superadmin
 * deve attivarla esplicitamente. Di default è spenta, così
 * a schermo non si vedono mai i preconti.
 */
export function isSuperAdminRole(role) {
  if (role !== "superadmin") return false;
  return sessionStorage.getItem("trgb_gm") === "1";
}

/**
 * True se il ruolo è effettivamente superadmin (indipendentemente dalla modalità).
 * Usare solo per verificare se l'utente PUÒ attivare la modalità gestione.
 */
export function canActivateSuperMode(role) {
  return role === "superadmin";
}

/**
 * Attiva/disattiva la modalità gestione. Ritorna il nuovo stato.
 */
export function toggleSuperMode() {
  const current = sessionStorage.getItem("trgb_gm") === "1";
  if (current) {
    sessionStorage.removeItem("trgb_gm");
  } else {
    sessionStorage.setItem("trgb_gm", "1");
  }
  return !current;
}

/**
 * Stato corrente della modalità gestione.
 */
export function isSuperModeActive() {
  return sessionStorage.getItem("trgb_gm") === "1";
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
    canSuperMode: canActivateSuperMode(role),
  };
}
