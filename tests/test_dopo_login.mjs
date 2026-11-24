// Test di frontend/src/utils/dopoLogin.js — dove si va dopo il PIN (2026-11-24).
// Un link aperto senza essere entrati (o col pass scaduto) → dopo il PIN si va
// al link; dopo «Esci» o se la sessione scade mentre si lavora → Home.
//
//     cd /Users/underline83/trgb && node tests/test_dopo_login.mjs
//
// Solo node: window e sessionStorage finti, un'istanza nuova del modulo per
// ogni caricamento di pagina.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const MODULO = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname),
  "../frontend/src/utils/dopoLogin.js")).href;

let store = {};
globalThis.sessionStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
let carica = 0;
async function apriPagina(url) {
  const u = new URL(url, "https://app.tregobbi.it");
  globalThis.window = { location: { pathname: u.pathname, search: u.search, hash: u.hash } };
  return import(`${MODULO}?pagina=${++carica}`);
}
function vaiA(url) {
  const u = new URL(url, "https://app.tregobbi.it");
  Object.assign(window.location, { pathname: u.pathname, search: u.search, hash: u.hash });
}

const casi = [];
const caso = (nome, fn) => casi.push([nome, fn]);

caso("link senza essere entrati → il link", async () => {
  store = {};
  const m = await apriPagina("/cucina/mobile/frigo/4?r=13");
  assert.equal(m.destinazioneDopoLogin(), "/cucina/mobile/frigo/4?r=13");
});

caso("link col pass scaduto (401 e ricarica su /login) → il link", async () => {
  store = {};
  let m = await apriPagina("/clienti/27103");
  m.ricordaIngressoSeLink();              // apiFetch: 401 alla prima chiamata
  m = await apriPagina("/login");         // window.location.href = "/login"
  assert.equal(m.destinazioneDopoLogin(), "/clienti/27103");
  assert.equal(m.destinazioneDopoLogin(), "/", "il link si usa una volta sola");
});

caso("sessione scaduta mentre si lavora → Home", async () => {
  store = {};
  let m = await apriPagina("/vini/v2/cantina");
  m.segnaSessioneViva();                  // chiamate andate a buon fine
  vaiA("/clienti/lista");
  m.ricordaIngressoSeLink();              // 401 più tardi
  m = await apriPagina("/login");
  assert.equal(m.destinazioneDopoLogin(), "/");
});

caso("app aperta dalla Home col pass scaduto → Home", async () => {
  store = {};
  let m = await apriPagina("/");
  m.ricordaIngressoSeLink();
  m = await apriPagina("/login");
  assert.equal(m.destinazioneDopoLogin(), "/");
});

caso("«Esci» → Home (anche senza aver navigato)", async () => {
  store = {};
  const m = await apriPagina("/dipendenti/turni");
  m.segnaSessioneViva();
  m.dimenticaDestinazione();
  vaiA("/");                              // handleLogout: replaceState("/")
  assert.equal(m.destinazioneDopoLogin(), "/");
});

caso("pagina diversa dal link d'arrivo → Home", async () => {
  store = {};
  const m = await apriPagina("/clienti/27103");
  vaiA("/vini");
  assert.equal(m.destinazioneDopoLogin(), "/");
});

caso("indirizzi strani non diventano destinazioni", async () => {
  store = { trgb_dopo_login: "//altro-sito.it/x" };
  let m = await apriPagina("/login");
  assert.equal(m.destinazioneDopoLogin(), "/");
  store = {};
  m = await apriPagina("/accesso-q");
  assert.equal(m.destinazioneDopoLogin(), "/");
});

let falliti = 0;
for (const [nome, fn] of casi) {
  try { await fn(); console.log("ok  ", nome); }
  catch (e) { falliti++; console.log("FAIL", nome, "\n     ", e.message); }
}
console.log(`\n${casi.length - falliti}/${casi.length} ok`);
process.exit(falliti ? 1 : 0);
