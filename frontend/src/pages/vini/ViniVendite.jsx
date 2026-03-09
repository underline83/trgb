// src/pages/vini/ViniVendite.jsx
// @version: v1.0-hub-vendite-scarichi
// Hub Vendite & Scarichi — registrazione rapida, storico globale, statistiche

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

// ─────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────
const TIPO_COLORS = {
  CARICO:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCARICO:   "bg-red-100 text-red-800 border-red-200",
  VENDITA:   "bg-violet-100 text-violet-800 border-violet-200",
  RETTIFICA: "bg-amber-100 text-amber-800 border-amber-200",
};

const TIPO_EMOJI = {
  CARICO: "⬆️", SCARICO: "⬇️", VENDITA: "🛒", RETTIFICA: "✏️",
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

/**
 * Costruisce le opzioni locazione da un oggetto vino.
 * Mostra solo le locazioni che hanno un nome o una giacenza > 0.
 * Il valore è sempre il codice backend (frigo, loc1, loc2, loc3).
 */
function buildLocOptions(vino) {
  if (!vino) return [];
  return [
    { value: "frigo", label: vino.FRIGORIFERO || "Frigo",  qta: vino.QTA_FRIGO ?? 0 },
    { value: "loc1",  label: vino.LOCAZIONE_1 || "Loc 1",  qta: vino.QTA_LOC1 ?? 0 },
    { value: "loc2",  label: vino.LOCAZIONE_2 || "Loc 2",  qta: vino.QTA_LOC2 ?? 0 },
    { value: "loc3",  label: vino.LOCAZIONE_3 || "Loc 3",  qta: vino.QTA_LOC3 ?? 0 },
  ];
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
  const [regTipo, setRegTipo] = useState("VENDITA");
  const [regLoc, setRegLoc] = useState("");
  const [regQta, setRegQta] = useState("");
  const [regNote, setRegNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // ── Storico globale ──
  const [movimenti, setMovimenti] = useState([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movLoading, setMovLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");
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

  // ── Fetch movimenti globali ──
  const fetchMovimenti = useCallback(async (resetPage = false) => {
    setMovLoading(true);
    const p = resetPage ? 0 : page;
    if (resetPage) setPage(0);

    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
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
  }, [filtroTipo, filtroText, filtroDataDa, filtroDataA, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchMovimenti(); }, [fetchMovimenti]);

  // ── Autocomplete vini ──
  useEffect(() => {
    if (searchText.length < 2) { setSuggestions([]); return; }
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
  }, [searchText]);

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
  };

  // ── Registra movimento ──
  // Locazione obbligatoria per VENDITA e SCARICO
  const locRequired = regTipo === "VENDITA" || regTipo === "SCARICO";

  const submitMovimento = async () => {
    if (!selectedVino) { alert("Seleziona un vino dalla ricerca."); return; }
    const qtaNum = Number(regQta);
    if (!regQta || qtaNum <= 0) { alert("Inserisci una quantità valida (> 0)."); return; }
    if (locRequired && !regLoc) { alert("Seleziona la locazione da cui scalare."); return; }

    setSubmitting(true);
    setSubmitMsg("");

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: regTipo,
          qta: qtaNum,
          locazione: regLoc || null,
          note: regNote.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      // Reset form
      setSelectedVino(null);
      setSearchText("");
      setRegLoc("");
      setRegQta("");
      setRegNote("");
      setSubmitMsg(`✅ ${regTipo} registrato — ${qtaNum} bt`);
      setTimeout(() => setSubmitMsg(""), 4000);

      // Ricarica movimenti e stats
      fetchMovimenti(true);
      fetchStats();
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Applicare filtri ──
  const applicaFiltri = () => fetchMovimenti(true);
  const resetFiltri = () => {
    setFiltroTipo(""); setFiltroText(""); setFiltroDataDa(""); setFiltroDataA("");
    setPage(0);
    // Il useEffect su fetchMovimenti ricarica automaticamente
  };

  const totalPages = Math.ceil(movTotal / PAGE_SIZE);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER + SUBMENU */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-neutral-200">
          <MagazzinoSubMenu />
          <h1 className="text-3xl font-bold text-amber-900 font-playfair mt-2">
            🛒 Vendite & Scarichi
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Registra vendite e scarichi, consulta lo storico movimenti della cantina
          </p>
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

        {/* ── REGISTRAZIONE RAPIDA ────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-800 mb-4">
            Registra movimento
          </h2>

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
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              {selectedVino && (
                <span className="absolute right-3 top-8 text-xs text-violet-600 font-semibold">
                  #{selectedVino.id} — {selectedVino.QTA_TOTALE ?? 0} bt
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

            {/* Tipo */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                Tipo
              </label>
              <select
                value={regTipo}
                onChange={(e) => { setRegTipo(e.target.value); if (e.target.value === "RETTIFICA") setRegLoc(""); }}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="VENDITA">🛒 Vendita</option>
                <option value="SCARICO">⬇️ Scarico</option>
                <option value="CARICO">⬆️ Carico</option>
                <option value="RETTIFICA">✏️ Rettifica</option>
              </select>
            </div>

            {/* Locazione — nomi e giacenze dinamici dal vino selezionato */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                Locazione {locRequired && <span className="text-red-400">*</span>}
              </label>
              <select
                value={regLoc}
                onChange={(e) => setRegLoc(e.target.value)}
                disabled={regTipo === "RETTIFICA" || !selectedVino}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  locRequired && !regLoc ? "border-red-300" : "border-neutral-300"
                } ${(regTipo === "RETTIFICA" || !selectedVino) ? "opacity-40 cursor-not-allowed" : ""}`}
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
                placeholder="N."
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>

            {/* Bottone registra */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={submitMovimento}
                disabled={submitting || !selectedVino}
                className="w-full bg-violet-700 text-white rounded-xl px-4 py-2.5 font-semibold hover:bg-violet-800 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {submitting ? "Registro..." : "Registra"}
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

        {/* ── STORICO MOVIMENTI GLOBALE ───────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-neutral-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-neutral-800">
              Storico movimenti
              <span className="text-sm font-normal text-neutral-400 ml-2">
                {movTotal} totali
              </span>
            </h2>
          </div>

          {/* Filtri */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Tutti i tipi</option>
              <option value="VENDITA">🛒 Vendita</option>
              <option value="SCARICO">⬇️ Scarico</option>
              <option value="CARICO">⬆️ Carico</option>
              <option value="RETTIFICA">✏️ Rettifica</option>
            </select>

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

          {/* Tabella movimenti */}
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-center">Qtà</th>
                  <th className="px-3 py-2 text-left">Vino</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Note</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Utente</th>
                </tr>
              </thead>
              <tbody>
                {movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                      Caricamento...
                    </td>
                  </tr>
                )}

                {!movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                      Nessun movimento trovato.
                    </td>
                  </tr>
                )}

                {movimenti.map((m) => {
                  const tipoColor = TIPO_COLORS[m.tipo] || "";
                  const emoji = TIPO_EMOJI[m.tipo] || "";
                  return (
                    <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                      <td className="px-3 py-2.5 text-xs text-neutral-600 whitespace-nowrap">
                        {formatDate(m.data_mov)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tipoColor}`}>
                          {emoji} {m.tipo}
                        </span>
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
                      <td className="px-3 py-2.5 text-xs text-neutral-500 hidden md:table-cell max-w-[180px] truncate">
                        {m.note || "—"}
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
