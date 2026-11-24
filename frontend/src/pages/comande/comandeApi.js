// @version: v1.0 — chiamate del modulo Comanda (2026-11-24)
// Modulo: comande
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

export const nomeUscita = (n) => (n === 0 ? "Subito" : `${n}ª uscita`);

export const RUOLI_ADMIN = ["admin", "superadmin"];
export const isAdmin = () => RUOLI_ADMIN.includes(localStorage.getItem("role"));
