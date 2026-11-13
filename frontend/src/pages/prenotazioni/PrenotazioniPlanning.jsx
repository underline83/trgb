// @version: v1.14-stati — «In opzione» (tavolo tenuto fino al…, proroga, coperti a parte) e «Lista d'attesa» (sezione propria, non occupa); pulsanti di stato dai passaggi permessi della tabella stati (sparito «Seduto» su «Da confermare», che dava errore) (2026-11-13); v1.13-scadenza-preventivo — ⏳ prenotazione in attesa di conferma preventivo (scadenza), «Libera tavolo», motivo della cancellazione (2026-11-03); v1.12-motore — tavolo suggerito dal motore per tavoli (clic = assegna, «Assegna i suggeriti»), «non entra» in rosso, tavoli doppi; v1.11-sale — sale aperte/chiuse per turno nell'intestazione (capienza dai tavoli); v1.10-modifica — «✏️ Modifica» nella riga aperta (stesso form della nuova prenotazione); v1.9-nome — nome anche col solo cognome; v1.8-menu-evento — menù dell'evento confermato nella riga aperta; v1.7-preventivo — tasto «📋 Preventivo» nella riga aperta (crea o apre il preventivo della prenotazione, solo per chi può crearli); v1.6-fasce — fasce orarie del turno (apertura, limiti, online anche su TheFork); v1.5-affidabilita — badge no-show del cliente, riconferma WhatsApp; v1.4 scheda inline — scheda cliente aperta dentro il Planning; v1.3 timeline — bollino cliente (prima/occasionale/frequente) + timeline sala per orario; badge «doppione?»
// Modulo: prenotazioni
// Vista planning giornaliero — modulo Prenotazioni TRGB
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import PrenotazioniForm from "./PrenotazioniForm";
import MiniCalendario from "./components/MiniCalendario";
import StatoBadge from "./components/StatoBadge";
import usePrenotazioniStati from "./components/statiPrenotazioni";
import CanaleBadge from "./components/CanaleBadge";
import FasceTurno from "./components/FasceTurno";
import Tooltip from "../../components/Tooltip";
import ClientiScheda from "../clienti/ClientiScheda";
import { Btn } from "../../components/ui";
import useModuleAccess from "../../hooks/useModuleAccess";

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
  if (pren.stato === "OPTION") return "bg-amber-50/60 border-l-4 border-l-amber-300 border-dashed";
  if (pren.stato === "WAITLIST") return "bg-violet-50/60";
  if (isRitardo(pren)) return "bg-amber-50";
  return "bg-white";
}

// ============================================================
// COMPONENTE RIGA PRENOTAZIONE
// ============================================================
// Tavolo della riga: quello scritto, oppure il suggerito dal motore per tavoli (clic = assegna)
function CellaTavolo({ pren, motore, onAssegna }) {
  if (pren.tavolo) {
    if (motore && motore.stato === "conflitto") {
      return (
        <Tooltip label={`Tavolo ${motore.tavoli_doppi.join(", ")} già occupato a quell'ora da un'altra prenotazione`}>
          <span className="text-red-600 font-medium">⚠️ {pren.tavolo}</span>
        </Tooltip>
      );
    }
    return <>{pren.tavolo}</>;
  }
  if (!motore || ["CANCELED", "NO_SHOW", "REFUSED"].includes(pren.stato)) return <span className="text-amber-500">—</span>;
  if (motore.stato === "senza_posto") {
    return (
      <Tooltip label="Nessun tavolo o unione salvata libera per questi coperti a quell'ora">
        <span className="text-[11px] font-semibold text-red-600">non entra</span>
      </Tooltip>
    );
  }
  const s = motore.suggerito;
  if (!s) return <span className="text-amber-500">—</span>;
  const forzato = motore.stato === "forzato";
  return (
    <Tooltip label={`${forzato ? "Solo su un tavolo più grande del necessario (sotto il suo minimo)" : "Tavolo suggerito"}: ${s.nome} (${s.posti} posti${s.prolunghe ? ", prolunga" : ""}). Clicca per assegnarlo`}>
      <button onClick={(e) => { e.stopPropagation(); onAssegna && onAssegna([motore]); }}
        className={`text-xs px-1.5 py-0.5 rounded border border-dashed ${forzato ? "border-amber-400 text-amber-700" : "border-indigo-300 text-indigo-600"} hover:bg-indigo-50`}>
        → {s.nome}
      </button>
    </Tooltip>
  );
}

