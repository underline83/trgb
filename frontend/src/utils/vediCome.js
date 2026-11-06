// FILE: frontend/src/utils/vediCome.js
// @version: v1.0 — «Vedi come» del superadmin (2026-11-06) — modulo platform [core]
//
// Il superadmin vede TRGB come una persona (suo ruolo + suo dipendente) o come un
// ruolo «vuoto». La sicurezza è tutta nel backend (app/services/vedi_come.py): qui
// si scambiano solo i pass in localStorage.
//
// Durante «Vedi come»:
//   token/role/username/display_name = quelli di X (menu, Home, «I miei» ecc.)
//   vero_token/vero_role/vero_username/vero_display_name = il superadmin, messi da parte
//   vedi_come = {id, nome, ruolo, username, fino, chi}
// «Torna a me» (o scadenza): POST /auth/vedi-come/fine col pass VERO, che scrive la
// fine nel registro e restituisce un pass vero rinnovato.

import { API_BASE } from "../config/api";

const CHIAVI = ["token", "role", "username", "display_name"];

export function statoVediCome() {
  try {
    const s = localStorage.getItem("vedi_come");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function puoVediCome() {
  return localStorage.getItem("role") === "superadmin"
    && localStorage.getItem("username") !== "Q"
    && !statoVediCome();
}

export async function iniziaVediCome({ username, ruolo }) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/auth/vedi-come/inizia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(username ? { username } : { ruolo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Errore ${res.status}`);
  for (const k of CHIAVI) {
    const v = localStorage.getItem(k);
    if (v !== null) localStorage.setItem(`vero_${k}`, v);
  }
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("username", data.username || "");
  localStorage.setItem("display_name", data.display_name || "");
  localStorage.setItem("vedi_come", JSON.stringify(data.vedi_come));
  sessionStorage.removeItem("trgb_gm"); // niente modalità gestione mentre si è un altro
  window.location.href = "/";
}

let _uscendo = false;

// scaduto=true quando ce ne accorgiamo per scadenza o 401; reload=false nel logout
export async function tornaAMe({ scaduto = false, reload = true } = {}) {
  if (_uscendo) return;
  _uscendo = true;
  const stato = statoVediCome();
  const vero = localStorage.getItem("vero_token");
  let nuovo = null;
  if (stato && vero) {
    try {
      const res = await fetch(`${API_BASE}/auth/vedi-come/fine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vero}` },
        body: JSON.stringify({ id: stato.id, scaduto }),
      });
      if (res.ok) nuovo = await res.json();
    } catch { /* rete: si torna comunque al pass vero */ }
  }
  for (const k of CHIAVI) {
    const v = localStorage.getItem(`vero_${k}`);
    if (v !== null) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
    localStorage.removeItem(`vero_${k}`);
  }
  if (nuovo?.access_token) localStorage.setItem("token", nuovo.access_token);
  localStorage.removeItem("vedi_come");
  if (reload) window.location.href = "/";
}

// Logout mentre si è «come X»: chiude la riga del registro (senza aspettare) e
// butta via i pass messi da parte, così il logout non riporta dentro nessuno.
export function chiudiPerLogout() {
  const stato = statoVediCome();
  const vero = localStorage.getItem("vero_token");
  if (stato && vero) {
    try {
      fetch(`${API_BASE}/auth/vedi-come/fine`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vero}` },
        body: JSON.stringify({ id: stato.id }),
      }).catch(() => {});
    } catch { /* niente */ }
  }
  for (const k of CHIAVI) localStorage.removeItem(`vero_${k}`);
  localStorage.removeItem("vedi_come");
}
