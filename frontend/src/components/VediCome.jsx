// FILE: frontend/src/components/VediCome.jsx
// @version: v1.0 — «Vedi come» del superadmin (2026-11-06) — modulo platform [core]
//
// <VediComeStriscia />  striscia fissa in alto finché si è «come X», con «Torna a me»
//                       e il conto alla rovescia; alla scadenza torna da sola.
// <VediComeBottone />   👁 nell'intestazione, solo al superadmin vero: sceglie una
//                       persona (suo ruolo + suo dipendente) o un ruolo «vuoto».
// La logica dei pass è in utils/vediCome.js, i permessi veri nel backend.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../config/api";
import { statoVediCome, puoVediCome, iniziaVediCome, tornaAMe } from "../utils/vediCome";
import Tooltip from "./Tooltip";

const RUOLI = [
  ["admin", "Admin"], ["contabile", "Contabile"], ["chef", "Chef"], ["sous_chef", "Sous chef"],
  ["commis", "Commis"], ["sommelier", "Sommelier"], ["capo_sala", "Capo sala"], ["sala", "Sala"],
  ["viewer", "Viewer"],
];
const NOME_RUOLO = Object.fromEntries(RUOLI);

function norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function VediComeStriscia() {
  const stato = statoVediCome();
  const [ora, setOra] = useState(() => Date.now());

  useEffect(() => {
    if (!stato) return;
    const t = setInterval(() => setOra(Date.now()), 15000);
    return () => clearInterval(t);
  }, [stato?.id]);

  const restano = stato ? Math.ceil((stato.fino * 1000 - ora) / 60000) : 0;
  useEffect(() => {
    if (stato && restano <= 0) tornaAMe({ scaduto: true });
  }, [stato?.id, restano]);

  // l'intestazione (anche lei sticky) scende sotto la striscia: altezza in --vedi-come-h
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const metti = () => document.documentElement.style.setProperty("--vedi-come-h", `${el ? el.offsetHeight : 0}px`);
    metti();
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(metti);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--vedi-come-h"); };
  }, [stato?.id]);

  if (!stato) return null;
  const chi = stato.username ? stato.nome : (NOME_RUOLO[stato.ruolo] || stato.ruolo);
  const ruolo = NOME_RUOLO[stato.ruolo] || stato.ruolo;
  return (
    <div ref={ref} className="sticky top-0 z-[60] bg-amber-400 text-amber-950 text-sm px-4 py-2 flex items-center justify-center gap-3 flex-wrap shadow">
      <span>
        👁 Stai vedendo come <strong>{chi}</strong>
        {stato.username ? <> ({ruolo.toLowerCase()})</> : <> (ruolo vuoto, senza dipendente)</>}
        <span className="opacity-70"> · i salvataggi restano a nome «{stato.chi} (come {stato.username ? stato.nome : `ruolo ${stato.ruolo}`})» · {restano > 0 ? `${restano} min` : "scade ora"}</span>
      </span>
      <button
        onClick={() => tornaAMe()}
        className="px-3 py-1 rounded-lg bg-amber-950 text-amber-50 font-semibold text-xs hover:bg-black transition"
      >
        Torna a me
      </button>
    </div>
  );
}

export function VediComeBottone() {
  const [aperto, setAperto] = useState(false);
  const [utenti, setUtenti] = useState(null);
  const [cerca, setCerca] = useState("");
  const [errore, setErrore] = useState("");
  const [lavoro, setLavoro] = useState(false);

  useEffect(() => {
    if (!aperto || utenti) return;
    apiFetch(`${API_BASE}/auth/users/`)
      .then((r) => r.json())
      .then((d) => setUtenti(Array.isArray(d) ? d : []))
      .catch(() => setUtenti([]));
  }, [aperto, utenti]);

  const persone = useMemo(() => {
    const me = localStorage.getItem("username");
    const q = norm(cerca.trim());
    return (utenti || [])
      .filter((u) => u.username !== me && u.role !== "superadmin")
      .filter((u) => !q || norm(`${u.display_name} ${u.username} ${u.role}`).includes(q))
      .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
  }, [utenti, cerca]);

  if (!puoVediCome()) return null;

  async function scegli(sel) {
    setErrore(""); setLavoro(true);
    try { await iniziaVediCome(sel); }
    catch (e) { setErrore(e.message); setLavoro(false); }
  }

  return (
    <div className="relative">
      <Tooltip label="Vedi come…" placement="bottom" disableOnTouch>
        <button
          onClick={() => setAperto((v) => !v)}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition"
        >
          👁
        </button>
      </Tooltip>
      {aperto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAperto(false)} />
          <div className="absolute right-0 mt-2 z-50 w-[min(20rem,calc(100vw-2rem))] bg-white rounded-xl shadow-lg border border-neutral-200 p-3 max-h-[70vh] overflow-y-auto">
            <div className="text-sm font-semibold text-brand-ink">Vedi come…</div>
            <div className="text-xs text-neutral-500 mb-2">
              Menu, Home e permessi di chi scegli. Puoi salvare: l'autore resta il tuo, «(come …)».
            </div>
            <input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca una persona"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-1 mb-1">Una persona</div>
            {utenti === null && <div className="text-sm text-neutral-400 px-1 py-2">Carico…</div>}
            {persone.map((u) => (
              <button
                key={u.username}
                disabled={lavoro}
                onClick={() => scegli({ username: u.username })}
                className="w-full text-left px-2 py-2 min-h-[44px] rounded-lg hover:bg-amber-50 text-sm flex items-center justify-between gap-2"
              >
                <span>{u.display_name || u.username}</span>
                <span className="text-xs text-neutral-400">
                  {NOME_RUOLO[u.role] || u.role}{u.dipendente_id ? "" : " · senza dipendente"}
                </span>
              </button>
            ))}
            {utenti && persone.length === 0 && <div className="text-sm text-neutral-400 px-1 py-2">Nessuno</div>}
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mt-3 mb-1">Oppure un ruolo vuoto (senza dipendente)</div>
            <div className="flex flex-wrap gap-1.5">
              {RUOLI.map(([r, nome]) => (
                <button
                  key={r}
                  disabled={lavoro}
                  onClick={() => scegli({ ruolo: r })}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs text-neutral-700 hover:bg-amber-50 hover:border-amber-200"
                >
                  {nome}
                </button>
              ))}
            </div>
            {errore && <div className="text-xs text-red-700 mt-2">{errore}</div>}
          </div>
        </>
      )}
    </div>
  );
}
