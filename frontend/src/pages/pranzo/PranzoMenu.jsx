// FILE: frontend/src/pages/pranzo/PranzoMenu.jsx
// @version: v3.1 — Hotfix loop azioni + design turni preservato (sessione 58 cont., 2026-04-26)
//
// Cambiamenti vs v3.0:
//   - Eliminato il pattern register-callback (TabCompositore -> Toolbar):
//     causava re-render in cascata e bloccava i click sulla pagina.
//     Ora la pagina e' un unico componente: stato e handler tutti nel root,
//     niente child component con setState che chiamano setState del parent.
//   - Le azioni "PDF / Copia prec. / Elimina / Salva" vivono in una sub-toolbar
//     della card del compositore (in alto a destra), non piu' nella toolbar
//     principale. Il design dei turni e' preservato sulla LEFT (nav settimana)
//     e CENTER (segmented control).
//
// Pattern UI: derivato da FoglioSettimana.jsx (modulo Gestione Dipendenti).
// Pool piatti: search + filtro categoria, scalabile a centinaia di ricette.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, EmptyState } from "../../components/ui";
import RicetteNav from "../ricette/RicetteNav";

// ─────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────
const CATEGORIE = [
  { key: "antipasto", label: "Antipasto" },
  { key: "primo",     label: "Primo" },
  { key: "secondo",   label: "Secondo" },
  { key: "contorno",  label: "Contorno" },
  { key: "dolce",     label: "Dolce" },
  { key: "altro",     label: "Altro" },
];
const ORDINE_CAT = { antipasto: 1, primo: 2, secondo: 3, contorno: 4, dolce: 5, altro: 6 };
const MESI_ABBR = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

// ─────────────────────────────────────────────────────────────
// Helpers settimana (ISO week, allineati a Gestione Turni)
// ─────────────────────────────────────────────────────────────
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const fmtIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function lunediCorrente() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
}

function lunediDiIso(iso) {
  if (!iso) return fmtIso(lunediCorrente());
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return fmtIso(d);
}

function isoWeekOfMonday(mondayIso) {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `W${pad(wk)}`;
}

function shiftMonday(mondayIso, deltaWeeks) {
  const d = new Date(mondayIso + "T12:00:00");
  d.setDate(d.getDate() + deltaWeeks * 7);
  return fmtIso(d);
}

