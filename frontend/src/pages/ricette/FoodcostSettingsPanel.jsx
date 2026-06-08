// @version: v1.0 — Pannello impostazioni Prezzi & Food Cost (fix Sedano 2026-06-08)
// Modulo: ricette (food cost)
//
// Vive dentro RicetteSettings (sidebar Impostazioni Cucina, sezione "Prezzi & Food Cost").
// Configura la finestra (giorni) usata per il "prezzo corrente" robusto: la
// mediana dei prezzi degli ultimi N giorni neutralizza gli acquisti
// occasionali fuori prezzo (caso Sedano: cuore di sedano Esselunga 8,27 €/kg
// scavalcava Milesi a 2,60). Il prezzo corrente alimenta KPI e food cost.

import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const PRESET = [30, 60, 90, 180, 365];

export default function FoodcostSettingsPanel() {
  const [giorni, setGiorni] = useState(90);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${FC}/settings`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();
      if (s.prezzo_finestra_giorni) setGiorni(s.prezzo_finestra_giorni);
    } catch (e) {
      setMsg({ tipo: "err", text: `Errore caricamento: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const salva = async () => {
    const g = parseInt(giorni, 10);
    if (!g || g < 1 || g > 730) {
      setMsg({ tipo: "err", text: "La finestra deve essere tra 1 e 730 giorni." });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch(`${FC}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prezzo_finestra_giorni: g }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ tipo: "ok", text: `Finestra impostata a ${g} giorni. I food cost useranno la mediana di questo periodo.` });
    } catch (e) {
      setMsg({ tipo: "err", text: `Errore salvataggio: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-neutral-500">Caricamento…</div>;

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red mb-1">Prezzi & Food Cost</h2>
      <p className="text-xs text-neutral-500 mb-4">
        Il <strong>prezzo corrente</strong> di ogni ingrediente è la <strong>mediana</strong> dei prezzi
        registrati nell'ultimo periodo. La mediana ignora gli acquisti occasionali fuori prezzo
        (es. un prodotto retail comprato una volta) che altrimenti inquinerebbero il food cost delle ricette.
        Se in un ingrediente non c'è alcun prezzo nel periodo, si usa l'ultimo prezzo disponibile.
      </p>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-4 py-2 border ${
          msg.tipo === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>{msg.text}</div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
          Finestra prezzo corrente
        </label>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {PRESET.map((g) => (
            <button
              key={g}
              onClick={() => setGiorni(g)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                Number(giorni) === g
                  ? "bg-orange-100 border-orange-300 text-orange-900 font-semibold"
                  : "bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >{g} gg</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600">Personalizzato:</span>
          <input
            type="number" min="1" max="730" value={giorni}
            onChange={(e) => setGiorni(e.target.value)}
            className="w-24 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-neutral-500">giorni</span>
        </div>
        <p className="text-[11px] text-neutral-400 mt-3">
          Indicativo: 90 giorni copre la stagionalità di un trimestre. Periodi più corti reagiscono
          prima ai rincari ma sono più sensibili ai picchi; più lunghi sono stabili ma lenti.
        </p>
        <div className="mt-4">
          <Btn variant="success" size="md" onClick={salva} loading={saving}>Salva</Btn>
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 mt-4">
        Dopo aver cambiato la finestra, i food cost si ricalcolano automaticamente alla prossima
        apertura delle ricette. Nella scheda ingrediente il KPI "Prezzo corrente" mostra il valore aggiornato.
      </p>
    </div>
  );
}
