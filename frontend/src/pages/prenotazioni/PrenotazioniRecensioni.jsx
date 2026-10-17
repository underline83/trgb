// @version: v1.0 — recensioni TheFork in TRGB (2026-10-17, mig 197)
// Modulo: prenotazioni
// Elenco recensioni con medie, filtri, collegamento a cliente e prenotazione, risposta pubblica.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import RecensioneCard, { coloreVoto } from "./components/RecensioneCard";

const FILTRI = [
  { k: "tutte", l: "Tutte" },
  { k: "da_rispondere", l: "Da rispondere" },
  { k: "non_lette", l: "Nuove" },
  { k: "basse", l: "Voto basso" },
];

function Media({ titolo, m }) {
  if (!m) return null;
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-3 flex items-center gap-3">
      <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-bold text-xl ${coloreVoto(m.voto)}`}>
        {m.voto != null ? String(m.voto).replace(".", ",") : "—"}
      </div>
      <div className="text-xs text-neutral-600">
        <div className="font-semibold text-neutral-800 text-sm">{titolo}</div>
        <div>{m.n} recensioni</div>
        {m.n > 0 && <div className="text-neutral-400">cibo {m.cibo} · servizio {m.servizio} · ambiente {m.ambiente}</div>}
      </div>
    </div>
  );
}

export default function PrenotazioniRecensioni() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const admin = role === "admin" || role === "superadmin";
  const [filtro, setFiltro] = useState("tutte");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [scarica, setScarica] = useState({ dal: "", al: new Date().toISOString().slice(0, 10) });
  const [scaricando, setScaricando] = useState(false);
  const [esito, setEsito] = useState(null);
  const LIMITE = 30;

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams({ filtro, limite: LIMITE, pagina });
      if (q.trim()) p.set("q", q.trim());
      const r = await apiFetch(`${API_BASE}/prenotazioni/recensioni/?${p}`);
      const d = await r.json();
      if (r.ok) { setDati(d); setErrore(null); } else setErrore(d.detail || "Errore");
    } catch {
      setErrore("Errore di connessione");
    }
  }, [filtro, q, pagina]);

  useEffect(() => { const t = setTimeout(carica, 250); return () => clearTimeout(t); }, [carica]);

  const aggiornata = (nuova) => {
    setDati((d) => d && ({ ...d, recensioni: d.recensioni.map((x) => (x.review_uuid === nuova.review_uuid ? { ...x, ...nuova } : x)) }));
  };

  const scaricaPeriodo = async () => {
    if (!scarica.dal) return;
    setScaricando(true);
    setEsito(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/recensioni/sincronizza`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scarica),
      });
      const d = await r.json();
      setEsito(r.ok ? `Trovate ${d.trovate}: ${d.nuove} nuove, ${d.aggiornate} aggiornate${d.errori ? `, ${d.errori} errori` : ""}` : (d.detail || "Errore"));
      if (r.ok) carica();
    } catch {
      setEsito("Errore di connessione");
    } finally {
      setScaricando(false);
    }
  };

  const tutteLette = async () => {
    await apiFetch(`${API_BASE}/prenotazioni/recensioni/letta-tutte`, { method: "POST" });
    carica();
  };

  const rie = dati?.riepilogo;
  const pagine = dati ? Math.max(1, Math.ceil(dati.totale / LIMITE)) : 1;

  return (
    <div className="min-h-screen bg-neutral-50">
      <PrenotazioniNav current="recensioni" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Media titolo="Ultimi 30 giorni" m={rie?.["30_giorni"]} />
          <Media titolo="Ultimi 90 giorni" m={rie?.["90_giorni"]} />
          <Media titolo="Da sempre (in TRGB)" m={rie?.sempre} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {FILTRI.map((f) => (
            <button key={f.k} onClick={() => { setFiltro(f.k); setPagina(1); }}
              className={`px-3 py-1 rounded-full text-sm border ${filtro === f.k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-neutral-600 border-neutral-300"}`}>
              {f.l}
              {f.k === "da_rispondere" && rie?.da_rispondere > 0 && ` (${rie.da_rispondere})`}
              {f.k === "non_lette" && rie?.non_lette > 0 && ` (${rie.non_lette})`}
            </button>
          ))}
          <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca nome o parola…"
            className="ml-auto px-3 py-1.5 border border-neutral-300 rounded-lg text-sm w-56" />
          {rie?.non_lette > 0 && (
            <button onClick={tutteLette} className="text-xs text-indigo-700 hover:underline">Segna tutte lette</button>
          )}
        </div>

        {errore && <div className="text-sm text-red-700">{errore}</div>}
        {dati && dati.recensioni.length === 0 && (
          <div className="text-center text-neutral-400 py-10 text-sm">
            Nessuna recensione{filtro !== "tutte" ? " con questo filtro" : ""}.
            {admin && dati.totale === 0 && filtro === "tutte" && " Scarica lo storico qui sotto."}
          </div>
        )}
        <div className="space-y-3">
          {(dati?.recensioni || []).map((r) => (
            <RecensioneCard key={r.review_uuid} r={r} puoRispondere={admin} onAggiornata={aggiornata}
              onApriCliente={(id) => navigate(`/clienti/${id}`)} />
          ))}
        </div>

        {pagine > 1 && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="px-2 disabled:opacity-30">◀</button>
            <span>{pagina} / {pagine}</span>
            <button disabled={pagina >= pagine} onClick={() => setPagina(pagina + 1)} className="px-2 disabled:opacity-30">▶</button>
          </div>
        )}

        {admin && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 text-sm">
            <div className="font-semibold text-neutral-700 mb-2">Scarica recensioni da TheFork</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-neutral-500">pasti dal</span>
              <input type="date" value={scarica.dal} onChange={(e) => setScarica({ ...scarica, dal: e.target.value })}
                className="px-2 py-1 border rounded" />
              <span className="text-neutral-500">al</span>
              <input type="date" value={scarica.al} onChange={(e) => setScarica({ ...scarica, al: e.target.value })}
                className="px-2 py-1 border rounded" />
              <button disabled={scaricando || !scarica.dal} onClick={scaricaPeriodo}
                className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50">{scaricando ? "Scarico…" : "Scarica"}</button>
              {esito && <span className="text-neutral-600">{esito}</span>}
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">
              Le nuove arrivano da sole ogni ora (ultimi 14 giorni). Qui si recupera lo storico, massimo due anni per volta.
              Sotto il voto impostato in Impostazioni › Capienza («Avviso recensioni») arriva una notifica agli admin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
