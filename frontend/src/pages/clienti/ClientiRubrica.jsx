// Modulo: clienti — [core]
// Impostazioni › Rubrica telefono (2026-11-16, mig 238): il telefono si abbona alla rubrica
// dei clienti di TRGB (CardDAV, sola lettura). Un accesso per telefono, password vista una volta.
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const host = (() => { try { return new URL(API_BASE).host; } catch { return ""; } })();
const dataOra = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : "—");

export default function ClientiRubrica() {
  const [stato, setStato] = useState(null);
  const [errore, setErrore] = useState(null);
  const [nome, setNome] = useState("");
  const [nuovo, setNuovo] = useState(null); // accesso appena creato, con la password
  const [prefisso, setPrefisso] = useState("");
  const [stelleMin, setStelleMin] = useState("1");
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState(null);

  const carica = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/rubrica/stato`);
      if (!res.ok) throw new Error(res.status === 403 ? "La rubrica la gestisce l'amministratore" : "Errore caricamento");
      const d = await res.json();
      setStato(d);
      setPrefisso(d.prefisso || "");
      setStelleMin(String(d.stelle_min || 1));
    } catch (e) {
      setErrore(e.message);
    }
  };
  useEffect(() => { carica(); }, []);

  const avvisa = (testo, tipo = "ok") => { setMsg({ testo, tipo }); setTimeout(() => setMsg(null), 4000); };

  const crea = async () => {
    setLavoro(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/rubrica/accessi`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() || "Telefono" }),
      });
      if (!res.ok) throw new Error("Accesso non creato");
      setNuovo(await res.json());
      setNome("");
      carica();
    } catch (e) { avvisa(e.message, "error"); } finally { setLavoro(false); }
  };

  const revoca = async (a) => {
    if (!window.confirm(`Togliere la rubrica a «${a.nome}»? Il telefono smette di aggiornarla e la cancella.`)) return;
    const res = await apiFetch(`${API_BASE}/clienti/rubrica/accessi/${a.id}/revoca`, { method: "POST" });
    if (res.ok) { avvisa("Accesso revocato"); carica(); } else avvisa("Non revocato", "error");
  };

  const salvaRegole = async () => {
    setLavoro(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica_prefisso: prefisso.trim(), rubrica_stelle_min: stelleMin }),
      });
      if (!res.ok) throw new Error("Non salvate");
      avvisa("Salvate: i telefoni si aggiornano entro pochi minuti");
      setTimeout(carica, 2500);
    } catch (e) { avvisa(e.message, "error"); } finally { setLavoro(false); }
  };

  const copia = (t) => navigator.clipboard?.writeText(t).then(() => avvisa("Copiato"));

  if (errore) return <p className="text-sm text-red-600">{errore}</p>;
  if (!stato) return <p className="text-sm text-neutral-400">Carico…</p>;
  const attivi = (stato.accessi || []).filter((a) => a.attivo);
  const revocati = (stato.accessi || []).filter((a) => !a.attivo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Rubrica telefono</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Il telefono si abbona alla rubrica dei clienti di TRGB e la tiene aggiornata da solo: chi chiama o scrive
          su WhatsApp Business ha già il nome. Sola lettura: i clienti si cambiano qui, non dal telefono.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-4">
        <div className="text-sm text-neutral-700">
          In rubrica ora: <b>{stato.contatti.toLocaleString("it-IT")} clienti</b>, quelli attivi con un telefono e almeno{" "}
          {stato.stelle_min} stell{stato.stelle_min === 1 ? "a" : "e"} (nere, argento e oro contano insieme).
          Sul telefono si chiamano così: <b>{[stato.prefisso, "Mario Rossi", "★★"].filter(Boolean).join(" ")}</b>,
          con una nota (stelle, segmento, visite, ultima visita, allergie, preferenze).
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-neutral-700">
            <span className="block text-xs font-semibold text-neutral-500 mb-1">Prefisso davanti al nome</span>
            <input value={prefisso} onChange={(e) => setPrefisso(e.target.value)} maxLength={10}
              className="w-28 min-h-[44px] border border-neutral-300 rounded-lg px-3 text-sm" />
          </label>
          <label className="text-sm text-neutral-700">
            <span className="block text-xs font-semibold text-neutral-500 mb-1">Stelle per entrare</span>
            <select value={stelleMin} onChange={(e) => setStelleMin(e.target.value)}
              className="min-h-[44px] border border-neutral-300 rounded-lg px-3 text-sm bg-white">
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{"★".repeat(n)} o più</option>)}
            </select>
          </label>
          <Btn variant="secondary" size="md" onClick={salvaRegole} disabled={lavoro}>Salva</Btn>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Telefoni abbonati</h2>
        {attivi.length === 0 && <p className="text-sm text-neutral-500">Nessun telefono ancora.</p>}
        {attivi.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
            <div className="text-sm">
              <b>{a.nome}</b> <span className="text-neutral-500">· utente {a.utente}</span>
              <div className="text-xs text-neutral-500">creato {dataOra(a.creato_il)}{a.creato_da ? ` da ${a.creato_da}` : ""} · ultimo aggiornamento {dataOra(a.ultimo_accesso)}</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => revoca(a)}>Revoca</Btn>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm flex-1 min-w-[200px]">
            <span className="block text-xs font-semibold text-neutral-500 mb-1">Nuovo telefono</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="iPhone sala"
              className="w-full min-h-[44px] border border-neutral-300 rounded-lg px-3 text-sm" />
          </label>
          <Btn variant="primary" size="md" onClick={crea} loading={lavoro} disabled={lavoro}>Crea accesso</Btn>
        </div>
        {revocati.length > 0 && (
          <p className="text-xs text-neutral-400">Revocati: {revocati.map((a) => a.nome).join(", ")}</p>
        )}
      </div>

      {nuovo && (
        <div className="bg-amber-50 rounded-xl border border-amber-300 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-900">Accesso per «{nuovo.nome}» — la password si vede solo adesso</h2>
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-center text-sm">
            {[["Server", host], ["Nome utente", nuovo.utente], ["Password", nuovo.password]].map(([etichetta, valore]) => (
              <React.Fragment key={etichetta}>
                <span className="text-amber-900">{etichetta}</span>
                <code className="bg-white rounded px-2 py-1 border border-amber-200 break-all">{valore}</code>
                <Btn variant="secondary" size="sm" onClick={() => copia(valore)}>Copia</Btn>
              </React.Fragment>
            ))}
          </div>
          <div className="text-sm text-amber-900 space-y-1">
            <p><b>iPhone:</b> Impostazioni › App › Contatti › Account contatti › Aggiungi account › Altro › «Aggiungi account CardDAV». Server, nome utente e password qui sopra; descrizione «Clienti TRGB».</p>
            <p><b>Android:</b> app DAVx5 › «Accedi con URL e nome utente» › URL <code>https://{host}/rubrica/</code>, poi nome utente e password.</p>
            <p>Su WhatsApp Business i nomi compaiono dopo che il telefono ha scaricato la rubrica (qualche minuto la prima volta).</p>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setNuovo(null)}>Fatto, l'ho inserita</Btn>
        </div>
      )}

      {msg && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${msg.tipo === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}
          onClick={() => setMsg(null)}>{msg.testo}</div>
      )}
    </div>
  );
}