// Pulsanti di stato (2026-11-13): uno per ogni passaggio permesso dalla tabella stati
const AZIONI_STATO = {
  SEATED:   { label: "✅ Seduto", cls: "bg-emerald-600 hover:bg-emerald-700" },
  ARRIVED:  { label: "🚶 Arrivato", cls: "bg-teal-600 hover:bg-teal-700" },
  BILL:     { label: "🧾 Al conto", cls: "bg-amber-600 hover:bg-amber-700" },
  LEFT:     { label: "🚪 Andato via", cls: "bg-neutral-500 hover:bg-neutral-600" },
  OPTION:   { label: "⏳ In opzione", cls: "bg-amber-500 hover:bg-amber-600" },
  WAITLIST: { label: "🕰️ Lista d'attesa", cls: "bg-violet-500 hover:bg-violet-600" },
  CANCELED: { label: "✖ Cancella", cls: "bg-neutral-400 hover:bg-neutral-500" },
  NO_SHOW:  { label: "👻 No-show", cls: "bg-red-500 hover:bg-red-600" },
  REFUSED:  { label: "⛔ Rifiuta", cls: "bg-red-400 hover:bg-red-500" },
};
function azioneStato(da, a) {
  if (a === "RECORDED") {
    return ["CANCELED", "NO_SHOW", "REFUSED"].includes(da)
      ? { label: "↩ Ripristina", cls: "bg-indigo-500 hover:bg-indigo-600" }
      : { label: "✓ Conferma", cls: "bg-indigo-600 hover:bg-indigo-700" };
  }
  return AZIONI_STATO[a] || { label: a, cls: "bg-neutral-500 hover:bg-neutral-600" };
}
const ggmm = (iso) => (iso || "").split("-").reverse().slice(0, 2).join("/");

