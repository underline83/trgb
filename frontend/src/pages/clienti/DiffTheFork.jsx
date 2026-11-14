// Modulo: clienti — [core]
// Differenze CRM ↔ TheFork su un cliente protetto (coda `clienti_import_diff`).
// Un solo disegno delle righe «valore nostro → valore TheFork» con Applica/Ignora,
// usato dalla revisione in Impostazioni (ClientiImport) e dalla scheda cliente.
// Le regole che decidono cosa finisce in coda stanno nel backend
// (clienti_thefork_service.valuta_differenza, 2026-11-14).
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";

export const CAMPO_LABELS = {
  nome: "Nome", cognome: "Cognome", titolo: "Titolo", email: "Email",
  telefono: "Telefono", telefono2: "Telefono 2", data_nascita: "Data nascita",
  lingua: "Lingua", indirizzo: "Indirizzo", cap: "CAP", citta: "Città",
  paese: "Paese", pref_cibo: "Pref. cibo", pref_bevande: "Pref. bevande",
  pref_posto: "Pref. posto", restrizioni_dietetiche: "Restrizioni",
  allergie: "Allergie", note_thefork: "Note TheFork",
};

export async function risolviDifferenze(ids, azione) {
  const res = await apiFetch(`${API_BASE}/clienti/import/diff/risolvi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, azione }),
  });
  if (!res.ok) throw new Error("Errore nel salvataggio della scelta");
  return res.json();
}

// Righe di un cliente: etichetta campo, nostro → TheFork, Applica / Ignora
export function DiffRighe({ diff, onAction, acting = {}, btnSize = "sm" }) {
  return (
    <div className="divide-y divide-neutral-100">
      {diff.map((d) => {
        const occupato = acting[String(d.id)];
        return (
          <div key={d.id} className="flex flex-wrap items-center px-4 py-2 text-sm gap-x-3 gap-y-2">
            <div className="w-28 text-xs font-semibold text-neutral-500 uppercase shrink-0">
              {CAMPO_LABELS[d.campo] || d.campo}
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Tooltip label={d.valore_crm}>
                  <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded border border-red-200 truncate max-w-[200px]">
                    {d.valore_crm}
                  </span>
                </Tooltip>
                <span className="text-neutral-400 text-xs">→</span>
                <Tooltip label={d.valore_thefork}>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded border border-emerald-200 truncate max-w-[200px]">
                    {d.valore_thefork}
                  </span>
                </Tooltip>
              </div>
            </div>
            <div className="flex gap-1 shrink-0 ml-auto">
              <Btn variant="primary" size={btnSize} onClick={() => onAction([d.id], "applica")} disabled={occupato}>
                Applica
              </Btn>
              <Btn variant="secondary" size={btnSize} onClick={() => onAction([d.id], "ignora")} disabled={occupato}>
                Ignora
              </Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Box per la scheda cliente: compare solo se TheFork ha dati diversi da guardare
export function DiffTheForkCliente({ clienteId, onCambiato, onMessaggio }) {
  const [diff, setDiff] = useState([]);
  const [acting, setActing] = useState({});

  const carica = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/import/diff?stato=pending&cliente_id=${clienteId}`);
      if (!res.ok) return;
      const d = await res.json();
      setDiff(d.clienti?.[0]?.diff || []);
    } catch {
      // la scheda resta usabile anche senza questo riquadro
    }
  }, [clienteId]);

  useEffect(() => { carica(); }, [carica]);

  const azione = async (ids, az) => {
    const key = ids.join(",");
    setActing((p) => ({ ...p, [key]: true }));
    try {
      const r = await risolviDifferenze(ids, az);
      await carica();
      if (az === "applica" && r.applicati && onCambiato) onCambiato();
      if (onMessaggio) onMessaggio(az === "applica" ? "Preso il dato di TheFork" : "Tenuto il nostro");
    } catch (err) {
      if (onMessaggio) onMessaggio(err.message, "error");
    } finally {
      setActing((p) => ({ ...p, [key]: false }));
    }
  };

  if (!diff.length) return null;
  const tutti = diff.map((d) => d.id);
  const tuttiKey = tutti.join(",");

  return (
    <section className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs font-bold tracking-wider uppercase text-amber-800">TheFork dice</div>
        {diff.length > 1 && (
          <div className="flex gap-1.5">
            <Btn variant="chip" tone="emerald" size="sm" onClick={() => azione(tutti, "applica")} disabled={acting[tuttiKey]}>
              Applica tutto
            </Btn>
            <Btn variant="chip" tone="neutral" size="sm" onClick={() => azione(tutti, "ignora")} disabled={acting[tuttiKey]}>
              Ignora tutto
            </Btn>
          </div>
        )}
      </div>
      <p className="text-xs text-amber-900/80 mb-3">
        Su TheFork questo cliente ha dati diversi dalla scheda. «Applica» prende quello di TheFork,
        «Ignora» tiene il nostro e non lo richiede più.
      </p>
      <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
        <DiffRighe diff={diff} onAction={azione} acting={acting} btnSize="md" />
      </div>
    </section>
  );
}
