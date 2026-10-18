// Modulo: dipendenti (sotto-modulo buste-paga) — [core]
// @version: v1.0 — Le mie buste paga (mig 198, 2026-10-18)
// Pagina "Le mie buste paga" — TRGB Gestionale
//
// Vista self-service accessibile a TUTTI i ruoli autenticati, come /miei-turni:
// il backend risolve l'utente loggato -> dipendente_id (users.json) e restituisce
// SOLO le sue buste. Il primo download del dipendente segna la busta come letta
// (l'admin lo vede in Dipendenti › Buste Paga).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, EmptyState } from "../../components/ui";

const fmtEuro = (v) =>
  v == null ? "—" : `€ ${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtData(s) {
  if (!s) return "";
  const [d] = s.split(" ");
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

export default function MieBustePaga() {
  const navigate = useNavigate();
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notLinked, setNotLinked] = useState(false);
  const [scaricando, setScaricando] = useState(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/mie-buste-paga/`);
      if (res.status === 404) {
        setNotLinked(true);
        return;
      }
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setDati(await res.json());
    } catch (e) {
      setError(e.message || "Errore di caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const perAnno = useMemo(() => {
    const g = {};
    (dati?.buste_paga || []).forEach((b) => { (g[b.anno] = g[b.anno] || []).push(b); });
    return Object.keys(g).sort((a, b) => b - a).map((anno) => ({ anno, buste: g[anno] }));
  }, [dati]);

  async function scarica(b) {
    setScaricando(b.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/mie-buste-paga/${b.id}/pdf`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || `Errore ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `busta_paga_${b.anno}-${String(b.mese).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (!b.letta_il) carica(); // aggiorna il segno «scaricata»
    } catch (e) {
      setError(e.message || "Download non riuscito");
    } finally {
      setScaricando(null);
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <button onClick={() => navigate("/")} className="text-sm text-neutral-500 hover:text-neutral-700">← Home</button>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
            📄 Le mie buste paga
          </h1>
          <div className="text-sm text-neutral-500 mt-0.5">
            {dati?.dipendente ? `${dati.dipendente.nome} ${dati.dipendente.cognome} — ` : ""}
            il tuo archivio, solo le tue buste
          </div>
          <div className="mt-3">
            <Btn variant="secondary" size="md" onClick={() => navigate("/miei-turni")}>🗓️ I miei turni</Btn>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
        )}

        {loading && !dati && <div className="text-sm text-neutral-500">Carico…</div>}

        {notLinked && (
          <div className="bg-white rounded-xl shadow p-6 text-center">
            <div className="text-4xl mb-2">🔗</div>
            <div className="text-lg font-semibold mb-1">Utente non collegato</div>
            <div className="text-sm text-neutral-600 max-w-md mx-auto">
              Il tuo utente non è ancora collegato a un dipendente in anagrafica.
              Chiedi all'amministratore di associarlo per vedere qui le tue buste paga.
            </div>
          </div>
        )}

        {dati && perAnno.length === 0 && (
          <EmptyState icon="📄" title="Nessuna busta paga" description="Quando l'amministrazione carica un cedolino, lo trovi qui." />
        )}

        {perAnno.map(({ anno, buste }) => (
          <div key={anno} className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] mb-4 overflow-hidden">
            <div className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-[1.2px] text-neutral-400">{anno}</div>
            {buste.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-t border-neutral-100 min-h-[56px]">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-neutral-800 capitalize">{b.mese_label} {b.anno}</div>
                  <div className="text-xs text-neutral-500">
                    Netto {fmtEuro(b.netto)}
                    {b.letta_il && <span className="ml-2 text-emerald-700">✓ scaricata il {fmtData(b.letta_il)}</span>}
                    {!b.letta_il && b.ha_pdf && <span className="ml-2 text-brand-blue font-semibold">• nuova</span>}
                  </div>
                </div>
                {b.ha_pdf ? (
                  <Btn variant={b.letta_il ? "secondary" : "primary"} size="md"
                       loading={scaricando === b.id} onClick={() => scarica(b)}>
                    ⬇️ Scarica
                  </Btn>
                ) : (
                  <span className="text-xs text-neutral-400">PDF non disponibile</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