function RigaPrenotazione({ pren, motore, onAssegna, onStatoChange, onExpand, expanded, onApriCliente, onRiconferma, onUnisciDoppione, onPreventivo, onModifica, onLiberaTavolo, onTenutoFino }) {
  const { info } = usePrenotazioniStati();
  // pren.nome/cognome sono COALESCE(cliente CRM, snapshot TheFork) lato backend:
  // mostriamo comunque il nome anche quando cliente_id e' NULL (prenotazioni
  // anonimizzate o senza Customer ID import TheFork). Vedi migrazione 068.
  // Basta il cognome (o il solo nome): TheFork spesso manda solo uno dei due
  const nomeCompleto = [
    pren.nome ? `${pren.nome}${pren.nome2 ? ` & ${pren.nome2}` : ""}` : "",
    pren.cognome || "",
  ].filter(Boolean).join(" ");
  const nome = nomeCompleto || (pren.canale === "Walk-in" ? "Walk-in" : "—");

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
            {pren.menu_evento && (
              <Tooltip label="Evento confermato: menù nella riga aperta"><span className="text-xs">🍽️</span></Tooltip>
            )}
            {pren.preventivo_attesa && (
              <Tooltip label={`In attesa di conferma preventivo ${pren.preventivo_attesa.numero}${pren.preventivo_attesa.scadenza ? ` — scade il ${(pren.preventivo_attesa.scadenza || "").split("-").reverse().slice(0, 2).join("/")}` : ""}`}>
                <span className={`text-xs ${pren.preventivo_attesa.stato === "scaduto" ? "text-red-600" : "text-amber-600"}`}>⏳</span>
              </Tooltip>
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
          <CellaTavolo pren={pren} motore={motore} onAssegna={onAssegna} />
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
                {pren.menu_evento && (
                  <div className="mt-1 p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 whitespace-pre-line">
                    🍽️ <b>Evento confermato</b>{"\n"}{pren.menu_evento}
                  </div>
                )}
                {pren.degustazione && <div>🍷 Degustazione: {pren.degustazione}</div>}
                {pren.stato === "OPTION" && !pren.preventivo_attesa && (
                  <div className="mt-1 p-2 rounded border border-dashed border-amber-300 bg-amber-50 text-amber-900">
                    ⏳ <b>In opzione</b>{pren.tenuto_fino_al ? <> — tavolo tenuto fino al {ggmm(pren.tenuto_fino_al)}</> : " — senza data"}
                    {pren.tenuto_fino_al && pren.tenuto_fino_al < new Date().toISOString().slice(0, 10) && <span className="ml-1 text-red-700 font-semibold">(scaduta)</span>}
                    {onTenutoFino && (
                      <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <label className="text-xs">Proroga al</label>
                        <input type="date" defaultValue={pren.tenuto_fino_al || ""} max={pren.data_pasto}
                          onChange={(e) => e.target.value && onTenutoFino(pren, e.target.value)}
                          className="px-2 py-1 text-xs border border-amber-300 rounded bg-white min-h-[32px]" />
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-amber-800">Alla scadenza il tavolo resta tenuto: arriva l'avviso e decidi tu.</div>
                  </div>
                )}
                {pren.stato === "WAITLIST" && (
                  <div className="mt-1 p-2 rounded border border-violet-200 bg-violet-50 text-violet-900">
                    🕰️ <b>Lista d'attesa</b> — non occupa tavoli. Se nel turno si libera un posto arriva l'avviso nel campanello.
                  </div>
                )}
                {pren.preventivo_attesa && (
                  <div className={`mt-1 p-2 rounded border ${pren.preventivo_attesa.stato === "scaduto" ? "bg-red-50 border-red-200 text-red-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                    ⏳ <b>{pren.preventivo_attesa.stato === "scaduto" ? "Preventivo scaduto" : "In attesa di conferma preventivo"}</b> {pren.preventivo_attesa.numero}
                    {pren.preventivo_attesa.scadenza && <> — {pren.preventivo_attesa.stato === "scaduto" ? "scaduto" : "scade"} il {(pren.preventivo_attesa.scadenza || "").split("-").reverse().slice(0, 2).join("/")}</>}
                    {(onPreventivo || onLiberaTavolo) && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {onPreventivo && (
                          <button onClick={(e) => { e.stopPropagation(); onPreventivo(pren); }}
                            className="px-2 py-1 text-xs rounded border border-amber-300 bg-white hover:bg-amber-100 min-h-[32px]">
                            📋 Apri preventivo
                          </button>
                        )}
                        {onLiberaTavolo && (
                          <button onClick={(e) => { e.stopPropagation(); onLiberaTavolo(pren); }}
                            className="px-2 py-1 text-xs rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 min-h-[32px]">
                            🔓 Libera tavolo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {pren.motivo_cancellazione && ["CANCELED", "REFUSED"].includes(pren.stato) && (
                  <div className="mt-1 text-neutral-500">✖ Cancellata: {pren.motivo_cancellazione}</div>
                )}
              </div>

              {/* Colonna 3: azioni */}
              <div>
                <div className="font-semibold text-neutral-700 mb-2">Azioni</div>
                {onModifica && !["LEFT"].includes(pren.stato) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onModifica(pren); }}
                    className="mb-2 mr-2 px-3 py-1.5 text-xs rounded min-h-[36px] border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  >
                    ✏️ Modifica
                  </button>
                )}
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
                {onPreventivo && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPreventivo(pren); }}
                    title="Crea il preventivo con cliente, data, ora e coperti di questa prenotazione (se c'è già, lo apre)"
                    className="mb-2 ml-1 px-3 py-1.5 text-xs rounded min-h-[36px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                  >
                    📋 Preventivo
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {info(pren.stato).transizioni
                    .map((a) => {
                      const az = azioneStato(pren.stato, a);
                      return (
                        <button
                          key={a}
                          onClick={(e) => { e.stopPropagation(); onStatoChange(pren.id, a); }}
                          className={`px-3 py-1 text-xs text-white rounded min-h-[32px] ${az.cls}`}
                        >
                          {az.label}
                        </button>
                      );
                    })}
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
function TimelineSala({ slot, capienza, fasce, onFasce }) {
  if (!slot || slot.length === 0) return null;
  const perOra = Object.fromEntries((fasce || []).map((f) => [f.ora, f]));
  return (
    <div className="flex gap-1 overflow-x-auto px-3 py-2 bg-white border-x border-indigo-200">
      {slot.map((s) => {
        const pct = capienza > 0 ? s.coperti / capienza : 0;
        const colore = pct > 0.9 ? "bg-red-500" : pct > 0.7 ? "bg-amber-500" : "bg-emerald-500";
        const f = perOra[s.ora];
        const statoFascia = !f ? "" : !f.aperta ? " · fascia CHIUSA" : !f.online_aperta ? " · online chiuso" : f.piena ? " · fascia piena" : "";
        return (
          <Tooltip key={s.ora} label={`${s.ora}: ${s.coperti} coperti in sala, ${s.prenotazioni} prenotazioni, ${s.tavoli} tavoli · arrivano ${s.arrivi}${statoFascia}`}>
            <div className={`flex-shrink-0 w-14 text-center rounded ${onFasce ? "cursor-pointer hover:bg-indigo-50" : ""} ${f && !f.aperta ? "opacity-50" : ""}`}
              onClick={onFasce}>
              <div className={`text-[11px] font-semibold ${f && !f.aperta ? "line-through text-neutral-400" : "text-neutral-700"}`}>
                {s.ora}{f && f.aperta && !f.online_aperta && <span className="ml-0.5 text-red-500" title="online chiuso">⊘</span>}
              </div>
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

function TabellaPrenotazioni({ titolo, prenotazioni, conteggio, pax, opzionePax, capienza, motore, onAssegna, onStatoChange, expandedId, onExpand, timeline, fasce, onFasce, sale, onSala, onApriCliente, onRiconferma, onUnisciDoppione, onPreventivo, onModifica, onLiberaTavolo, onTenutoFino }) {
  // Gruppi dalla tabella stati (2026-11-13): fuori = cancellate/no-show/rifiutate;
  // lista d'attesa = né occupa né fuori → sezione a parte
  const { gruppo } = usePrenotazioniStati();
  const fuori = gruppo("fuori");
  const occupa = gruppo("occupa");
  const cancellate = prenotazioni.filter((p) => fuori.includes(p.stato));
  const inAttesa = prenotazioni.filter((p) => !fuori.includes(p.stato) && !occupa.includes(p.stato));
  const attive = prenotazioni.filter((p) => !cancellate.includes(p) && !inAttesa.includes(p));
  const rigaProps = { onStatoChange, onExpand, onApriCliente, onRiconferma, onUnisciDoppione, onPreventivo, onLiberaTavolo, onModifica, onTenutoFino };

  const percentuale = capienza > 0 ? Math.round((pax / capienza) * 100) : 0;
  const perId = Object.fromEntries(((motore && motore.prenotazioni) || []).map((v) => [v.id, v]));
  const conta = (motore && motore.conta) || {};
  const suggeriti = ((motore && motore.prenotazioni) || []).filter((v) => v.stato === "suggerito");
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
          {conta.senza_posto > 0 && (
            <Tooltip label="Con i tavoli e le unioni salvate queste prenotazioni non trovano posto (durata del tavolo compresa): salva l'unione che usate, apri una sala o controlla i doppioni">
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300 font-medium">🔴 {conta.senza_posto} non {conta.senza_posto === 1 ? "entra" : "entrano"}</span>
            </Tooltip>
          )}
          {conta.conflitto > 0 && (
            <Tooltip label="Due prenotazioni sullo stesso tavolo nello stesso momento">
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300">⚠️ {conta.conflitto} tavoli doppi</span>
            </Tooltip>
          )}
          {suggeriti.length > 0 && onAssegna && (
            <button onClick={() => onAssegna(suggeriti)}
              title="Scrive su ogni prenotazione senza tavolo il tavolo suggerito dal motore"
              className="text-xs px-2 py-0.5 rounded-full border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100">
              🪑 Assegna i suggeriti ({suggeriti.length})
            </button>
          )}
          {(sale || []).length > 1 && (
            <div className="flex items-center gap-1">
              {sale.map((s) => (
                <button key={s.zona} onClick={() => onSala && onSala(s.zona, !s.aperta)}
                  title={s.aperta ? `${s.zona} aperta (${s.posti_max} posti): clicca per chiuderla in questo turno` : `${s.zona} chiusa: clicca per aprirla in questo turno`}
                  className={`text-xs px-2 py-0.5 rounded-full border ${s.aperta
                    ? "bg-white border-emerald-300 text-emerald-700"
                    : "bg-neutral-100 border-neutral-200 text-neutral-400 line-through"}`}>
                  {s.zona}{s.eccezione ? " •" : ""}
                </button>
              ))}
            </div>
          )}
          {(() => {
            const chiuse = (fasce || []).filter((f) => !f.aperta).length;
            const offline = (fasce || []).filter((f) => f.aperta && !f.online_aperta).length;
            const errori = (fasce || []).some((f) => String(f.thefork_esito || "").startsWith("errore"));
            return (
              <button onClick={onFasce} title="Fasce orarie: apertura, limiti, vendita online (anche su TheFork)"
                className="text-xs px-2 py-0.5 rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100">
                🕒 Fasce{chiuse > 0 && ` · ${chiuse} chiuse`}{offline > 0 && ` · 🌐✕ ${offline}`}{errori && " ⚠️"}
              </button>
            );
          })()}
          {inAttesa.length > 0 && (
            <Tooltip label="In lista d'attesa: non occupano tavoli, avviso se si libera un posto">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">🕰️ {inAttesa.length} in attesa</span>
            </Tooltip>
          )}
          <span className={`font-medium ${coloreCapienza}`}>
            {pax} / {capienza} pax ({percentuale}%)
          </span>
          {opzionePax > 0 && (
            <Tooltip label="In opzione: tavolo tenuto ma non ancora confermato (non contati nei pax)">
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-dashed border-amber-300 font-medium">+{opzionePax} ⏳ in opzione</span>
            </Tooltip>
          )}
        </div>
      </div>
      {attive.length > 0 && <TimelineSala slot={timeline} capienza={capienza} fasce={fasce} onFasce={onFasce} />}

      {attive.length === 0 && cancellate.length === 0 && inAttesa.length === 0 ? (
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
                  motore={perId[p.id]}
                  onAssegna={onAssegna}
                  onStatoChange={onStatoChange}
                  onExpand={onExpand}
                  expanded={expandedId === p.id}
                  onApriCliente={onApriCliente}
                  onRiconferma={onRiconferma}
                  onUnisciDoppione={onUnisciDoppione}
                  onPreventivo={onPreventivo}
                  onLiberaTavolo={onLiberaTavolo}
                  onModifica={onModifica}
                  onTenutoFino={onTenutoFino}
                />
              ))}
              {inAttesa.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="px-3 py-1 text-[10px] uppercase text-violet-500 bg-violet-50/60 border-t">
                      🕰️ Lista d'attesa ({inAttesa.length}) — non occupano tavoli
                    </td>
                  </tr>
                  {inAttesa.map((p) => (
                    <RigaPrenotazione key={p.id} pren={p} expanded={expandedId === p.id} {...rigaProps} />
                  ))}
                </>
              )}
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
                      onPreventivo={onPreventivo}
                      onLiberaTavolo={onLiberaTavolo}
                      onModifica={onModifica}
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
  // «📋 Preventivo»: solo per chi vede Gestione Clienti › Preventivi e può crearli
  // (le scritture dei preventivi sono admin/superadmin lato backend).
  const { canAccessSub } = useModuleAccess();
  const ruolo = localStorage.getItem("role") || "";
  const puoPreventivi = canAccessSub("clienti", "preventivi") && ["admin", "superadmin"].includes(ruolo);
  const apriPreventivo = (pren) => navigate("/clienti/preventivi/nuovo", { state: { prenotazione: pren } });
  // «Libera tavolo» dal Planning (2026-11-03): prenotazione cancellata (preventivo scaduto), preventivo «scaduto»
  const liberaTavolo = async (pren) => {
    const pa = pren.preventivo_attesa;
    if (!pa) return;
    if (!window.confirm(`Liberare il tavolo di ${pren.cognome || pren.nome || ""}? La prenotazione viene cancellata (motivo «preventivo scaduto») e il preventivo ${pa.numero} passa a «scaduto». Al cliente non parte niente.`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${pa.preventivo_id}/libera-tavolo`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Errore");
      if (d.prenotazione?.thefork && d.prenotazione?.cancellata) {
        window.alert("Tavolo liberato in TRGB. La prenotazione è di TheFork: cancellala anche in TheFork Manager, altrimenti torna.");
      }
      loadPlanning();
    } catch (err) {
      window.alert(err.message || "Errore");
    }
  };
  const { info: statiInfo } = usePrenotazioniStati();
  const [data, setData] = useState(dataParam || oggi());
  const [planning, setPlanning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [fasceTurno, setFasceTurno] = useState(null); // pannello fasce aperto per pranzo/cena
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
        setToast({ type: "ok", text: `Stato aggiornato → ${statiInfo(nuovoStato).etichetta}` });
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

  // «In opzione»: proroga del «tenuto fino al» (2026-11-13)
  const handleTenutoFino = async (pren, data) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${pren.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenuto_fino_al: data }),
      });
      const d = await r.json().catch(() => ({}));
      setToast(r.ok ? { type: "ok", text: `Tavolo tenuto fino al ${data.split("-").reverse().slice(0, 2).join("/")}` }
                    : { type: "err", text: d.detail || "Errore" });
      if (r.ok) loadPlanning();
    } catch {
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Scrive il tavolo suggerito dal motore (una o più prenotazioni)
  const assegnaSuggeriti = async (voci) => {
    if (voci.length > 1 && !window.confirm(`Assegno il tavolo suggerito a ${voci.length} prenotazioni?`)) return;
    let ok = 0;
    for (const v of voci) {
      try {
        const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/assegna/${v.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tavolo: v.suggerito.tavoli.join("+") }),
        });
        if (r.ok) ok += 1;
      } catch { /* conta solo le riuscite */ }
    }
    setToast({ type: ok === voci.length ? "ok" : "err", text: voci.length === 1 && ok ? `Tavolo ${voci[0].suggerito.nome} assegnato` : `Tavoli assegnati: ${ok} su ${voci.length}` });
    loadPlanning();
    setTimeout(() => setToast(null), 3000);
  };

  const [inModifica, setInModifica] = useState(null); // prenotazione aperta nel form di modifica

  // Apre/chiude una sala per questo giorno e turno (mig 214): la capienza si ricalcola dai tavoli
  const cambiaSala = async (turno, zona, aperta) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/sale/${encodeURIComponent(zona)}/giorno`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, aperta }),
      });
      const d = await r.json();
      if (!r.ok) setToast({ type: "err", text: d.detail || "Errore" });
      else setToast({ type: "ok", text: `${zona} ${aperta ? "aperta" : "chiusa"} a ${turno} · ${d.capienza} posti` });
      loadPlanning();
    } catch {
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setTimeout(() => setToast(null), 3000);
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
              opzionePax={c.pranzo_opzione_pax}
              capienza={c.capienza_pranzo}
              motore={planning.motore?.pranzo}
              onAssegna={assegnaSuggeriti}
              timeline={planning.timeline?.pranzo}
              fasce={planning.fasce?.pranzo}
              onFasce={() => setFasceTurno("pranzo")}
              sale={planning.sale?.pranzo}
              onSala={(zona, aperta) => cambiaSala("pranzo", zona, aperta)}
              onStatoChange={handleStatoChange}
              expandedId={expandedId}
              onExpand={handleExpand}
              onApriCliente={apriCliente}
              onRiconferma={riconferma}
              onUnisciDoppione={unisciDoppione}
              onPreventivo={puoPreventivi ? apriPreventivo : undefined}
              onLiberaTavolo={puoPreventivi ? liberaTavolo : undefined}
              onModifica={setInModifica}
              onTenutoFino={handleTenutoFino}
            />

            {/* Tabella cena */}
            <TabellaPrenotazioni
              titolo="🌙 Cena"
              prenotazioni={planning.cena}
              conteggio={c.cena_count}
              pax={c.cena_pax}
              opzionePax={c.cena_opzione_pax}
              capienza={c.capienza_cena}
              motore={planning.motore?.cena}
              onAssegna={assegnaSuggeriti}
              timeline={planning.timeline?.cena}
              fasce={planning.fasce?.cena}
              onFasce={() => setFasceTurno("cena")}
              sale={planning.sale?.cena}
              onSala={(zona, aperta) => cambiaSala("cena", zona, aperta)}
              onStatoChange={handleStatoChange}
              expandedId={expandedId}
              onExpand={handleExpand}
              onApriCliente={apriCliente}
              onRiconferma={riconferma}
              onUnisciDoppione={unisciDoppione}
              onPreventivo={puoPreventivi ? apriPreventivo : undefined}
              onLiberaTavolo={puoPreventivi ? liberaTavolo : undefined}
              onModifica={setInModifica}
              onTenutoFino={handleTenutoFino}
            />

            {/* Riepilogo */}
            <div className="flex items-center justify-between px-4 py-2 bg-white rounded-lg border border-neutral-200 text-sm text-neutral-600">
              <span>
                Totale: <strong>{(c.pranzo_count || 0) + (c.cena_count || 0)}</strong> prenotazioni ·{" "}
                <strong>{(c.pranzo_pax || 0) + (c.cena_pax || 0)}</strong> coperti
                {(c.pranzo_opzione_pax || 0) + (c.cena_opzione_pax || 0) > 0 && (
                  <span className="text-amber-700"> + {(c.pranzo_opzione_pax || 0) + (c.cena_opzione_pax || 0)} in opzione</span>
                )}
                {(c.pranzo_attesa_count || 0) + (c.cena_attesa_count || 0) > 0 && (
                  <span className="text-violet-700"> · {(c.pranzo_attesa_count || 0) + (c.cena_attesa_count || 0)} in lista d'attesa</span>
                )}
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

      {fasceTurno && (
        <FasceTurno data={data} turno={fasceTurno} onClose={() => setFasceTurno(null)} onChange={loadPlanning} />
      )}

      {/* Modal form nuova prenotazione */}
      {showForm && (
        <PrenotazioniForm
          defaultData={data}
          onClose={() => setShowForm(false)}
          onSuccess={handleFormSuccess}
        />
      )}
      {inModifica && (
        <PrenotazioniForm
          prenotazione={inModifica}
          onClose={() => setInModifica(null)}
          onSuccess={() => {
            setInModifica(null);
            loadPlanning();
            setToast({ type: "ok", text: "Prenotazione aggiornata" });
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}
