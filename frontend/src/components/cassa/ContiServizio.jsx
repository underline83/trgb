// @version: v1.1 — walk-in senza nome + prenotazioni mai segnate arrivate collegabili a mano (2026-10-19)
// v1.0 — Conti del servizio: abbinamento conti iPratico ↔ prenotazioni/clienti (2026-10-18)
// Modulo: cassa (ponte platform verso prenotazioni/clienti, vedi abbinamento_conti_service.py)
// Usato nella Chiusura turno e in Impostazioni Vendite › iPratico Cloud (giorni da sistemare).
// Non blocca mai la chiusura: se iPratico non risponde mostra un avviso e si va avanti.
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge } from "../ui";

const BASE = `${API_BASE}/cassa/ipratico`;
const euro = (n) => (n ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const ora = (s) => (s ? s.slice(11, 16) : "—");

async function leggi(res) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.detail || `Errore ${res.status}`);
  return j;
}

function nomeConto(c) {
  if (c.cliente?.nome) return c.cliente.nome;
  if (c.prenotazione?.nome) return c.prenotazione.nome;
  if (c.prenotazione) return "prenotazione senza nome";
  return null;
}

// ── Pannello «chi era?» ──────────────────────────────────────────────────
function SceltaCliente({ conto, libere, nonArrivate = [], onScelta, onChiudi }) {
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState([]);
  const [nuovo, setNuovo] = useState(null); // {nome, cognome, telefono}

  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/prenotazioni/clienti/search?q=${encodeURIComponent(q.trim())}`);
        if (r.ok) setTrovati((await r.json()).slice(0, 8));
      } catch { /* ricerca: silenziosa */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const conPrenotazione = !!conto.prenotazione;
  const walkinSenzaNome = conPrenotazione && !conto.cliente_id && !conto.prenotazione?.nome;

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-3 text-sm">
      {!conPrenotazione && libere.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Prenotazioni del turno ancora libere</div>
          <div className="flex flex-wrap gap-2">
            {libere.map((p) => (
              <button key={p.id} type="button" onClick={() => onScelta({ tipo: "prenotazione", prenotazione_id: p.id })}
                className="min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white hover:border-indigo-400 text-left">
                <span className="font-medium">{p.nome || "senza nome"}</span>
                <span className="text-neutral-500"> · {p.ora} · tav {p.tavolo || "—"} · {p.pax}p</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!conPrenotazione && nonArrivate.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Mai segnate arrivate</div>
          <p className="text-xs text-neutral-500 mb-1">Collegandola, la prenotazione viene segnata «andati».</p>
          <div className="flex flex-wrap gap-2">
            {nonArrivate.map((p) => (
              <button key={p.id} type="button" onClick={() => onScelta({ tipo: "prenotazione", prenotazione_id: p.id })}
                className="min-h-[44px] px-3 rounded-lg border border-dashed border-amber-400 bg-white hover:border-indigo-400 text-left">
                <span className="font-medium">{p.nome || "senza nome"}</span>
                <span className="text-neutral-500"> · {p.ora} · tav {p.tavolo || "—"} · {p.pax}p</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">
          {conPrenotazione ? "Dai un nome a questa prenotazione" : "Cerca il cliente"}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cognome o telefono"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px] bg-white" />
        {trovati.length > 0 && (
          <div className="mt-1 bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            {trovati.map((c) => (
              <button key={c.id} type="button" onClick={() => onScelta({ tipo: "cliente", cliente_id: c.id })}
                className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-indigo-50">
                {c.nome} {c.cognome}{c.vip ? " ⭐" : ""}
                <span className="text-neutral-400"> · {c.telefono || "—"} · {c.visite_totali || 0} visite</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {nuovo ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input placeholder="Nome" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
            className="border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px] bg-white" />
          <input placeholder="Cognome *" value={nuovo.cognome} onChange={(e) => setNuovo({ ...nuovo, cognome: e.target.value })}
            className="border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px] bg-white" />
          <input placeholder="Telefono" value={nuovo.telefono} onChange={(e) => setNuovo({ ...nuovo, telefono: e.target.value })}
            className="border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px] bg-white" />
          <div className="sm:col-span-3 flex gap-2">
            <Btn size="md" disabled={!nuovo.cognome.trim()} onClick={() => onScelta({ tipo: "nuovo_cliente", ...nuovo })}>Crea e collega</Btn>
            <Btn size="md" variant="ghost" onClick={() => setNuovo(null)}>Annulla</Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Btn size="md" variant="secondary" onClick={() => setNuovo({ nome: "", cognome: "", telefono: "" })}>➕ Nuovo cliente</Btn>
          {!conPrenotazione && <Btn size="md" variant="secondary" onClick={() => onScelta({ tipo: "passaggio" })}>🚶 Di passaggio</Btn>}
          {walkinSenzaNome && <Btn size="md" variant="secondary" onClick={() => onScelta({ tipo: "passaggio" })}>🚶 Walk-in, senza nome</Btn>}
          {conPrenotazione && <Btn size="md" variant="ghost" onClick={() => onScelta({ tipo: "riapri" })}>Non è questa prenotazione</Btn>}
          <Btn size="md" variant="ghost" onClick={onChiudi}>Chiudi</Btn>
        </div>
      )}
    </div>
  );
}

// ── Componente principale ────────────────────────────────────────────────
export default function ContiServizio({ data, turno, compatto = false }) {
  const [vista, setVista] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [aperto, setAperto] = useState(null);     // conto con il pannello «chi era?»
  const [dettaglio, setDettaglio] = useState(null); // conto con i piatti aperti
  const [mostraOk, setMostraOk] = useState(false);

  const carica = useCallback(async () => {
    setErrore(null);
    try { setVista(await leggi(await apiFetch(`${BASE}/servizio/${data}/${turno}/`))); }
    catch (e) { setErrore(e.message); }
  }, [data, turno]);

  useEffect(() => { setVista(null); setAperto(null); carica(); }, [carica]);

  const prepara = async () => {
    setCaricando(true); setErrore(null);
    try { setVista(await leggi(await apiFetch(`${BASE}/servizio/${data}/${turno}/prepara/`, { method: "POST" }))); }
    catch (e) { setErrore(e.message); }
    finally { setCaricando(false); }
  };

  const scegli = async (conto, scelta) => {
    setErrore(null);
    try {
      await leggi(await apiFetch(`${BASE}/conti/${conto.id}/abbina/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scelta),
      }));
      setAperto(null);
      await carica();
    } catch (e) { setErrore(e.message); }
  };

  const conti = vista?.conti || [];
  const k = vista?.conteggi || {};
  const daGuardare = conti.filter((c) =>
    c.abbinamento === "proposto" || c.abbinamento === "da_fare" ||
    (["auto", "manuale"].includes(c.abbinamento) && !c.cliente_id));
  const aPosto = conti.filter((c) => !daGuardare.includes(c));

  const riga = (c) => {
    const nome = nomeConto(c);
    return (
      <div key={c.id} className="py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={() => setDettaglio(dettaglio === c.id ? null : c.id)}
            className="flex flex-wrap items-center gap-x-3 text-left min-h-[44px]">
            <span className="text-neutral-500 w-11">{ora(c.aperto_at)}</span>
            <span className="font-semibold w-24">{c.tavolo || "banco"}</span>
            <span className="text-neutral-600 w-14">{c.coperti ? `${c.coperti} cop.` : ""}</span>
            <span className="font-semibold w-20">{euro(c.totale)}</span>
          </button>
          <span className="flex-1 min-w-[10rem]">
            {c.abbinamento === "proposto" && <>❓ <span className="text-neutral-500">Sembra</span> <b>{nome}</b>
              <span className="text-neutral-500"> · {c.prenotazione?.ora} · {c.prenotazione?.pax}p</span></>}
            {["auto", "manuale"].includes(c.abbinamento) && (nome
              ? <>✅ <b>{nome}</b>{c.prenotazione && <span className="text-neutral-500"> · {c.prenotazione.ora} · {c.prenotazione.pax}p</span>}</>
              : <>✅ <span className="text-amber-700">prenotazione senza nome</span>{c.prenotazione && <span className="text-neutral-500"> · {c.prenotazione.ora}</span>}</>)}
            {c.abbinamento === "da_fare" && <span className="text-amber-700">👤 Chi era?</span>}
            {c.abbinamento === "passaggio" && (c.prenotazione
              ? <span className="text-neutral-500">🚶 walk-in senza nome · {c.prenotazione.ora} · {c.prenotazione.pax}p</span>
              : <span className="text-neutral-500">🚶 di passaggio</span>)}
            {c.abbinamento === "banco" && <span className="text-neutral-400">al banco</span>}
          </span>
          <span className="flex gap-2">
            {c.abbinamento === "proposto" && <Btn size="md" onClick={() => scegli(c, { tipo: "conferma" })}>Sì</Btn>}
            {c.abbinamento !== "banco" && (
              <Btn size="md" variant={c.abbinamento === "da_fare" || (!c.cliente_id && c.prenotazione) ? "secondary" : "ghost"}
                onClick={() => setAperto(aperto === c.id ? null : c.id)}>
                {c.abbinamento === "da_fare" ? "Scegli" : !c.cliente_id && c.prenotazione ? "Dai un nome" : "Cambia"}
              </Btn>
            )}
          </span>
        </div>
        {dettaglio === c.id && (
          <ul className="mt-1 pl-14 text-sm text-neutral-600">
            {c.righe.map((r, i) => <li key={i}>{r.quantita}× {r.nome} <span className="text-neutral-400">· {euro(r.totale)}</span></li>)}
            {c.romana ? <li className="text-neutral-400">pagato alla romana (n. {c.documenti})</li> : null}
          </ul>
        )}
        {aperto === c.id && (
          <SceltaCliente conto={c} libere={vista.prenotazioni_libere} nonArrivate={vista.prenotazioni_non_arrivate || []} onScelta={(s) => scegli(c, s)} onChiudi={() => setAperto(null)} />
        )}
      </div>
    );
  };

  return (
    <div className={compatto ? "" : "bg-white rounded-2xl shadow p-5 border border-neutral-200"}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">🧾 Conti del servizio</h2>
        <Btn size="md" variant={conti.length ? "secondary" : "primary"} loading={caricando} onClick={prepara}>
          {conti.length ? "🔄 Aggiorna da iPratico" : "Scarica e abbina"}
        </Btn>
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        Collega ogni conto al cliente, finché il servizio è fresco. Facoltativo: si può saltare e sistemare dopo.
      </p>

      {vista?.avviso && <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">{vista.avviso}</div>}
      {errore && <div className="mb-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errore}</div>}

      {vista && conti.length === 0 && !caricando && (
        <p className="text-sm text-neutral-500">Nessun conto per questo turno. Premi «Scarica e abbina» quando i conti sono chiusi in cassa.</p>
      )}

      {conti.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mb-2 text-sm">
            <StatusBadge tone="success">{(k.auto || 0) + (k.manuale || 0)} abbinati</StatusBadge>
            {k.proposto > 0 && <StatusBadge tone="info">{k.proposto} da confermare</StatusBadge>}
            {k.da_fare > 0 && <StatusBadge tone="warning">{k.da_fare} senza prenotazione</StatusBadge>}
            {k.senza_nome > 0 && <StatusBadge tone="warning">{k.senza_nome} senza nome</StatusBadge>}
            {k.passaggio > 0 && <StatusBadge tone="neutral">{k.passaggio} walk-in / di passaggio</StatusBadge>}
          </div>
          {daGuardare.length === 0 && <p className="text-sm text-emerald-700 mb-1">Tutto allineato 👍</p>}
          <div className="divide-y divide-neutral-100">{daGuardare.map(riga)}</div>
          {aPosto.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setMostraOk(!mostraOk)} className="text-sm text-indigo-700 min-h-[44px]">
                {mostraOk ? "▾" : "▸"} {aPosto.length} già a posto
              </button>
              {mostraOk && <div className="divide-y divide-neutral-100">{aPosto.map(riga)}</div>}
            </div>
          )}
          {(vista.prenotazioni_libere?.length > 0 || vista.prenotazioni_non_arrivate?.length > 0) && (
            <p className="mt-2 text-xs text-neutral-500">
              Prenotazioni senza conto: {[
                ...(vista.prenotazioni_libere || []).map((p) => `${p.nome || "senza nome"} (${p.ora}, tav ${p.tavolo || "—"})`),
                ...(vista.prenotazioni_non_arrivate || []).map((p) => `${p.nome || "senza nome"} (${p.ora}, tav ${p.tavolo || "—"}, mai segnata arrivata)`),
              ].join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
