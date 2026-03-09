// src/pages/vini/ViniVendite.jsx
// @version: v2.0-vendite-bottiglia-calici
// Hub Vendite — registrazione vendita bottiglia o calici, storico vendite, KPI

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
// MagazzinoSubMenu rimosso — Vendite è sezione autonoma

// ─────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────
const MODALITA = {
  BOTTIGLIA: { label: "Bottiglia",  icon: "🍾", desc: "Vendita bottiglia intera",  color: "bg-violet-100 text-violet-800 border-violet-300" },
  CALICI:    { label: "Calici",     icon: "🥂", desc: "Aperta per vendita al calice", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

function formatDate(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function buildLocOptions(vino) {
  if (!vino) return [];
  return [
    { value: "frigo", label: vino.FRIGORIFERO || "Frigo",  qta: vino.QTA_FRIGO ?? 0 },
    { value: "loc1",  label: vino.LOCAZIONE_1 || "Loc 1",  qta: vino.QTA_LOC1 ?? 0 },
    { value: "loc2",  label: vino.LOCAZIONE_2 || "Loc 2",  qta: vino.QTA_LOC2 ?? 0 },
    { value: "loc3",  label: vino.LOCAZIONE_3 || "Loc 3",  qta: vino.QTA_LOC3 ?? 0 },
  ];
}

/** Riconosce la modalità da una nota di movimento */
function parseModalita(note) {
  if (!note) return null;
  if (note.includes("[CALICI]")) return "CALICI";
  if (note.includes("[BOTTIGLIA]")) return "BOTTIGLIA";
  return null;
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────
export default function ViniVendite() {
  const navigate = useNavigate();

  // ── Stats dalla dashboard ──
  const [stats, setStats] = useState(null);

  // ── Registrazione rapida ──
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedVino, setSelectedVino] = useState(null);
  const [modalita, setModalita] = useState("BOTTIGLIA");
  const [regLoc, setRegLoc] = useState("");
  const [regQta, setRegQta] = useState("1");
  const [regNote, setRegNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // ── Storico vendite ──
  const [movimenti, setMovimenti] = useState([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movLoading, setMovLoading] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [filtroDataDa, setFiltroDataDa] = useState("");
  const [filtroDataA, setFiltroDataA] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/dashboard`);
      if (res.ok) setStats(await res.json());
    } catch { /* silenzioso */ }
  }, []);

  // ── Fetch vendite (solo tipo=VENDITA) ──
  const fetchMovimenti = useCallback(async (resetPage = false) => {
    setMovLoading(true);
    const p = resetPage ? 0 : page;
    if (resetPage) setPage(0);

    const params = new URLSearchParams();
    params.set("tipo", "VENDITA");
    if (filtroText) params.set("text", filtroText);
    if (filtroDataDa) params.set("data_da", filtroDataDa);
    if (filtroDataA) params.set("data_a", filtroDataA);
    params.set("limit", PAGE_SIZE);
    params.set("offset", p * PAGE_SIZE);

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/movimenti-globali?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMovimenti(data.items || []);
        setMovTotal(data.total || 0);
      }
    } catch { /* silenzioso */ }
    setMovLoading(false);
  }, [filtroText, filtroDataDa, filtroDataA, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchMovimenti(); }, [fetchMovimenti]);

  // ── Autocomplete vini ──
  useEffect(() => {
    if (searchText.length < 2 || selectedVino) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `${API_BASE}/vini/magazzino/autocomplete?q=${encodeURIComponent(searchText)}&limit=8`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch { /* silenzioso */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, selectedVino]);

  // Chiudi suggestions al click fuori
  useEffect(() => {
    const handleClick = (e) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Seleziona vino ──
  const selectVino = (v) => {
    setSelectedVino(v);
    setSearchText(v.DESCRIZIONE + (v.PRODUTTORE ? ` — ${v.PRODUTTORE}` : ""));
    setShowSuggestions(false);
    setSuggestions([]);
    setRegLoc("");
  };

  // ── Deseleziona ──
  const clearVino = () => {
    setSelectedVino(null);
    setSearchText("");
    setRegLoc("");
  };

  // ── Registra vendita ──
  const submitVendita = async () => {
    if (!selectedVino) { alert("Seleziona un vino dalla ricerca."); return; }
    const qtaNum = Number(regQta);
    if (!regQta || qtaNum <= 0) { alert("Inserisci una quantità valida (> 0)."); return; }
    if (!regLoc) { alert("Seleziona la locazione da cui scalare."); return; }

    setSubmitting(true);
    setSubmitMsg("");

    // Compone la nota con il tag modalità
    const modTag = `[${modalita}]`;
    const notaParts = [modTag];
    if (regNote.trim()) notaParts.push(regNote.trim());
    const notaFinale = notaParts.join(" ");

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "VENDITA",
          qta: qtaNum,
          locazione: regLoc,
          note: notaFinale,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      const modInfo = MODALITA[modalita];
      setSubmitMsg(`✅ ${modInfo.icon} ${modInfo.label} — ${qtaNum} bt di ${selectedVino.DESCRIZIONE}`);

      // Reset form
      clearVino();
      setRegQta("1");
      setRegNote("");
      setTimeout(() => setSubmitMsg(""), 5000);

      // Ricarica
      fetchMovimenti(true);
      fetchStats();
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtri storico ──
  const applicaFiltri = () => fetchMovimenti(true);
  const resetFiltri = () => {
    setFiltroText(""); setFiltroDataDa(""); setFiltroDataA("");
    setPage(0);
  };

  const totalPages = Math.ceil(movTotal / PAGE_SIZE);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-neutral-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-amber-900 font-playfair">
                🛒 Vendite
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                Registra vendite bottiglia o calici, consulta lo storico
              </p>
            </div>
            <button type="button" onClick={() => navigate("/vini")}
              className="self-start px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              ← Menu Vini
            </button>
          </div>
        </div>

        {/* ── KPI RAPIDI ──────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile
              label="Vendute oggi"
              value={stats.vendite_recenti?.filter(v => {
                const d = v.data_mov?.slice(0, 10);
                return d === new Date().toISOString().slice(0, 10);
              }).reduce((s, v) => s + (v.qta || 0), 0) ?? 0}
              unit="bt"
              color="violet"
            />
            <KpiTile label="Vendute 7gg" value={stats.vendute_7gg} unit="bt" color="violet" />
            <KpiTile label="Vendute 30gg" value={stats.vendute_30gg} unit="bt" color="violet" />
            <KpiTile label="Bottiglie in cantina" value={stats.total_bottiglie} unit="bt" color="amber" />
          </div>
        )}

        {/* ── REGISTRAZIONE VENDITA ───────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-800 mb-4">
            Registra vendita
          </h2>

          {/* Toggle Bottiglia / Calici */}
          <div className="flex gap-3 mb-5">
            {Object.entries(MODALITA).map(([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => setModalita(key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition ${
                  modalita === key
                    ? m.color + " shadow-md"
                    : "bg-neutral-50 border-neutral-200 text-neutral-500 hover:border-neutral-300"
                }`}
              >
                <span className="text-xl">{m.icon}</span>
                <span>{m.label}</span>
                <span className="text-[10px] font-normal opacity-70 hidden sm:inline">— {m.desc}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Ricerca vino */}
            <div className="md:col-span-5 relative">
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                Vino
              </label>
              <input
                ref={searchRef}
                type="text"
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setSelectedVino(null); }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Cerca per nome, produttore o ID..."
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  selectedVino ? "border-violet-300 pr-24" : "border-neutral-300"
                }`}
              />
              {selectedVino && (
                <span className="absolute right-3 top-8 flex items-center gap-1.5 text-xs text-violet-600 font-semibold">
                  #{selectedVino.id} — {selectedVino.QTA_TOTALE ?? 0} bt
                  <button
                    type="button"
                    onClick={clearVino}
                    className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-neutral-200 text-neutral-500 hover:bg-red-100 hover:text-red-600 transition text-xs font-bold"
                    title="Deseleziona vino"
                  >
                    ✕
                  </button>
                </span>
              )}

              {/* Dropdown suggerimenti */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
                >
                  {suggestions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectVino(v)}
                      className="w-full text-left px-4 py-2.5 hover:bg-violet-50 transition border-b border-neutral-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono mr-2">
                            #{v.id}
                          </span>
                          <span className="text-sm font-medium text-neutral-800">
                            {v.DESCRIZIONE}
                          </span>
                          {v.PRODUTTORE && (
                            <span className="text-xs text-neutral-500 ml-1">— {v.PRODUTTORE}</span>
                          )}
                          {v.ANNATA && (
                            <span className="text-xs text-neutral-400 ml-1">({v.ANNATA})</span>
                          )}
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <span className={`text-sm font-bold ${(v.QTA_TOTALE ?? 0) === 0 ? "text-red-500" : "text-neutral-700"}`}>
                            {v.QTA_TOTALE ?? 0} bt
                          </span>
                          {v.PREZZO_CARTA && (
                            <span className="text-[10px] text-neutral-400 block">€{v.PREZZO_CARTA}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Locazione */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                Da locazione <span className="text-red-400">*</span>
              </label>
              <select
                value={regLoc}
                onChange={(e) => setRegLoc(e.target.value)}
                disabled={!selectedVino}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  !regLoc && selectedVino ? "border-red-300" : "border-neutral-300"
                } ${!selectedVino ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <option value="">— Seleziona —</option>
                {selectedVino && buildLocOptions(selectedVino).map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label} ({loc.qta} bt)
                  </option>
                ))}
              </select>
            </div>

            {/* Quantità */}
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                Qtà
              </label>
              <input
                type="number"
                value={regQta}
                min={1}
                onChange={(e) => setRegQta(e.target.value)}
                placeholder="1"
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>

            {/* Bottone registra */}
            <div className="md:col-span-3">
              <button
                type="button"
                onClick={submitVendita}
                disabled={submitting || !selectedVino}
                className={`w-full text-white rounded-xl px-4 py-2.5 font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
                  modalita === "CALICI"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-violet-700 hover:bg-violet-800"
                }`}
              >
                {submitting ? "Registro..." : `${MODALITA[modalita].icon} Registra ${MODALITA[modalita].label}`}
              </button>
            </div>
          </div>

          {/* Note (riga sotto) */}
          <div className="mt-3">
            <input
              type="text"
              value={regNote}
              onChange={(e) => setRegNote(e.target.value)}
              placeholder="Note (opzionali)"
              className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {submitMsg && (
            <p className={`text-sm font-semibold mt-3 ${submitMsg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>
              {submitMsg}
            </p>
          )}
        </div>

        {/* ── STORICO VENDITE ─────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-neutral-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-neutral-800">
              Storico vendite
              <span className="text-sm font-normal text-neutral-400 ml-2">
                {movTotal} totali
              </span>
            </h2>
          </div>

          {/* Filtri */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              type="text"
              value={filtroText}
              onChange={(e) => setFiltroText(e.target.value)}
              placeholder="Cerca vino..."
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />

            <input
              type="date"
              value={filtroDataDa}
              onChange={(e) => setFiltroDataDa(e.target.value)}
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />

            <input
              type="date"
              value={filtroDataA}
              onChange={(e) => setFiltroDataA(e.target.value)}
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={applicaFiltri}
                className="flex-1 bg-amber-700 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-amber-800 transition"
              >
                Filtra
              </button>
              <button
                type="button"
                onClick={resetFiltri}
                className="px-3 py-2 text-sm text-neutral-500 border border-neutral-300 rounded-xl hover:bg-neutral-50 transition"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Tabella vendite */}
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-center">Modalità</th>
                  <th className="px-3 py-2 text-center">Qtà</th>
                  <th className="px-3 py-2 text-left">Vino</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Locazione</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Note</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Utente</th>
                </tr>
              </thead>
              <tbody>
                {movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                      Caricamento...
                    </td>
                  </tr>
                )}

                {!movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                      Nessuna vendita trovata.
                    </td>
                  </tr>
                )}

                {movimenti.map((m) => {
                  const mod = parseModalita(m.note);
                  const modInfo = mod ? MODALITA[mod] : null;
                  // Rimuovi il tag [BOTTIGLIA] o [CALICI] dalla nota visualizzata
                  const notePulita = (m.note || "").replace(/\[(BOTTIGLIA|CALICI)\]\s*/g, "").trim();
                  return (
                    <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                      <td className="px-3 py-2.5 text-xs text-neutral-600 whitespace-nowrap">
                        {formatDate(m.data_mov)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {modInfo ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${modInfo.color}`}>
                            {modInfo.icon} {modInfo.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-violet-100 text-violet-800 border-violet-200">
                            🛒 Vendita
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-neutral-800">
                        {m.qta}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}
                          className="text-left hover:underline"
                        >
                          <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono mr-1.5">
                            #{m.vino_id}
                          </span>
                          <span className="text-sm text-neutral-800">
                            {m.vino_desc}
                          </span>
                          {m.vino_produttore && (
                            <span className="text-xs text-neutral-400 ml-1">— {m.vino_produttore}</span>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-500 hidden md:table-cell">
                        {m.locazione || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-500 hidden md:table-cell max-w-[160px] truncate">
                        {notePulita || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400 hidden md:table-cell">
                        {m.utente || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginazione */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-1.5 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 disabled:opacity-40 transition"
              >
                ← Precedente
              </button>
              <span className="text-sm text-neutral-500">
                Pagina {page + 1} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-1.5 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 disabled:opacity-40 transition"
              >
                Successiva →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// KPI TILE
// ─────────────────────────────────────────────────────────────
function KpiTile({ label, value, unit, color = "neutral" }) {
  const palettes = {
    violet: "bg-violet-50 border-violet-200 text-violet-900",
    amber:  "bg-amber-50 border-amber-200 text-amber-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    rose:   "bg-rose-50 border-rose-200 text-rose-900",
    neutral: "bg-neutral-50 border-neutral-200 text-neutral-800",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${palettes[color] || palettes.neutral}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value ?? "—"}
        {unit && <span className="text-sm font-normal ml-1 opacity-60">{unit}</span>}
      </p>
    </div>
  );
}
