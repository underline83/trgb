// @version: v2.2 — chiamate del modulo Comanda; ganci per riempire lo schermo su iPad e telefono (2026-11-24)
// Modulo: comande
import { useEffect, useLayoutEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

// Gli endpoint root dei router vogliono lo slash finale (/comande/conti/), gli altri no.
export async function api(path, { method = "GET", body } = {}) {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const det = data && data.detail;
    throw new Error(typeof det === "string" ? det : `Errore ${res.status}`);
  }
  return data;
}

export const euro = (v) =>
  v === null || v === undefined
    ? ""
    : Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

// «Subito» esiste solo sui conti nati con la 1.x (uscita 0); dalla 2.0 le uscite partono da 1.
export const nomeUscita = (n) => (n === 0 ? "Subito" : `Uscita ${n}`);

// I minuti li conta il server (minuti_aperto, minuti_andata): qui si scrivono soltanto.
export const durata = (min) =>
  min === null || min === undefined ? "" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;

export const utenteCorrente = () => localStorage.getItem("username") || "";

export const RUOLI_ADMIN = ["admin", "superadmin"];
export const isAdmin = () => RUOLI_ADMIN.includes(localStorage.getItem("role"));

// Schermo abbastanza grande per due pannelli affiancati (iPad dritto o sdraiato, computer).
// Un telefono, anche girato, resta a un pannello per volta.
export const SCHERMO_LARGO = "(min-width: 768px) and (min-height: 520px)";
export function useSchermoLargo(query = SCHERMO_LARGO) {
  const [si, setSi] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const senti = () => setSi(m.matches);
    senti();
    if (m.addEventListener) m.addEventListener("change", senti);
    else m.addListener(senti);
    return () => {
      if (m.removeEventListener) m.removeEventListener("change", senti);
      else m.removeListener(senti);
    };
  }, [query]);
  return si;
}

// Altezza che resta sotto un elemento fino in fondo allo schermo, misurata sul posto: così un
// pannello riempie lo schermo qualunque cosa ci sia sopra (testata di TRGB, barra del modulo,
// avvisi), senza numeri fissi. Torna [ref da mettere sull'elemento, altezza in px o null].
export function useAltezzaRestante(attivo = true, margine = 12) {
  const [nodo, setNodo] = useState(null);
  const [altezza, setAltezza] = useState(null);
  useLayoutEffect(() => {
    if (!attivo || !nodo) {
      setAltezza(null);
      return undefined;
    }
    const misura = () => {
      const cima = nodo.getBoundingClientRect().top + window.scrollY;
      setAltezza(Math.max(240, Math.round(window.innerHeight - cima - margine)));
    };
    misura();
    window.addEventListener("resize", misura);
    window.addEventListener("orientationchange", misura);
    // se cambia ciò che sta sopra (un avviso che compare, una riga che va a capo) si rimisura
    const oss = typeof ResizeObserver !== "undefined" ? new ResizeObserver(misura) : null;
    if (oss && nodo.parentElement) oss.observe(nodo.parentElement);
    return () => {
      window.removeEventListener("resize", misura);
      window.removeEventListener("orientationchange", misura);
      if (oss) oss.disconnect();
    };
  }, [attivo, nodo, margine]);
  return [setNodo, altezza];
}
