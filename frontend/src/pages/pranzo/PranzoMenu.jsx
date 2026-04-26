// FILE: frontend/src/pages/pranzo/PranzoMenu.jsx
// @version: v3.0 — Allineato al design Gestione Turni (sessione 58 cont., 2026-04-26)
//
// Sub-modulo "Menu Pranzo" di Gestione Cucina.
// Pagina = compositore puro. Pattern UI replicato da FoglioSettimana / PerDipendente
// (modulo Gestione Dipendenti · Turni):
//   - toolbar 3-sezioni: LEFT nav settimana ◀ [range · W##] ▶ Oggi · CENTER segmented
//     control "Settimana | Programmazione" · RIGHT azioni primary + overflow ⋯
//   - ISO week format YYYY-Www come label informativa, settimana_inizio (lunedi
//     YYYY-MM-DD) come chiave verso il backend
//   - card bianca contenuto su bg-brand-cream
// Pool piatti: input search + chip categoria + lista raggruppata scrollabile —
// pensata per scalare a 50-100 ricette pranzo senza saturare lo spazio.
// Tab Programmazione: griglia N colonne (4/6/8/12/16/26/52) come PerDipendente.

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
// Helpers data — ISO week, allineati a Gestione Turni
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
  return `${date.getUTCFullYear()}-W${pad(wk)}`;
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

const settimanaShort = (mondayIso) => labelWeekRange(mondayIso);

