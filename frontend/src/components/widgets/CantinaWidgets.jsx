// FILE: frontend/src/components/widgets/CantinaWidgets.jsx
// @version: v1.0 — riquadri della Home sommelier (2026-11-05)
// Modulo: vini
//
// Riquadri di sola lettura: ognuno mostra un numero e porta alla pagina dove
// si fa il lavoro. I dati li carica HomeSommelier (una volta, poi ogni 3
// minuti) e arrivano qui come props.
//   RiordinoCard      ← GET /vini/ordini/fornitori/       (da_ordinare)
//   InArrivoCard      ← GET /vini/ordini/fornitori/ + /riepilogo/ (in_viaggio, fermi)
//   FattureViniCard   ← GET /vini/multifornitore/fatture/conteggi/
//   ListiniCard       ← GET /vini/multifornitore/listini/
//   EsauritiCartaCard ← GET /vini/magazzino/dashboard     (alert_carta_senza_giacenza, QTA 0)

import React from "react";
import { useNavigate } from "react-router-dom";

function Card({ titolo, numero, unita, to, children, vuoto }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(to)}
      className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] px-4 py-3 cursor-pointer hover:shadow-[0_3px_14px_rgba(0,0,0,.09)] active:scale-[.995] transition flex-shrink-0"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#a8a49e]">{titolo}</span>
        {numero != null && (
          <span className="text-[17px] font-extrabold text-brand-ink tabular-nums">
            {numero}{unita && <span className="text-[10px] font-medium text-[#a8a49e] ml-1">{unita}</span>}
          </span>
        )}
      </div>
      {vuoto ? <div className="text-[12.5px] text-[#a8a49e] py-1">{vuoto}</div> : children}
    </div>
  );
}

function Riga({ sx, dx, tono }) {
  const cls = tono === "red" ? "bg-red-50 text-red-700" : tono === "ambra" ? "bg-amber-50 text-amber-800" : tono === "verde" ? "bg-emerald-50 text-emerald-800" : "";
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-[#f4f2ee] text-[13px]">
      <span className="flex-1 min-w-0 truncate text-brand-ink">{sx}</span>
      {tono ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{dx}</span>
            : <span className="font-bold text-brand-ink tabular-nums whitespace-nowrap">{dx}</span>}
    </div>
  );
}

export function RiordinoCard({ fornitori }) {
  if (!fornitori) return null;
  const lista = fornitori.filter((f) => f.attivo !== false && f.da_ordinare > 0).sort((a, b) => b.da_ordinare - a.da_ordinare);
  const tot = lista.reduce((s, f) => s + f.da_ordinare, 0);
  return (
    <Card titolo="📦 Da riordinare" numero={tot} unita="vini" to="/vini/ordini" vuoto={lista.length ? null : "Niente da riordinare"}>
      {lista.slice(0, 5).map((f) => (
        <Riga key={f.fornitore_nome} sx={f.fornitore_nome}
          dx={`${f.da_ordinare} ${f.da_ordinare === 1 ? "vino" : "vini"}${f.bozza ? " · bozza" : ""}`} />
      ))}
      {lista.length > 5 && <div className="text-[11px] text-[#a8a49e] pt-1">e altri {lista.length - 5} fornitori</div>}
    </Card>
  );
}

export function InArrivoCard({ fornitori, riepilogo }) {
  if (!fornitori) return null;
  const lista = fornitori.filter((f) => f.in_viaggio > 0).sort((a, b) => b.in_viaggio - a.in_viaggio);
  const tot = riepilogo?.in_viaggio ?? lista.reduce((s, f) => s + f.in_viaggio, 0);
  return (
    <Card titolo="🚚 Ordini in arrivo" numero={tot} to="/vini/ordini" vuoto={lista.length ? null : "Nessun ordine in viaggio"}>
      {lista.slice(0, 4).map((f) => (
        <Riga key={f.fornitore_nome} sx={f.fornitore_nome} dx={`${f.in_viaggio} ${f.in_viaggio === 1 ? "ordine" : "ordini"}`} />
      ))}
      {riepilogo?.fermi > 0 && (
        <Riga sx={`fermi da più di ${riepilogo.soglia_fermo_giorni} giorni`} dx={`${riepilogo.fermi}`} tono="red" />
      )}
    </Card>
  );
}

export function FattureViniCard({ conteggi }) {
  if (!conteggi) return null;
  const em = conteggi.emittenti || [];
  return (
    <Card titolo="🧾 Fatture da abbinare" numero={conteggi.da_abbinare} unita="righe" to="/vini/fatture"
      vuoto={conteggi.da_abbinare || conteggi.da_verificare ? null : "Tutto abbinato"}>
      {em.slice(0, 4).map((e) => (
        <Riga key={e.piva} sx={e.nome || `P.IVA ${e.piva}`} dx={e.classificato ? `${e.da_abbinare}` : `${e.da_abbinare} · da classificare`}
          tono={e.classificato ? null : "ambra"} />
      ))}
      {conteggi.da_verificare > 0 && (
        <Riga sx="prezzi da verificare" dx={`${conteggi.da_verificare}`} tono="ambra" />
      )}
    </Card>
  );
}

const dataBreve = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");

export function ListiniCard({ listini }) {
  if (!listini) return null;
  const aperti = listini.filter((l) => (l.proposte || 0) > 0);
  const recenti = [...listini].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))).slice(0, 3);
  const mostra = aperti.length ? aperti.slice(0, 3) : recenti;
  return (
    <Card titolo="📑 Listini" numero={aperti.length || null} unita={aperti.length ? "da confermare" : null} to="/vini/listini"
      vuoto={listini.length ? null : "Nessun listino caricato"}>
      {mostra.map((l) => (
        <Riga key={l.id} sx={`${l.fornitore || "—"} ${dataBreve(l.data)}`}
          dx={(l.proposte || 0) > 0 ? `${l.proposte} da confermare` : `${l.confermate || 0} confermate`}
          tono={(l.proposte || 0) > 0 ? "ambra" : "verde"} />
      ))}
    </Card>
  );
}

export function EsauritiCartaCard({ dashboard }) {
  if (!dashboard) return null;
  const esauriti = (dashboard.alert_carta_senza_giacenza || []).filter((v) => Number(v.QTA_TOTALE || 0) <= 0);
  return (
    <Card titolo="📉 Esauriti in carta" numero={esauriti.length} to="/vini/dashboard"
      vuoto={esauriti.length ? null : "Nessun vino in carta a zero"}>
      {esauriti.slice(0, 5).map((v) => (
        <Riga key={v.id} sx={`${v.DESCRIZIONE}${v.ANNATA ? ` ${v.ANNATA}` : ""}`} dx="0 bt" tono="red" />
      ))}
      {esauriti.length > 5 && <div className="text-[11px] text-[#a8a49e] pt-1">e altri {esauriti.length - 5}</div>}
    </Card>
  );
}