function labelWeekRange(mondayIso) {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const lun = new Date(y, m - 1, d);
  const ven = new Date(lun); ven.setDate(ven.getDate() + 4);
  if (lun.getMonth() === ven.getMonth()) {
    return `${lun.getDate()}–${ven.getDate()} ${MESI_ABBR[lun.getMonth()]} ${lun.getFullYear()}`;
  }
  if (lun.getFullYear() === ven.getFullYear()) {
    return `${lun.getDate()} ${MESI_ABBR[lun.getMonth()]} – ${ven.getDate()} ${MESI_ABBR[ven.getMonth()]} ${lun.getFullYear()}`;
  }
  return `${lun.getDate()} ${MESI_ABBR[lun.getMonth()]} ${lun.getFullYear()} – ${ven.getDate()} ${MESI_ABBR[ven.getMonth()]} ${ven.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────
// Pool piatti (componente puro: nessun setState del parent)
// ─────────────────────────────────────────────────────────────
function PoolPiatti({ pool, onPick }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const norm = (s) => (s || "").toLowerCase();

  const filtered = useMemo(() => {
    if (!pool) return [];
    const ql = norm(q.trim());
    return pool.filter((p) => {
      if (cat !== "all" && p.categoria !== cat) return false;
      if (!ql) return true;
      return norm(p.nome).includes(ql) || norm(p.menu_description).includes(ql);
    });
  }, [pool, q, cat]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((p) => {
      (map[p.categoria] = map[p.categoria] || []).push(p);
    });
    return CATEGORIE
      .map((c) => ({ ...c, items: map[c.key] || [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  if (pool === null) {
    return <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 text-sm text-neutral-500">Caricamento ricette…</div>;
  }
  if (pool.length === 0) {
    return (
      <EmptyState
        icon="🍳"
        title="Nessuna ricetta nel pool pranzo"
        description={
          <>
            Vai in <a href="/ricette/archivio" className="underline hover:text-orange-700">Gestione Cucina · Ricette</a> e
            spunta <em>Pranzo di lavoro</em> nei tipi servizio.
          </>
        }
      />
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-orange-900 font-playfair">
          Pool ricette · <span className="text-neutral-500 font-normal">{filtered.length} di {pool.length}</span>
        </h3>
        <a href="/ricette/archivio" className="text-[11px] text-neutral-400 hover:text-orange-700">Gestisci pool →</a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca piatto…"
            className="w-full border border-neutral-300 rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">⌕</span>
          {q && (
            <button onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs"
            >×</button>
          )}
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">Tutte le categorie</option>
          {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-neutral-500 italic py-6 text-center">
          Nessun piatto corrisponde ai filtri.
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto pr-1 -mr-1 space-y-3">
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                {g.label} · {g.items.length}
              </div>
              <div className="space-y-1">
                {g.items.map((p) => (
                  <button
                    key={p.recipe_id}
                    onClick={() => onPick(p)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-orange-50 hover:border-orange-300 transition text-sm"
                    title={p.menu_description || ""}
                  >
                    <span className="truncate">{p.nome}</span>
                    <span className="text-[11px] text-neutral-400 flex-shrink-0">+ aggiungi</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT ROOT — tutto inline (no child component con feedback callback)
// ─────────────────────────────────────────────────────────────
export default function PranzoMenu() {
  const [tab, setTab] = useState("compositore");
  const [settimana, setSettimanaState] = useState(fmtIso(lunediCorrente()));
  const setSettimana = useCallback((iso) => setSettimanaState(lunediDiIso(iso)), []);

  // Data sources
  const [piattiPool, setPiattiPool] = useState(null);
  const [menu, setMenu] = useState(null);
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Programmazione
  const [progN, setProgN] = useState(8);
  const [progData, setProgData] = useState(null);
  const [progLoading, setProgLoading] = useState(false);

  // ── Loaders ─────────────────────────────────────────────────
  const loadPool = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/piatti-disponibili/`);
      if (res.ok) {
        const d = await res.json();
        setPiattiPool(d.piatti || []);
      } else {
        setPiattiPool([]);
      }
    } catch {
      setPiattiPool([]);
    }
  }, []);

  const loadMenu = useCallback(async (mondayIso) => {
    setLoading(true); setMsg(null);

    // Helper: parsa la risposta in entrambi i possibili shape backend
    const handleData = (data) => {
      const m = data && Object.prototype.hasOwnProperty.call(data, "menu")
        ? data.menu
        : data;
      if (!m) {
        setMenu(null);
        setRighe([]);
      } else {
        setMenu(m);
        setRighe((m.righe || []).map((r, i) => ({
          recipe_id: r.recipe_id || null,
          nome: r.nome,
          categoria: r.categoria || "altro",
          ordine: r.ordine ?? i,
          note: r.note || "",
        })));
      }
    };

    // Tentativo 1: query string (workaround iter 10 per "Failed to fetch" su Safari)
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/by-week/?settimana=${mondayIso}`);
      if (res.ok) {
        handleData(await res.json());
        setLoading(false);
        return;
      }
      if (res.status !== 404) {
        // Diverso da 404 e diverso da OK: fallthrough al tentativo 2
        // eslint-disable-next-line no-console
        console.warn("[pranzo] by-week non OK", res.status);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[pranzo] by-week fail, retry path-param", e);
    }

    // Tentativo 2: path param (compat backend vecchio o se by-week non esiste)
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${mondayIso}/`);
      if (res.ok) {
        handleData(await res.json());
      } else if (res.status === 404) {
        setMenu(null); setRighe([]);
      } else {
        // Backend risponde ma non OK: pagina degradata, niente messaggio invasivo
        setMenu(null); setRighe([]);
        // eslint-disable-next-line no-console
        console.warn(`[pranzo] menu non disponibile (HTTP ${res.status})`);
      }
    } catch (e) {
      // Network fail su entrambi i tentativi: degrada gracefully
      // eslint-disable-next-line no-console
      console.error("[pranzo] loadMenu fail", e);
      setMenu(null); setRighe([]);
      // niente setMsg(): la card mostrerà l'empty state e Marco puo' comunque comporre
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProgrammazione = useCallback(async (n, anchor) => {
    setProgLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/programmazione/?n=${n}&fino_a=${anchor}`);
      if (res.ok) setProgData(await res.json());
      else setProgData({ settimane: [] });
    } catch {
      setProgData({ settimane: [] });
    } finally {
      setProgLoading(false);
    }
  }, []);

  // ── Effetti ─────────────────────────────────────────────────
  useEffect(() => { loadPool(); }, [loadPool]);

  useEffect(() => {
    if (tab === "compositore") loadMenu(settimana);
  }, [tab, settimana, loadMenu]);

  useEffect(() => {
    if (tab === "programmazione") loadProgrammazione(progN, settimana);
  }, [tab, progN, settimana, loadProgrammazione]);

  // ── Operazioni righe ────────────────────────────────────────
  const aggiungiRiga = (piatto) => {
    if (piatto) {
      setRighe((r) => [...r, {
        recipe_id: piatto.recipe_id,
        nome: piatto.nome,
        categoria: piatto.categoria,
        ordine: r.length,
      }]);
    } else {
      setRighe((r) => [...r, { recipe_id: null, nome: "", categoria: "altro", ordine: r.length }]);
    }
  };
  const aggiornaRiga = (idx, patch) =>
    setRighe((rr) => rr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const rimuoviRiga = (idx) => setRighe((rr) => rr.filter((_, i) => i !== idx));
  const muoviRiga = (idx, dir) => {
    setRighe((rr) => {
      const target = idx + dir;
      if (target < 0 || target >= rr.length) return rr;
      const arr = [...rr];
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((r, i) => ({ ...r, ordine: i }));
    });
  };
  const ordinaPerCategoria = () => {
    setRighe((rr) =>
      [...rr]
        .sort((a, b) => (ORDINE_CAT[a.categoria] || 99) - (ORDINE_CAT[b.categoria] || 99) || (a.ordine ?? 0) - (b.ordine ?? 0))
        .map((r, i) => ({ ...r, ordine: i }))
    );
  };

  // ── Azioni ──────────────────────────────────────────────────
  const salva = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload = {
        settimana,
        righe: righe.filter((r) => (r.nome || "").trim()).map((r, i) => ({
          recipe_id: r.recipe_id || null,
          nome: (r.nome || "").trim(),
          categoria: r.categoria,
          ordine: i,
          note: r.note || null,
        })),
      };
      const res = await apiFetch(`${API_BASE}/pranzo/menu/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const m = await res.json();
      setMenu(m);
      setMsg({ tipo: "ok", text: "Settimana salvata." });
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const elimina = async () => {
    if (!menu) return;
    if (!window.confirm(`Eliminare il menu della ${labelWeekRange(settimana)}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${settimana}/`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMenu(null); setRighe([]);
      setMsg({ tipo: "ok", text: "Menu eliminato." });
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    }
  };

  const apriPdf = (mondayIso = settimana) => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/pranzo/menu/${mondayIso}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch((e) => setMsg({ tipo: "err", text: `PDF: ${e.message}` }));
  };

  const copiaSettimanaPrecedente = async () => {
    const prevMon = shiftMonday(settimana, -1);
    const fetchPrev = async () => {
      // Stesso fallback by-week → path-param di loadMenu
      try {
        const r = await apiFetch(`${API_BASE}/pranzo/menu/by-week/?settimana=${prevMon}`);
        if (r.ok) return await r.json();
      } catch { /* fallthrough */ }
      const r2 = await apiFetch(`${API_BASE}/pranzo/menu/${prevMon}/`);
      if (r2.status === 404) return { menu: null };
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      return await r2.json();
    };
    try {
      const data = await fetchPrev();
      const prev = data && Object.prototype.hasOwnProperty.call(data, "menu") ? data.menu : data;
      if (!prev || !(prev.righe || []).length) {
        setMsg({ tipo: "err", text: "Settimana precedente vuota, niente da copiare." });
        return;
      }
      setRighe((prev.righe || []).map((r, i) => ({
        recipe_id: r.recipe_id || null,
        nome: r.nome,
        categoria: r.categoria || "altro",
        ordine: i,
      })));
      setMsg({ tipo: "ok", text: `Copiati ${prev.righe.length} piatti dalla ${labelWeekRange(prevMon)}. Salva per persistere.` });
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    }
  };

  const eliminaSettimana = async (mondayIso) => {
    if (!window.confirm(`Eliminare il menu della settimana ${labelWeekRange(mondayIso)}?`)) return;
    const res = await apiFetch(`${API_BASE}/pranzo/menu/${mondayIso}/`, { method: "DELETE" });
    if (res.ok) loadProgrammazione(progN, settimana);
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="pranzo" />
      <div className="p-4 sm:p-6">
        <div className="max-w-[1600px] mx-auto">

          {/* TOOLBAR — pattern Gestione Turni */}
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* LEFT: nav settimana */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setSettimana(shiftMonday(settimana, -1))}
                  className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  title="Settimana precedente"
                >◀</button>
                <div className="min-h-[44px] px-3 flex items-center bg-white border border-neutral-300 rounded-lg text-sm gap-2">
                  <span className="text-neutral-900">{labelWeekRange(settimana)}</span>
                  <span className="text-neutral-400 font-mono text-xs">· {isoWeekOfMonday(settimana)}</span>
                </div>
                <button
                  onClick={() => setSettimana(shiftMonday(settimana, +1))}
                  className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  title="Settimana successiva"
                >▶</button>
                <button
                  onClick={() => setSettimana(fmtIso(lunediCorrente()))}
                  className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm text-neutral-700"
                  title="Vai a oggi"
                >Oggi</button>
              </div>

              {/* CENTER: segmented control */}
              <div className="flex-1 flex justify-center min-w-[260px]">
                <div className="inline-flex bg-neutral-200 rounded-lg p-1 gap-1">
                  <button
                    onClick={() => setTab("compositore")}
                    className={
                      "min-h-[38px] px-4 rounded-md text-sm font-medium " +
                      (tab === "compositore"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-white/60")
                    }
                  >Settimana</button>
                  <button
                    onClick={() => setTab("programmazione")}
                    className={
                      "min-h-[38px] px-4 rounded-md text-sm font-medium " +
                      (tab === "programmazione"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-white/60")
                    }
                  >Programmazione</button>
                </div>
              </div>

              {/* RIGHT: shortcut globali */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href="/ricette/archivio" className="text-[11px] text-neutral-500 hover:text-orange-700">Gestisci ricette →</a>
                <a href="/ricette/settings" className="text-[11px] text-neutral-500 hover:text-orange-700">Impostazioni →</a>
              </div>
            </div>
          </div>

          {/* MESSAGES */}
          {msg && (
            <div className={"text-sm rounded-lg px-3 py-2 mb-3 border " +
              (msg.tipo === "ok" ? "text-green-700 bg-green-50 border-green-200"
                                  : "text-red-700 bg-red-50 border-red-200")}>
              {msg.text}
            </div>
          )}

          {/* TAB COMPOSITORE */}
          {tab === "compositore" && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              {/* CARD principale: piatti della settimana */}
              <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-base font-semibold text-orange-900 font-playfair">
                    Piatti della settimana
                    {loading && <span className="ml-2 text-xs text-neutral-400 font-normal">caricamento…</span>}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="ghost" size="sm" onClick={ordinaPerCategoria}>↕ Ordina</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => aggiungiRiga(null)}>+ Riga ad-hoc</Btn>
                    <Btn variant="ghost" size="sm" onClick={copiaSettimanaPrecedente}>📋 Copia prec.</Btn>
                    {menu && <Btn variant="secondary" size="sm" onClick={() => apriPdf()}>📄 PDF</Btn>}
                    {menu && <Btn variant="danger" size="sm" onClick={elimina}>Elimina</Btn>}
                    <Btn variant="success" size="sm" onClick={salva} loading={saving}>
                      {menu ? "Aggiorna" : "Crea menu"}
                    </Btn>
                  </div>
                </div>

                {righe.length === 0 ? (
                  <div className="text-center text-neutral-500 py-10 italic text-sm">
                    Nessun piatto. Cerca dal pool a destra o aggiungi una riga ad-hoc.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {righe.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => muoviRiga(i, -1)} disabled={i === 0}
                            className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30 text-xs px-1">▲</button>
                          <button onClick={() => muoviRiga(i, +1)} disabled={i === righe.length - 1}
                            className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30 text-xs px-1">▼</button>
                        </div>
                        <select
                          value={r.categoria}
                          onChange={(e) => aggiornaRiga(i, { categoria: e.target.value })}
                          className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white"
                        >
                          {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <input
                          value={r.nome}
                          onChange={(e) => aggiornaRiga(i, { nome: e.target.value, recipe_id: null })}
                          placeholder="Nome piatto"
                          className="flex-1 min-w-[200px] border border-neutral-300 rounded px-2 py-1 text-sm"
                        />
                        {r.recipe_id && (
                          <span className="text-[10px] uppercase tracking-wide text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                            ricetta #{r.recipe_id}
                          </span>
                        )}
                        <button
                          onClick={() => rimuoviRiga(i)}
                          className="text-red-600 hover:text-red-900 text-sm px-2"
                          title="Elimina riga"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SIDE: pool */}
              <PoolPiatti pool={piattiPool} onPick={aggiungiRiga} />
            </div>
          )}

          {/* TAB PROGRAMMAZIONE */}
          {tab === "programmazione" && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-base font-semibold text-orange-900 font-playfair">
                  Programmazione · ultime {progN} settimane
                </h3>
                <div className="flex items-center gap-2">
                  <select value={progN} onChange={(e) => setProgN(Number(e.target.value))}
                    className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {[4, 6, 8, 12, 16, 26, 52].map((x) => <option key={x} value={x}>{x} settimane</option>)}
                  </select>
                  <Btn variant="ghost" size="sm" onClick={() => loadProgrammazione(progN, settimana)}>↻ Aggiorna</Btn>
                  <span className="text-xs text-neutral-500">
                    {progLoading ? "caricamento…" : `${progData?.settimane?.length || 0} con menu`}
                  </span>
                </div>
              </div>

              {(!progData || (progData.settimane || []).length === 0) ? (
                <EmptyState
                  icon="📊"
                  title="Nessuna settimana programmata"
                  description="Crea il primo menu dalla tab Settimana."
                />
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${progData.settimane.length}, minmax(220px, 1fr))` }}>
                    {progData.settimane.map((s) => {
                      const byCat = {};
                      (s.righe || []).forEach((r) => {
                        (byCat[r.categoria || "altro"] = byCat[r.categoria || "altro"] || []).push(r);
                      });
                      return (
                        <div key={s.id} className="bg-neutral-50 rounded-xl border border-neutral-200 p-3 flex flex-col">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="text-xs uppercase tracking-wider text-neutral-500">{labelWeekRange(s.settimana_inizio)}</div>
                              <div className="text-[10px] text-neutral-400">
                                {s.righe?.length || 0} piatti · {isoWeekOfMonday(s.settimana_inizio)}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => apriPdf(s.settimana_inizio)}
                                title="Apri PDF"
                                className="text-xs px-1.5 py-0.5 hover:bg-orange-50 rounded"
                              >📄</button>
                              <button
                                onClick={() => eliminaSettimana(s.settimana_inizio)}
                                title="Elimina"
                                className="text-xs px-1.5 py-0.5 hover:bg-red-50 text-red-600 rounded"
                              >🗑</button>
                            </div>
                          </div>
                          <div className="space-y-1.5 text-xs flex-1">
                            {CATEGORIE.map((c) => {
                              const items = byCat[c.key] || [];
                              if (items.length === 0) return null;
                              return (
                                <div key={c.key}>
                                  <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-0.5">{c.label}</div>
                                  {items.map((it, i) => (
                                    <div key={i} className="text-neutral-700 leading-tight">{it.nome}</div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
