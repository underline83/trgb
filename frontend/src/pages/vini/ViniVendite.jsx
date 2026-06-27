// src/pages/vini/ViniVendite.jsx
// @version: v2.3-mattoni — M.I primitives (Btn) su header, registra, filtri, paginazione
// Hub Vendite — registrazione vendita bottiglia o calici, storico vendite, KPI

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import CaliciDisponibiliCard from "../../components/widgets/CaliciDisponibiliCard";
import DecidiPrezzoCalice, { roundToHalf } from "../../components/vini/DecidiPrezzoCalice";

// ─────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────
const MODALITA = {
  BOTTIGLIA:   { label: "Bottiglia",   icon: "🍾",  desc: "Vendita bottiglia intera",  color: "bg-violet-100 text-violet-800 border-violet-300" },
  CALICI:      { label: "Calici",      icon: "🥂",  desc: "Aperta per vendita al calice", color: "bg-rose-100 text-rose-800 border-rose-300" },
  // ATTIVAZIONE: evento di "apertura bottiglia per servizio al calice da
  // residuo" — non è una vendita, è un'azione operativa tracciata
  // (vini 3.63, Marco 2026-06-24). Cancellabile con effetto di chiusura
  // della bottiglia (vedi delete_movimento backend).
  ATTIVAZIONE: { label: "Attivazione", icon: "🥂↻", desc: "Bottiglia aperta per servizio al calice (non è una vendita)", color: "bg-amber-50 text-amber-800 border-amber-200" },
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
  // Se LOCAZIONE_3 contiene coordinate matrice "(col,riga), …" mostra label pulita
  const loc3Raw = vino.LOCAZIONE_3 || "";
  const isMatrice = /^\(\d+,\d+\)/.test(loc3Raw.trim());
  const loc3Label = isMatrice ? "Matrice" : (loc3Raw || "Loc 3");
  return [
    { value: "frigo", label: vino.FRIGORIFERO || "Frigo",  qta: vino.QTA_FRIGO ?? 0 },
    { value: "loc1",  label: vino.LOCAZIONE_1 || "Loc 1",  qta: vino.QTA_LOC1 ?? 0 },
    { value: "loc2",  label: vino.LOCAZIONE_2 || "Loc 2",  qta: vino.QTA_LOC2 ?? 0 },
    { value: "loc3",  label: loc3Label,                     qta: vino.QTA_LOC3 ?? 0 },
  ];
}

