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
 * True per i ruoli abilitati a GESTIRE il modulo Vini (catalogo e giacenze).
 * Specchio esatto di `is_vini_manager()` in app/services/auth_service.py:
 * admin, superadmin, sommelier. Gli altri (sala, cucina, viewer, contabile)
 * hanno sola lettura — la sala puo' comunque fare le azioni di SERVIZIO
 * (vendita one-tap dalla carta staff, toggle mescita), che il backend
 * autorizza a parte.
 */
export function isViniManagerRole(role) {
  return role === "admin" || role === "superadmin" || role === "sommelier";
}

/**
 * True per i ruoli che possono SCRIVERE sui turni (assegnare, modificare,
 * cancellare, copiare settimana, pubblicare, gestire i template).
 * Specchio esatto di `RUOLI_SCRITTURA_TURNI` in app/routers/turni_router.py
 * e app/routers/dipendenti.py: admin, superadmin.
 *
 * NON usare `isAdminRole` qui: quella include `contabile`, che il backend
 * esclude → il bottone comparirebbe e la chiamata tornerebbe 403.
 * La LETTURA del foglio resta aperta a tutti i ruoli che vedono il modulo.
 *
 * Se domani il responsabile di sala deve compilare il foglio, aggiungere
 * "sala" QUI e nelle due costanti backend: sono i tre punti da toccare.
 */
export function isTurniWriterRole(role) {
  return role === "admin" || role === "superadmin";
}

/**
 * True per i ruoli che possono SCRIVERE le selezioni del giorno
 * (macellaio, salumi, formaggi, pescato, piatti del giorno).
 * Specchio delle guardie nei `scelta_*_router.py`: admin, superadmin, chef.
 *
 * Sala e sommelier vedono le selezioni e possono segnare venduto/archiviato —
 * quello e' un'azione di servizio — ma non creano, modificano o cancellano:
 * le prepara la cucina (decisione Marco 2026-09-01).
 */
export function isCucinaWriterRole(role) {
  return role === "admin" || role === "superadmin" || role === "chef";
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
