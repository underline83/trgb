// @version: v4.1-regia-calici — sessione 2026-05-04
// Nuova sub-sezione "Regia Calici" a fianco del pannello informativo. È la
// SEDE delle funzioni di gestione delle bottiglie in mescita: vive qui dentro
// (Centro Carta → Vini) per crescere indipendentemente dal widget compatto in
// home camerieri (CaliciDisponibiliCard). Stesso endpoint dati, ma componente
// separato: cosi' aggiungere azioni qui non sporca il widget di home.
// v4.0-info-pane — sessione 58 fase 2 iter 6 (2026-04-25)
//
// Le esport (PDF, Word, anteprima) e l'iframe live sono gestiti dalla shell
// `CartaBevande` a livello globale (carta intera = vini + bevande).

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

export default function CartaVini() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
          🍷 Sezione Vini
        </h2>
        <p className="text-neutral-600 text-sm">
          Le voci vini della carta sono <strong>dinamiche</strong>: arrivano direttamente dal magazzino Cantina.
          Per modificare prezzi, annate, descrizioni, vai alla Cantina e aggiorna la scheda del vino —
          le esportazioni PDF/Word in alto sono sempre live.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold mb-1">Cosa entra in carta</div>
        <ul className="list-disc list-inside space-y-1 text-amber-800">
          <li>Tutti i vini con flag <strong>Carta Vini</strong> attivo</li>
          <li>Sezione "Al calice" automatica per i vini con flag <strong>Calice</strong> attivo o <em>bottiglia in mescita</em></li>
          <li>Ordinati per Tipologia → Nazione → Regione → Produttore (configurabile in Impostazioni Vini)</li>
        </ul>
      </div>

      <RegiaCaliciPanel onApriScheda={(v) => navigate(`/vini/magazzino/${v.id}`)} />

      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" size="md" type="button" onClick={() => navigate("/vini/magazzino")}>
          🍷 Vai alla Cantina
        </Btn>
        <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/carta-staff")}>
          🥂 Vista sommelier
        </Btn>
        <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/settings")}>
          ⚙️ Ordinamento
        </Btn>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────
// Sub-componente: Regia Calici al Calice
// ─────────────────────────────────────────────────────────────────────────
// Vive qui (non in /components/widgets) perche' e' la SEDE specifica della
// gestione calici dentro Centro Carta. Separato dal widget compatto che vive
// nelle home (CaliciDisponibiliCard) — qui lavoreremo aggiungendo azioni
// (apri/chiudi VENDITA_CALICE, vendite calice del giorno, riordino, …) senza
// dover sporcare il widget minimale della home camerieri.
//
// Endpoint dati: GET /vini/magazzino/calici-disponibili/  (stesso del widget,
// ma ogni componente fa la propria chiamata: nessun coupling).
//
// Toggle off bottiglia in mescita: PATCH /vini/magazzino/{id}
// con {BOTTIGLIA_APERTA: 0}.
function RegiaCaliciPanel({ onApriScheda }) {
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchVini = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/calici-disponibili/`);
      if (r.ok) setVini(await r.json());
    } catch {
      // silenzioso: il pannello si svuota e mostra empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVini(); }, [fetchVini]);

  const spegniBottiglia = async (vinoId) => {
    if (!window.confirm(
      "Spegnere il flag 'bottiglia in mescita'?\n\n" +
      "Il vino sparirà dalla sezione \"Al calice\" della carta cliente se non ha giacenza."
    )) return;
    setBusyId(vinoId);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: 0 }),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      await fetchVini();
    } catch (err) {
      alert(err.message || "Errore");
    } finally {
      setBusyId(null);
    }
  };

  const fmtPrezzo = (n) =>
    n == null ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
            🥂 Regia calici al calice
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Bottiglie attualmente in mescita. Click su una riga per aprire la scheda del vino.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">
            {loading ? "…" : `${vini.length} ${vini.length === 1 ? "bottiglia" : "bottiglie"}`}
          </span>
          <button
            type="button"
            onClick={fetchVini}
            disabled={loading}
            className="text-[11px] px-2 py-1 rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            title="Ricarica"
          >
            ↻
          </button>
        </div>
      </header>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-neutral-400">Caricamento…</div>
      ) : vini.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-neutral-500">
          <div className="text-2xl mb-1">🍾</div>
          Nessuna bottiglia in mescita.<br />
          <span className="text-[11px] text-neutral-400">
            Si attiva automaticamente registrando una vendita "calici" in Vendite, oppure
            manualmente dal toggle nella scheda vino (tab Giacenze).
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-2 font-semibold">Vino</th>
                <th className="px-3 py-2 font-semibold hidden md:table-cell">Produttore · Regione</th>
                <th className="px-3 py-2 font-semibold hidden sm:table-cell">Tipologia</th>
                <th className="px-3 py-2 font-semibold text-right">Calice</th>
                <th className="px-3 py-2 font-semibold text-right">Giacenza</th>
                <th className="px-3 py-2 font-semibold text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {vini.map(v => (
                <tr
                  key={v.id}
                  onClick={onApriScheda ? () => onApriScheda(v) : undefined}
                  className={`border-b border-neutral-100 transition ${
                    onApriScheda ? "hover:bg-amber-50 cursor-pointer" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-brand-ink">
                      {v.DESCRIZIONE}
                      {v.ANNATA && <span className="text-neutral-500 font-normal"> · {v.ANNATA}</span>}
                    </div>
                    <div className="md:hidden text-[11px] text-neutral-500 mt-0.5">
                      {[v.PRODUTTORE, v.REGIONE].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600 hidden md:table-cell">
                    {[v.PRODUTTORE, v.REGIONE].filter(Boolean).join(" · ") || (
                      <span className="text-neutral-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600 hidden sm:table-cell">
                    {v.TIPOLOGIA || <span className="text-neutral-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">
                    {v.PREZZO_CALICE != null ? `${fmtPrezzo(v.PREZZO_CALICE)} €` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {v.QTA_TOTALE ?? 0} <span className="text-[10px] text-neutral-400">bt</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); spegniBottiglia(v.id); }}
                      disabled={busyId === v.id}
                      title="Spegni il flag bottiglia in mescita"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-neutral-300 bg-white text-neutral-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition text-xs disabled:opacity-40"
                    >
                      {busyId === v.id ? "…" : "✕"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
