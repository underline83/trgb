// @version: v3.4-mattoni — M.I primitives (Btn) su CTA + barra marketing + paginazione + nota rapida
// Lista clienti — sidebar filtri, dettaglio inline, note rapide, barra marketing (copia email/tel, export CSV)
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import ClientiScheda from "./ClientiScheda";
import Tooltip from "../../components/Tooltip";
import { buildWaLink, fillTemplate, WA_TEMPLATES } from "../../utils/whatsapp";
import { Btn } from "../../components/ui";

// ── Colori rank ──────────────────────────────────────────
const RANK_COLORS = {
  Gold:    { row: "bg-yellow-50/60", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  Silver:  { row: "bg-neutral-50/60", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  Bronze:  { row: "bg-orange-50/60", badge: "bg-orange-100 text-orange-700 border-orange-300" },
  Caution: { row: "bg-red-50/60", badge: "bg-red-100 text-red-700 border-red-300" },
};
const rankBadge = (rank) => RANK_COLORS[rank]?.badge || "bg-neutral-100 text-neutral-600 border-neutral-200";

// ── Segmenti marketing ──────────────────────────────────
const SEGMENTO_CONFIG = {
  abituale:    { label: "Abituale",    icon: "🔥", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  occasionale: { label: "Occasionale", icon: "👋", badge: "bg-sky-100 text-sky-700 border-sky-300", dot: "bg-sky-500" },
  nuovo:       { label: "Nuovo",       icon: "🆕", badge: "bg-violet-100 text-violet-700 border-violet-300", dot: "bg-violet-500" },
  in_calo:     { label: "In calo",     icon: "📉", badge: "bg-amber-100 text-amber-800 border-amber-300", dot: "bg-amber-500" },
  perso:       { label: "Perso",       icon: "💤", badge: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-400" },
  mai_venuto:  { label: "Mai venuto",  icon: "👻", badge: "bg-neutral-100 text-neutral-500 border-neutral-300", dot: "bg-neutral-400" },
};

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
  return <span className="text-teal-600 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

const PAGE_SIZE = 50;

export default function ClientiLista() {
  const navigate = useNavigate();
  const [clienti, setClienti] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState([]);
  const [segmentiCount, setSegmentiCount] = useState({});

  // Filtri
  const [q, setQ] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [tagFiltro, setTagFiltro] = useState("");
  const [rankFiltro, setRankFiltro] = useState("");
  const [segmentoFiltro, setSegmentoFiltro] = useState("");
  const [conEmail, setConEmail] = useState(false);
  const [conTelefono, setConTelefono] = useState(false);
  const [mostraInattivi, setMostraInattivi] = useState(false);
  const [offset, setOffset] = useState(0);

  // Dettaglio inline
  const [selectedId, setSelectedId] = useState(null);

  // Nota rapida
  const [notaClienteId, setNotaClienteId] = useState(null);
  const [notaTesto, setNotaTesto] = useState("");
  const [notaSaving, setNotaSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // WhatsApp broadcast panel
  const [showWaPanel, setShowWaPanel] = useState(false);
  const [waClients, setWaClients] = useState([]);
  const [waTemplate, setWaTemplate] = useState(WA_TEMPLATES.broadcast_clienti);
  const [waLoading, setWaLoading] = useState(false);

  const salvaNotaRapida = async () => {
    if (!notaTesto.trim() || !notaClienteId) return;
    setNotaSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${notaClienteId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "nota", testo: notaTesto.trim() }),
      });
      if (!res.ok) throw new Error("Errore");
      setToast("Nota salvata");
      setTimeout(() => setToast(null), 2500);
      setNotaClienteId(null);
      setNotaTesto("");
    } catch {
      setToast("Errore salvataggio nota");
      setTimeout(() => setToast(null), 2500);
    } finally { setNotaSaving(false); }
  };

  // Ordinamento — server-side
  const [sortKey, setSortKey] = useState("cognome");
  const [sortDir, setSortDir] = useState("asc");
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "n_prenotazioni" || key === "ultima_visita" ? "desc" : "asc");
    }
    setOffset(0); // torna a pagina 1 quando cambia l'ordinamento
  };

  // Fetch segmenti conteggi
  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/segmenti/conteggi`)
      .then(r => r.json())
      .then(setSegmentiCount)
      .catch(() => {});
  }, []);

  const fetchClienti = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (vipOnly) params.set("vip", "true");
      if (tagFiltro) params.set("tag_id", tagFiltro);
      if (rankFiltro) params.set("rank", rankFiltro);
      if (segmentoFiltro) params.set("segmento", segmentoFiltro);
      if (conEmail) params.set("con_email", "true");
      if (conTelefono) params.set("con_telefono", "true");
      if (!mostraInattivi) params.set("attivo", "true");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("ordine", `${sortKey}_${sortDir}`);

      const res = await apiFetch(`${API_BASE}/clienti/?${params}`);
      const data = await res.json();
      setClienti(data.clienti || []);
      setTotale(data.totale || 0);
    } catch (err) {
      console.error("Errore caricamento clienti", err);
    } finally {
      setLoading(false);
    }
  }, [q, vipOnly, tagFiltro, rankFiltro, segmentoFiltro, conEmail, conTelefono, mostraInattivi, offset, sortKey, sortDir]);

  useEffect(() => { fetchClienti(); }, [fetchClienti]);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/tag/lista`)
      .then((r) => r.json())
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Reset offset quando cambiano filtri (ma non sort, già gestito in handleSort)
  useEffect(() => { setOffset(0); }, [q, vipOnly, tagFiltro, rankFiltro, segmentoFiltro, conEmail, conTelefono, mostraInattivi]);

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalePagine = Math.ceil(totale / PAGE_SIZE);

  const resetFiltri = () => {
    setQ(""); setVipOnly(false); setTagFiltro(""); setRankFiltro("");
    setSegmentoFiltro(""); setConEmail(false); setConTelefono(false); setMostraInattivi(false);
  };

  const filtriAttivi = [q, vipOnly, tagFiltro, rankFiltro, segmentoFiltro, conEmail, conTelefono, mostraInattivi]
    .filter(v => v && v !== "").length;

  // ── Funzioni marketing: copia/export ──
  const buildFilterParams = () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (vipOnly) p.set("vip", "true");
    if (tagFiltro) p.set("tag_id", tagFiltro);
    if (rankFiltro) p.set("rank", rankFiltro);
    if (segmentoFiltro) p.set("segmento", segmentoFiltro);
    if (conEmail) p.set("con_email", "true");
    if (conTelefono) p.set("con_telefono", "true");
    if (!mostraInattivi) p.set("attivo", "true");
    p.set("limit", "5000");
    p.set("offset", "0");
    return p;
  };

  const fetchAllFiltered = async () => {
    const res = await apiFetch(`${API_BASE}/clienti/?${buildFilterParams()}`);
    const data = await res.json();
    return data.clienti || [];
  };

  const copiaEmail = async () => {
    try {
      const all = await fetchAllFiltered();
      const emails = all.map(c => c.email).filter(Boolean);
      if (!emails.length) { setToast("Nessuna email trovata"); return; }
      await navigator.clipboard.writeText(emails.join("\n"));
      setToast(`${emails.length} email copiate`);
      setTimeout(() => setToast(null), 2500);
    } catch { setToast("Errore copia"); setTimeout(() => setToast(null), 2500); }
  };

  const copiaTelefoni = async () => {
    try {
      const all = await fetchAllFiltered();
      const tels = all.map(c => c.telefono).filter(Boolean);
      if (!tels.length) { setToast("Nessun telefono trovato"); return; }
      await navigator.clipboard.writeText(tels.join("\n"));
      setToast(`${tels.length} telefoni copiati`);
      setTimeout(() => setToast(null), 2500);
    } catch { setToast("Errore copia"); setTimeout(() => setToast(null), 2500); }
  };

  const esportaCsv = async () => {
    try {
      const all = await fetchAllFiltered();
      if (!all.length) { setToast("Nessun dato da esportare"); return; }
      const headers = ["cognome", "nome", "email", "telefono", "telefono2", "rank", "vip", "data_nascita", "citta", "allergie", "pref_cibo", "pref_bevande", "tags", "segmento", "n_prenotazioni", "ultima_visita"];
      const csvRows = [headers.join(";")];
      for (const c of all) {
        csvRows.push(headers.map(h => {
          let v = c[h] ?? "";
          if (typeof v === "string" && (v.includes(";") || v.includes('"') || v.includes("\n")))
            v = `"${v.replace(/"/g, '""')}"`;
          return v;
        }).join(";"));
      }
      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clienti_export_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast(`${all.length} clienti esportati`);
      setTimeout(() => setToast(null), 2500);
    } catch { setToast("Errore export"); setTimeout(() => setToast(null), 2500); }
  };

  const apriWaPanel = async () => {
    if (showWaPanel) { setShowWaPanel(false); return; }
    setWaLoading(true);
    try {
      const all = await fetchAllFiltered();
      const withPhone = all.filter(c => c.telefono && c.telefono.trim());
      setWaClients(withPhone);
      setShowWaPanel(true);
    } catch { setToast("Errore caricamento"); }
    finally { setWaLoading(false); }
  };

  const getWaLink = (client) => buildWaLink(client.telefono, waTemplate, {
    nome: client.nome, cognome: client.cognome, nome2: client.nome2 || "",
  });

  const sel = "w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
  const lbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";

  return (
    <>
      <ClientiNav current="lista" />
      <div className="min-h-screen bg-brand-cream font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

          {/* ── HEADER ── */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Anagrafica Clienti</h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {totale.toLocaleString("it-IT")} client{totale === 1 ? "e" : "i"}
                {segmentoFiltro && ` — ${SEGMENTO_CONFIG[segmentoFiltro]?.icon} ${SEGMENTO_CONFIG[segmentoFiltro]?.label}`}
              </p>
            </div>
            <Btn variant="chip" tone="emerald" size="md" onClick={() => navigate("/clienti/nuovo")}>+ Nuovo Cliente</Btn>
          </div>

          {/* ── BARRA AZIONI MARKETING ── */}
          <div className="flex items-center gap-2 mb-4 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-xs text-neutral-500 font-medium mr-1">Azioni:</span>
            <Btn variant="chip" tone="sky" size="sm" onClick={copiaEmail}>Copia email ({totale})</Btn>
            <Btn variant="chip" tone="emerald" size="sm" onClick={copiaTelefoni}>Copia telefoni ({totale})</Btn>
            <Btn variant="chip" tone="amber" size="sm" onClick={esportaCsv}>Esporta CSV</Btn>
            {showWaPanel ? (
              <Btn variant="success" size="sm" onClick={apriWaPanel} disabled={waLoading} loading={waLoading}>
                {waLoading ? "..." : "WhatsApp lista"}
              </Btn>
            ) : (
              <Btn variant="chip" tone="emerald" size="sm" onClick={apriWaPanel} disabled={waLoading} loading={waLoading}>
                {waLoading ? "..." : "WhatsApp lista"}
              </Btn>
            )}
            {filtriAttivi > 0 && (
              <span className="text-[10px] text-neutral-400 ml-2">
                Filtri attivi: {filtriAttivi} — esporta solo i {totale.toLocaleString("it-IT")} risultati filtrati
              </span>
            )}
          </div>

          {/* ── PANNELLO WHATSAPP BROADCAST ── */}
          {showWaPanel && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-emerald-800">
                  WhatsApp — {waClients.length} clienti con telefono
                </h3>
                <button onClick={() => setShowWaPanel(false)} className="text-xs text-neutral-400 hover:text-neutral-600">✕</button>
              </div>
              <div className="mb-3">
                <label className="block text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                  Template messaggio (usa {"{nome}"} e {"{cognome}"} per personalizzare)
                </label>
                <textarea
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  rows={2}
                  className="w-full border border-emerald-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <p className="text-[10px] text-emerald-600 mt-1">
                  Anteprima: "{fillTemplate(waTemplate, { nome: "Mario", cognome: "Rossi" })}"
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto border border-emerald-200 rounded-lg bg-white divide-y divide-emerald-100">
                {waClients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50/50">
                    <div className="text-sm">
                      <span className="font-medium text-neutral-800">{c.cognome} {c.nome}{c.nome2 ? ` & ${c.nome2}` : ""}</span>
                      <span className="text-xs text-neutral-400 ml-2">{c.telefono}</span>
                    </div>
                    <a href={getWaLink(c)} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition shadow-sm">
                      Invia WA
                    </a>
                  </div>
                ))}
              </div>
              {waClients.length === 0 && (
                <p className="text-sm text-neutral-400 text-center py-4">Nessun cliente con telefono nei risultati filtrati</p>
              )}
            </div>
          )}

          <div className="flex gap-5">
            {/* ══════════════════════════════════════════
                SIDEBAR SINISTRA — Filtri + Segmenti
               ══════════════════════════════════════════ */}
            <div className="w-56 flex-shrink-0 hidden lg:block space-y-3">

              {/* Segmenti marketing */}
              <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
                <h3 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Segmenti Marketing</h3>
                <div className="space-y-1">
                  {Object.entries(SEGMENTO_CONFIG).map(([key, cfg]) => {
                    const count = segmentiCount[key] || 0;
                    const active = segmentoFiltro === key;
                    return (
                      <button key={key}
                        onClick={() => setSegmentoFiltro(active ? "" : key)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition ${
                          active ? cfg.badge + " border shadow-sm" : "hover:bg-neutral-50 text-neutral-600"
                        }`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className={`text-[10px] font-medium ${active ? "" : "text-neutral-400"}`}>
                          {count.toLocaleString("it-IT")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Mini stats */}
                <div className="border-t border-neutral-100 mt-2 pt-2 space-y-0.5 text-[10px] text-neutral-400">
                  <div className="flex justify-between">
                    <span>Con email</span>
                    <span className="text-neutral-600 font-medium">{(segmentiCount.con_email || 0).toLocaleString("it-IT")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Con telefono</span>
                    <span className="text-neutral-600 font-medium">{(segmentiCount.con_telefono || 0).toLocaleString("it-IT")}</span>
                  </div>
                </div>
              </div>

              {/* Filtri classici */}
              <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Filtri</h3>
                  {filtriAttivi > 0 && (
                    <button onClick={resetFiltri} className="text-[10px] text-teal-600 hover:text-teal-700">
                      Resetta ({filtriAttivi})
                    </button>
                  )}
                </div>

                <div>
                  <label className={lbl}>Cerca</label>
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Nome, tel, allergie..."
                    className={sel} />
                </div>

                <div>
                  <label className={lbl}>Rank</label>
                  <select value={rankFiltro} onChange={(e) => setRankFiltro(e.target.value)} className={sel}>
                    <option value="">Tutti</option>
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                    <option value="Bronze">Bronze</option>
                    <option value="Caution">Caution</option>
                  </select>
                </div>

                <div>
                  <label className={lbl}>Tag</label>
                  <select value={tagFiltro} onChange={(e) => setTagFiltro(e.target.value)} className={sel}>
                    <option value="">Tutti</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)}
                      className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                    Solo VIP ⭐
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={conEmail} onChange={(e) => setConEmail(e.target.checked)}
                      className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                    Con email
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={conTelefono} onChange={(e) => setConTelefono(e.target.checked)}
                      className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                    Con telefono
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={mostraInattivi} onChange={(e) => setMostraInattivi(e.target.checked)}
                      className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                    Mostra inattivi
                  </label>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════
                CONTENUTO PRINCIPALE — tabella o dettaglio inline
               ══════════════════════════════════════════ */}
            <div className="flex-1 min-w-0">

              {/* ── DETTAGLIO INLINE (quando selezionato) ── */}
              {selectedId ? (
                <ClientiScheda
                  clienteId={selectedId}
                  onClose={() => { setSelectedId(null); fetchClienti(); }}
                  embedded
                />
              ) : (
              <>
              {/* Filtri mobile */}
              <div className="lg:hidden mb-3">
                <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Cerca clienti..."
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-16 text-center text-neutral-400 text-sm">Caricamento...</div>
                ) : clienti.length === 0 ? (
                  <div className="p-16 text-center text-neutral-400 text-sm">Nessun cliente trovato.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                          <th className="px-3 py-2.5 text-left cursor-pointer select-none hover:text-teal-700" onClick={() => handleSort("cognome")}>
                            Cliente <SortIcon col="cognome" sortKey={sortKey} sortDir={sortDir} />
                          </th>
                          <th className="px-3 py-2.5 text-left">Telefono</th>
                          <th className="px-3 py-2.5 text-left hidden md:table-cell">Email</th>
                          <th className="px-3 py-2.5 text-left hidden lg:table-cell">Tag</th>
                          <th className="px-3 py-2.5 text-center w-20">Segmento</th>
                          <th className="px-3 py-2.5 text-center cursor-pointer select-none hover:text-teal-700 w-14" onClick={() => handleSort("n_prenotazioni")}>
                            Vis. <SortIcon col="n_prenotazioni" sortKey={sortKey} sortDir={sortDir} />
                          </th>
                          <th className="px-3 py-2.5 text-left hidden xl:table-cell cursor-pointer select-none hover:text-teal-700" onClick={() => handleSort("ultima_visita")}>
                            Ultima <SortIcon col="ultima_visita" sortKey={sortKey} sortDir={sortDir} />
                          </th>
                          <th className="px-3 py-2.5 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {clienti.map((c) => {
                          const rowColor = c.rank ? (RANK_COLORS[c.rank]?.row || "") : "";
                          const seg = SEGMENTO_CONFIG[c.segmento] || SEGMENTO_CONFIG.mai_venuto;
                          return (
                            <React.Fragment key={c.id}>
                            <tr
                              onClick={() => setSelectedId(c.id)}
                              className={`cursor-pointer hover:bg-teal-50/80 transition ${rowColor} ${!c.attivo ? "opacity-40" : ""}`}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <div>
                                    <span className="font-semibold text-neutral-900">{c.cognome}{c.cognome2 && c.cognome2 !== c.cognome ? ` / ${c.cognome2}` : ""}</span>
                                    <span className="text-neutral-600 ml-1">{c.nome}{c.nome2 ? ` & ${c.nome2}` : ""}</span>
                                  </div>
                                  {c.vip ? <span className="text-xs">⭐</span> : null}
                                  {c.rank && (
                                    <span className={`text-[9px] px-1 py-0.5 rounded-full border font-medium ${rankBadge(c.rank)}`}>
                                      {c.rank}
                                    </span>
                                  )}
                                  {c.protetto === 1 && <Tooltip label="Protetto"><span className="text-[10px] text-teal-500">🛡</span></Tooltip>}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-neutral-600 font-mono text-xs whitespace-nowrap">{c.telefono || "—"}</td>
                              <td className="px-3 py-2.5 text-neutral-500 text-xs max-w-[160px] truncate hidden md:table-cell">{c.email || "—"}</td>
                              <td className="px-3 py-2.5 hidden lg:table-cell">
                                {c.tags && c.tags.split(", ").filter(Boolean).map((tag) => (
                                  <span key={tag} className="inline-block text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full mr-0.5 mb-0.5 border border-teal-200">
                                    {tag}
                                  </span>
                                ))}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${seg.badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${seg.dot}`} />
                                  {seg.label}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {c.n_prenotazioni > 0 ? (
                                  <span className={`text-xs font-bold ${
                                    c.n_prenotazioni >= 10 ? "text-teal-700" :
                                    c.n_prenotazioni >= 3 ? "text-neutral-700" :
                                    "text-neutral-400"
                                  }`}>
                                    {c.n_prenotazioni}
                                  </span>
                                ) : (
                                  <span className="text-neutral-300 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-neutral-500 hidden xl:table-cell whitespace-nowrap">
                                {c.ultima_visita || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <Tooltip label="Nota rapida">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setNotaClienteId(notaClienteId === c.id ? null : c.id); setNotaTesto(""); }}
                                    className={`text-sm hover:scale-110 transition ${notaClienteId === c.id ? "opacity-100" : "opacity-40 hover:opacity-70"}`}>
                                    📝
                                  </button>
                                </Tooltip>
                              </td>
                            </tr>
                            {notaClienteId === c.id && (
                              <tr className="bg-amber-50/80">
                                <td colSpan={8} className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-amber-700 font-medium whitespace-nowrap">Nota per {c.cognome}:</span>
                                    <input
                                      type="text"
                                      value={notaTesto}
                                      onChange={(e) => setNotaTesto(e.target.value)}
                                      onKeyDown={(e) => e.key === "Enter" && salvaNotaRapida()}
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="Scrivi e premi Invio..."
                                      className="flex-1 border border-amber-300 rounded-lg px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                                      autoFocus
                                    />
                                    <Btn variant="chip" tone="amber" size="sm" onClick={(e) => { e.stopPropagation(); salvaNotaRapida(); }}
                                      disabled={notaSaving || !notaTesto.trim()} loading={notaSaving}>
                                      {notaSaving ? "..." : "Salva"}
                                    </Btn>
                                    <button onClick={(e) => { e.stopPropagation(); setNotaClienteId(null); }}
                                      className="text-xs text-neutral-400 hover:text-neutral-600">✕</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── PAGINAZIONE ── */}
                {totalePagine > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 bg-neutral-50">
                    <Btn variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                      ← Precedente
                    </Btn>
                    <span className="text-xs text-neutral-500">Pagina {pagina} di {totalePagine}</span>
                    <Btn variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= totale} onClick={() => setOffset(offset + PAGE_SIZE)}>
                      Successiva →
                    </Btn>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast nota rapida */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 bg-emerald-600 text-white"
          onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </>
  );
}
