// src/pages/vini/MagazzinoAdmin.jsx
// @version: v1.0-admin-bulk
// Pagina admin — tabellona editabile per modifiche massive, solo ruolo admin

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";
import {
  STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS,
} from "../../config/viniConstants";

// ── Colonne della tabellona ─────────────────────────────
const COLUMNS = [
  { key: "id",              label: "ID",        type: "readonly", w: "w-14" },
  { key: "DESCRIZIONE",     label: "Descrizione", type: "text",  w: "w-56" },
  { key: "PRODUTTORE",      label: "Produttore",  type: "text",  w: "w-40" },
  { key: "TIPOLOGIA",       label: "Tipo",        type: "text",  w: "w-28" },
  { key: "ANNATA",          label: "Ann.",        type: "text",  w: "w-16" },
  { key: "DENOMINAZIONE",   label: "Denom.",      type: "text",  w: "w-32" },
  { key: "REGIONE",         label: "Regione",     type: "text",  w: "w-28" },
  { key: "NAZIONE",         label: "Naz.",        type: "text",  w: "w-20" },
  { key: "EURO_LISTINO",    label: "€ List.",     type: "number", w: "w-20" },
  { key: "PREZZO_CARTA",    label: "€ Carta",     type: "number", w: "w-20" },
  { key: "QTA_FRIGO",       label: "Frigo",       type: "number", w: "w-16" },
  { key: "QTA_LOC1",        label: "Loc1",        type: "number", w: "w-16" },
  { key: "QTA_LOC2",        label: "Loc2",        type: "number", w: "w-16" },
  { key: "QTA_LOC3",        label: "Loc3",        type: "number", w: "w-16" },
  { key: "QTA_TOTALE",      label: "Tot",         type: "readonly", w: "w-14" },
  { key: "CARTA",           label: "Carta",       type: "select", options: ["","SI","NO"], w: "w-16" },
  { key: "IPRATICO",        label: "iPrat",       type: "select", options: ["","SI","NO"], w: "w-16" },
  { key: "DISCONTINUATO",   label: "Disc.",       type: "select", options: ["","SI","NO"], w: "w-16" },
  { key: "STATO_VENDITA",   label: "St.Vend",     type: "select", options: STATO_VENDITA_OPTIONS.map(o => o.value), w: "w-16" },
  { key: "STATO_RIORDINO",  label: "St.Riord",    type: "select", options: STATO_RIORDINO_OPTIONS.map(o => o.value), w: "w-16" },
  { key: "STATO_CONSERVAZIONE", label: "St.Cons",  type: "select", options: STATO_CONSERVAZIONE_OPTIONS.map(o => o.value), w: "w-16" },
];

