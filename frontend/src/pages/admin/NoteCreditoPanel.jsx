// @version: v1.0 (2026-11-02) — roadmap A.1 fase 3, mig 223
// Pannello «Note di credito» del dettaglio fattura.
//  - Su una FATTURA: note di credito collegate (con ✕ per scollegare) e quelle
//    dello stesso fornitore ancora da usare, con «Collega». La quota della NC si
//    somma al pagato della fattura, come un secondo bonifico.
//  - Su una NOTA DI CREDITO: le fatture che storna e quanto ne resta.
// Backend: GET/POST /contabilita/fe/fatture/{id}/note-credito,
//          DELETE /contabilita/fe/note-credito/collegamenti/{id}
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const FE = `${API_BASE}/contabilita/fe`;
const eur = (v) =>
  v != null ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

export default function NoteCreditoPanel({ fatturaId, onChanged }) {
  const [dati, setDati] = useState(null);
  const [busy, setBusy] = useState(null);
  const [errore, setErrore] = useState(null);

  const carica = async () => {
    try {
      const r = await apiFetch(`${FE}/fatture/${fatturaId}/note-credito`);
      if (!r.ok) throw new Error();
      setDati(await r.json());
    } catch {
      setDati(null);
    }
  };

  useEffect(() => {
    setDati(null);
    setErrore(null);
    if (fatturaId) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatturaId]);

  const agisci = async (key, fn) => {
    setBusy(key);
    setErrore(null);
    try {
      const r = await fn();
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || "Operazione non riuscita");
      }
      await carica();
      if (onChanged) onChanged();
    } catch (e) {
      setErrore(e.message);
    } finally {
      setBusy(null);
    }
  };

  const collega = (notaId) =>
    agisci(`c${notaId}`, () =>
      apiFetch(`${FE}/fatture/${fatturaId}/note-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota_id: notaId }),
      })
    );

  const scollega = (collId) => {
    if (!window.confirm("Scollegare la nota di credito? La fattura torna a risultare da pagare per quella cifra.")) return;
    agisci(`s${collId}`, () =>
      apiFetch(`${FE}/note-credito/collegamenti/${collId}`, { method: "DELETE" })
    );
  };

  if (!dati) return null;
  const isNota = dati.tipo === "nota";
  const collegati = dati.collegati || [];
  const candidate = dati.candidate || [];
  // Su una fattura senza NC collegate né disponibili non mostro niente.
  if (!isNota && collegati.length === 0 && candidate.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-sky-200 bg-sky-50/60 text-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] text-sky-800 uppercase tracking-wide font-semibold">
          {isNota ? "Fatture stornate da questa nota" : "Note di credito"}
        </div>
        <div className="text-xs text-sky-900">
          {isNota
            ? <>da usare <span className="font-semibold tabular-nums">€ {eur(dati.residuo)}</span> su € {eur(dati.totale)}</>
            : dati.scoperto > 0 && <>scoperto <span className="font-semibold tabular-nums">€ {eur(dati.scoperto)}</span></>}
        </div>
      </div>

      {collegati.length === 0 && isNota && (
        <div className="text-xs text-neutral-600">
          Non è collegata a nessuna fattura: conta nel conto economico, ma non riduce nessun pagamento.
          Si collega dal dettaglio della fattura che storna.
        </div>
      )}

      {collegati.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 py-1 border-t border-sky-100 first:border-t-0">
          <div className="min-w-0 text-xs text-neutral-800">
            <span className="font-mono font-semibold">{isNota ? "FT" : "NC"} {c.numero_fattura || `#${c.doc_id}`}</span>
            <span className="text-neutral-500"> · {c.data_fattura}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold tabular-nums text-emerald-800">− € {eur(c.importo)}</span>
            {!isNota && (
              <Btn variant="chip" tone="neutral" size="sm" type="button"
                loading={busy === `s${c.id}`} onClick={() => scollega(c.id)} title="Scollega">
                ✕
              </Btn>
            )}
          </div>
        </div>
      ))}

      {!isNota && candidate.length > 0 && dati.scoperto > 0 && (
        <div className={collegati.length ? "mt-2 pt-2 border-t border-sky-200" : ""}>
          <div className="text-[10px] text-neutral-500 mb-1">Dello stesso fornitore, ancora da usare:</div>
          {candidate.map((n) => (
            <div key={n.id} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0 text-xs text-neutral-800">
                <span className="font-mono font-semibold">NC {n.numero_fattura || `#${n.id}`}</span>
                <span className="text-neutral-500"> · {n.data_fattura}</span>
                <span className="text-neutral-500 tabular-nums"> · € {eur(n.residuo)}{n.residuo !== n.totale ? ` di € ${eur(n.totale)}` : ""}</span>
              </div>
              <Btn variant="chip" tone="sky" size="sm" type="button"
                loading={busy === `c${n.id}`} onClick={() => collega(n.id)}>
                Collega
              </Btn>
            </div>
          ))}
        </div>
      )}

      {errore && <div className="mt-2 text-xs text-red-700">{errore}</div>}
    </div>
  );
}
