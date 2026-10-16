// @version: v1.0 — fasce orarie del servizio (copia «Andamento per fascia oraria» di TheFork Manager)
// Modulo: prenotazioni
// Pannello per un giorno e un turno: apertura della fascia, limite coperti, vendita online
// (scritta anche su TheFork), limite online, verifica di cosa vede il cliente su TheFork, registro.
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

function Interruttore({ acceso, onClick, disabled, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative w-10 h-6 rounded-full transition flex-shrink-0 ${acceso ? "bg-emerald-500" : "bg-neutral-300"} ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${acceso ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Limite({ valore, predefinito, onSalva, disabled }) {
  const [v, setV] = useState(valore ?? "");
  useEffect(() => { setV(valore ?? ""); }, [valore]);
  const salva = () => {
    const nuovo = v === "" ? null : parseInt(v, 10);
    if (nuovo === (valore ?? null)) return;
    onSalva(nuovo === predefinito ? null : nuovo);
  };
  return (
    <input
      type="number"
      min={0}
      value={v}
      disabled={disabled}
      placeholder={predefinito == null ? "∞" : String(predefinito)}
      onChange={(e) => setV(e.target.value)}
      onBlur={salva}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-16 px-2 py-1 border border-neutral-300 rounded text-sm text-center disabled:bg-neutral-50"
    />
  );
}

export default function FasceTurno({ data, turno, onClose, onChange }) {
  const [info, setInfo] = useState(null);
  const [errore, setErrore] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [theforkOra, setTheforkOra] = useState(null); // {prenotabili:[...], coperti}
  const [mostraRegistro, setMostraRegistro] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}`);
      const d = await r.json();
      if (r.ok) setInfo(d); else setErrore(d.detail || "Errore");
    } catch {
      setErrore("Errore di connessione");
    }
  }, [data, turno]);

  useEffect(() => { carica(); }, [carica]);

  const imposta = async (ore, modifiche) => {
    setOccupato(true);
    setMessaggio(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ore, ...modifiche }),
      });
      const d = await r.json();
      if (!r.ok) { setMessaggio({ tipo: "err", testo: d.detail || "Errore" }); return; }
      setInfo(d);
      const errori = (d.thefork || []).filter((e) => !String(e.esito).startsWith("ok"));
      if (errori.length) setMessaggio({ tipo: "err", testo: errori.map((e) => `${e.ore.join(", ")}: ${e.esito}`).join(" · ") });
      else if ((d.thefork || []).length) setMessaggio({ tipo: "ok", testo: "Salvato, anche su TheFork" });
      else setMessaggio({ tipo: "ok", testo: "Salvato" });
      setTheforkOra(null);
      onChange && onChange();
    } catch {
      setMessaggio({ tipo: "err", testo: "Errore di connessione" });
    } finally {
      setOccupato(false);
    }
  };

  const verificaTheFork = async () => {
    setOccupato(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}/thefork?coperti=2`);
      const d = await r.json();
      if (r.ok) setTheforkOra(d); else setMessaggio({ tipo: "err", testo: d.detail || "Errore TheFork" });
    } catch {
      setMessaggio({ tipo: "err", testo: "Errore di connessione" });
    } finally {
      setOccupato(false);
    }
  };

  const fasce = info?.fasce || [];
  const tutte = fasce.map((f) => f.ora);
  const dflt = info?.default || {};
  const dataIt = data.split("-").reverse().join("/");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-neutral-800">🕒 Fasce orarie · {turno === "pranzo" ? "Pranzo" : "Cena"} {dataIt}</h3>
            <p className="text-[11px] text-neutral-500">
              Default del turno: {dflt.max_coperti ?? "∞"} coperti per fascia, {dflt.max_online ?? "∞"} online (Impostazioni)
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">✕</button>
        </div>

        <div className="px-5 py-3 space-y-3">
          {errore && <div className="text-sm text-red-700">{errore}</div>}
          {messaggio && (
            <div className={`px-3 py-2 rounded text-sm ${messaggio.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              {messaggio.testo}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <button disabled={occupato || !tutte.length} onClick={() => imposta(tutte, { online_aperta: false })}
              className="px-2.5 py-1 rounded border border-neutral-300 hover:bg-neutral-50">🌐✕ Chiudi online tutto il turno</button>
            <button disabled={occupato || !tutte.length} onClick={() => imposta(tutte, { online_aperta: true })}
              className="px-2.5 py-1 rounded border border-neutral-300 hover:bg-neutral-50">🌐 Riapri online tutto il turno</button>
            <button disabled={occupato} onClick={verificaTheFork}
              className="px-2.5 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50">🔍 Cosa vede il cliente su TheFork (2 persone)</button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-neutral-400 border-b border-neutral-100">
                <th className="py-1.5 text-left">Fascia</th>
                <th className="py-1.5 text-center">Coperti / max</th>
                <th className="py-1.5 text-center">Online</th>
                <th className="py-1.5 text-center">Online / max</th>
                {theforkOra && <th className="py-1.5 text-center">TheFork</th>}
              </tr>
            </thead>
            <tbody>
              {fasce.map((f) => (
                <tr key={f.ora} className={`border-b border-neutral-50 ${f.aperta ? "" : "bg-neutral-50 text-neutral-400"}`}>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <Interruttore acceso={f.aperta} disabled={occupato}
                        title={f.aperta ? "Chiudi la fascia (anche al telefono)" : "Riapri la fascia"}
                        onClick={() => imposta([f.ora], { aperta: !f.aperta })} />
                      <span className="font-medium">{f.ora}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-center whitespace-nowrap">
                    <span className={f.piena ? "text-red-600 font-semibold" : ""}>{f.coperti}</span> /{" "}
                    <Limite valore={f.limiti_del_giorno ? f.max_coperti : null} predefinito={dflt.max_coperti}
                      disabled={occupato || !f.aperta} onSalva={(n) => imposta([f.ora], { max_coperti: n })} />
                  </td>
                  <td className="py-1.5 text-center">
                    <button disabled={occupato || !f.aperta}
                      onClick={() => imposta([f.ora], { online_aperta: !f.online_aperta })}
                      title={f.thefork_esito || ""}
                      className={`px-2 py-1 rounded text-xs border ${f.online_aperta
                        ? "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                        : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"}`}>
                      {f.online_aperta ? "🌐 Disattiva online" : "🌐✕ Riattiva online"}
                    </button>
                    {f.thefork_esito && String(f.thefork_esito).startsWith("errore") && (
                      <span title={f.thefork_esito} className="ml-1 text-red-600">⚠️</span>
                    )}
                  </td>
                  <td className="py-1.5 text-center whitespace-nowrap">
                    <span className={f.online_piena ? "text-red-600 font-semibold" : ""}>{f.online}</span> /{" "}
                    <Limite valore={f.limiti_del_giorno ? f.max_online : null} predefinito={dflt.max_online}
                      disabled={occupato || !f.online_aperta} onSalva={(n) => imposta([f.ora], { max_online: n })} />
                  </td>
                  {theforkOra && (
                    <td className="py-1.5 text-center text-xs">
                      {theforkOra.prenotabili.includes(f.ora)
                        ? <span className="text-emerald-700">prenotabile</span>
                        : <span className="text-neutral-400">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[11px] text-neutral-400">
            Interruttore = fascia aperta o chiusa in TRGB (anche per il telefono). «Disattiva online» la chiude anche su TheFork.
            I limiti di coperti valgono in TRGB: su TheFork si può solo aprire o chiudere l'online, i suoi limiti restano quelli di TheFork Manager.
            Coperti = persone che arrivano in quella fascia.
          </p>

          <div>
            <button onClick={() => setMostraRegistro(!mostraRegistro)} className="text-xs text-indigo-700 hover:underline">
              {mostraRegistro ? "▾" : "▸"} Registro modifiche del giorno ({(info?.registro || []).length})
            </button>
            {mostraRegistro && (
              <div className="mt-1 space-y-1 text-[11px] text-neutral-600">
                {(info?.registro || []).map((l) => (
                  <div key={l.id} className="border-b border-neutral-50 pb-1">
                    <span className="text-neutral-400">{(l.created_at || "").slice(11, 16)}</span>{" "}
                    <strong>{l.utente || "?"}</strong> · {l.ore} · {l.modifica}
                    {l.thefork_esito && <span className={String(l.thefork_esito).includes("errore") ? " text-red-600" : " text-emerald-700"}> · {l.thefork_esito}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
