// Modulo: dipendenti (sotto-modulo turni) — [core]
// @version: v1.0 — calendario personale per iPhone/Android (mig 203, 2026-10-20)
//
// Pannello «📅 Aggiungi al calendario» di «I miei turni».
// - iPhone: link webcal:// → Calendario chiede «Abbonati» e si aggiorna da solo.
// - Android: Google Calendar «aggiungi da URL» (cid=webcal://…), aggiornamento
//   automatico ma lento (Google rilegge il link ogni qualche ora).
// - File: lo stesso calendario scaricato una volta (non si aggiorna).
// Il link è personale e segreto (token): «Cambia link» lo rigenera e quello
// vecchio smette di funzionare. Backend: turni_router «CALENDARIO PERSONALE».
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

function urlAssoluto(path) {
  return new URL(`${API_BASE}${path}`, window.location.origin).href;
}

export default function CalendarioTelefono({ onClose }) {
  const [path, setPath] = useState(null);
  const [errore, setErrore] = useState(null);
  const [copiato, setCopiato] = useState(false);
  const [confermaCambio, setConfermaCambio] = useState(false);
  const [lavoro, setLavoro] = useState(false);

  useEffect(() => {
    apiFetch(`${API_BASE}/turni/miei-turni/calendario/`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.detail || `Errore ${r.status}`);
        setPath(b.path);
      })
      .catch((e) => setErrore(e.message));
  }, []);

  async function cambiaLink() {
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/turni/miei-turni/calendario/rigenera`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.detail || `Errore ${r.status}`);
      setPath(b.path);
      setConfermaCambio(false);
      setCopiato(false);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLavoro(false);
    }
  }

  const https = path ? urlAssoluto(path) : null;
  const webcal = https ? https.replace(/^https?:\/\//, "webcal://") : null;
  const google = webcal ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` : null;
  const file = https ? `${https}?scarica=1` : null;

  async function copia() {
    try {
      await navigator.clipboard.writeText(https);
      setCopiato(true);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <div className="mb-4 bg-white rounded-xl shadow border border-purple-200 p-4 sm:p-5 print:hidden">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="text-lg font-semibold">📅 I tuoi turni nel calendario del telefono</div>
          <div className="text-sm text-neutral-600 mt-0.5">
            Con l'abbonamento i turni si aggiornano da soli: se cambia un turno, cambia anche sul telefono.
          </div>
        </div>
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] text-neutral-500 hover:text-neutral-800 text-xl" title="Chiudi">✕</button>
      </div>

      {errore && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{errore}</div>}
      {!path && !errore && <div className="text-sm text-neutral-500 py-4">Preparo il tuo link…</div>}

      {path && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href={webcal} className="block rounded-xl border border-neutral-200 hover:border-purple-300 hover:bg-purple-50 p-4 min-h-[44px]">
              <div className="font-semibold">📱 iPhone / iPad / Mac</div>
              <div className="text-sm text-neutral-600 mt-1">Tocca e conferma «Abbonati». Si aggiorna da solo.</div>
            </a>
            <a href={google} target="_blank" rel="noreferrer" className="block rounded-xl border border-neutral-200 hover:border-purple-300 hover:bg-purple-50 p-4 min-h-[44px]">
              <div className="font-semibold">🤖 Android (Google Calendar)</div>
              <div className="text-sm text-neutral-600 mt-1">
                Tocca e conferma «Aggiungi». Google lo aggiorna da solo, ma con qualche ora di ritardo.
              </div>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Btn as="a" href={file} variant="secondary" size="md" title="Scarica i turni come file .ics (non si aggiorna)">
              ⬇️ Scarica file .ics
            </Btn>
            <Btn variant="secondary" size="md" onClick={copia} title="Per incollarlo in un'altra app di calendario">
              {copiato ? "✓ Link copiato" : "🔗 Copia link"}
            </Btn>
            <div className="flex-1" />
            {!confermaCambio ? (
              <Btn variant="ghost" size="md" onClick={() => setConfermaCambio(true)} title="Se hai condiviso il link per sbaglio">
                Cambia link
              </Btn>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-700">Il link vecchio smette di funzionare. Sicuro?</span>
                <Btn variant="danger" size="md" loading={lavoro} onClick={cambiaLink}>Sì, cambia</Btn>
                <Btn variant="ghost" size="md" onClick={() => setConfermaCambio(false)}>No</Btn>
              </div>
            )}
          </div>

          <div className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Il file è una fotografia di adesso: se i turni cambiano va riscaricato, e reimportarlo può creare doppioni.
            Il link è personale: non condividerlo. Nel calendario ci sono i turni (quelli da confermare sono segnati) e ferie/permessi.
          </div>
        </>
      )}
    </div>
  );
}
