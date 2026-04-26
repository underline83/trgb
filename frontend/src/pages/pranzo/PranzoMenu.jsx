// FILE: frontend/src/pages/pranzo/PranzoMenu.jsx
// @version: v2.0 — Compositore Menu Pranzo SETTIMANALE (sessione 58 cont., 2026-04-26)
//
// Sub-modulo "Menu Pranzo" di Gestione Cucina.
// La pagina e' SOLO un compositore:
//   - selezione settimana (week picker)
//   - scelta piatti dal pool delle ricette con service_type "Pranzo di lavoro"
//   - vista Programmazione: ultime N settimane in colonne per non ripetersi
//
// Cosa NON e' qui (decisione di Marco, S58 cont.):
//   - prezzi Menù Business      → Impostazioni Cucina sidebar "Menu Pranzo"
//   - testata / sottotitolo     → Impostazioni Cucina
//   - footer note               → Impostazioni Cucina
//   - catalogo piatti           → ricette con service_type "Pranzo di lavoro"
//                                 (gestiti in Gestione Cucina · Ricette)
//
// Wrapper visivo: RicetteNav in alto + bg-brand-cream + card bianca shadow-2xl
// rounded-3xl, identico a RicetteArchivio/RicetteSettings.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, EmptyState } from "../../components/ui";
import RicetteNav from "../ricette/RicetteNav";

// ─────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────
const CATEGORIE = [
  { key: "antipasto", label: "Antipasto", emoji: "🥗" },
  { key: "primo",     label: "Primo",     emoji: "🍝" },
  { key: "secondo",   label: "Secondo",   emoji: "🥩" },
  { key: "contorno",  label: "Contorno",  emoji: "🥦" },
  { key: "dolce",     label: "Dolce",     emoji: "🍰" },
  { key: "altro",     label: "Altro",     emoji: "🍽️" },
];
const ORDINE_CAT = { antipasto: 1, primo: 2, secondo: 3, contorno: 4, dolce: 5, altro: 6 };

// ─── Helpers settimana ────────────────────────────────────────
const fmtIso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const lunediDi = (iso) => {
  if (!iso) return fmtIso(lunediCorrente());
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setDate(d.getDate() - dow);
  return fmtIso(d);
};

const lunediCorrente = () => {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
};

const formatSettimana = (mondayIso) => {
  if (!mondayIso) return "";
  const lun = new Date(mondayIso + "T12:00:00");
  const ven = new Date(lun);
  ven.setDate(ven.getDate() + 4);
  const optMese = { day: "numeric", month: "long" };
  const lunStr = lun.toLocaleDateString("it-IT", optMese);
  const venStr = ven.toLocaleDateString("it-IT", optMese);
  return `Settimana del ${lunStr} – ${venStr} ${lun.getFullYear()}`;
};

const settimanaShort = (mondayIso) => {
  if (!mondayIso) return "";
  const lun = new Date(mondayIso + "T12:00:00");
  const ven = new Date(lun);
  ven.setDate(ven.getDate() + 4);
  const optMese = { day: "numeric", month: "short" };
  return `${lun.toLocaleDateString("it-IT", optMese)} – ${ven.toLocaleDateString("it-IT", optMese)}`;
};

const aggiungiSettimane = (mondayIso, n) => {
  const d = new Date(mondayIso + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return fmtIso(d);
};

// ─────────────────────────────────────────────────────────────
// Tab nav
// ─────────────────────────────────────────────────────────────
function TabNav({ tab, setTab }) {
  const tabs = [
    { key: "compositore",   label: "Settimana",      emoji: "📅" },
    { key: "programmazione", label: "Programmazione", emoji: "📊" },
  ];
  return (
    <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3 mb-4 items-center">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={
            "px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap " +
            (tab === t.key
              ? "bg-orange-100 text-orange-900 shadow-sm"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800")
          }
        >
          <span className="mr-1">{t.emoji}</span>{t.label}
        </button>
      ))}
      <a
        href="/ricette/archivio"
        className="ml-3 text-[11px] text-neutral-400 hover:text-orange-700 transition"
        title="Gestisci le ricette pranzo (service_type Pranzo di lavoro)"
      >📚 Gestisci ricette →</a>
      <a
        href="/ricette/settings"
        className="ml-auto text-[11px] text-neutral-400 hover:text-orange-700 transition"
        title="Prezzi, testata, footer del menu pranzo"
      >⚙️ Impostazioni →</a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 1: COMPOSITORE settimana