/** Riconosce la modalità da una nota di movimento */
function parseModalita(note) {
  if (!note) return null;
  // L'ordine conta: [CALICI-RESIDUO] include la sottostringa [CALICI] e va
  // intercettato prima.
  if (note.includes("[CALICI-RESIDUO]")) return "ATTIVAZIONE";
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
  // Modale "Decidi prezzo calice" — si apre quando il sommelier apre per calici un
  // vino con VENDITA_CALICE != 'SI' e BOTTIGLIA_APERTA = 0 (prima apertura manuale).
  // Sessione 2026-05-11.
  const [decidiPrezzo, setDecidiPrezzo] = useState(null); // null o { vino, defaultPrezzo }
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // ── Matrice (selezione celle per vendita da loc3) ──
  const [matriceStato, setMatriceStato] = useState(null); // {righe, colonne, nome, celle}
  const [myCelleMatrice, setMyCelleMatrice] = useState([]); // [{riga, colonna}]
  const [selectedCelle, setSelectedCelle] = useState([]); // celle selezionate per la vendita
  const [matriceLoading, setMatriceLoading] = useState(false);

  // ── Storico vendite ──
  const [movimenti, setMovimenti] = useState([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movLoading, setMovLoading] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [filtroDataDa, setFiltroDataDa] = useState("");
  const [filtroDataA, setFiltroDataA] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // ── Ordinamento colonne storico ──
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir(key === "data" ? "desc" : "asc"); }
  };
  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
    return <span className="text-amber-600 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };
  const movimentiOrdinati = useMemo(() => {
    if (!sortKey || !movimenti.length) return movimenti;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...movimenti].sort((a, b) => {
      switch (sortKey) {
        case "data": return ((a.data_mov || "") < (b.data_mov || "") ? -1 : 1) * dir;
        case "qta": return ((a.qta || 0) - (b.qta || 0)) * dir;
        case "vino": return ((a.vino_desc || "").toLowerCase() < (b.vino_desc || "").toLowerCase() ? -1 : 1) * dir;
        case "modalita": {
          const ma = (a.note || "").includes("[CALICI]") ? "C" : "B";
          const mb = (b.note || "").includes("[CALICI]") ? "C" : "B";
          return (ma < mb ? -1 : 1) * dir;
        }
        case "locazione": return ((a.locazione || "") < (b.locazione || "") ? -1 : 1) * dir;
        case "utente": return ((a.utente || "") < (b.utente || "") ? -1 : 1) * dir;
        default: return 0;
      }
    });
  }, [movimenti, sortKey, sortDir]);

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
          `${API_BASE}/vini/magazzino/autocomplete?q=${encodeURIComponent(searchText)}&limit=8&solo_disponibili=true`
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
    setSelectedCelle([]);
    setMatriceStato(null);
    setMyCelleMatrice([]);
  };

  // ── Matrice: detect se loc3 è matrice e carica griglia ──
  const isLoc3Matrice = selectedVino && /^\(\d+,\d+\)/.test((selectedVino.LOCAZIONE_3 || "").trim());

  const fetchMatriceData = useCallback(async () => {
    if (!selectedVino || !isLoc3Matrice) return;
    setMatriceLoading(true);
    try {
      const [rStato, rCelle] = await Promise.all([
        apiFetch(`${API_BASE}/vini/cantina-tools/matrice/stato`),
        apiFetch(`${API_BASE}/vini/cantina-tools/matrice/celle/${selectedVino.id}`),
      ]);
      if (rStato.ok) setMatriceStato(await rStato.json());
      if (rCelle.ok) {
        const data = await rCelle.json();
        setMyCelleMatrice(data.celle || []);
      }
    } catch { /* silenzioso */ }
    setMatriceLoading(false);
  }, [selectedVino, isLoc3Matrice]);

  // Quando cambia locazione a loc3-matrice, carica la griglia
  useEffect(() => {
    if (regLoc === "loc3" && isLoc3Matrice) {
      fetchMatriceData();
      setSelectedCelle([]);
    } else {
      setSelectedCelle([]);
    }
  }, [regLoc, isLoc3Matrice, fetchMatriceData]);

  // Toggle selezione cella per vendita
  const toggleCella = (riga, colonna) => {
    const key = `${riga},${colonna}`;
    setSelectedCelle(prev => {
      const exists = prev.some(c => `${c.riga},${c.colonna}` === key);
      if (exists) return prev.filter(c => `${c.riga},${c.colonna}` !== key);
      return [...prev, { riga, colonna }];
    });
  };

  // Quando le celle selezionate cambiano, aggiorna la quantità
  useEffect(() => {
    if (regLoc === "loc3" && isLoc3Matrice && selectedCelle.length > 0) {
      setRegQta(String(selectedCelle.length));
    }
  }, [selectedCelle, regLoc, isLoc3Matrice]);

  // ── Registra vendita ──
  // "Attiva calice da bottiglia residua": click dal bottone +🥂 in storico
  // vendite. Caso: bottiglia venduta come intera, il cliente la lascia
  // avanzata, decidiamo di servire i calici residui. NON crea movimento
  // (la bottiglia era già stata venduta), si limita ad attivare il flag
  // BOTTIGLIA_APERTA=1 + DATA_APERTURA. Se il vino non è in carta calici
  // (VENDITA_CALICE != SI), apre il modale DecidiPrezzoCalice per fissare
  // il prezzo manuale. Sessione 2026-05-11.
  const [attivandoCaliceId, setAttivandoCaliceId] = useState(null);
  const attivaCaliceDaResiduo = async (movimento) => {
    if (!movimento?.vino_id) return;
    setAttivandoCaliceId(movimento.id);
    try {
      // Pre-carica il vino completo (lo storico ha solo vino_id/desc/produttore)
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${movimento.vino_id}`);
      if (!r.ok) throw new Error("Vino non trovato");
      const vino = await r.json();
      // Se già aperta, basta un toast informativo
      if (vino.BOTTIGLIA_APERTA) {
        setSubmitMsg(`ℹ ${vino.DESCRIZIONE} è già in mescita.`);
        setTimeout(() => setSubmitMsg(""), 4000);
        return;
      }
      // Se VENDITA_CALICE = 1 → patch diretto BOTTIGLIA_APERTA=1 (V-H.E: INTEGER 0/1)
      if (vino.VENDITA_CALICE === 1) {
        await patchAttivaCalice(vino.id);
        setSubmitMsg(`✅ 🥂 ${vino.DESCRIZIONE} attivato per i calici.`);
        setTimeout(() => setSubmitMsg(""), 4000);
        return;
      }
      // Altrimenti: apri modale DecidiPrezzoCalice
      const carta = Number(vino.PREZZO_CARTA || 0);
      const defaultPrezzo = carta > 0 ? roundToHalf(carta / 5) : 0;
      setDecidiPrezzo({
        vino,
        defaultPrezzo,
        // flag interno per indicare "no movimento, solo attivazione"
        soloAttivazione: true,
      });
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
      setTimeout(() => setSubmitMsg(""), 5000);
    } finally {
      setAttivandoCaliceId(null);
    }
  };


  // PATCH che attiva BOTTIGLIA_APERTA=1 (DATA_APERTURA viene gestita backend)
  const patchAttivaCalice = async (vinoId, extra = {}) => {
    const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/bottiglia-aperta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ BOTTIGLIA_APERTA: 1, ...extra }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Errore ${r.status}`);
    }
    // Refresh storico + widget (CaliciDisponibili si autocarica al prossimo mount,
    // ma forziamo un refetch dei dati lato pagina)
    fetchMovimenti(true);
    fetchStats();
  };

  // Esegue effettivamente la POST del movimento. Estratto da submitVendita
  // perché può essere chiamato sia direttamente sia dopo la conferma del modale
  // "Decidi prezzo calice" (con prezzo+nota aggiuntiva).
  const eseguiVendita = async ({ extraNota = "", prezzoCustom = null } = {}) => {
    const qtaNum = Number(regQta);
    setSubmitting(true);
    setSubmitMsg("");
    try {
      // Se il sommelier ha scelto un prezzo custom per il calice, propaga il
      // valore nell'anagrafica del vino PRIMA della registrazione movimento.
      // Setta anche PREZZO_CALICE_MANUALE=1 per non farlo sovrascrivere dai
      // ricalcoli automatici (logica già usata in vini_pricing_router).
      if (prezzoCustom != null) {
        const resPatch = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            PREZZO_CALICE: prezzoCustom,
            PREZZO_CALICE_MANUALE: 1,
          }),
        });
        if (!resPatch.ok) {
          const err = await resPatch.json().catch(() => ({}));
          throw new Error(`Errore PATCH prezzo calice: ${err.detail || resPatch.status}`);
        }
      }

      // Compone nota: tag modalità + nota utente + eventuale extraNota (motivazione)
      const modTag = `[${modalita}]`;
      const notaParts = [modTag];
      if (regNote.trim()) notaParts.push(regNote.trim());
      if (extraNota && extraNota.trim()) notaParts.push(`[MOTIV: ${extraNota.trim()}]`);
      const notaFinale = notaParts.join(" ");

      const payload = {
        tipo: "VENDITA",
        qta: qtaNum,
        locazione: regLoc,
        note: notaFinale,
      };
      if (regLoc === "loc3" && isLoc3Matrice && selectedCelle.length > 0) {
        payload.celle_matrice = selectedCelle.map(c => [c.riga, c.colonna]);
      }

      const res = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      const modInfo = MODALITA[modalita];
      setSubmitMsg(`✅ ${modInfo.icon} ${modInfo.label} — ${qtaNum} bt di ${selectedVino.DESCRIZIONE}`);
      clearVino();
      setRegQta("1");
      setRegNote("");
      setTimeout(() => setSubmitMsg(""), 5000);
      fetchMovimenti(true);
      fetchStats();
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const submitVendita = async () => {
    if (!selectedVino) { alert("Seleziona un vino dalla ricerca."); return; }
    const qtaNum = Number(regQta);
    if (!regQta || qtaNum <= 0) { alert("Inserisci una quantità valida (> 0)."); return; }
    if (!regLoc) { alert("Seleziona la locazione da cui scalare."); return; }

    if (regLoc === "loc3" && isLoc3Matrice && selectedCelle.length === 0) {
      alert("Seleziona dalla griglia le celle da svuotare."); return;
    }

    // Intercetto: modalità CALICI su vino con VENDITA_CALICE != 'SI' e bottiglia
    // non ancora aperta → apri modale "Decidi prezzo calice" (sessione 2026-05-11).
    // Logica: è una scelta del sommelier, deve fissare lui il prezzo.
    const isCaliceNonStd =
      modalita === "CALICI" &&
      selectedVino.VENDITA_CALICE !== 1 &&
      !selectedVino.BOTTIGLIA_APERTA;
    if (isCaliceNonStd) {
      const carta = Number(selectedVino.PREZZO_CARTA || 0);
      const defaultPrezzo = carta > 0 ? roundToHalf(carta / 5) : 0;
      setDecidiPrezzo({ vino: selectedVino, defaultPrezzo });
      return; // attende conferma utente nel modale, poi chiama eseguiVendita
    }

    await eseguiVendita();
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
    <div className="min-h-screen bg-brand-cream">
      <ViniNav current="vendite" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

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
            <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini")} className="self-start">
              ← Menu Vini
            </Btn>
          </div>
        </div>

        {/* ── KPI RAPIDI ──────────────────────────────────── */}
        {stats && (
          <div className="space-y-4">
            {/* Vendite bottiglie */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiTile label="Vendute oggi" value={stats.vendute_oggi ?? 0} unit="bt" color="violet" />
              <KpiTile label="Vendute 7gg" value={stats.vendute_7gg} unit="bt" color="violet" />
              <KpiTile label="Vendute 30gg" value={stats.vendute_30gg} unit="bt" color="violet" />
              <KpiTile label="Bottiglie in cantina" value={stats.total_bottiglie} unit="bt" color="amber" />
            </div>
            {/* Aperte per calici */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiTile label="Aperte oggi" value={stats.aperte_oggi ?? 0} unit="bt" color="rose" />
              <KpiTile label="Aperte 7gg" value={stats.aperte_7gg ?? 0} unit="bt" color="rose" />
              <KpiTile label="Aperte 30gg" value={stats.aperte_30gg ?? 0} unit="bt" color="rose" />
            </div>
          </div>
        )}

        {/* ── CALICI DISPONIBILI (sessione 58) ────────────── */}
        <CaliciDisponibiliCard
          onClick={(v) => navigate(`/vini/magazzino/${v.id}`)}
        />

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
                  <Tooltip label="Deseleziona vino">
                    <button
                      type="button"
                      onClick={clearVino}
                      className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-neutral-200 text-neutral-500 hover:bg-red-100 hover:text-red-600 transition text-xs font-bold"
                    >
                      ✕
                    </button>
                  </Tooltip>
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
                readOnly={regLoc === "loc3" && isLoc3Matrice}
                placeholder="1"
                className={`w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  regLoc === "loc3" && isLoc3Matrice ? "bg-neutral-100 cursor-not-allowed" : ""
                }`}
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

          {/* Griglia matrice — full width sotto il form */}
          {regLoc === "loc3" && isLoc3Matrice && (
            <div className="mt-4">
              {matriceLoading ? (
                <div className="text-sm text-neutral-400 py-4 text-center">Caricamento griglia…</div>
              ) : matriceStato && matriceStato.righe > 0 ? (
                <div className="border border-violet-200 rounded-2xl p-4 bg-violet-50/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                      Tocca le tue bottiglie per selezionare quelle da scaricare
                    </span>
                    {selectedCelle.length > 0 && (
                      <span className="text-sm font-bold text-violet-600 bg-violet-100 px-3 py-1 rounded-full">
                        {selectedCelle.length} {selectedCelle.length === 1 ? "bottiglia" : "bottiglie"}
                      </span>
                    )}
                  </div>
                  {/* Legenda */}
                  <div className="flex flex-wrap gap-4 mb-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-500 border border-violet-600 inline-block"></span> Selezionata</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-400 border border-amber-500 inline-block"></span> Tua bottiglia</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-neutral-300 border border-neutral-400 inline-block"></span> Altro vino</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white border border-neutral-200 inline-block"></span> Vuota</span>
                  </div>
                  <div className="overflow-x-auto pb-2">
                    <div className="inline-block">
                      {/* Intestazione colonne */}
                      <div className="flex">
                        <div className="w-8 h-8"></div>
                        {Array.from({ length: matriceStato.colonne }, (_, c) => (
                          <div key={c} className="w-12 h-8 text-center text-xs font-bold text-neutral-500 flex items-end justify-center">{c + 1}</div>
                        ))}
                      </div>
                      {/* Righe */}
                      {Array.from({ length: matriceStato.righe }, (_, r) => {
                        const riga = r + 1;
                        return (
                          <div key={r} className="flex">
                            <div className="w-8 h-12 flex items-center justify-center text-xs font-bold text-neutral-500">{riga}</div>
                            {Array.from({ length: matriceStato.colonne }, (_, c) => {
                              const colonna = c + 1;
                              const cellKey = `${riga},${colonna}`;
                              const isMine = myCelleMatrice.some(mc => mc.riga === riga && mc.colonna === colonna);
                              const isSelected = selectedCelle.some(sc => sc.riga === riga && sc.colonna === colonna);
                              const occupiedCell = (matriceStato.celle || []).find(mc => mc.riga === riga && mc.colonna === colonna);
                              const isOther = occupiedCell && !isMine;

                              let cls = "w-12 h-12 border text-base font-semibold flex items-center justify-center rounded-lg transition-all ";
                              if (isSelected) {
                                cls += "bg-violet-500 border-violet-600 text-white ring-2 ring-violet-300 cursor-pointer scale-105";
                              } else if (isMine) {
                                cls += "bg-amber-400 border-amber-500 text-white cursor-pointer hover:bg-violet-400 hover:border-violet-500 hover:scale-105 active:scale-95";
                              } else if (isOther) {
                                cls += "bg-neutral-200 border-neutral-300 text-neutral-400 cursor-not-allowed";
                              } else {
                                cls += "bg-white border-neutral-100 cursor-not-allowed";
                              }

                              return (
                                <div key={cellKey} className={cls}
                                  onClick={() => isMine && toggleCella(riga, colonna)}
                                  title={
                                    isSelected ? `Selezionata: (${colonna},${riga}) — click per deselezionare` :
                                    isMine ? `Tua: (${colonna},${riga}) — click per selezionare` :
                                    isOther ? `Occupata da: ${occupiedCell.DESCRIZIONE || "?"}` :
                                    "Vuota"
                                  }>
                                  {isSelected ? "✓" : isMine ? "●" : isOther ? "·" : ""}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

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
              <Btn variant="primary" size="md" type="button" onClick={applicaFiltri} className="flex-1">
                Filtra
              </Btn>
              <Btn variant="secondary" size="md" type="button" onClick={resetFiltri}>
                Reset
              </Btn>
            </div>
          </div>

          {/* Tabella vendite */}
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide select-none">
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("data")}>Data <SortIcon col="data" /></th>
                  <th className="px-3 py-2 text-center cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("modalita")}>Modalità <SortIcon col="modalita" /></th>
                  <th className="px-3 py-2 text-center cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("qta")}>Qtà <SortIcon col="qta" /></th>
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("vino")}>Vino <SortIcon col="vino" /></th>
                  <th className="px-3 py-2 text-left hidden md:table-cell cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("locazione")}>Locazione <SortIcon col="locazione" /></th>
                  <th className="px-3 py-2 text-left hidden md:table-cell">Note</th>
                  <th className="px-3 py-2 text-left hidden md:table-cell cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("utente")}>Utente <SortIcon col="utente" /></th>
                  <th className="px-3 py-2 text-center w-16">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                      Caricamento...
                    </td>
                  </tr>
                )}

                {!movLoading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                      Nessuna vendita trovata.
                    </td>
                  </tr>
                )}

                {movimentiOrdinati.map((m) => {
                  const mod = parseModalita(m.note);
                  const modInfo = mod ? MODALITA[mod] : null;
                  const isAttivazione = mod === "ATTIVAZIONE";
                  // Rimuovi i tag [BOTTIGLIA] | [CALICI] | [CALICI-RESIDUO] dalla nota visualizzata
                  const notePulita = (m.note || "")
                    .replace(/\[(BOTTIGLIA|CALICI-RESIDUO|CALICI)\]\s*/g, "")
                    .trim();
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
                        {isAttivazione ? <span className="text-neutral-300">—</span> : m.qta}
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
                      <td className="px-3 py-2.5 text-center">
                        {mod === "BOTTIGLIA" && (
                          <Tooltip label="Attiva calice da bottiglia residua (es. cliente che lascia bottiglia non finita). Non crea movimento, marca solo la bottiglia come in mescita e ti chiede il prezzo se non è in carta calici.">
                            <button
                              type="button"
                              onClick={() => attivaCaliceDaResiduo(m)}
                              disabled={attivandoCaliceId === m.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 hover:border-rose-300 transition disabled:opacity-50"
                            >
                              {attivandoCaliceId === m.id ? "…" : "+🥂"}
                            </button>
                          </Tooltip>
                        )}
                        {/* Sulla riga ATTIVAZIONE non c'è azione: per annullare
                            si cancella il movimento dal tab Movimenti della
                            scheda vino (🗑), il backend chiude la bottiglia
                            in atomico. */}
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
              <Btn
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Precedente
              </Btn>
              <span className="text-sm text-neutral-500">
                Pagina {page + 1} di {totalPages}
              </span>
              <Btn
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Successiva →
              </Btn>
            </div>
          )}
        </div>

      </div>

      {/* Modale "Decidi prezzo calice" (sessione 2026-05-11) */}
      {decidiPrezzo && (
        <DecidiPrezzoCalice
          vino={decidiPrezzo.vino}
          defaultPrezzo={decidiPrezzo.defaultPrezzo}
          onCancel={() => setDecidiPrezzo(null)}
          onConfirm={async ({ prezzo, nota }) => {
            const soloAtt = decidiPrezzo.soloAttivazione;
            const vino = decidiPrezzo.vino;
            setDecidiPrezzo(null);
            if (soloAtt) {
              // Caso "Attiva calice da bottiglia residua": niente movimento,
              // solo PATCH per attivare la mescita + nuovo prezzo manuale.
              try {
                const extra = {
                  PREZZO_CALICE: prezzo,
                  PREZZO_CALICE_MANUALE: 1,
                };
                if (nota && nota.trim()) {
                  // Concateno la nota motivazione alle NOTE del vino (audit
                  // veloce dal dettaglio scheda). Pattern coerente con i
                  // marker [MOTIV:...] usati nei movimenti vendita.
                  extra.NOTE = `[MOTIV ${new Date().toISOString().slice(0,10)}] ${nota.trim()}`;
                }
                await patchAttivaCalice(vino.id, extra);
                setSubmitMsg(`✅ 🥂 ${vino.DESCRIZIONE} attivato per calici a € ${prezzo.toFixed(2)}.`);
                setTimeout(() => setSubmitMsg(""), 5000);
              } catch (err) {
                setSubmitMsg(`❌ ${err.message}`);
                setTimeout(() => setSubmitMsg(""), 5000);
              }
              return;
            }
            // Caso normale: vendita al calice di un vino NON ancora al calice.
            // Devo fare DUE cose: registrare la vendita E aprire la bottiglia
            // in mescita (= settare BOTTIGLIA_APERTA=1 + VENDITA_CALICE=1 se
            // non già + prezzo calice manuale). Fix 2026-06-24 (Marco #1310):
            // prima qui c'era solo `eseguiVendita` → il movimento risultava
            // "Calici" nello storico (badge dalla nota [CALICI]) ma il vino
            // restava con BOTTIGLIA_APERTA=0 → widget Calici NON lo mostrava.
            // L'attivazione è best-effort: se fallisce la vendita resta
            // valida e segnalo il problema nel msg.
            await eseguiVendita({ extraNota: nota, prezzoCustom: prezzo });
            try {
              const extra = {
                PREZZO_CALICE: prezzo,
                PREZZO_CALICE_MANUALE: 1,
              };
              if (vino.VENDITA_CALICE !== 1) extra.VENDITA_CALICE = 1;
              await patchAttivaCalice(vino.id, extra);
            } catch (err) {
              setSubmitMsg(prev =>
                `${prev || `✅ Vendita registrata`} ⚠ Attivazione mescita fallita: ${err.message}`
              );
              setTimeout(() => setSubmitMsg(""), 7000);
            }
          }}
        />
      )}
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
