// Modulo: dipendenti (sotto-modulo turni) — [core]
// @version: v1.1 — un calendario per reparto per chi ne ha più d'uno (2026-11-05)
//   v1.0 — calendario personale per iPhone/Android (mig 203, 2026-10-20)
//
// Pannello «📅 Aggiungi al calendario» di «I miei turni».
// - iPhone: link webcal:// → Calendario chiede «Abbonati» e si aggiorna da solo.
// - Android: Google Calendar «aggiungi da URL» (cid=webcal://…), aggiornamento
//   automatico ma lento (Google rilegge il link ogni qualche ora).
// - File: lo stesso calendario scaricato una volta (non si aggiorna).
// Il link è personale e segreto (token): «Cambia link» lo rigenera e quello
// vecchio smette di funzionare. Backend: turni_router «CALENDARIO PERSONALE».
// Chi lavora in più reparti (es. cucina e sala) vede un abbonamento per reparto
// (?reparto=CODICE): sul telefono diventano due calendari, ognuno col suo colore
// (il colore del singolo evento negli abbonamenti iPhone/Google non esiste).
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

function urlAssoluto(path) {
  return new URL(`${API_BASE}${path}`, window.location.origin).href;
}

function linkDa(https) {
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  const sep = https.includes("?") ? "&" : "?";
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    file: `${https}${sep}scarica=1`,
  };
}

export default function CalendarioTelefono({ onClose }) {
  const [path, setPath] = useState(null);
  const [reparti, setReparti] = useState([]);
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
        setReparti(Array.isArray(b.reparti) ? b.reparti : []);
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
      setReparti(Array.isArray(b.reparti) ? b.reparti : []);
      setConfermaCambio(false);
      setCopiato(false);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLavoro(false);
    }
  }

  const https = path ? urlAssoluto(path) : null;
  const unico = https ? linkDa(https) : null;
  const multi = reparti.length > 1;
  const perReparto = https && multi
    ? reparti.map((r) => ({ ...r, link: linkDa(`${https}?reparto=${encodeURIComponent(r.codice)}`) }))
    : [];

  async function copia(testo, chiave) {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(chiave);
    } catch {
      setCopiato(false);
    }
  }

  // «Cambia link»: un solo token per persona → cambia tutti i calendari insieme
  function CambiaLink() {
    return (
      <div className="flex justify-end mt-2">
        {!confermaCambio ? (
          <Btn variant="ghost" size="md" onClick={() => setConfermaCambio(true)} title="Se hai condiviso il link per sbaglio">
            Cambia link
          </Btn>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-700">
              {multi ? "Tutti i link vecchi smettono di funzionare. Sicuro?" : "Il link vecchio smette di funzionare. Sicuro?"}
            </span>
            <Btn variant="danger" size="md" loading={lavoro} onClick={cambiaLink}>Sì, cambia</Btn>
            <Btn variant="ghost" size="md" onClick={() => setConfermaCambio(false)}>No</Btn>
          </div>
        )}
      </div>
    );
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

      {path && multi && (
        <>
          <div className="text-sm text-neutral-700 mb-3">
            Lavori in più reparti: abbonati a <b>tutti e {reparti.length}</b>. Sul telefono diventano calendari separati,
            ognuno col suo colore (se non ti piace lo cambi dalle impostazioni del calendario).
          </div>
          <div className="space-y-3">
            {perReparto.map((r) => (
              <div key={r.codice} className="rounded-xl border-2 p-3 sm:p-4" style={{ borderColor: r.colore || "#d4d4d4" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: r.colore || "#999" }} />
                  <span className="font-semibold">{r.icona ? `${r.icona} ` : ""}Turni {r.nome}</span>
                  {r.principale ? <span className="text-xs text-neutral-500">· con ferie e permessi</span> : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a href={r.link.webcal} className="block rounded-lg border border-neutral-200 hover:bg-purple-50 hover:border-purple-300 px-3 py-2 min-h-[44px]">
                    <div className="font-medium">📱 iPhone / iPad / Mac</div>
                    <div className="text-xs text-neutral-600">Tocca e conferma «Abbonati».</div>
                  </a>
                  <a href={r.link.google} target="_blank" rel="noreferrer" className="block rounded-lg border border-neutral-200 hover:bg-purple-50 hover:border-purple-300 px-3 py-2 min-h-[44px]">
                    <div className="font-medium">🤖 Android (Google Calendar)</div>
                    <div className="text-xs text-neutral-600">Tocca e conferma «Aggiungi».</div>
                  </a>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Btn as="a" href={r.link.file} variant="ghost" size="md" title="File .ics di questo reparto (non si aggiorna)">⬇️ File .ics</Btn>
                  <Btn variant="ghost" size="md" onClick={() => copia(r.link.https, r.codice)}>
                    {copiato === r.codice ? "✓ Link copiato" : "🔗 Copia link"}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Se avevi già il calendario unico «Turni · …», toglilo dal telefono, sennò vedi i turni doppi.
            Ferie e permessi stanno solo nel calendario del reparto principale.
          </div>
          <CambiaLink />
        </>
      )}

      {path && !multi && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href={unico.webcal} className="block rounded-xl border border-neutral-200 hover:border-purple-300 hover:bg-purple-50 p-4 min-h-[44px]">
              <div className="font-semibold">📱 iPhone / iPad / Mac</div>
              <div className="text-sm text-neutral-600 mt-1">Tocca e conferma «Abbonati». Si aggiorna da solo.</div>
            </a>
            <a href={unico.google} target="_blank" rel="noreferrer" className="block rounded-xl border border-neutral-200 hover:border-purple-300 hover:bg-purple-50 p-4 min-h-[44px]">
              <div className="font-semibold">🤖 Android (Google Calendar)</div>
              <div className="text-sm text-neutral-600 mt-1">
                Tocca e conferma «Aggiungi». Google lo aggiorna da solo, ma con qualche ora di ritardo.
              </div>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Btn as="a" href={unico.file} variant="secondary" size="md" title="Scarica i turni come file .ics (non si aggiorna)">
              ⬇️ Scarica file .ics
            </Btn>
            <Btn variant="secondary" size="md" onClick={() => copia(unico.https, "unico")} title="Per incollarlo in un'altra app di calendario">
              {copiato === "unico" ? "✓ Link copiato" : "🔗 Copia link"}
            </Btn>
          </div>
          <CambiaLink />

          <div className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Il file è una fotografia di adesso: se i turni cambiano va riscaricato, e reimportarlo può creare doppioni.
            Il link è personale: non condividerlo. Nel calendario ci sono i turni (quelli da confermare sono segnati) e ferie/permessi.
          </div>
        </>
      )}
    </div>
  );
}