// ─────────────────────────────────────────────────────────────
function TabCompositore({ piattiPool, refreshArchivio }) {
  const [settimana, setSettimana] = useState(fmtIso(lunediCorrente()));
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [righe, setRighe] = useState([]);

  const loadMenu = useCallback(async (mondayIso) => {
    setLoading(true);
    setMsg(null);
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

  // ── azioni righe ──
  const aggiungiRiga = (piatto) => {
    if (piatto) {
      setRighe([...righe, {
        recipe_id: piatto.recipe_id,
        nome: piatto.nome,
        categoria: piatto.categoria,
        ordine: righe.length,
      }]);
    } else {
      setRighe([...righe, { recipe_id: null, nome: "", categoria: "altro", ordine: righe.length }]);
    }
  };

  const aggiornaRiga = (idx, patch) =>
    setRighe(righe.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const rimuoviRiga = (idx) => setRighe(righe.filter((_, i) => i !== idx));

  const muoviRiga = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= righe.length) return;
    const arr = [...righe];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setRighe(arr.map((r, i) => ({ ...r, ordine: i })));
  };

  const ordinaPerCategoria = () => {
    const sorted = [...righe].sort(
      (a, b) =>
        (ORDINE_CAT[a.categoria] || 99) - (ORDINE_CAT[b.categoria] || 99) ||
        (a.ordine ?? 0) - (b.ordine ?? 0)
    );
    setRighe(sorted.map((r, i) => ({ ...r, ordine: i })));
  };

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
      refreshArchivio?.();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const elimina = async () => {
    if (!menu) return;
    if (!window.confirm(`Eliminare il menu della ${formatSettimana(settimana).toLowerCase()}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${settimana}/`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMenu(null);
      setRighe([]);
      setMsg({ tipo: "ok", text: "Menu eliminato." });
      refreshArchivio?.();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    }
  };

  const apriPdf = () => {
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
  };

  // ── UI ──
  return (
    <div className="space-y-4">
      {/* Selezione settimana + azioni */}
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 flex flex-wrap gap-3 items-center">
        <Btn variant="ghost" size="sm" onClick={() => setSettimana(aggiungiSettimane(settimana, -1))}>← Settimana prec.</Btn>
        <div>
          <input
            type="date"
            value={settimana}
            onChange={(e) => setSettimana(lunediDi(e.target.value))}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="text-xs text-neutral-500 italic mt-0.5">{formatSettimana(settimana)} {loading && " · caricamento…"}</div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setSettimana(aggiungiSettimane(settimana, +1))}>Settimana succ. →</Btn>
        <Btn variant="ghost" size="sm" onClick={() => setSettimana(fmtIso(lunediCorrente()))}>Oggi</Btn>

        <div className="ml-auto flex flex-wrap gap-2">
          {menu && <Btn variant="ghost" size="sm" onClick={apriPdf}>📄 PDF</Btn>}
          {menu && <Btn variant="danger" size="sm" onClick={elimina}>Elimina</Btn>}
          <Btn size="sm" onClick={salva} loading={saving}>{menu ? "Aggiorna" : "Crea menu settimana"}</Btn>
        </div>
      </div>

      {msg && (
        <div className={"text-sm rounded-lg px-3 py-2 border " +
          (msg.tipo === "ok" ? "text-green-700 bg-green-50 border-green-200"
                              : "text-red-700 bg-red-50 border-red-200")}>
          {msg.text}
        </div>
      )}

      {/* Pool piatti disponibili */}
      <PiattiPoolCard pool={piattiPool} onPick={aggiungiRiga} />

      {/* Righe del menu */}
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-neutral-800">Piatti della settimana</h3>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={ordinaPerCategoria}>↕ Ordina per categoria</Btn>
            <Btn variant="ghost" size="sm" onClick={() => aggiungiRiga(null)}>+ Riga ad-hoc</Btn>
          </div>
        </div>

        {righe.length === 0 ? (
          <div className="text-center text-neutral-500 py-6 italic text-sm">
            Nessun piatto. Scegli dal pool qui sopra o aggiungi una riga ad-hoc.
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-lg border border-neutral-200">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => muoviRiga(i, -1)} disabled={i === 0}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30 text-xs px-1">▲</button>
                  <button onClick={() => muoviRiga(i, +1)} disabled={i === righe.length - 1}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30 text-xs px-1">▼</button>
                </div>
                <select
                  value={r.categoria}
                  onChange={(e) => aggiornaRiga(i, { categoria: e.target.value })}
                  className="border border-neutral-300 rounded px-2 py-1 text-sm"
                >
                  {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pool piatti — chip cliccabili dal modulo Ricette
// ─────────────────────────────────────────────────────────────
function PiattiPoolCard({ pool, onPick }) {
  const [filter, setFilter] = useState("all");
  const list = useMemo(() => {
    if (!pool) return [];
    return filter === "all" ? pool : pool.filter((p) => p.categoria === filter);
  }, [pool, filter]);

  if (pool === null) {
    return <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-500">Caricamento ricette…</div>;
  }
  if (pool.length === 0) {
    return (
      <EmptyState
        icon="🍳"
        title="Nessuna ricetta nel pool pranzo"
        description={
          <>
            Per popolare il pool, vai in <a href="/ricette/archivio" className="underline hover:text-orange-700">Gestione Cucina · Ricette</a> e
            associa le ricette al tipo servizio <em>Pranzo di lavoro</em>.
          </>
        }
      />
    );
  }

  return (
    <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-neutral-800 text-sm">Pool piatti pranzo <span className="text-neutral-400 font-normal">· {pool.length}</span></h3>
        <a href="/ricette/archivio" className="text-[11px] text-neutral-400 hover:text-orange-700">Gestisci pool →</a>
      </div>
      <div className="flex flex-wrap gap-1 mb-2 text-xs">
        <button
          onClick={() => setFilter("all")}
          className={"px-2 py-0.5 rounded " + (filter === "all" ? "bg-orange-100 text-orange-900" : "bg-white text-neutral-600 border border-neutral-200")}
        >tutti</button>
        {CATEGORIE.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={"px-2 py-0.5 rounded " + (filter === c.key ? "bg-orange-100 text-orange-900" : "bg-white text-neutral-600 border border-neutral-200")}
          >{c.emoji} {c.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {list.map((p) => (
          <button
            key={p.recipe_id}
            onClick={() => onPick(p)}
            className="text-xs bg-white border border-neutral-200 rounded px-2 py-1 hover:bg-orange-50 hover:border-orange-300 text-left"
            title={p.menu_description || p.nome}
          >
            <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-1">{p.categoria}</span>
            {p.nome.length > 50 ? p.nome.slice(0, 50) + "…" : p.nome}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2: PROGRAMMAZIONE — vista comparativa N settimane
// ─────────────────────────────────────────────────────────────
function TabProgrammazione({ refreshArchivio }) {
  const [n, setN] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/programmazione/?n=${n}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [n]);

  useEffect(() => { load(); }, [load]);

  const apriPdf = (mondayIso) => {
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
    <div className="space-y-4">
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-600">Mostra ultime</label>
        <select value={n} onChange={(e) => setN(Number(e.target.value))}
          className="border border-neutral-300 rounded-lg px-2 py-1 text-sm">
          {[4, 6, 8, 12, 16, 26, 52].map((x) => <option key={x} value={x}>{x} settimane</option>)}
        </select>
        <Btn variant="ghost" size="sm" onClick={load}>↻ Aggiorna</Btn>
        <div className="ml-auto text-sm text-neutral-500">
          {loading ? "caricamento…" : `${settimane.length} settimane con menu`}
        </div>
      </div>

      {settimane.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nessuna settimana programmata"
          description="Crea il primo menu dalla tab Settimana."
        />
      ) : (
        <div className="overflow-x-auto">
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
                      <div className="text-[10px] text-neutral-400">{s.righe?.length || 0} piatti</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => apriPdf(s.settimana_inizio)}
                        title="Apri PDF"
                        className="text-xs px-1.5 py-0.5 hover:bg-orange-50 rounded"
                      >📄</button>
                      <button
                        onClick={() => elimina(s.settimana_inizio)}
                        title="Elimina"
                        className="text-xs px-1.5 py-0.5 hover:bg-red-50 text-red-600 rounded"
                      >🗑️</button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs flex-1">
                    {CATEGORIE.map((c) => {
                      const items = byCat[c.key] || [];
                      if (items.length === 0) return null;
                      return (
                        <div key={c.key}>
                          <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-0.5">{c.emoji} {c.label}</div>
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
  const [piattiPool, setPiattiPool] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <>
      <RicetteNav current="pranzo" />
      <div className="min-h-screen bg-brand-cream font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 mb-5">
              <div>
                <h1 className="text-2xl font-bold text-orange-900 font-playfair">Menu Pranzo settimanale</h1>
                <p className="text-sm text-neutral-500 mt-0.5">
                  Compositore · seleziona la settimana e scegli i piatti dal pool ricette
                </p>
              </div>
            </div>

            <TabNav tab={tab} setTab={setTab} />

            {tab === "compositore" && (
              <TabCompositore
                key={reloadKey}
                piattiPool={piattiPool}
                refreshArchivio={refreshAll}
              />
            )}
            {tab === "programmazione" && (
              <TabProgrammazione key={reloadKey} refreshArchivio={refreshAll} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
