// @version: v1.0 — Mattone M.J "Pubblicazione web" (2026-08-03)
// Modulo: platform
// Classificazione: [core]
//
// Bottone riusabile "Pubblica sul sito". Carica il PDF generato dal backend
// sull'FTP dell'hosting, dove il sito pubblico lo linka con un nome fisso.
//
// Uso:
//   <PubblicaSulSito
//     statoUrl={`${API_BASE}/vini/carta/pubblicazione/`}
//     pubblicaUrl={`${API_BASE}/vini/carta/pubblica/`}
//     etichetta="Pubblica la carta sul sito"
//   />
//
// Il componente si arrangia da solo: legge lo stato (FTP configurato? l'utente
// ha il ruolo per pubblicare? quando è stata l'ultima pubblicazione riuscita?),
// pubblica, mostra l'esito.
//
// `nota` è testo di aiuto mostrato sotto il bottone. Da non confondere con la
// `descrizione` lato backend, che è l'etichetta della riga di storico.

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { Btn } from "./ui";

function formattaQuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PubblicaSulSito({
  statoUrl,
  pubblicaUrl,
  etichetta = "Pubblica sul sito",
  nota = null,
}) {
  const [stato, setStato] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);       // { tipo: "ok"|"err", testo }

  const caricaStato = useCallback(async () => {
    try {
      const resp = await apiFetch(statoUrl);
      if (!resp.ok) return;
      setStato(await resp.json());
    } catch {
      /* lo stato è un di più: se non arriva, il bottone resta comunque usabile */
    }
  }, [statoUrl]);

  useEffect(() => { caricaStato(); }, [caricaStato]);

  const pubblica = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const resp = await apiFetch(pubblicaUrl, { method: "POST" });
      const testo = await resp.text();
      let data = null;
      try { data = JSON.parse(testo); } catch { /* errore non-JSON */ }
      if (!resp.ok) {
        throw new Error(data?.detail || testo || `Errore ${resp.status}`);
      }
      setMsg({ tipo: "ok", testo: "Fatto: il file sul sito è aggiornato." });
      caricaStato();
    } catch (e) {
      setMsg({ tipo: "err", testo: e?.message || "Pubblicazione fallita." });
    } finally {
      setLoading(false);
    }
  };

  const configurato = stato?.ftp?.configurato !== false;
  const ultima = stato?.ultima;
  const url = stato?.url;

  // Il backend dice se questo utente può pubblicare: meglio non mostrare un
  // bottone che restituisce 403 solo dopo il click. Finché lo stato non è
  // arrivato non si nasconde nulla (evita il lampeggio del bottone).
  if (stato && stato.abilitato === false) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Btn
          variant="primary"
          size="md"
          onClick={pubblica}
          loading={loading}
          disabled={loading || !configurato}
        >
          🌐 {etichetta}
        </Btn>

        {ultima?.creato_il && (
          <span className="text-xs text-neutral-500">
            Ultima pubblicazione: {formattaQuando(ultima.creato_il)}
            {ultima.descrizione ? ` — ${ultima.descrizione}` : ""}
          </span>
        )}
      </div>

      {nota && (
        <p className="text-xs text-neutral-500">{nota}</p>
      )}

      {!configurato && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          FTP non configurato sul server
          {stato?.ftp?.mancanti?.length
            ? `: mancano ${stato.ftp.mancanti.join(", ")} in .env`
            : "."}
        </div>
      )}

      {msg && (
        <div
          className={
            "text-xs rounded-lg px-3 py-2 border " +
            (msg.tipo === "ok"
              ? "text-green-800 bg-green-50 border-green-200"
              : "text-rose-800 bg-rose-50 border-rose-200")
          }
        >
          {msg.testo}
          {msg.tipo === "ok" && url && (
            <>
              {" "}
              <a href={url} target="_blank" rel="noreferrer" className="underline">
                apri la pagina
              </a>
              {" — se vedi ancora il file vecchio, ricarica con Ctrl+Shift+R."}
            </>
          )}
        </div>
      )}
    </div>
  );
}
