// Modulo: platform (auth) — [core]
// Dove si va dopo il PIN (2026-11-24, segnalazione di Marco).
//
// Un link aperto da fuori (QR, tag NFC, contatto della rubrica, notifica) senza
// essere entrati, o col pass già scaduto, porta al login: dopo il PIN si continua
// verso quel link. In tutti gli altri casi (dopo «Esci», o se la sessione scade
// mentre si lavora) si va alla Home, come deciso il 10/07/2026.
//
// Pass scaduto: l'app si apre sul link, la prima chiamata risponde 401 e apiFetch
// ricarica su /login. Qui si distingue «pass già morto all'apertura» (nessuna
// chiamata col pass è mai riuscita in questa pagina → si è arrivati da un link)
// da «sessione scaduta mentre si lavorava» (almeno una chiamata era riuscita).
// Il link sopravvive al ricaricamento in sessionStorage (solo questa scheda).

const CHIAVE = "trgb_dopo_login";
const NON_DESTINAZIONI = new Set(["/", "/login", "/accesso-q"]);

// Indirizzo con cui si è aperta l'app in questa scheda
const INGRESSO = typeof window !== "undefined"
  ? window.location.pathname + window.location.search + window.location.hash
  : "/";

let sessioneViva = false; // almeno una chiamata col pass è andata a buon fine

function qui() {
  return window.location.pathname + window.location.search + window.location.hash;
}

function utile(url) {
  const path = String(url || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path.startsWith("/") && !path.startsWith("//") && !NON_DESTINAZIONI.has(path);
}

export function segnaSessioneViva() {
  sessioneViva = true;
}

// apiFetch, su 401: se il pass era già morto quando si è aperta l'app, il link
// d'arrivo si tiene per dopo il PIN.
export function ricordaIngressoSeLink() {
  if (sessioneViva || !utile(INGRESSO)) return;
  try { sessionStorage.setItem(CHIAVE, INGRESSO); } catch { /* storage chiuso */ }
}

// LoginForm, dopo il PIN giusto: l'indirizzo dove andare.
export function destinazioneDopoLogin() {
  let dest = null;
  try {
    dest = sessionStorage.getItem(CHIAVE);
    sessionStorage.removeItem(CHIAVE);
  } catch { /* storage chiuso */ }
  if (dest && utile(dest)) return dest;
  // Link aperto senza essere entrati: il login compare sull'indirizzo del link
  if (qui() === INGRESSO && utile(INGRESSO)) return INGRESSO;
  return "/";
}

// «Esci»: si riparte dalla Home e si dimentica un link in sospeso.
export function dimenticaDestinazione() {
  try { sessionStorage.removeItem(CHIAVE); } catch { /* storage chiuso */ }
}