// ─────────────────────────────────────────────────────────
export default function MagazzinoAdmin() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  // ── Dati ──
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Edits: { [vinoId]: { campo: nuovoValore, ... } }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ── Filtri ──
  const [fText, setFText] = useState("");
  const [fTipologia, setFTipologia] = useState("");
  const [fNazione, setFNazione] = useState("");
  const [fSoloGiacenza, setFSoloGiacenza] = useState(false);
  const [fSoloCarta, setFSoloCarta] = useState(false);

  // ── Protezione ruolo ──
  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-neutral-100 p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-2xl p-12 text-center">
          <h1 className="text-2xl font-bold text-red-700 mb-4">Accesso negato</h1>
          <p className="text-neutral-600">Questa pagina è riservata agli amministratori.</p>
          <button onClick={() => navigate("/vini/magazzino")}
            className="mt-6 px-6 py-2 bg-amber-700 text-white rounded-xl font-semibold hover:bg-amber-800 transition">
            Torna al magazzino
          </button>
        </div>
      </div>
    );
  }

  // ── Fetch vini ──
  const fetchVini = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino?limit=5000`);
      if (res.ok) {
        const data = await res.json();
        setVini(Array.isArray(data) ? data : data.items || []);
      }
    } catch { /* silenzioso */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVini(); }, [fetchVini]);

  // ── Liste uniche per filtri ──
  const tipologie = useMemo(() => [...new Set(vini.map(v => v.TIPOLOGIA).filter(Boolean))].sort(), [vini]);
  const nazioni = useMemo(() => [...new Set(vini.map(v => v.NAZIONE).filter(Boolean))].sort(), [vini]);

  // ── Filtraggio ──
  const filtered = useMemo(() => {
    let list = vini;
    if (fText) {
      const t = fText.toLowerCase();
      list = list.filter(v =>
        (v.DESCRIZIONE || "").toLowerCase().includes(t) ||
        (v.PRODUTTORE || "").toLowerCase().includes(t) ||
        (v.DENOMINAZIONE || "").toLowerCase().includes(t) ||
        String(v.id).includes(t)
      );
    }
    if (fTipologia) list = list.filter(v => v.TIPOLOGIA === fTipologia);
    if (fNazione) list = list.filter(v => v.NAZIONE === fNazione);
    if (fSoloGiacenza) list = list.filter(v => (v.QTA_TOTALE || 0) > 0);
    if (fSoloCarta) list = list.filter(v => v.CARTA === "SI");
    return list;
  }, [vini, fText, fTipologia, fNazione, fSoloGiacenza, fSoloCarta]);

  // ── Gestione edit cella ──
  const getCellValue = (vino, key) => {
    if (edits[vino.id] && key in edits[vino.id]) return edits[vino.id][key];
    return vino[key] ?? "";
  };

  const setCellValue = (vinoId, key, value) => {
    setEdits(prev => ({
      ...prev,
      [vinoId]: { ...(prev[vinoId] || {}), [key]: value },
    }));
  };

  // ── Conta modifiche pendenti ──
  const pendingCount = Object.keys(edits).length;

  // ── Salva in blocco ──
  const saveBulk = async () => {
    if (pendingCount === 0) return;
    setSaving(true);
    setSaveMsg("");

    const updates = Object.entries(edits).map(([id, fields]) => ({
      id: Number(id),
      ...fields,
    }));

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/bulk-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      const data = await res.json();
      setEdits({});
      setSaveMsg(`✅ ${data.updated} vini aggiornati.`);
      fetchVini(); // ricarica dati freschi
      setTimeout(() => setSaveMsg(""), 5000);
    } catch (err) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Annulla modifiche ──
  const discardEdits = () => {
    if (pendingCount > 0 && !window.confirm(`Annullare ${pendingCount} modifiche non salvate?`)) return;
    setEdits({});
  };

  // ── Elimina vino ──
  const deleteVino = async (vino) => {
    if (!window.confirm(
      `Eliminare definitivamente il vino #${vino.id} "${vino.DESCRIZIONE}"?\n\nVerranno eliminati anche tutti i movimenti e le note associate.\nQuesta azione è irreversibile.`
    )) return;

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/delete-vino/${vino.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }
      // Rimuovi dall'elenco locale
      setVini(prev => prev.filter(v => v.id !== vino.id));
      // Rimuovi eventuali edit pendenti
      setEdits(prev => { const n = { ...prev }; delete n[vino.id]; return n; });
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-4">
      <div className="max-w-[100rem] mx-auto space-y-4">

        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-neutral-200">
          <MagazzinoSubMenu />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-2">
            <div>
              <h1 className="text-2xl font-bold text-amber-900 font-playfair">
                ⚙️ Admin — Modifica massiva
              </h1>
              <p className="text-neutral-500 text-sm">
                {filtered.length} vini visualizzati su {vini.length} totali
                {loading && " — caricamento..."}
              </p>
            </div>

            {/* Barra salvataggio */}
            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className={`text-sm font-semibold ${saveMsg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>
                  {saveMsg}
                </span>
              )}
              {pendingCount > 0 && (
                <>
                  <span className="text-sm text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
                    {pendingCount} modific{pendingCount === 1 ? "a" : "he"} non salvat{pendingCount === 1 ? "a" : "e"}
                  </span>
                  <button onClick={discardEdits}
                    className="px-4 py-2 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 transition">
                    Annulla
                  </button>
                </>
              )}
              <button onClick={saveBulk}
                disabled={saving || pendingCount === 0}
                className="px-6 py-2 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-800 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                {saving ? "Salvataggio..." : "💾 Salva tutto"}
              </button>
            </div>
          </div>
        </div>

        {/* FILTRI */}
        <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <input
              type="text"
              value={fText}
              onChange={(e) => setFText(e.target.value)}
              placeholder="Cerca vino, produttore, ID..."
              className="col-span-2 border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <select value={fTipologia} onChange={(e) => setFTipologia(e.target.value)}
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200">
              <option value="">Tutte le tipologie</option>
              {tipologie.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={fNazione} onChange={(e) => setFNazione(e.target.value)}
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200">
              <option value="">Tutte le nazioni</option>
              {nazioni.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={fSoloGiacenza} onChange={(e) => setFSoloGiacenza(e.target.checked)}
                className="rounded border-neutral-300" />
              Solo con giacenza
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input type="checkbox" checked={fSoloCarta} onChange={(e) => setFSoloCarta(e.target.checked)}
                className="rounded border-neutral-300" />
              Solo in carta
            </label>
          </div>
        </div>

        {/* TABELLONA */}
        <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-neutral-100 sticky top-0 z-10">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className={`px-2 py-2 text-left font-semibold text-neutral-600 uppercase tracking-wide border-b border-neutral-200 whitespace-nowrap ${col.w}`}>
                    {col.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-neutral-600 uppercase tracking-wide border-b border-neutral-200 w-12">
                  ✕
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vino) => {
                const isEdited = !!edits[vino.id];
                return (
                  <tr key={vino.id}
                    className={`border-b border-neutral-100 hover:bg-amber-50/30 transition ${
                      isEdited ? "bg-amber-50/50" : ""
                    }`}>
                    {COLUMNS.map(col => (
                      <td key={col.key} className={`px-1 py-0.5 ${col.w}`}>
                        <CellEditor
                          col={col}
                          value={getCellValue(vino, col.key)}
                          originalValue={vino[col.key] ?? ""}
                          onChange={(val) => setCellValue(vino.id, col.key, val)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-0.5 text-center">
                      <button onClick={() => deleteVino(vino)}
                        className="text-red-300 hover:text-red-600 transition text-sm"
                        title={`Elimina #${vino.id}`}>
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-neutral-400">
                    Nessun vino trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con bottone salva duplicato */}
        {pendingCount > 0 && (
          <div className="sticky bottom-4 flex justify-center">
            <button onClick={saveBulk}
              disabled={saving}
              className="px-8 py-3 bg-emerald-700 text-white rounded-2xl font-bold text-sm hover:bg-emerald-800 transition shadow-lg disabled:opacity-40">
              {saving ? "Salvataggio..." : `💾 Salva ${pendingCount} modific${pendingCount === 1 ? "a" : "he"}`}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────
// CELL EDITOR
// ─────────────────────────────────────────────────────────
function CellEditor({ col, value, originalValue, onChange }) {
  const isChanged = String(value) !== String(originalValue);
  const base = `w-full px-1.5 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-amber-300 ${
    isChanged
      ? "border-amber-400 bg-amber-50 font-semibold"
      : "border-transparent bg-transparent hover:border-neutral-200 hover:bg-white"
  }`;

  if (col.type === "readonly") {
    return (
      <span className="text-xs text-neutral-500 font-mono px-1.5 py-1 block">
        {value}
      </span>
    );
  }

  if (col.type === "select") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className={base + " cursor-pointer"}>
        {col.options.map(opt => (
          <option key={opt} value={opt}>{opt || "—"}</option>
        ))}
      </select>
    );
  }

  if (col.type === "number") {
    return (
      <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={base + " text-right"} />
    );
  }

  // text
  return (
    <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      className={base} />
  );
}