// ─────────────────────────────────────────────────────────────
// Toolbar 3-sezioni (replica FoglioSettimana)
// ─────────────────────────────────────────────────────────────
function Toolbar({ tab, setTab, settimana, setSettimana, actions }) {
  return (
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
            <span className="text-neutral-400 font-mono text-xs">· {isoWeekOfMonday(settimana).split("-")[1]}</span>
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
                  ? "bg-white text-neutral-900 shadow-sm cursor-default"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-white/60")
              }
              title="Compositore della settimana corrente"
            >Settimana</button>
            <button
              onClick={() => setTab("programmazione")}
              className={
                "min-h-[38px] px-4 rounded-md text-sm font-medium " +
                (tab === "programmazione"
                  ? "bg-white text-neutral-900 shadow-sm cursor-default"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-white/60")
              }
              title="Vista comparativa N settimane"
            >Programmazione</button>
          </div>
        </div>

        {/* RIGHT: azioni */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pool piatti — search + filtro categoria + lista raggruppata
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
            Per popolare il pool vai in <a href="/ricette/archivio" className="underline hover:text-orange-700">Gestione Cucina · Ricette</a> e
            associa le ricette al tipo servizio <em>Pranzo di lavoro</em>.
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
        <div className="relative flex-1 min-w-[200px]">
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
// TAB COMPOSITORE
// ─────────────────────────────────────────────────────────────
function TabCompositore({ piattiPool, settimana, setSettimana, refreshArchivio, registerActions }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [righe, setRighe] = useState([]);

  const loadMenu = useCallback(async (mondayIso) => {
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${mondayIso}/`);
      if (res.status === 404) {
        setMenu(null);
        setRighe([]);
      } else if (res.ok) {
        const m = await res.json();
        setMenu(m);
        setRighe((m.righe || []).map((r, i) => ({
          recipe_id: r.recipe_id || null,
          nome: r.nome,
          categoria: r.categoria || "altro",
          ordine: r.ordine ?? i,
          note: r.note || "",
        })));
      } else {
        setMsg({ tipo: "err", text: `Errore caricamento (${res.status})` });
      }
    } catch (e) {
      setMsg({ tipo: "err", text: `Errore: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMenu(settimana); }, [settimana, loadMenu]);

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

  const salva = useCallback(async () => {
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
      refreshArchivio?.();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  }, [settimana, righe, refreshArchivio]);

  const elimina = useCallback(async () => {
    if (!menu) return;
    if (!window.confirm(`Eliminare il menu della ${labelWeekRange(settimana)}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${settimana}/`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMenu(null); setRighe([]);
      setMsg({ tipo: "ok", text: "Menu eliminato." });
      refreshArchivio?.();
    } catch (e) { setMsg({ tipo: "err", text: e.message }); }
  }, [menu, settimana, refreshArchivio]);

  const apriPdf = useCallback(() => {
    if (!menu) return;
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/pranzo/menu/${settimana}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch((e) => setMsg({ tipo: "err", text: `PDF: ${e.message}` }));
  }, [menu, settimana]);

  const copiaSettimanaPrecedente = useCallback(async () => {
    const prevMon = shiftMonday(settimana, -1);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${prevMon}/`);
      if (res.status === 404) {
        setMsg({ tipo: "err", text: "Settimana precedente vuota, niente da copiare." });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const prev = await res.json();
      const nuove = (prev.righe || []).map((r, i) => ({
        recipe_id: r.recipe_id || null,
        nome: r.nome,
        categoria: r.categoria || "altro",
        ordine: i,
      }));
      setRighe(nuove);
      setMsg({ tipo: "ok", text: `Copiati ${nuove.length} piatti dalla ${labelWeekRange(prevMon)}. Ricordati di salvare.` });
    } catch (e) { setMsg({ tipo: "err", text: e.message }); }
  }, [settimana]);

  // Pubblica le azioni al parent (Toolbar a destra)
  useEffect(() => {
    registerActions(
      <>
        {menu && <Btn variant="secondary" size="md" onClick={apriPdf}>📄 PDF</Btn>}
        <Btn variant="ghost" size="md" onClick={copiaSettimanaPrecedente}>📋 Copia prec.</Btn>
        {menu && <Btn variant="danger" size="md" onClick={elimina}>Elimina</Btn>}
        <Btn variant="success" size="md" onClick={salva} loading={saving}>
          {menu ? "Aggiorna" : "Crea menu"}
        </Btn>
      </>
    );
    return () => registerActions(null);
  }, [menu, saving, apriPdf, copiaSettimanaPrecedente, elimina, salva, registerActions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* CONTENUTO: lista righe */}
      <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-orange-900 font-playfair">
            Piatti della settimana
            {loading && <span className="ml-2 text-xs text-neutral-400 font-normal">caricamento…</span>}
          </h3>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={ordinaPerCategoria}>↕ Ordina</Btn>
            <Btn variant="ghost" size="sm" onClick={() => aggiungiRiga(null)}>+ Riga ad-hoc</Btn>
          </div>
        </div>

        {msg && (
          <div className={"text-sm rounded-lg px-3 py-2 mb-3 border " +
            (msg.tipo === "ok" ? "text-green-700 bg-green-50 border-green-200"
                                : "text-red-700 bg-red-50 border-red-200")}>
            {msg.text}
          </div>
        )}

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

      {/* SIDE PANEL: pool */}
      <PoolPiatti pool={piattiPool} onPick={aggiungiRiga} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB PROGRAMMAZIONE — griglia N settimane (replica PerDipendente)
// ─────────────────────────────────────────────────────────────
function TabProgrammazione({ settimana, registerActions, refreshArchivio }) {
  const [n, setN] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/programmazione/?n=${n}&fino_a=${settimana}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [n, settimana]);

  useEffect(() => { load(); }, [load]);

  // azioni toolbar
  useEffect(() => {
    registerActions(
      <>
        <select value={n} onChange={(e) => setN(Number(e.target.value))}
          className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg text-sm"
          title="Numero settimane visualizzate">
          {[4, 6, 8, 12, 16, 26, 52].map((x) => <option key={x} value={x}>{x} settimane</option>)}
        </select>
        <Btn variant="ghost" size="md" onClick={load}>↻ Aggiorna</Btn>
      </>
    );
    return () => registerActions(null);
  }, [n, load, registerActions]);

  const apriPdfData = (mondayIso) => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/pranzo/menu/${mondayIso}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
  };

  const elimina = async (mondayIso) => {
    if (!window.confirm(`Eliminare il menu della settimana del ${mondayIso}?`)) return;
    const res = await apiFetch(`${API_BASE}/pranzo/menu/${mondayIso}/`, { method: "DELETE" });
    if (res.ok) { load(); refreshArchivio?.(); }
  };

  const settimane = data?.settimane || [];

  return (
    <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-orange-900 font-playfair">
          Programmazione · ultime {n} settimane
        </h3>
        <span className="text-xs text-neutral-500">
          {loading ? "caricamento…" : `${settimane.length} con menu`}
        </span>
      </div>

      {settimane.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nessuna settimana programmata"
          description="Crea il primo menu dalla tab Settimana."
        />
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${settimane.length}, minmax(220px, 1fr))` }}>
            {settimane.map((s) => {
              const byCat = {};
              (s.righe || []).forEach((r) => {
                (byCat[r.categoria || "altro"] = byCat[r.categoria || "altro"] || []).push(r);
              });
              return (
                <div key={s.id} className="bg-neutral-50 rounded-xl border border-neutral-200 p-3 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-neutral-500">{settimanaShort(s.settimana_inizio)}</div>
                      <div className="text-[10px] text-neutral-400">
                        {s.righe?.length || 0} piatti · W{isoWeekOfMonday(s.settimana_inizio).split("-")[1]}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => apriPdfData(s.settimana_inizio)}
                        title="Apri PDF"
                        className="text-xs px-1.5 py-0.5 hover:bg-orange-50 rounded"
                      >📄</button>
                      <button
                        onClick={() => elimina(s.settimana_inizio)}
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
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT ROOT
// ─────────────────────────────────────────────────────────────
export default function PranzoMenu() {
  const [tab, setTab] = useState("compositore");
  const [settimana, setSettimana] = useState(fmtIso(lunediCorrente()));
  const [piattiPool, setPiattiPool] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actions, setActionsState] = useState(null);

  const loadPool = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/pranzo/piatti-disponibili/`);
    if (res.ok) {
      const d = await res.json();
      setPiattiPool(d.piatti || []);
    } else {
      setPiattiPool([]);
    }
  }, []);

  useEffect(() => { loadPool(); }, [loadPool]);

  const refreshAll = () => setReloadKey((x) => x + 1);
  const registerActions = useCallback((node) => setActionsState(node), []);

  // Quando l'utente passa di tab, normalizza la settimana al lunedi
  const onSetSettimana = (iso) => setSettimana(lunediDiIso(iso));

  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="pranzo" />
      <div className="p-4 sm:p-6">
        <div className="max-w-[1600px] mx-auto">
          <Toolbar
            tab={tab}
            setTab={setTab}
            settimana={settimana}
            setSettimana={onSetSettimana}
            actions={actions}
          />

          {tab === "compositore" && (
            <TabCompositore
              key={reloadKey}
              piattiPool={piattiPool}
              settimana={settimana}
              setSettimana={onSetSettimana}
              refreshArchivio={refreshAll}
              registerActions={registerActions}
            />
          )}
          {tab === "programmazione" && (
            <TabProgrammazione
              key={reloadKey}
              settimana={settimana}
              registerActions={registerActions}
              refreshArchivio={refreshAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
