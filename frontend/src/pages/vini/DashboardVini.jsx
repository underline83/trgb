// src/pages/vini/DashboardVini.jsx
// @version: v4.13-alert-widget-faseE — Toggle "Raggruppa per distributore" (persistenza localStorage); in modalita' raggruppata rendering <details> open per ogni fornitore con conteggio; compatibile con filtro tipologia
// Dashboard Vini — KPI in alto, alert compattato, vendite/movimenti/distribuzione

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";
import { STATO_RIORDINO, STATO_CONSERVAZIONE } from "../../config/viniConstants";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import useToast from "../../hooks/useToast";

// ─────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────
const TIPO_COLORS = {
  CARICO:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCARICO:   "bg-red-100    text-red-800    border-red-200",
  VENDITA:   "bg-violet-100 text-violet-800 border-violet-200",
  RETTIFICA: "bg-amber-100  text-amber-800  border-amber-200",
};

const TIPO_EMOJI = {
  CARICO:    "⬆️",
  SCARICO:   "⬇️",
  VENDITA:   "🛒",
  RETTIFICA: "✏️",
};

const ALERT_COLLAPSED_SHOW = 5;

function fmtNum(val, decimals = 2) {
  if (val == null) return null;
  return Number(val).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

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

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────
export default function DashboardVini() {
  const navigate = useNavigate();

  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [riordSort, setRiordSort] = useState({ key: null, dir: "asc" });
  const [mostraGiacPositiva, setMostraGiacPositiva] = useState(false);
  const toggleRiordSort = (key) => setRiordSort(prev =>
    prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
  );
  const [alertExpanded, setAlertExpanded] = useState(false);
  // Fase D — filtro rapido tipologia nel widget alert (reset a ogni refresh pagina).
  // Valori: null = tutti, "ROSSI" | "BIANCHI" | "BOLLICINE" | "ROSATI" | "ALTRI".
  const [tipoFiltro, setTipoFiltro] = useState(null);
  // Fase E — raggruppa per distributore (persistenza localStorage).
  const [raggruppaDistr, setRaggruppaDistr] = useState(() => {
    try { return localStorage.getItem("vini_alert_raggruppa") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("vini_alert_raggruppa", raggruppaDistr ? "true" : "false"); } catch { /* noop */ }
  }, [raggruppaDistr]);
  const [fermiExpanded, setFermiExpanded] = useState(false);
  const FERMI_INITIAL_SHOW = 15;

  // ── Modale "Duplica con nuova annata" (Fase 2) ──────────
  const { toast } = useToast();
  const [duplicaVino, setDuplicaVino]     = useState(null);  // vino sorgente o null
  const [duplicaAnnata, setDuplicaAnnata] = useState("");
  const [duplicaSaving, setDuplicaSaving] = useState(false);

  const openDuplica = (v) => {
    setDuplicaVino(v);
    setDuplicaAnnata(v?.ANNATA ? String(v.ANNATA) : "");
  };
  const closeDuplica = () => {
    if (duplicaSaving) return;
    setDuplicaVino(null);
    setDuplicaAnnata("");
  };
  const submitDuplica = async () => {
    if (!duplicaVino) return;
    const ann = (duplicaAnnata || "").trim();
    if (!ann) {
      toast("Inserisci un'annata", { kind: "warn" });
      return;
    }
    if (String(ann) === String(duplicaVino.ANNATA ?? "")) {
      toast("L'annata coincide con quella originale", { kind: "warn" });
      return;
    }
    setDuplicaSaving(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${duplicaVino.id}/duplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annata: ann }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      toast(`Duplicato — annata ${ann}`, { kind: "success" });
      setDuplicaVino(null);
      setDuplicaAnnata("");
      fetchStats(mostraGiacPositiva);
    } catch (e) {
      toast("Errore duplicazione: " + (e?.message || ""), { kind: "error" });
    } finally {
      setDuplicaSaving(false);
    }
  };

  // ── Ordini pending per widget Riordini (Fase 4) ─────────
  // Mappa { [vino_id]: { qta, data_ordine, note, utente, updated_at } }
  const [ordiniPending, setOrdiniPending] = useState({});
  const [ordineVino, setOrdineVino]       = useState(null);  // vino target modale
  const [ordineQta, setOrdineQta]         = useState("");
  const [ordineNote, setOrdineNote]       = useState("");
  const [ordineSaving, setOrdineSaving]   = useState(false);
  const [ordineDeleting, setOrdineDeleting] = useState(false);
  const [ordineArriving, setOrdineArriving] = useState(false);  // Fase 5: conferma arrivo merce

  // ── Listino inline edit per widget Riordini (Fase 7) ────
  // listinoEditing = id del vino attualmente in edit (null se nessuno)
  // listinoDraft   = valore stringa dell'input (consente virgola/punto)
  // listinoSaving  = flag salvataggio in corso → disabilita input
  const [listinoEditing, setListinoEditing] = useState(null);
  const [listinoDraft, setListinoDraft]     = useState("");
  const [listinoSaving, setListinoSaving]   = useState(false);

  const openListinoEdit = (v) => {
    setListinoEditing(v.id);
    setListinoDraft(v.EURO_LISTINO != null ? String(v.EURO_LISTINO).replace(".", ",") : "");
  };
  const cancelListinoEdit = () => {
    if (listinoSaving) return;
    setListinoEditing(null);
    setListinoDraft("");
  };
  const saveListino = async (v) => {
    if (listinoSaving) return;
    const raw = String(listinoDraft).trim().replace(",", ".");
    // Null allowed (clear the field)
    let nuovo = null;
    if (raw !== "") {
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n < 0) {
        toast("Valore non valido: usa un numero ≥ 0 (es. 12,50)", { kind: "warn" });
        return;
      }
      nuovo = Math.round(n * 100) / 100;
    }
    const vecchio = v.EURO_LISTINO != null ? Number(v.EURO_LISTINO) : null;
    // No-op: stesso valore (tolleranza 0.01)
    if (
      (vecchio == null && nuovo == null) ||
      (vecchio != null && nuovo != null && Math.abs(vecchio - nuovo) < 0.005)
    ) {
      cancelListinoEdit();
      return;
    }
    setListinoSaving(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ EURO_LISTINO: nuovo }),
      });
      if (!resp.ok) {
        let msg = "HTTP " + resp.status;
        try { const err = await resp.json(); if (err?.detail) msg = err.detail; } catch {}
        throw new Error(msg);
      }
      const updated = await resp.json();
      // Patch ottimistica: aggiorno la riga nel widget riordini con tutti i campi
      // tornati dal BE (include il PREZZO_CARTA ricalcolato automaticamente).
      setStats((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (Array.isArray(prev.riordini_per_fornitore)) {
          next.riordini_per_fornitore = prev.riordini_per_fornitore.map((x) =>
            x.id === v.id ? { ...x, ...updated } : x
          );
        }
        if (Array.isArray(prev.alert_carta_senza_giacenza)) {
          next.alert_carta_senza_giacenza = prev.alert_carta_senza_giacenza.map((x) =>
            x.id === v.id ? { ...x, ...updated } : x
          );
        }
        return next;
      });
      toast(
        nuovo == null
          ? "Listino rimosso"
          : `Listino aggiornato — ${fmtNum(nuovo)} €`,
        { kind: "success" }
      );
      setListinoEditing(null);
      setListinoDraft("");
    } catch (e) {
      toast("Errore salvataggio listino: " + (e?.message || ""), { kind: "error" });
    } finally {
      setListinoSaving(false);
    }
  };

  const fetchOrdiniPending = useCallback(async () => {
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/ordini-pending/`);
      if (!resp.ok) return;
      const arr = await resp.json();
      const map = {};
      (arr || []).forEach((o) => { if (o?.vino_id != null) map[o.vino_id] = o; });
      setOrdiniPending(map);
    } catch {
      // silenzioso: il widget continua a funzionare anche senza ordini
    }
  }, []);

  const openOrdine = (v) => {
    const existing = ordiniPending[v.id];
    setOrdineVino(v);
    // Priorita' input qta: 1) ordine pending esistente, 2) qta_suggerita (da storico 60gg),
    // 3) stringa vuota. Cosi' se Marco clicca "+ ordina" su un vino con storico vendite,
    // trova gia' il numero suggerito e puo' solo confermare o modificare.
    let defaultQta = "";
    if (existing?.qta != null) defaultQta = String(existing.qta);
    else if (typeof v?.qta_suggerita === "number" && v.qta_suggerita > 0) defaultQta = String(v.qta_suggerita);
    setOrdineQta(defaultQta);
    setOrdineNote(existing?.note || "");
  };
  const closeOrdine = () => {
    if (ordineSaving || ordineDeleting || ordineArriving) return;
    setOrdineVino(null);
    setOrdineQta("");
    setOrdineNote("");
  };
  const submitOrdine = async () => {
    if (!ordineVino) return;
    const n = parseInt(String(ordineQta).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      toast("Inserisci una quantità > 0", { kind: "warn" });
      return;
    }
    setOrdineSaving(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${ordineVino.id}/ordine-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qta: n, note: (ordineNote || "").trim() || null }),
      });
      if (!resp.ok) {
        let msg = "HTTP " + resp.status;
        try { const err = await resp.json(); if (err?.detail) msg = err.detail; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      setOrdiniPending((prev) => ({ ...prev, [ordineVino.id]: data.ordine }));
      toast(`Ordine salvato — ${n} bt`, { kind: "success" });
      setOrdineVino(null);
      setOrdineQta("");
      setOrdineNote("");
    } catch (e) {
      toast("Errore salvataggio ordine: " + (e?.message || ""), { kind: "error" });
    } finally {
      setOrdineSaving(false);
    }
  };
  const deleteOrdine = async () => {
    if (!ordineVino) return;
    const existing = ordiniPending[ordineVino.id];
    if (!existing) return;
    const ok = window.confirm(
      `Cancellare l'ordine di ${existing.qta} bt per\n"${ordineVino.DESCRIZIONE}"?`
    );
    if (!ok) return;
    setOrdineDeleting(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${ordineVino.id}/ordine-pending`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        let msg = "HTTP " + resp.status;
        try { const err = await resp.json(); if (err?.detail) msg = err.detail; } catch {}
        throw new Error(msg);
      }
      setOrdiniPending((prev) => {
        const next = { ...prev };
        delete next[ordineVino.id];
        return next;
      });
      toast("Ordine cancellato", { kind: "success" });
      setOrdineVino(null);
      setOrdineQta("");
      setOrdineNote("");
    } catch (e) {
      toast("Errore cancellazione ordine: " + (e?.message || ""), { kind: "error" });
    } finally {
      setOrdineDeleting(false);
    }
  };

  // Fase 5: conferma arrivo merce → chiude pending + crea CARICO atomico.
  // La `qta_ricevuta` è il valore dell'input (l'utente può modificarlo se
  // la merce arrivata è diversa da quella ordinata). Il BE logga la
  // differenza nelle note del movimento.
  const confermaArrivo = async () => {
    if (!ordineVino) return;
    const existing = ordiniPending[ordineVino.id];
    if (!existing) return;
    const n = parseInt(String(ordineQta).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      toast("Inserisci la quantità ricevuta (> 0)", { kind: "warn" });
      return;
    }
    const diff = n - existing.qta;
    const msg = diff === 0
      ? `Confermare l'arrivo di ${n} bt per\n"${ordineVino.DESCRIZIONE}"?\n\n→ L'ordine viene chiuso e la giacenza aumenta di ${n}.`
      : `Ordinate: ${existing.qta} bt\nRicevute: ${n} bt\nDifferenza: ${diff > 0 ? "+" : ""}${diff}\n\n"${ordineVino.DESCRIZIONE}"\n\n→ Registrare CARICO di ${n} bt e chiudere l'ordine?`;
    if (!window.confirm(msg)) return;
    setOrdineArriving(true);
    try {
      const resp = await apiFetch(
        `${API_BASE}/vini/magazzino/${ordineVino.id}/ordine-pending/conferma-arrivo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qta_ricevuta: n,
            note: (ordineNote || "").trim() || null,
          }),
        }
      );
      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { const err = await resp.json(); if (err?.detail) errMsg = err.detail; } catch {}
        throw new Error(errMsg);
      }
      // Rimuove il pending dallo state locale (ottimistico)
      setOrdiniPending((prev) => {
        const next = { ...prev };
        delete next[ordineVino.id];
        return next;
      });
      toast(
        diff === 0
          ? `Arrivo confermato — ${n} bt in giacenza`
          : `Arrivo confermato — ${n} bt (delta ${diff > 0 ? "+" : ""}${diff})`,
        { kind: "success" }
      );
      setOrdineVino(null);
      setOrdineQta("");
      setOrdineNote("");
      // La giacenza è cambiata → refresh del dashboard.
      fetchStats(mostraGiacPositiva);
    } catch (e) {
      toast("Errore conferma arrivo: " + (e?.message || ""), { kind: "error" });
    } finally {
      setOrdineArriving(false);
    }
  };

  const toggleDrilldown = (key) =>
    setDrilldown((prev) => (prev === key ? null : key));

  // Fase C — cambia STATO_RIORDINO di un vino dal widget alert.
  // Se clicco lo stato corrente → clear (null). Altrimenti imposta il nuovo valore.
  // Logica "toggle non ricomprare" e' ora un caso d'uso di questa funzione (STATO_RIORDINO='X').
  const setStatoRiordino = async (vino, nuovoStato) => {
    const corrente = vino.STATO_RIORDINO || null;
    const target = (corrente === nuovoStato) ? null : nuovoStato;
    setTogglingId(vino.id);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${vino.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ STATO_RIORDINO: target }),
      });
      if (!resp.ok) throw new Error();
      setStats((prev) => ({
        ...prev,
        alert_carta_senza_giacenza: prev.alert_carta_senza_giacenza.map((v) =>
          v.id === vino.id ? { ...v, STATO_RIORDINO: target } : v
        ),
      }));
    } catch {
      toast("Errore aggiornamento stato riordino", { kind: "error" });
    } finally {
      setTogglingId(null);
    }
  };

  const fetchStats = useCallback(async (giacPositiva) => {
    setLoading(true);
    setError("");
    try {
      const qs = giacPositiva ? "?includi_giacenza_positiva=true" : "";
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/dashboard${qs}`);
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);
      const data = await resp.json();
      setStats(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message || "Errore caricamento dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(mostraGiacPositiva);
  }, [fetchStats, mostraGiacPositiva]);

  // Fase 4: carico in parallelo la mappa degli ordini pending.
  // Fetch indipendente dal dashboard — non bloccante, non si refetcha al toggle giacenze.
  useEffect(() => {
    fetchOrdiniPending();
  }, [fetchOrdiniPending]);

  // ── KPI tiles ────────────────────────────────────────────
  const kpiStock = stats
    ? [
        {
          label: "Bottiglie in cantina", value: stats.total_bottiglie,
          icon: "🍾", color: "bg-amber-50 border-amber-200 text-amber-900",
          sub: `su ${stats.referenze_attive ?? stats.total_vini} referenze attive`,
        },
        {
          label: "Vini in carta", value: stats.vini_in_carta,
          icon: "📋", color: "bg-emerald-50 border-emerald-200 text-emerald-900",
          sub: `${stats.total_vini > 0 ? Math.round((stats.vini_in_carta / stats.total_vini) * 100) : 0}% del catalogo`,
        },
        {
          label: "Senza prezzo listino", value: stats.vini_senza_listino,
          icon: "⚠️",
          color: stats.vini_senza_listino > 0
            ? "bg-orange-50 border-orange-200 text-orange-900"
            : "bg-neutral-50 border-neutral-200 text-neutral-700",
          sub: stats.vini_senza_listino > 0 ? "clicca per vedere la lista" : "tutto ok",
          drilldownKey: "senza_listino", clickable: stats.vini_senza_listino > 0,
        },
        {
          label: "Vini fermi (30gg)",
          value: stats.total_vini_fermi ?? stats.vini_fermi?.length ?? 0,
          icon: "💤",
          color: (stats.total_vini_fermi ?? stats.vini_fermi?.length ?? 0) > 0
            ? "bg-slate-50 border-slate-300 text-slate-800"
            : "bg-neutral-50 border-neutral-200 text-neutral-700",
          sub: (stats.total_vini_fermi ?? stats.vini_fermi?.length ?? 0) > 0 ? "in cantina, senza movimenti" : "tutto si muove",
          drilldownKey: "vini_fermi",
          clickable: (stats.total_vini_fermi ?? stats.vini_fermi?.length ?? 0) > 0,
        },
      ]
    : [];

  const kpiVendite = stats
    ? [
        { label: "Vendute oggi", value: stats.vendute_oggi ?? 0, icon: "🛒", color: "bg-violet-50 border-violet-200 text-violet-900", sub: "bottiglie" },
        { label: "Vendute 7gg",  value: stats.vendute_7gg ?? 0,  icon: "🛒", color: "bg-violet-50 border-violet-200 text-violet-900", sub: "bottiglie" },
        { label: "Vendute 30gg", value: stats.vendute_30gg ?? 0, icon: "📈", color: "bg-violet-50 border-violet-200 text-violet-900", sub: "bottiglie" },
      ]
    : [];

  const kpiAperte = stats
    ? [
        { label: "Aperte oggi", value: stats.aperte_oggi ?? 0, icon: "🥂", color: "bg-rose-50 border-rose-200 text-rose-900", sub: "calici" },
        { label: "Aperte 7gg",  value: stats.aperte_7gg ?? 0,  icon: "🥂", color: "bg-rose-50 border-rose-200 text-rose-900", sub: "calici" },
        { label: "Aperte 30gg", value: stats.aperte_30gg ?? 0, icon: "🥂", color: "bg-rose-50 border-rose-200 text-rose-900", sub: "calici" },
      ]
    : [];

  const kpiValori = stats
    ? [
        {
          label: "Valore acquisto",
          value: `${fmtNum((stats.valore_acquisto ?? 0) / 1000, 1)}k`,
          icon: "💰", color: "bg-teal-50 border-teal-200 text-teal-900",
          sub: `${(stats.valore_acquisto ?? 0).toLocaleString("it-IT", {minimumFractionDigits: 0, maximumFractionDigits: 0})} € (listino)`,
          raw: true,
        },
        {
          label: "Valore carta",
          value: `${fmtNum((stats.valore_carta ?? 0) / 1000, 1)}k`,
          icon: "📋", color: "bg-teal-50 border-teal-200 text-teal-900",
          sub: `${(stats.valore_carta ?? 0).toLocaleString("it-IT", {minimumFractionDigits: 0, maximumFractionDigits: 0})} € (prezzi carta)`,
          raw: true,
        },
      ]
    : [];

  const maxBottiglie = stats?.distribuzione_tipologie?.length
    ? Math.max(...stats.distribuzione_tipologie.map((d) => d.tot_bottiglie))
    : 1;

  // Alert data
  const alertAll = stats?.alert_carta_senza_giacenza ?? [];
  const urgenti = alertAll.filter((v) => v.STATO_RIORDINO !== "X");
  const nonRicomprare = alertAll.filter((v) => v.STATO_RIORDINO === "X");
  const alertCount = urgenti.length;

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="dashboard" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ── HEADER ───────────────────────────────────────── */}
        <div className="bg-white shadow-2xl rounded-3xl px-8 py-6 border border-neutral-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
                📊 Dashboard
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                Situazione operativa in tempo reale.
                {lastUpdate && (
                  <span className="ml-2 text-neutral-400">
                    Aggiornato alle {lastUpdate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Btn variant="primary" size="md" type="button" onClick={fetchStats} disabled={loading} loading={loading}>
                {loading ? "Carico…" : "⟳ Aggiorna"}
              </Btn>
              <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini")}>
                ← Menu Vini
              </Btn>
            </div>
          </div>
          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            KPI TILES — SEMPRE IN ALTO
            ══════════════════════════════════════════════════════ */}

        {/* Skeleton loading */}
        {loading && !stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 animate-pulse">
                <div className="h-4 bg-neutral-200 rounded w-2/3 mb-3" />
                <div className="h-8 bg-neutral-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-neutral-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {stats && (
          <div className="space-y-4">

            {/* Stock */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiStock.map((tile) => (
                <div key={tile.label}
                  onClick={() => tile.clickable && toggleDrilldown(tile.drilldownKey)}
                  className={`rounded-2xl border p-5 shadow-sm transition ${tile.color}
                    ${tile.clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}
                    ${drilldown === tile.drilldownKey ? "ring-2 ring-orange-400" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="text-2xl mb-2">{tile.icon}</div>
                    {tile.clickable && (
                      <span className="text-[10px] font-semibold opacity-50 uppercase tracking-wide">
                        {drilldown === tile.drilldownKey ? "▲ chiudi" : "▼ lista"}
                      </span>
                    )}
                  </div>
                  <div className="text-3xl font-bold tracking-tight">
                    {tile.value?.toLocaleString("it-IT")}
                  </div>
                  <div className="text-xs font-semibold mt-1 opacity-80">{tile.label}</div>
                  <div className="text-xs mt-0.5 opacity-60">{tile.sub}</div>
                </div>
              ))}
            </div>

            {/* Vendite + Aperte — 2 righe da 3 */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
              {kpiVendite.map((tile) => (
                <div key={tile.label} className={`rounded-2xl border p-4 shadow-sm ${tile.color}`}>
                  <div className="text-xl mb-1">{tile.icon}</div>
                  <div className="text-2xl font-bold tracking-tight">{tile.value?.toLocaleString("it-IT")}</div>
                  <div className="text-[11px] font-semibold mt-1 opacity-80">{tile.label}</div>
                  <div className="text-[11px] mt-0.5 opacity-60">{tile.sub}</div>
                </div>
              ))}
              {kpiAperte.map((tile) => (
                <div key={tile.label} className={`rounded-2xl border p-4 shadow-sm ${tile.color}`}>
                  <div className="text-xl mb-1">{tile.icon}</div>
                  <div className="text-2xl font-bold tracking-tight">{tile.value?.toLocaleString("it-IT")}</div>
                  <div className="text-[11px] font-semibold mt-1 opacity-80">{tile.label}</div>
                  <div className="text-[11px] mt-0.5 opacity-60">{tile.sub}</div>
                </div>
              ))}
            </div>

            {/* Valori */}
            <div className="grid grid-cols-2 gap-4">
              {kpiValori.map((tile) => (
                <div key={tile.label} className={`rounded-2xl border p-5 shadow-sm ${tile.color}`}>
                  <div className="text-2xl mb-2">{tile.icon}</div>
                  <div className="text-3xl font-bold tracking-tight">{tile.value}</div>
                  <div className="text-xs font-semibold mt-1 opacity-80">{tile.label}</div>
                  <div className="text-xs mt-0.5 opacity-60">{tile.sub}</div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── DRILLDOWN: SENZA LISTINO ─────────────────────── */}
        {drilldown === "senza_listino" && stats?.vini_senza_listino_list?.length > 0 && (
          <div className="bg-white rounded-3xl border border-orange-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-orange-900">{stats.vini_senza_listino_list.length} vini senza prezzo listino</div>
                <div className="text-xs text-orange-700 mt-0.5">Clicca su un vino per aprire la scheda e aggiungere il prezzo.</div>
              </div>
              <button type="button" onClick={() => setDrilldown(null)} className="text-orange-400 hover:text-orange-700 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-orange-50 sticky top-0">
                  <tr className="text-xs text-orange-700 uppercase tracking-wide border-b border-orange-100">
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Tipologia</th>
                    <th className="px-4 py-2 text-left">Vino</th>
                    <th className="px-4 py-2 text-left">Produttore</th>
                    <th className="px-4 py-2 text-center">Annata</th>
                    <th className="px-4 py-2 text-center">Prezzo carta</th>
                    <th className="px-4 py-2 text-center">Giacenza</th>
                    <th className="px-4 py-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.vini_senza_listino_list.map((v) => (
                    <tr key={v.id} className="border-b border-neutral-100 hover:bg-orange-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                      <td className="px-4 py-2"><span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">#{v.id}</span></td>
                      <td className="px-4 py-2 text-xs text-neutral-600">{v.TIPOLOGIA}</td>
                      <td className="px-4 py-2 font-semibold text-neutral-900">{v.DESCRIZIONE}</td>
                      <td className="px-4 py-2 text-neutral-600">{v.PRODUTTORE || "—"}</td>
                      <td className="px-4 py-2 text-center text-neutral-600">{v.ANNATA || "—"}</td>
                      <td className="px-4 py-2 text-center text-neutral-600">
                        {v.PREZZO_CARTA != null && v.PREZZO_CARTA !== "" ? `${fmtNum(v.PREZZO_CARTA)} €` : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-neutral-700">{v.QTA_TOTALE ?? 0} bt</td>
                      <td className="px-4 py-2 text-center text-amber-600 text-xs font-semibold">Apri →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DRILLDOWN: VINI FERMI ────────────────────────── */}
        {drilldown === "vini_fermi" && stats?.vini_fermi?.length > 0 && (() => {
          const fermiShow = fermiExpanded ? stats.vini_fermi : stats.vini_fermi.slice(0, FERMI_INITIAL_SHOW);
          const hasMoreFermi = stats.vini_fermi.length > FERMI_INITIAL_SHOW;
          const senzaMovimenti = stats.vini_fermi.filter(v => !v.ultimo_movimento).length;
          return (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{stats.vini_fermi.length} vini in cantina senza movimenti da 30+ giorni</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {senzaMovimenti > 0 && <span className="text-red-600 font-semibold">{senzaMovimenti} mai movimentati</span>}
                    {senzaMovimenti > 0 && " — "}
                    Da valutare: promuovere, riposizionare o correggere la giacenza.
                  </div>
                </div>
                <button type="button" onClick={() => setDrilldown(null)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
              </div>
              <div className="divide-y divide-neutral-100">
                {fermiShow.map((v) => (
                  <div key={v.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight shrink-0">#{v.id}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-neutral-900 truncate">{v.DESCRIZIONE}</div>
                        <div className="text-xs text-neutral-500">{v.TIPOLOGIA}{v.ANNATA ? ` · ${v.ANNATA}` : ""}{v.PRODUTTORE ? ` · ${v.PRODUTTORE}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <div className="text-right">
                        <div className="text-sm font-bold text-neutral-800">{v.QTA_TOTALE} bt</div>
                        <div className="text-[11px] text-neutral-400">
                          {v.ultimo_movimento
                            ? `ult. mov. ${v.ultimo_movimento.slice(0,10)}`
                            : <span className="text-red-500 font-semibold">mai movimentato</span>
                          }
                        </div>
                      </div>
                      <span className="text-amber-600 text-xs font-semibold">→</span>
                    </div>
                  </div>
                ))}
                {hasMoreFermi && !fermiExpanded && (
                  <button type="button" onClick={() => setFermiExpanded(true)}
                    className="w-full px-6 py-3 text-center text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 transition">
                    Mostra tutti ({stats.vini_fermi.length - FERMI_INITIAL_SHOW} altri) ▼
                  </button>
                )}
                {fermiExpanded && hasMoreFermi && (
                  <button type="button" onClick={() => setFermiExpanded(false)}
                    className="w-full px-6 py-3 text-center text-sm font-semibold text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition">
                    Mostra meno ▲
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════
            ALERT — COMPATTATO (collapsed di default, solo stati attivi)
            ══════════════════════════════════════════════════════ */}
        {alertCount > 0 && (
          <div className="bg-white rounded-3xl border border-red-200 shadow-sm overflow-hidden">
            {/* Banner cliccabile */}
            <button type="button" onClick={() => setAlertOpen(!alertOpen)}
              className="w-full px-6 py-4 bg-red-50 border-b border-red-200 flex items-center gap-3 hover:bg-red-100 transition text-left">
              <span className="text-xl">🚨</span>
              <div className="flex-1">
                <div className="font-semibold text-red-800">
                  {alertCount} {alertCount === 1 ? "vino attivo" : "vini attivi"} in carta senza giacenza
                  {nonRicomprare.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      + {nonRicomprare.length} non da ricomprare
                    </span>
                  )}
                </div>
                <div className="text-xs text-red-600 mt-0.5">
                  Solo vini con stato vendita attivo (V/F/S/T). Clicca per {alertOpen ? "nascondere" : "espandere"}.
                </div>
              </div>
              <span className="text-red-400 text-sm font-semibold shrink-0">
                {alertOpen ? "▲ Chiudi" : "▼ Espandi"}
              </span>
            </button>

            {/* Lista — visibile solo se aperta */}
            {alertOpen && (() => {
              // Helper: giorni fra una data ISO e oggi (null se iso mancante)
              const giorniDa = (iso) => {
                if (!iso) return null;
                const t = new Date(iso).getTime();
                if (!Number.isFinite(t)) return null;
                return Math.floor((Date.now() - t) / 86400000);
              };
              // Mappa color_tone -> classi Tailwind per il badge combo.
              // Mirror delle categorie di app/utils/vini_metrics.py::calcola_ritmo_vendita
              const RITMO_CLS = {
                "emerald":      "bg-emerald-50 text-emerald-800 border-emerald-200",
                "amber":        "bg-amber-50 text-amber-800 border-amber-200",
                "neutral":      "bg-neutral-100 text-neutral-600 border-neutral-200",
                "neutral-dark": "bg-slate-100 text-slate-500 border-slate-300",
              };
              // Fase C iter 2 — picker inline STATO_RIORDINO con emoji + label breve.
              // Le lettere singole D/O/0/A/X non erano comprensibili se non conoscevi
              // il codice interno. Ora ogni pill e' autoesplicativa.
              // Attiva: bg saturo colore stato + border-2 + font-bold.
              // Inattiva: bianco + border neutro + hover leggero.
              // Click su attiva = clear; click su inattiva = imposta.
              const PICKER_STATI = [
                { code: "D", emoji: "📝", label: "Da ordinare" },
                { code: "O", emoji: "🚨", label: "Finito — ordina" },
                { code: "0", emoji: "📦", label: "Ordinato" },
                { code: "A", emoji: "🗓️", label: "Annata esaurita" },
                { code: "X", emoji: "⛔", label: "Non ricomprare" },
              ];
              const pickerPillCls = (active, codiceInfo) =>
                active
                  ? `${codiceInfo.color} border-2 font-semibold shadow-sm`
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-400";
              const VinoRow = ({ v, dimmed }) => {
                const scInfo = v.STATO_CONSERVAZIONE ? STATO_CONSERVAZIONE[v.STATO_CONSERVAZIONE] : null;
                const srCorrente = v.STATO_RIORDINO || null;
                // Badge combo ritmo+finito. L'etichetta "Finito ~Xgg" ha senso solo se
                // il vino e' stato venduto almeno una volta (altrimenti e' "Mai venduto").
                const ritmo = v.ritmo_vendita || {};
                const ritmoCls = RITMO_CLS[ritmo.color_tone] || RITMO_CLS.neutral;
                const ggFinito = giorniDa(v.ultima_vendita);
                const mostraFinito = ritmo.categoria !== "mai" && ggFinito != null;
                const finitoLbl =
                  ggFinito == null ? null
                  : ggFinito === 0 ? "Finito oggi"
                  : ggFinito === 1 ? "Finito ieri"
                  :                  `Finito ~${ggFinito}gg fa`;
                return (
                  <div className={`px-6 py-3 flex items-start justify-between gap-3 transition ${dimmed ? "opacity-50" : "hover:bg-red-50"}`}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                      {/* RIGA 1 — identita' vino */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">#{v.id}</span>
                        <span className={`font-semibold text-sm ${dimmed ? "line-through text-neutral-400" : "text-neutral-900"}`}>{v.DESCRIZIONE}</span>
                        {v.ANNATA && <span className="text-xs text-neutral-500">{v.ANNATA}</span>}
                        {v.PRODUTTORE && <span className="text-xs text-neutral-400">— {v.PRODUTTORE}</span>}
                        <span className="text-[10px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-full">{v.TIPOLOGIA}</span>
                      </div>
                      {/* RIGA 2 — metriche azionabili (ritmo+finito) */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ritmoCls}`}
                          title={ritmo.vendite_totali != null ? `${ritmo.vendite_totali} bt vendute in ${ritmo.giorni_storico}gg di storico (dal 01/03/2026)` : ""}>
                          🛒 {ritmo.label || "—"}
                          {mostraFinito && (
                            <span className="font-normal opacity-75">· {finitoLbl}</span>
                          )}
                        </span>
                        {scInfo && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${scInfo.color}`}>
                            <span className={`w-1 h-1 rounded-full ${scInfo.dot}`} />{scInfo.label}
                          </span>
                        )}
                      </div>

                      {/* RIGA 3 — picker stato riordino autoesplicativo.
                          Sposto in riga dedicata (era in Riga 2 con label a singola lettera,
                          poco chiaro). Ora emoji + label breve. Click stato attivo = clear.
                          Riga scrollabile orizzontalmente su mobile stretto. */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wide mr-0.5">
                          Stato riordino:
                        </span>
                        {PICKER_STATI.map(({ code, emoji, label }) => {
                          const info = STATO_RIORDINO[code];
                          const active = srCorrente === code;
                          return (
                            <Tooltip key={code} label={active ? `${label} — click per rimuovere` : `Imposta: ${label}`}>
                              <button
                                type="button"
                                disabled={togglingId === v.id}
                                onClick={(e) => { e.stopPropagation(); setStatoRiordino(v, code); }}
                                className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-full text-[11px] transition ${pickerPillCls(active, info)} ${togglingId === v.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                                aria-label={`Imposta stato riordino: ${label}`}
                                aria-pressed={active}
                              >
                                <span aria-hidden="true">{emoji}</span>
                                <span>{label}</span>
                                {active && <span aria-hidden="true" className="ml-0.5 opacity-70">✓</span>}
                              </button>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">

                      {/* Fase A — Ordina inline: pill blu se ordine pending, outline "+ ordina" altrimenti.
                          Su righe "dimmed" (Non ricomprare) nascosto per ridurre rumore. */}
                      {!dimmed && (() => {
                        const ord = ordiniPending[v.id];
                        if (ord) {
                          const dataIso = ord.data_ordine || ord.updated_at || "";
                          const dataFmt = dataIso
                            ? new Date(dataIso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
                            : "";
                          const tip = [
                            dataFmt ? `Ordinato il ${dataFmt}` : null,
                            ord.utente ? `da ${ord.utente}` : null,
                            ord.note ? `— ${ord.note}` : null,
                          ].filter(Boolean).join(" ");
                          return (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openOrdine(v); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition min-h-[28px]"
                              title={tip || "Modifica ordine pending"}
                              aria-label="Modifica ordine pending"
                            >
                              📦 {ord.qta} bt
                            </button>
                          );
                        }
                        const hasSuggerita = typeof v.qta_suggerita === "number" && v.qta_suggerita > 0;
                        return (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openOrdine(v); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed transition min-h-[28px] text-brand-blue border-brand-blue/40 hover:bg-brand-blue/10"
                            title={hasSuggerita ? `Suggerito ${v.qta_suggerita} bt (storico 60gg)` : "Crea ordine per questo vino"}
                            aria-label="Crea ordine"
                          >
                            + ordina{hasSuggerita ? ` · ${v.qta_suggerita}` : ""}
                          </button>
                        );
                      })()}

                    </div>
                  </div>
                );
              };

              // Fase D — filtro tipologia client-side.
              // 5 categorie logiche fisse (i piu' comuni) + "Altri" catch-all per
              // GRANDI FORMATI, PASSITI, VINI ANALCOLICI, ERRORE, null.
              const CATEGORIE = [
                { key: "ROSSI",     label: "Rossi",     dot: "bg-red-500",      match: (t) => t === "ROSSI" },
                { key: "BIANCHI",   label: "Bianchi",   dot: "bg-yellow-400",   match: (t) => t === "BIANCHI" },
                { key: "BOLLICINE", label: "Bollicine", dot: "bg-sky-400",      match: (t) => t === "BOLLICINE" },
                { key: "ROSATI",   label: "Rosati",    dot: "bg-pink-400",     match: (t) => t === "ROSATI" },
                { key: "ALTRI",     label: "Altri",     dot: "bg-neutral-400",  match: (t) => !["ROSSI","BIANCHI","BOLLICINE","ROSATI"].includes(t) },
              ];
              const matchesFiltro = (v) => {
                if (!tipoFiltro) return true;
                const cat = CATEGORIE.find(c => c.key === tipoFiltro);
                return cat ? cat.match(v.TIPOLOGIA) : true;
              };
              const urgentiFiltrati = urgenti.filter(matchesFiltro);
              const urgentiShow = alertExpanded ? urgentiFiltrati : urgentiFiltrati.slice(0, ALERT_COLLAPSED_SHOW);
              const hasMore = urgentiFiltrati.length > ALERT_COLLAPSED_SHOW;

              // Conteggi per ogni categoria (sempre sull'insieme completo `urgenti`,
              // cosi' i numeri non saltano cambiando filtro).
              const conteggi = CATEGORIE.reduce((acc, c) => {
                acc[c.key] = urgenti.filter(v => c.match(v.TIPOLOGIA)).length;
                return acc;
              }, {});

              // Fase E — raggruppamento per distributore applicato DOPO il filtro tipologia.
              // Chiave di gruppo: "DISTRIBUTORE|||RAPPRESENTANTE". Vini senza distributore
              // finiscono nel gruppo "— Non assegnato".
              const buildGruppi = (lista) => {
                const map = new Map();
                for (const v of lista) {
                  const dist = (v.DISTRIBUTORE || "").trim() || "— Non assegnato";
                  const rapp = (v.RAPPRESENTANTE || "").trim();
                  const key = `${dist}|||${rapp}`;
                  if (!map.has(key)) map.set(key, { distributore: dist, rappresentante: rapp, vini: [] });
                  map.get(key).vini.push(v);
                }
                // Ordine: gruppi con piu' vini prima, "Non assegnato" sempre in fondo
                return [...map.values()].sort((a, b) => {
                  if (a.distributore === "— Non assegnato") return 1;
                  if (b.distributore === "— Non assegnato") return -1;
                  return b.vini.length - a.vini.length;
                });
              };

              return (
                <div>
                  {/* Riga controlli: filtro tipologia + toggle raggruppa */}
                  {urgenti.length > 0 && (
                    <div className="px-6 py-2.5 bg-neutral-50/70 border-b border-neutral-100 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wide mr-1">Filtra:</span>
                      <button
                        type="button"
                        onClick={() => setTipoFiltro(null)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                          !tipoFiltro
                            ? "bg-brand-blue text-white border border-brand-blue"
                            : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                        }`}
                      >
                        Tutti <span className={!tipoFiltro ? "opacity-90" : "text-neutral-400"}>({urgenti.length})</span>
                      </button>
                      {CATEGORIE.map(c => {
                        const active = tipoFiltro === c.key;
                        const n = conteggi[c.key] || 0;
                        if (n === 0 && !active) return null; // nascondi chip con 0 vini (declutter)
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setTipoFiltro(active ? null : c.key)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                              active
                                ? "bg-brand-blue text-white border border-brand-blue"
                                : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.dot}`} />
                            {c.label}
                            <span className={active ? "opacity-90" : "text-neutral-400"}>({n})</span>
                          </button>
                        );
                      })}

                      {/* Toggle raggruppamento — allineato a destra, persistenza localStorage. */}
                      <label className="ml-auto flex items-center gap-2 cursor-pointer select-none" title="Raggruppa per distributore">
                        <span className="text-[11px] text-neutral-600">Raggruppa per distributore</span>
                        <span
                          onClick={() => setRaggruppaDistr(p => !p)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${raggruppaDistr ? "bg-brand-blue" : "bg-neutral-300"}`}
                          role="switch"
                          aria-checked={raggruppaDistr}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${raggruppaDistr ? "translate-x-4" : ""}`} />
                        </span>
                      </label>
                    </div>
                  )}

                  <div className="divide-y divide-neutral-100">
                    {urgentiFiltrati.length === 0 && tipoFiltro && (
                      <div className="px-6 py-8 text-center text-sm text-neutral-400">
                        Nessun vino in questa categoria.{" "}
                        <button type="button" onClick={() => setTipoFiltro(null)}
                          className="text-brand-blue font-medium hover:underline">
                          Mostra tutti
                        </button>
                      </div>
                    )}

                    {/* MODALITA' RAGGRUPPATA per distributore */}
                    {raggruppaDistr && urgentiFiltrati.length > 0 && (
                      <>
                        {buildGruppi(urgentiFiltrati).map((g, idx) => (
                          <details key={`${g.distributore}|${g.rappresentante}|${idx}`} className="group" open>
                            <summary className="px-6 py-2.5 cursor-pointer hover:bg-neutral-50 transition flex items-center justify-between bg-white sticky top-0 z-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base">📋</span>
                                <span className="font-semibold text-sm text-neutral-900 truncate">{g.distributore}</span>
                                {g.rappresentante && (
                                  <span className="text-xs text-neutral-500 truncate">({g.rappresentante})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                                  {g.vini.length} {g.vini.length === 1 ? "vino" : "vini"}
                                </span>
                                <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                              </div>
                            </summary>
                            <div className="divide-y divide-neutral-100 border-t border-neutral-100">
                              {g.vini.map((v) => <VinoRow key={v.id} v={v} dimmed={false} />)}
                            </div>
                          </details>
                        ))}
                      </>
                    )}

                    {/* MODALITA' LISTA PIATTA (default) */}
                    {!raggruppaDistr && (
                      <>
                        {urgentiShow.map((v) => <VinoRow key={v.id} v={v} dimmed={false} />)}
                        {hasMore && !alertExpanded && (
                          <button type="button" onClick={() => setAlertExpanded(true)}
                            className="w-full px-6 py-3 text-center text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition">
                            Mostra tutti ({urgentiFiltrati.length - ALERT_COLLAPSED_SHOW} altri vini) ▼
                          </button>
                        )}
                        {alertExpanded && hasMore && (
                          <button type="button" onClick={() => setAlertExpanded(false)}
                            className="w-full px-6 py-3 text-center text-sm font-semibold text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition">
                            Mostra meno ▲
                          </button>
                        )}
                      </>
                    )}

                    {/* Sezione "Non da ricomprare" NON filtrata ne' raggruppata — resta
                        sempre come archivio sotto. */}
                    {nonRicomprare.length > 0 && (
                      <div className="px-6 py-1.5 bg-neutral-50 text-[11px] text-neutral-400 uppercase tracking-wide font-semibold">
                        Non da ricomprare ({nonRicomprare.length})
                      </div>
                    )}
                    {nonRicomprare.map((v) => <VinoRow key={v.id} v={v} dimmed={true} />)}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── RIGA CENTRALE: VENDITE + OPERATIVI ───────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* VENDITE RECENTI */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-violet-50">
                <h2 className="text-sm font-semibold text-violet-900 uppercase tracking-wide">🛒 Vendite recenti</h2>
              </div>
              {!stats.vendite_recenti?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessuna vendita registrata.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {stats.vendite_recenti.map((m) => (
                    <div key={m.id} className="px-6 py-3 flex items-center justify-between hover:bg-violet-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-neutral-900 truncate">{m.vino_desc}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(m.data_mov)}{m.utente && <span className="ml-2">— {m.utente}</span>}
                        </div>
                      </div>
                      <div className="ml-3 text-sm font-bold text-violet-700 whitespace-nowrap">{m.qta} bt</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MOVIMENTI OPERATIVI */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">🔧 Movimenti operativi</h2>
              </div>
              {!stats.movimenti_operativi?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessun movimento operativo.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {stats.movimenti_operativi.map((m) => (
                    <div key={m.id} className="px-6 py-3 flex items-start justify-between hover:bg-neutral-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TIPO_COLORS[m.tipo] || ""}`}>
                            {TIPO_EMOJI[m.tipo]} {m.tipo}
                          </span>
                          <span className="text-sm font-semibold text-neutral-900 truncate">{m.vino_desc}</span>
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(m.data_mov)}{m.utente && <span className="ml-2">— {m.utente}</span>}
                        </div>
                      </div>
                      <div className="ml-3 text-sm font-bold text-neutral-800 whitespace-nowrap">{m.qta} bt</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TOP VENDUTI 30gg */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden lg:col-span-2">
              <div className="px-6 py-4 border-b border-neutral-200 bg-violet-50">
                <h2 className="text-sm font-semibold text-violet-900 uppercase tracking-wide">🏆 Top venduti — ultimi 30gg</h2>
              </div>
              {!stats.top_venduti_30gg?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessuna vendita negli ultimi 30 giorni.</div>
              ) : (
                <div className="p-5 space-y-3">
                  {stats.top_venduti_30gg.map((v, i) => {
                    const maxV = stats.top_venduti_30gg[0]?.tot_vendute || 1;
                    const pct = Math.round((v.tot_vendute / maxV) * 100);
                    return (
                      <div key={v.id} className="cursor-pointer" onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-neutral-400 font-mono w-4 shrink-0">{i + 1}.</span>
                            <span className="font-semibold text-neutral-800 truncate">{v.DESCRIZIONE}</span>
                            {v.ANNATA && <span className="text-neutral-400 shrink-0">{v.ANNATA}</span>}
                          </div>
                          <span className="font-bold text-violet-700 shrink-0 ml-2">{v.tot_vendute} bt</span>
                        </div>
                        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DISTRIBUZIONE ────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">🍷 Bottiglie per tipologia</h2>
              </div>
              {stats.distribuzione_tipologie.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessun dato disponibile.</div>
              ) : (
                <div className="p-6 space-y-4">
                  {stats.distribuzione_tipologie.map((d) => {
                    const pct = maxBottiglie > 0 ? Math.round((d.tot_bottiglie / maxBottiglie) * 100) : 0;
                    return (
                      <div key={d.TIPOLOGIA || "—"}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-neutral-800">{d.TIPOLOGIA || "—"}</span>
                          <span className="text-neutral-500">
                            {d.tot_bottiglie} bt <span className="ml-2 text-neutral-400">({d.n_vini} ref.)</span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-neutral-200 flex justify-between text-sm">
                    <span className="font-semibold text-neutral-700">Totale cantina</span>
                    <span className="font-bold text-neutral-900">{stats.total_bottiglie} bottiglie</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RIORDINI PER DISTRIBUTORE / RAPPRESENTANTE ──── */}
        {stats?.riordini_per_fornitore?.length > 0 && (() => {
          // Raggruppa per distributore + rappresentante
          const grouped = {};
          stats.riordini_per_fornitore.forEach(v => {
            const dist = v.DISTRIBUTORE || "—";
            const rapp = v.RAPPRESENTANTE || "";
            const key = `${dist}|||${rapp}`;
            if (!grouped[key]) grouped[key] = { distributore: dist, rappresentante: rapp, vini: [] };
            grouped[key].vini.push(v);
          });
          const groups = Object.values(grouped).sort((a, b) => b.vini.length - a.vini.length);

          // Calcola giorni da una data ISO
          const giorniDa = (iso) => {
            if (!iso) return null;
            const diff = Date.now() - new Date(iso).getTime();
            return Math.floor(diff / 86400000);
          };

          const SR_LABELS = { D: "Da ordinare", O: "Finito, ordinare", "0": "Ordinato" };
          const SR_CLS = {
            D: "bg-orange-100 text-orange-800 border-orange-200",
            O: "bg-red-100 text-red-800 border-red-200",
            "0": "bg-blue-100 text-blue-800 border-blue-200",
          };

          return (
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-orange-50">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-orange-900 uppercase tracking-wide">
                    📦 Riordini per fornitore
                  </h2>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs text-orange-700">Mostra giacenze positive</span>
                    <div
                      onClick={() => setMostraGiacPositiva(p => !p)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${mostraGiacPositiva ? "bg-orange-500" : "bg-neutral-300"}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${mostraGiacPositiva ? "translate-x-4" : ""}`} />
                    </div>
                  </label>
                </div>
                <p className="text-xs text-orange-700 mt-0.5">
                  {stats.riordini_per_fornitore.length} vini{mostraGiacPositiva ? "" : " da riordinare"}, raggruppati per distributore/rappresentante.
                </p>
              </div>

              <div className="divide-y divide-neutral-200">
                {groups.map(g => (
                  <details key={`${g.distributore}-${g.rappresentante}`} className="group">
                    <summary className="px-6 py-3 cursor-pointer hover:bg-orange-50/50 transition flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg">📋</span>
                        <div className="min-w-0">
                          <span className="font-semibold text-sm text-neutral-900">{g.distributore}</span>
                          {g.rappresentante && <span className="text-xs text-neutral-500 ml-2">({g.rappresentante})</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                          {g.vini.length} vini
                        </span>
                        <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                      </div>
                    </summary>
                    <div className="border-t border-neutral-100 bg-neutral-50/50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] text-neutral-500 uppercase tracking-wide border-b border-neutral-200">
                            {/* Colonna "info" — non sortabile */}
                            <th className="px-2 py-2 w-8 text-center select-none" aria-label="Apri dettaglio"></th>
                            {[
                              { k: "DESCRIZIONE", label: "Vino", align: "text-left" },
                              { k: "PRODUTTORE", label: "Produttore", align: "text-left" },
                              { k: "STATO_RIORDINO", label: "Stato", align: "text-center" },
                              { k: "QTA_TOTALE", label: "Giac.", align: "text-center" },
                              { k: "ordine_qta", label: "Riordino", align: "text-center" },
                              { k: "EURO_LISTINO", label: "Listino", align: "text-center" },
                              { k: "ultimo_carico", label: "Ult. carico", align: "text-center" },
                              { k: "ultima_vendita", label: "Ult. vendita", align: "text-center" },
                            ].map(col => (
                              <th key={col.k} className={`px-3 py-2 ${col.align} cursor-pointer hover:text-orange-700 select-none transition`}
                                onClick={() => toggleRiordSort(col.k)}>
                                {col.label} {riordSort.key === col.k ? (riordSort.dir === "asc" ? "▲" : "▼") : ""}
                              </th>
                            ))}
                            {/* Colonna "duplica" — non sortabile */}
                            <th className="px-2 py-2 w-8 text-center select-none" aria-label="Duplica annata"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {[...g.vini].sort((a, b) => {
                            if (!riordSort.key) return 0;
                            const k = riordSort.key;
                            let va = a[k] ?? "";
                            let vb = b[k] ?? "";
                            if (k === "QTA_TOTALE" || k === "EURO_LISTINO") {
                              va = Number(va) || 0; vb = Number(vb) || 0;
                            } else if (k === "ordine_qta") {
                              // Valore dinamico: quantità ordine pending (0 se nessuno)
                              va = Number(ordiniPending[a.id]?.qta) || 0;
                              vb = Number(ordiniPending[b.id]?.qta) || 0;
                            } else if (k === "ultimo_carico" || k === "ultima_vendita") {
                              va = va || ""; vb = vb || "";
                            } else {
                              va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                            }
                            if (va < vb) return riordSort.dir === "asc" ? -1 : 1;
                            if (va > vb) return riordSort.dir === "asc" ? 1 : -1;
                            return 0;
                          }).map(v => {
                            const ggCarico = giorniDa(v.ultimo_carico);
                            const ggVendita = giorniDa(v.ultima_vendita);
                            return (
                              <tr key={v.id} className="hover:bg-orange-50/40 transition">
                                <td className="px-1 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/vini/magazzino/${v.id}`)}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-neutral-400 hover:text-brand-blue hover:bg-brand-blue/10 transition"
                                    title="Apri dettaglio vino"
                                    aria-label="Apri dettaglio vino"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                      <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                  </button>
                                </td>
                                <td className="px-4 py-2">
                                  <div className="font-semibold text-neutral-800">{v.DESCRIZIONE}</div>
                                  <div className="text-[10px] text-neutral-400">
                                    {v.TIPOLOGIA}{v.ANNATA ? ` · ${v.ANNATA}` : ""}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-neutral-700">
                                  {v.PRODUTTORE || <span className="text-neutral-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {v.STATO_RIORDINO ? (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SR_CLS[v.STATO_RIORDINO] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
                                      {SR_LABELS[v.STATO_RIORDINO] || v.STATO_RIORDINO}
                                    </span>
                                  ) : (
                                    <span className="text-red-500 font-semibold text-[10px]">0 bt in carta</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center font-semibold">{v.QTA_TOTALE ?? 0} bt</td>
                                <td className="px-2 py-2 text-center">
                                  {(() => {
                                    const ord = ordiniPending[v.id];
                                    if (ord) {
                                      const dataIso = ord.data_ordine || ord.updated_at || "";
                                      const dataFmt = dataIso
                                        ? new Date(dataIso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
                                        : "";
                                      const tip = [
                                        dataFmt ? `Ordinato il ${dataFmt}` : null,
                                        ord.utente ? `da ${ord.utente}` : null,
                                        ord.note ? `— ${ord.note}` : null,
                                      ].filter(Boolean).join(" ");
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => openOrdine(v)}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition min-h-[28px]"
                                          title={tip || "Modifica ordine pending"}
                                          aria-label="Modifica ordine pending"
                                        >
                                          📦 {ord.qta} bt
                                        </button>
                                      );
                                    }
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => openOrdine(v)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-neutral-400 border border-dashed border-neutral-300 hover:text-brand-blue hover:border-brand-blue hover:bg-brand-blue/5 transition min-h-[28px]"
                                        title="Crea ordine per questo vino"
                                        aria-label="Crea ordine"
                                      >
                                        + ordina
                                      </button>
                                    );
                                  })()}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {listinoEditing === v.id ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={listinoDraft}
                                        onChange={(e) => setListinoDraft(e.target.value)}
                                        onBlur={() => saveListino(v)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            saveListino(v);
                                          } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            cancelListinoEdit();
                                          }
                                        }}
                                        disabled={listinoSaving}
                                        autoFocus
                                        placeholder="0,00"
                                        className="w-20 px-2 py-1 border border-brand-blue rounded-md text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                        style={{ minHeight: "32px", fontSize: "14px" }}
                                      />
                                      <span className="text-neutral-500 text-xs">€</span>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openListinoEdit(v)}
                                      className="group inline-flex items-center gap-1 text-neutral-600 hover:text-brand-blue hover:bg-brand-blue/5 rounded px-2 py-1 transition min-h-[28px]"
                                      title="Click per modificare il prezzo di listino"
                                      aria-label="Modifica prezzo listino"
                                    >
                                      <span>
                                        {v.EURO_LISTINO ? `${fmtNum(v.EURO_LISTINO)} €` : <span className="text-neutral-300">—</span>}
                                      </span>
                                      <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                      </svg>
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {v.ultimo_carico ? (
                                    <span className={ggCarico > 90 ? "text-red-600 font-semibold" : ggCarico > 30 ? "text-orange-600" : "text-neutral-600"}>
                                      {ggCarico}gg fa
                                    </span>
                                  ) : <span className="text-neutral-300">mai</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {v.ultima_vendita ? (
                                    <span className={ggVendita > 90 ? "text-red-600 font-semibold" : ggVendita > 30 ? "text-orange-600" : "text-neutral-600"}>
                                      {ggVendita}gg fa
                                    </span>
                                  ) : <span className="text-neutral-300">mai</span>}
                                </td>
                                <td className="px-1 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => openDuplica(v)}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-neutral-400 hover:text-brand-green hover:bg-brand-green/10 transition"
                                    title="Duplica con nuova annata"
                                    aria-label="Duplica con nuova annata"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── ACCESSO RAPIDO ───────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm px-6 py-5">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-4">Accesso rapido</h2>
          <div className="flex flex-wrap gap-3">
            <Btn variant="primary" size="md" type="button" onClick={() => navigate("/vini/magazzino")}>
              🍷 Cantina
            </Btn>
            <Btn variant="chip" tone="emerald" size="md" type="button" onClick={() => navigate("/vini/vendite")}>
              🛒 Vendite
            </Btn>
            <Btn variant="chip" tone="amber" size="md" type="button" onClick={() => navigate("/vini/magazzino/nuovo")}>
              ➕ Nuovo vino
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/carta")}>
              📋 Carta vini
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/settings")}>
              ⚙️ Impostazioni
            </Btn>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════
          MODALE — Duplica con nuova annata (Fase 2)
          ══════════════════════════════════════════════════════ */}
      {duplicaVino && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeDuplica}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900 font-playfair">
                  📋 Duplica con nuova annata
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Crea una copia del vino con la nuova annata indicata. Giacenza a 0, stato <b>Ordinato</b>, fuori carta.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDuplica}
                disabled={duplicaSaving}
                className="text-neutral-400 hover:text-neutral-700 text-xl leading-none ml-2 shrink-0"
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>

            <div className="bg-neutral-50 rounded-xl p-3 mb-4 border border-neutral-200">
              <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Vino sorgente</div>
              <div className="font-semibold text-neutral-900 text-sm">{duplicaVino.DESCRIZIONE}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {duplicaVino.TIPOLOGIA}
                {duplicaVino.PRODUTTORE ? ` · ${duplicaVino.PRODUTTORE}` : ""}
                {duplicaVino.ANNATA ? ` · annata ${duplicaVino.ANNATA}` : ""}
              </div>
            </div>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                Nuova annata
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={duplicaAnnata}
                onChange={(e) => setDuplicaAnnata(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitDuplica();
                  if (e.key === "Escape") closeDuplica();
                }}
                disabled={duplicaSaving}
                autoFocus
                placeholder="es. 2023"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-base font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
              />
            </label>

            <div className="flex items-center justify-end gap-2">
              <Btn variant="secondary" size="md" type="button" onClick={closeDuplica} disabled={duplicaSaving}>
                Annulla
              </Btn>
              <Btn variant="primary" size="md" type="button" onClick={submitDuplica} disabled={duplicaSaving} loading={duplicaSaving}>
                {duplicaSaving ? "Duplico…" : "Duplica"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODALE — Riordino / Ordine pending (Fase 4)
          ══════════════════════════════════════════════════════ */}
      {ordineVino && (() => {
        const existing = ordiniPending[ordineVino.id];
        const busy = ordineSaving || ordineDeleting || ordineArriving;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={closeOrdine}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 font-playfair">
                    📦 {existing ? "Modifica ordine" : "Nuovo ordine"}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Imposta la quantità ordinata (bottiglie). L'ordine resta aperto finché la merce non arriva.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeOrdine}
                  disabled={busy}
                  className="text-neutral-400 hover:text-neutral-700 text-xl leading-none ml-2 shrink-0"
                  aria-label="Chiudi"
                >
                  ✕
                </button>
              </div>

              <div className="bg-neutral-50 rounded-xl p-3 mb-4 border border-neutral-200">
                <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Vino</div>
                <div className="font-semibold text-neutral-900 text-sm">{ordineVino.DESCRIZIONE}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {ordineVino.TIPOLOGIA}
                  {ordineVino.PRODUTTORE ? ` · ${ordineVino.PRODUTTORE}` : ""}
                  {ordineVino.ANNATA ? ` · annata ${ordineVino.ANNATA}` : ""}
                </div>
                {existing && (
                  <div className="text-[11px] text-blue-700 mt-2 pt-2 border-t border-neutral-200">
                    Ordine attuale: <b>{existing.qta} bt</b>
                    {existing.data_ordine && (
                      <> · dal {new Date(existing.data_ordine).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}</>
                    )}
                    {existing.utente && <> · {existing.utente}</>}
                  </div>
                )}
              </div>

              <label className="block mb-3">
                <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Bottiglie ordinate
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={ordineQta}
                  onChange={(e) => setOrdineQta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitOrdine();
                    if (e.key === "Escape") closeOrdine();
                  }}
                  disabled={busy}
                  autoFocus
                  placeholder="es. 6"
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-base font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                />
                {/* Hint quantita' suggerita — visibile solo se: nessun ordine esistente,
                    il vino porta qta_suggerita > 0, e il valore nell'input combacia (= precompilato). */}
                {!existing && typeof ordineVino?.qta_suggerita === "number" && ordineVino.qta_suggerita > 0 && (
                  <div className="mt-1.5 text-[11px] text-brand-blue flex items-center gap-1">
                    <span>💡</span>
                    <span>
                      Suggerito: <b>{ordineVino.qta_suggerita} bt</b>
                      <span className="text-neutral-500"> · storico vendite 60gg ÷ 2</span>
                    </span>
                  </div>
                )}
              </label>

              <label className="block mb-4">
                <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Note (opzionale)
                </span>
                <textarea
                  value={ordineNote}
                  onChange={(e) => setOrdineNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeOrdine();
                  }}
                  disabled={busy}
                  rows={2}
                  placeholder="es. conferma via WhatsApp, consegna giovedì…"
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue resize-none"
                />
              </label>

              {existing && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1">
                    ✅ Quando la merce arriva
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-snug">
                    Premi <b>“Arrivata”</b> qui sotto per chiudere l'ordine
                    e registrare un CARICO di giacenza con la quantità
                    indicata nell'input. Se le bottiglie arrivate sono
                    diverse da quelle ordinate, modifica prima il numero:
                    la differenza viene annotata sul movimento.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {existing && (
                    <Btn variant="chip" tone="red" size="md" type="button" onClick={deleteOrdine} disabled={busy} loading={ordineDeleting}>
                      {ordineDeleting ? "Cancello…" : "🗑 Cancella"}
                    </Btn>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Btn variant="secondary" size="md" type="button" onClick={closeOrdine} disabled={busy}>
                    Annulla
                  </Btn>
                  {existing && (
                    <Btn variant="chip" tone="emerald" size="md" type="button" onClick={confermaArrivo} disabled={busy} loading={ordineArriving}>
                      {ordineArriving ? "Confermo…" : "✅ Arrivata"}
                    </Btn>
                  )}
                  <Btn variant="primary" size="md" type="button" onClick={submitOrdine} disabled={busy} loading={ordineSaving}>
                    {ordineSaving ? "Salvo…" : (existing ? "Aggiorna" : "Salva")}
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
