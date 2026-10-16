// @version: v1.5-affidabilita — badge no-show del cliente, riconferma WhatsApp; v1.4 scheda inline — scheda cliente aperta dentro il Planning; v1.3 timeline — bollino cliente (prima/occasionale/frequente) + timeline sala per orario; badge «doppione?»
// Modulo: prenotazioni
// Vista planning giornaliero — modulo Prenotazioni TRGB
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import PrenotazioniForm from "./PrenotazioniForm";
import MiniCalendario from "./components/MiniCalendario";
import StatoBadge from "./components/StatoBadge";
import CanaleBadge from "./components/CanaleBadge";
import Tooltip from "../../components/Tooltip";
import ClientiScheda from "../clienti/ClientiScheda";
import { Btn } from "../../components/ui";

const oggi = () => new Date().toISOString().slice(0, 10);

const GIORNI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function formatData(iso) {
  const d = new Date(iso + "T12:00:00");
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

function shiftDate(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Stato ritardo: > 15 min dopo l'ora prevista e non ancora arrivato
function isRitardo(pren) {
  if (!["RECORDED", "REQUESTED"].includes(pren.stato)) return false;
  if (!pren.ora_pasto) return false;
  const now = new Date();
  const [h, m] = pren.ora_pasto.split(":").map(Number);
  const oraPreno = new Date();
  oraPreno.setHours(h, m, 0, 0);
  return (now - oraPreno) > 15 * 60 * 1000;
}

// Colore riga per stato
function rigaClasses(pren) {
  if (pren.stato === "CANCELED" || pren.stato === "REFUSED") return "bg-neutral-50 opacity-60";
  if (pren.stato === "NO_SHOW") return "bg-red-50 opacity-70";
  if (pren.stato === "LEFT" || pren.stato === "BILL") return "bg-emerald-50";
  if (pren.stato === "SEATED" || pren.stato === "ARRIVED") return "bg-green-50";
  if (pren.stato === "REQUESTED") return "bg-blue-50";
  if (isRitardo(pren)) return "bg-amber-50";
  return "bg-white";
}

// ============================================================
// COMPONENTE RIGA PRENOTAZIONE
// ============================================================
function RigaPrenotazione({ pren, onStatoChange, onExpand, expanded, onApriCliente, onRiconferma, onUnisciDoppione }) {
  // pren.nome/cognome sono COALESCE(cliente CRM, snapshot TheFork) lato backend:
  // mostriamo comunque il nome anche quando cliente_id e' NULL (prenotazioni
  // anonimizzate o senza Customer ID import TheFork). Vedi migrazione 068.
  const nome = pren.nome
    ? `${pren.nome}${pren.nome2 ? ` & ${pren.nome2}` : ""}${pren.cognome ? ` ${pren.cognome}` : ""}`
    : (pren.canale === "Walk-in" ? "Walk-in" : "—");

  const oraShort = pren.ora_pasto ? pren.ora_pasto.slice(0, 5) : "—";

  return (
    <>
      <tr
        className={`border-b border-neutral-100 cursor-pointer hover:bg-neutral-50/50 transition ${rigaClasses(pren)}`}
        onClick={() => onExpand(pren.id)}
      >
        {/* Ora */}
        <td className="px-3 py-2 text-sm font-mono font-medium text-neutral-700 whitespace-nowrap">
          {oraShort}
          {isRitardo(pren) && <Tooltip label="In ritardo"><span className="ml-1 text-amber-500">⏰</span></Tooltip>}
        </td>

        {/* Cliente */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <CanaleBadge canale={pren.canale} fonte={pren.fonte} />
            {pren.cliente_id ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onApriCliente && onApriCliente(pren.cliente_id); }}
                className="text-sm font-medium text-indigo-700 hover:underline text-left"
              >
                {nome}
              </button>
            ) : (
              <span className="text-sm text-neutral-600">{nome}</span>
            )}
            {pren.vip === 1 && <Tooltip label="VIP"><span>⭐</span></Tooltip>}
            {pren.no_show_totali > 0 && (
              <Tooltip label={`Affidabilità: ${pren.no_show_totali} no-show e ${pren.cancellate_totali || 0} cancellazioni in passato`}>
                <span className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold rounded-full">
                  {pren.no_show_totali} no-show
                </span>
              </Tooltip>
            )}
            {pren.reminder_inviato === 1 && (
              <Tooltip label="Riconferma WhatsApp inviata"><span className="text-emerald-600 text-xs">✓💬</span></Tooltip>
            )}
            {pren.bollino && BOLLINI[pren.bollino] && (
              <Tooltip label={`${pren.visite_precedenti || 0} visite prima di oggi`}>
                <span className={`px-1.5 py-0.5 border text-[10px] font-medium rounded-full ${BOLLINI[pren.bollino].cls}`}>
                  {BOLLINI[pren.bollino].label}
                </span>
              </Tooltip>
            )}
            {(pren.allergie || pren.allergie_segnalate) && (
              <Tooltip label={pren.allergie || pren.allergie_segnalate}>
                <span className="text-red-500 text-xs">⚠️</span>
              </Tooltip>
            )}
            {pren.stato === "REQUESTED" && (
              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full">NUOVA</span>
            )}
            {pren.possibili_doppioni && pren.possibili_doppioni.length > 0 && (
              <Tooltip label={pren.possibili_doppioni.map((d) => `Uguale a ${d.ora} ${d.nome} (${d.pax} pax${d.thefork ? ", TheFork" : ", a mano"}): ${d.motivi.join(", ")}`).join(" · ")}>
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold rounded-full">DOPPIONE?</span>
              </Tooltip>
            )}
          </div>
        </td>

        {/* Pax */}
        <td className="px-3 py-2 text-sm text-center font-medium">{pren.pax}</td>

        {/* Tavolo */}
        <td className="px-3 py-2 text-sm text-center text-neutral-600">
          {pren.tavolo || <span className="text-amber-500">—</span>}
          {pren.tavolo_esterno === 1 && <Tooltip label="Esterno"><span className="ml-1">🌳</span></Tooltip>}
        </td>

        {/* Note (troncate) */}
        <td className="px-3 py-2 text-xs text-neutral-500 max-w-[200px] truncate">
          {pren.nota_ristorante || pren.nota_cliente || pren.occasione || ""}
          {pren.seggioloni && pren.seggioloni !== "0" && (
            <span className="ml-1">🪑{pren.seggioloni}</span>
          )}
        </td>

        {/* Stato */}
        <td className="px-3 py-2 text-right">
          <StatoBadge stato={pren.stato} />
        </td>
      </tr>

      {/* Riga espansa */}
      {expanded && (
        <tr className="bg-neutral-50/80">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* Colonna 1: info cliente */}
              <div>
                <div className="font-semibold text-neutral-700 mb-1">Cliente</div>
                {pren.telefono && <div>📞 {pren.telefono}</div>}
                {pren.email && <div>✉️ {pren.email}</div>}
                {pren.visite_totali > 0 && <div>📊 {pren.visite_totali} visite totali</div>}
                {pren.cliente_id && (pren.no_show_totali > 0 || pren.cancellate_totali > 0) && (
                  <div className={pren.no_show_totali > 0 ? "text-red-600" : "text-neutral-500"}>
                    ⚖️ Affidabilità: {pren.no_show_totali || 0} no-show, {pren.cancellate_totali || 0} cancellazioni
                  </div>
                )}
                {pren.tags && pren.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {pren.tags.map((t) => (
                      <span key={t.nome} className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: t.colore }}>
                        {t.nome}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Colonna 2: note e dettagli */}
              <div>
                <div className="font-semibold text-neutral-700 mb-1">Dettagli</div>
                {pren.allergie && <div className="text-red-600">⚠️ Allergie CRM: {pren.allergie}</div>}
                {pren.allergie_segnalate && <div className="text-red-600">⚠️ Allergie pren.: {pren.allergie_segnalate}</div>}
                {pren.restrizioni_dietetiche && <div>🥗 {pren.restrizioni_dietetiche}</div>}
                {pren.pref_cibo && <div>🍽️ {pren.pref_cibo}</div>}
                {pren.occasione && <div>🎉 {pren.occasione}</div>}
                {(pren.possibili_doppioni || []).map((d) => (
                  <div key={d.id} className="text-amber-700">
                    ⚠️ Possibile doppione: {d.ora} {d.nome}, {d.pax} pax ({d.thefork ? "da TheFork" : "inserita a mano"}) — uguale: {d.motivi.join(", ")}
                    {d.thefork && !pren.thefork_booking_id && onUnisciDoppione && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnisciDoppione(pren, d); }}
                        className="ml-2 px-2 py-0.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium"
                      >
                        Tieni quella TheFork, elimina questa
                      </button>
                    )}
                  </div>
                ))}
                {pren.nota_ristorante && <div className="mt-1">📝 Nota staff: {pren.nota_ristorante}</div>}
                {pren.nota_cliente && <div>💬 Nota cliente: {pren.nota_cliente}</div>}
                {pren.menu_preset && <div>🍴 Menu: {pren.menu_preset}</div>}
                {pren.degustazione && <div>🍷 Degustazione: {pren.degustazione}</div>}
              </div>

              {/* Colonna 3: azioni */}
              <div>
                <div className="font-semibold text-neutral-700 mb-2">Azioni</div>
                {pren.telefono && ["RECORDED", "REQUESTED"].includes(pren.stato) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRiconferma && onRiconferma(pren); }}
                    className={`mb-2 px-3 py-1.5 text-xs rounded min-h-[36px] ${
                      pren.reminder_inviato === 1
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    💬 {pren.reminder_inviato === 1 ? "Riconferma inviata — reinvia" : "Riconferma su WhatsApp"}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {["RECORDED", "REQUESTED"].includes(pren.stato) && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "SEATED"); }}
                        className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        ✅ Seduto
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "CANCELED"); }}
                        className="px-3 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500"
                      >
                        ✖ Cancella
                      </button>
                    </>
                  )}
                  {pren.stato === "RECORDED" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "NO_SHOW"); }}
                      className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      👻 No-show
                    </button>
                  )}
                  {pren.stato === "REQUESTED" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "RECORDED"); }}
                      className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      ✓ Conferma
                    </button>
                  )}
                  {pren.stato === "SEATED" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "LEFT"); }}
                      className="px-3 py-1 text-xs bg-neutral-500 text-white rounded hover:bg-neutral-600"
                    >
                      🚪 Andato via
                    </button>
                  )}
                  {pren.stato === "ARRIVED" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "SEATED"); }}
                      className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      ✅ Seduto
                    </button>
                  )}
                  {["CANCELED", "NO_SHOW", "REFUSED"].includes(pren.stato) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, "RECORDED"); }}
                      className="px-3 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600"
                    >
                      ↩ Ripristina
                    </button>
                  )}
                </div>
                {pren.thefork_booking_id && (
                  <div className="mt-2 text-[10px] text-neutral-400">TF: {pren.thefork_booking_id}</div>
                )}
                {pren.creato_da && (
                  <div className="mt-1 text-[10px] text-neutral-400">Creato da: {pren.creato_da}</div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}


// ============================================================
// TABELLA TURNO (pranzo o cena)
// ============================================================
// Bollino cliente come in TheFork Manager (visite fatte PRIMA di quel giorno; soglia in config)
const BOLLINI = {
  prima:       { label: "Prima visita", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  occasionale: { label: "Occasionale",  cls: "bg-neutral-50 text-neutral-600 border-neutral-200" },
  frequente:   { label: "Frequente",    cls: "bg-amber-50 text-amber-800 border-amber-300" },
};

// Timeline sala: coperti in sala per orario (arrivo + durata media del turno)
function TimelineSala({ slot, capienza }) {
  if (!slot || slot.length === 0) return null;
  return (
    <div className="flex gap-1 overflow-x-auto px-3 py-2 bg-white border-x border-indigo-200">
      {slot.map((s) => {
        const pct = capienza > 0 ? s.coperti / capienza : 0;
        const colore = pct > 0.9 ? "bg-red-500" : pct > 0.7 ? "bg-amber-500" : "bg-emerald-500";
        return (
          <Tooltip key={s.ora} label={`${s.ora}: ${s.coperti} coperti in sala, ${s.prenotazioni} prenotazioni, ${s.tavoli} tavoli · arrivano ${s.arrivi}`}>
            <div className="flex-shrink-0 w-14 text-center">
              <div className="text-[11px] font-semibold text-neutral-700">{s.ora}</div>
              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden my-0.5">
                <div className={`h-full ${colore}`} style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
              </div>
              <div className="text-[10px] text-neutral-500">{s.coperti}/{capienza}</div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

function TabellaPrenotazioni({ titolo, prenotazioni, conteggio, pax, capienza, onStatoChange, expandedId, onExpand, timeline, onApriCliente, onRiconferma, onUnisciDoppione }) {
  const attive = prenotazioni.filter((p) => !["CANCELED", "NO_SHOW", "REFUSED"].includes(p.stato));
  const cancellate = prenotazioni.filter((p) => ["CANCELED", "NO_SHOW", "REFUSED"].includes(p.stato));

  const percentuale = capienza > 0 ? Math.round((pax / capienza) * 100) : 0;
  const coloreCapienza = percentuale > 90 ? "text-red-600" : percentuale > 70 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 rounded-t-lg border border-indigo-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-indigo-900">{titolo}</span>
          <span className="text-sm text-indigo-600">{conteggio} prenotazioni</span>
          {(() => {
            const daRic = prenotazioni.filter((p) => p.stato === "RECORDED" && p.telefono && p.reminder_inviato !== 1).length;
            return daRic > 0 ? (
              <Tooltip label="Prenotazioni con telefono non ancora riconfermate su WhatsApp (apri la riga per inviare)">
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">💬 {daRic} da riconfermare</span>
              </Tooltip>
            ) : null;
          })()}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`font-medium ${coloreCapienza}`}>
            {pax} / {capienza} pax ({percentuale}%)
          </span>
        </div>
      </div>
      {attive.length > 0 && <TimelineSala slot={timeline} capienza={capienza} />}

      {attive.length === 0 && cancellate.length === 0 ? (
        <div className="border border-t-0 border-neutral-200 rounded-b-lg p-6 text-center text-neutral-400">
          Nessuna prenotazione
        </div>
      ) : (
        <div className="border border-t-0 border-neutral-200 rounded-b-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] uppercase text-neutral-400 border-b border-neutral-100">
                <th className="px-3 py-1.5 text-left w-16">Ora</th>
                <th className="px-3 py-1.5 text-left">Cliente</th>
                <th className="px-3 py-1.5 text-center w-12">Pax</th>
                <th className="px-3 py-1.5 text-center w-16">Tavolo</th>
                <th className="px-3 py-1.5 text-left">Note</th>
                <th className="px-3 py-1.5 text-right w-28">Stato</th>
              </tr>
            </thead>
            <tbody>
              {attive.map((p) => (
                <RigaPrenotazione
                  key={p.id}
                  pren={p}
                  onStatoChange={onStatoChange}
                  onExpand={onExpand}
                  expanded={expandedId === p.id}
                  onApriCliente={onApriCliente}
                  onRiconferma={onRiconferma}
                  onUnisciDoppione={onUnisciDoppione}
                />
              ))}
              {cancellate.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="px-3 py-1 text-[10px] uppercase text-neutral-400 bg-neutral-50 border-t">
                      Cancellate / No-show ({cancellate.length})
                    </td>
                  </tr>
                  {cancellate.map((p) => (
                    <RigaPrenotazione
                      key={p.id}
                      pren={p}
                      onStatoChange={onStatoChange}
                      onExpand={onExpand}
                      expanded={expandedId === p.id}
                      onApriCliente={onApriCliente}
                      onRiconferma={onRiconferma}
                      onUnisciDoppione={onUnisciDoppione}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================
export default function PrenotazioniPlanning() {
  const { data: dataParam } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(dataParam || oggi());
  const [planning, setPlanning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showCalendario, setShowCalendario] = useState(false);
  const [toast, setToast] = useState(null);
  // Scheda cliente aperta dentro la pagina (come fatture e vini), senza lasciare il Planning
  const [clienteAperto, setClienteAperto] = useState(null);
  const apriCliente = (id) => { setClienteAperto(id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Riconferma WhatsApp (template «reminder» in Impostazioni): apre WhatsApp e segna inviata.
  // La finestra si apre subito (prima delle chiamate) per non farla bloccare dal browser.
  const riconferma = async (pren) => {
    const finestra = window.open("", "_blank");
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${pren.id}/wa-link?tipo=reminder`);
      const d = await r.json();
      if (!r.ok) { finestra && finestra.close(); setToast({ type: "err", text: d.detail || "Errore" }); return; }
      if (finestra) finestra.location.href = d.link; else window.open(d.link, "_blank");
      await apiFetch(`${API_BASE}/prenotazioni/${pren.id}/inviato?tipo=reminder`, { method: "POST" });
      setToast({ type: "ok", text: `Riconferma aperta su WhatsApp per ${pren.nome || ""} ${pren.cognome || ""}` });
      loadPlanning();
    } catch {
      finestra && finestra.close();
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setTimeout(() => setToast(null), 3000);
  };

  // Doppione: la prenotazione inserita a mano confluisce in quella TheFork e si elimina.
  const unisciDoppione = async (pren, d) => {
    if (!window.confirm(`Tengo la prenotazione TheFork delle ${d.ora} ed elimino questa inserita a mano?\nNote, allergie e tavolo mancanti vengono copiati su quella TheFork.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${pren.id}/unisci-in/${d.id}`, { method: "POST" });
      const res = await r.json();
      if (!r.ok) setToast({ type: "err", text: res.detail || "Errore" });
      else {
        setToast({ type: "ok", text: `Doppione eliminato${res.copiati?.length ? ` (copiati: ${res.copiati.join(", ")})` : ""}` });
        setExpandedId(null);
        loadPlanning();
      }
    } catch {
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setTimeout(() => setToast(null), 3000);
  };

  const loadPlanning = useCallback(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/prenotazioni/planning/${data}`)
      .then((r) => r.json())
      .then((d) => { setPlanning(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [data]);

  useEffect(() => {
    loadPlanning();
  }, [loadPlanning]);

  // Sync URL con data
  useEffect(() => {
    if (dataParam !== data) {
      navigate(`/prenotazioni/planning/${data}`, { replace: true });
    }
  }, [data, dataParam, navigate]);

  const handleStatoChange = async (prenId, nuovoStato) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${prenId}/stato`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (r.ok) {
        setToast({ type: "ok", text: `Stato aggiornato → ${nuovoStato}` });
        loadPlanning();
      } else {
        const err = await r.json();
        setToast({ type: "err", text: err.detail || "Errore" });
      }
    } catch {
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    loadPlanning();
    setToast({ type: "ok", text: "Prenotazione creata" });
    setTimeout(() => setToast(null), 3000);
  };

  const c = planning?.contatori || {};

  return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="planning" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Header con navigazione data */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => setData(shiftDate(data, -1))}>◀</Btn>
            <div className="text-center min-w-[260px]">
              <div className="text-lg font-bold text-neutral-800">{formatData(data)}</div>
              {data === oggi() && (
                <span className="text-xs text-indigo-600 font-medium">Oggi</span>
              )}
            </div>
            <Btn variant="secondary" size="sm" onClick={() => setData(shiftDate(data, 1))}>▶</Btn>
            {data !== oggi() && (
              <Btn variant="chip" tone="violet" size="sm" onClick={() => setData(oggi())}>
                Oggi
              </Btn>
            )}
            <Btn variant="secondary" size="sm" onClick={() => setShowCalendario(!showCalendario)}>
              📅
            </Btn>
          </div>

          <Btn variant="chip" tone="violet" size="md" onClick={() => setShowForm(true)}>
            + Nuova Prenotazione
          </Btn>
        </div>

        {/* Mini-calendario */}
        {showCalendario && (
          <div className="mb-4">
            <MiniCalendario
              selectedDate={data}
              onSelectDate={(d) => { setData(d); setShowCalendario(false); }}
            />
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>
            {toast.text}
          </div>
        )}

        {clienteAperto ? (
          <div>
            <button
              onClick={() => { setClienteAperto(null); loadPlanning(); }}
              className="mb-3 text-sm text-indigo-700 hover:text-indigo-900 font-medium min-h-[44px]"
            >
              ← Torna al planning
            </button>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <ClientiScheda
                clienteId={clienteAperto}
                embedded
                onClose={() => { setClienteAperto(null); loadPlanning(); }}
              />
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : planning ? (
          <>
            {/* Tabella pranzo */}
            <TabellaPrenotazioni
              titolo="🌤️ Pranzo"
              prenotazioni={planning.pranzo}
              conteggio={c.pranzo_count}
              pax={c.pranzo_pax}
              capienza={c.capienza_pranzo}
              timeline={planning.timeline?.pranzo}
              onStatoChange={handleStatoChange}
              expandedId={expandedId}
              onExpand={handleExpand}
              onApriCliente={apriCliente}
              onRiconferma={riconferma}
              onUnisciDoppione={unisciDoppione}
            />

            {/* Tabella cena */}
            <TabellaPrenotazioni
              titolo="🌙 Cena"
              prenotazioni={planning.cena}
              conteggio={c.cena_count}
              pax={c.cena_pax}
              capienza={c.capienza_cena}
              timeline={planning.timeline?.cena}
              onStatoChange={handleStatoChange}
              expandedId={expandedId}
              onExpand={handleExpand}
              onApriCliente={apriCliente}
              onRiconferma={riconferma}
              onUnisciDoppione={unisciDoppione}
            />

            {/* Riepilogo */}
            <div className="flex items-center justify-between px-4 py-2 bg-white rounded-lg border border-neutral-200 text-sm text-neutral-600">
              <span>
                Totale: <strong>{(c.pranzo_count || 0) + (c.cena_count || 0)}</strong> prenotazioni ·{" "}
                <strong>{(c.pranzo_pax || 0) + (c.cena_pax || 0)}</strong> coperti
              </span>
              {c.senza_tavolo > 0 && (
                <span className="text-amber-600 font-medium">
                  ⚠️ {c.senza_tavolo} senza tavolo
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-neutral-400">Errore nel caricamento</div>
        )}
      </div>

      {/* Modal form nuova prenotazione */}
      {showForm && (
        <PrenotazioniForm
          defaultData={data}
          onClose={() => setShowForm(false)}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
