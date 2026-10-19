// @version: v4.0 — redesign bozzetto A (2026-10-19): ricerca grande, filtri rapidi, lista compatta + anteprima a destra; azioni di massa in «Esporta e contatta»; via le voci senza nome · v3.4-mattoni — M.I primitives (Btn) su CTA + barra marketing + paginazione + nota rapida
// Lista clienti — ricerca, filtri rapidi, lista compatta, anteprima scheda a destra, pannello Esporta e contatta
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import ClientiScheda from "./ClientiScheda";
import { buildWaLink, fillTemplate, WA_TEMPLATES } from "../../utils/whatsapp";
import { Btn } from "../../components/ui";

// ── Segmenti marketing ──────────────────────────────────
const SEGMENTO_CONFIG = {
  abituale:    { label: "Abituale",    icon: "🔥", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  occasionale: { label: "Occasionale", icon: "👋", badge: "bg-sky-100 text-sky-700 border-sky-300", dot: "bg-sky-500" },
  nuovo:       { label: "Nuovo",       icon: "🆕", badge: "bg-violet-100 text-violet-700 border-violet-300", dot: "bg-violet-500" },
  in_calo:     { label: "In calo",     icon: "📉", badge: "bg-amber-100 text-amber-800 border-amber-300", dot: "bg-amber-500" },
  perso:       { label: "Perso",       icon: "💤", badge: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-400" },
  mai_venuto:  { label: "Mai venuto",  icon: "👻", badge: "bg-neutral-100 text-neutral-500 border-neutral-300", dot: "bg-neutral-400" },
};

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

  // Dettaglio inline (anteprima a destra su schermo largo)
  const [selectedId, setSelectedId] = useState(null);
  const [showFiltri, setShowFiltri] = useState(false);
  const [showAzioni, setShowAzioni] = useState(false);

  const [toast, setToast] = useState(null);

  // WhatsApp broadcast panel
  const [showWaPanel, setShowWaPanel] = useState(false);
  const [waClients, setWaClients] = useState([]);
  const [waTemplate, setWaTemplate] = useState(WA_TEMPLATES.broadcast_clienti);
  const [waLoading, setWaLoading] = useState(false);

  // Ordinamento — server-side
  const [sortKey, setSortKey] = useState("cognome");
  const [sortDir, setSortDir] = useState("asc");

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
      params.set("con_nome", "true");
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

  // Reset offset quando cambiano filtri (il cambio di ordine azzera da solo)
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
    p.set("con_nome", "true");
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

  // ── Redesign 2026-10-19 (bozzetto A): lista a sinistra, anteprima a destra (iPad/Mac); su telefono la scheda si apre a pagina intera ──
  const CHIPS = [
    { key: "", label: "Tutti" },
    { key: "abituale", label: "Abituali" },
    { key: "vip", label: "VIP" },
    { key: "nuovo", label: "Nuovi" },
    { key: "in_calo", label: "In calo" },
    { key: "perso", label: "Persi" },
  ];
  const chipAttivo = (k) => (k === "vip" ? vipOnly : !vipOnly && segmentoFiltro === k);
  const scegliChip = (k) => {
    if (k === "vip") { setVipOnly(!vipOnly); setSegmentoFiltro(""); }
    else { setVipOnly(false); setSegmentoFiltro(k); }
  };
  const apri = (c) => {
    if (window.matchMedia && window.matchMedia("(min-width: 1024px)").matches) setSelectedId(c.id);
    else navigate(`/clienti/${c.id}`);
  };
  const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const quando = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso.slice(0, 10) + "T12:00:00");
    return `${d.getDate()} ${MESI[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${String(d.getFullYear()).slice(2)}` : ""}`;
  };
  const sel = "w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
  const lbl = "block text-xs font-semibold text-neutral-500 mb-1";

  return (
    <>
      <ClientiNav current="lista" />
      <div className="min-h-screen bg-brand-cream font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">

          {/* ── TESTATA ── */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="font-playfair text-[28px] font-bold text-neutral-900 leading-tight">Clienti</h1>
              <p className="text-sm text-neutral-500">{totale.toLocaleString("it-IT")} client{totale === 1 ? "e" : "i"}{filtriAttivi > 0 ? " con questi filtri" : ""}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAzioni(!showAzioni)}
                className="min-h-[44px] px-4 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:border-teal-400">
                Esporta e contatta
              </button>
              <button type="button" onClick={() => navigate("/clienti/nuovo")}
                className="min-h-[44px] px-4 rounded-xl bg-teal-800 text-white text-sm font-bold hover:bg-teal-900">
                + Nuovo cliente
              </button>
            </div>
          </div>

          {/* ── AZIONI DI MASSA (nascoste finché non servono) ── */}
          {showAzioni && (
            <div className="mb-4 bg-white border border-neutral-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm text-neutral-600">Valgono per i {totale.toLocaleString("it-IT")} clienti della lista qui sotto, con i filtri attivi.</p>
              <div className="flex flex-wrap gap-2">
                <Btn variant="secondary" size="md" onClick={copiaEmail}>Copia le email</Btn>
                <Btn variant="secondary" size="md" onClick={copiaTelefoni}>Copia i telefoni</Btn>
                <Btn variant="secondary" size="md" onClick={esportaCsv}>Scarica CSV</Btn>
                <Btn variant={showWaPanel ? "success" : "secondary"} size="md" onClick={apriWaPanel} disabled={waLoading} loading={waLoading}>WhatsApp uno per uno</Btn>
              </div>
              {showWaPanel && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">
                    Messaggio ({"{nome}"} e {"{cognome}"} si riempiono da soli) — {waClients.length} clienti con telefono
                  </label>
                  <textarea value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} rows={2}
                    className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  <p className="text-xs text-emerald-700 mt-1">Anteprima: «{fillTemplate(waTemplate, { nome: "Mario", cognome: "Rossi" })}»</p>
                  <div className="mt-2 max-h-64 overflow-y-auto bg-white border border-emerald-200 rounded-lg divide-y divide-emerald-100">
                    {waClients.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 min-h-[44px]">
                        <span className="text-sm"><b>{c.cognome} {c.nome}</b> <span className="text-neutral-400">{c.telefono}</span></span>
                        <a href={getWaLink(c)} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Invia</a>
                      </div>
                    ))}
                    {waClients.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">Nessun cliente con telefono.</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-5 items-start">

            {/* ══ LISTA ══ */}
            <div className="w-full lg:w-[460px] lg:flex-shrink-0">
              <label className="flex items-center gap-2 h-12 px-4 bg-white border border-neutral-300 rounded-xl focus-within:ring-2 focus-within:ring-teal-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5C574F" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                <span className="sr-only">Cerca cliente</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cognome o telefono"
                  className="flex-1 bg-transparent outline-none text-base" />
              </label>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {CHIPS.map((ch) => {
                  const on = chipAttivo(ch.key);
                  const n = ch.key && ch.key !== "vip" ? segmentiCount[ch.key] : null;
                  return (
                    <button key={ch.key || "tutti"} type="button" aria-pressed={on} onClick={() => scegliChip(ch.key)}
                      className={`min-h-[36px] px-3 rounded-full text-sm font-semibold border transition ${on ? "bg-teal-800 border-teal-800 text-white" : "bg-white border-neutral-300 text-neutral-700 hover:border-teal-400"}`}>
                      {ch.label}{n ? <span className={`ml-1 font-normal ${on ? "text-teal-100" : "text-neutral-400"}`}>{n.toLocaleString("it-IT")}</span> : null}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setShowFiltri(!showFiltri)} aria-expanded={showFiltri}
                  className="min-h-[36px] px-3 rounded-full text-sm font-semibold text-teal-800 hover:underline">
                  {showFiltri ? "Meno filtri" : "Altri filtri"}{filtriAttivi > 0 ? ` (${filtriAttivi})` : ""}
                </button>
              </div>

              {showFiltri && (
                <div className="mt-3 bg-white border border-neutral-200 rounded-xl p-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl} htmlFor="f-rank">Rank TheFork</label>
                    <select id="f-rank" value={rankFiltro} onChange={(e) => setRankFiltro(e.target.value)} className={sel}>
                      <option value="">Tutti</option><option value="Gold">Gold</option><option value="Silver">Silver</option>
                      <option value="Bronze">Bronze</option><option value="Caution">Caution</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="f-tag">Etichetta</label>
                    <select id="f-tag" value={tagFiltro} onChange={(e) => setTagFiltro(e.target.value)} className={sel}>
                      <option value="">Tutte</option>
                      {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="f-ord">Ordina per</label>
                    <select id="f-ord" value={`${sortKey}_${sortDir}`} onChange={(e) => { const v = e.target.value; const i = v.lastIndexOf("_"); setSortKey(v.slice(0, i)); setSortDir(v.slice(i + 1)); setOffset(0); }} className={sel}>
                      <option value="cognome_asc">Cognome A→Z</option>
                      <option value="ultima_visita_desc">Ultima visita</option>
                      <option value="n_prenotazioni_desc">Più visite</option>
                    </select>
                  </div>
                  <div className="flex flex-col justify-end gap-1 text-sm text-neutral-700">
                    <label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={conTelefono} onChange={(e) => setConTelefono(e.target.checked)} className="w-4 h-4 accent-teal-700" />Con telefono</label>
                    <label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={conEmail} onChange={(e) => setConEmail(e.target.checked)} className="w-4 h-4 accent-teal-700" />Con email</label>
                    <label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={mostraInattivi} onChange={(e) => setMostraInattivi(e.target.checked)} className="w-4 h-4 accent-teal-700" />Anche inattivi</label>
                  </div>
                  {filtriAttivi > 0 && (
                    <button type="button" onClick={resetFiltri} className="col-span-2 text-left text-sm font-semibold text-teal-800 min-h-[36px]">Azzera i filtri</button>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_64px_72px] gap-2 px-3 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <span>Cliente</span><span className="text-right">Visite</span><span className="text-right">Ultima</span>
              </div>
              <div className="mt-1 space-y-1">
                {loading && clienti.length === 0 && <div className="py-12 text-center text-sm text-neutral-400">Caricamento…</div>}
                {!loading && clienti.length === 0 && <div className="py-12 text-center text-sm text-neutral-400">Nessun cliente trovato.</div>}
                {clienti.map((c) => {
                  const scelto = selectedId === c.id;
                  const seg = SEGMENTO_CONFIG[c.segmento];
                  const sotto = [c.rank, seg && c.segmento !== "mai_venuto" ? seg.label : null, ...(c.tags ? c.tags.split(", ").filter(Boolean).slice(0, 2) : [])].filter(Boolean).join(" · ");
                  return (
                    <button key={c.id} type="button" onClick={() => apri(c)}
                      className={`w-full text-left min-h-[56px] px-3 rounded-xl border grid grid-cols-[minmax(0,1fr)_64px_72px] gap-2 items-center transition ${scelto ? "bg-teal-50 border-teal-300" : "bg-white border-neutral-200 hover:border-teal-300"} ${!c.attivo ? "opacity-50" : ""}`}>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-neutral-900 truncate">
                          {c.vip ? "★ " : ""}{c.cognome}{c.cognome2 && c.cognome2 !== c.cognome ? ` / ${c.cognome2}` : ""} <span className="font-normal text-neutral-700">{c.nome}{c.nome2 ? ` & ${c.nome2}` : ""}</span>
                        </span>
                        {sotto && <span className="block text-xs text-neutral-500 truncate">{sotto}</span>}
                      </span>
                      <span className="text-right text-[15px] tabular-nums">{c.n_prenotazioni || "—"}</span>
                      <span className="text-right text-sm text-neutral-600">{quando(c.ultima_visita)}</span>
                    </button>
                  );
                })}
              </div>
              {offset + PAGE_SIZE < totale && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Btn variant="secondary" size="md" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Indietro</Btn>
                  <span className="text-sm text-neutral-500">{pagina} di {totalePagine}</span>
                  <Btn variant="secondary" size="md" onClick={() => setOffset(offset + PAGE_SIZE)}>Avanti →</Btn>
                </div>
              )}
              {offset > 0 && offset + PAGE_SIZE >= totale && (
                <div className="mt-3"><Btn variant="secondary" size="md" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Indietro</Btn></div>
              )}
            </div>

            {/* ══ ANTEPRIMA (iPad orizzontale e computer) ══ */}
            <div className="hidden lg:block flex-1 min-w-0 lg:sticky lg:top-4">
              {selectedId ? (
                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                  <ClientiScheda clienteId={selectedId} embedded onClose={() => { setSelectedId(null); fetchClienti(); }} />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
                  <div className="font-playfair text-xl text-neutral-700 mb-1">Scegli un cliente</div>
                  <p className="text-sm">La sua scheda si apre qui, senza lasciare la lista.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 bg-emerald-600 text-white" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </>
  );
}
