// frontend/src/pages/public/Regalo.jsx
// Modulo: clienti — Gift Card
// @version: v1.4 — esito «non ancora attivato» per le card in bianco (2026-10-29); v1.3 — solo vista cliente, lo staff scansiona dall'app (2026-10-27); v1.2 — testo leggibile nel riquadro anche per «non riconosciuto»/errori (era avorio su avorio) (2026-10-26); v1.1 — «Prenota il tavolo»: widget TRGB con la nota della gift card, TheFork se è spento (2026-10-25)
// v1.0 — pagina del QR sull'etichetta del buono (2026-10-25)
//
// /regalo/:token — la apre chi inquadra il QR incollato sul buono.
// Solo vista CLIENTE, per chiunque la apra: cosa gli hanno regalato, se è
// valido, fino a quando. Mai l'importo (decisione Marco 2026-10-25), mai chi
// l'ha regalato. Dati da GET /public/regalo/{token}. Senza login: fetch diretto.
// Lo staff NON legge il QR da qui ma dall'app: Gift Card › «📷 Scansiona»
// (decisione Marco 2026-10-27; prima qui c'era una vista staff col login del browser).
// Colori dal branding del locale (branding.json → giftcard), non di TRGB.

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import { PrenotaIncorporata, widgetAttivo } from "./Prenota";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function dataLunga(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.split("-").map(Number);
  return `${g} ${MESI[m - 1]} ${a}`;
}

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

export default function Regalo() {
  const { token } = useParams();
  const [pub, setPub] = useState(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/public/regalo/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPub)
      .catch(() => setErrore("Non riesco a leggere il buono. Controlla la connessione e riprova."));
  }, [token]);

  const c = pub?.locale?.colori || { fondo: "#2b2b2b", carta: "#faf8f4", oro: "#8a7a5c", oro_chiaro: "#d8cdb6" };
  const nome = pub?.locale?.nome || "";

  return (
    <div style={{ minHeight: "100vh", background: c.fondo, color: c.carta }}
      className="flex flex-col items-center px-4 py-8">
      {nome && (
        <div style={{ color: c.oro_chiaro, letterSpacing: ".22em" }} className="text-xs uppercase mb-6 text-center">
          {nome}
        </div>
      )}
      <VistaCliente pub={pub} errore={errore} c={c} nome={nome} />
    </div>
  );
}

function VistaCliente({ pub, errore, c, nome }) {
  if (errore) return <Riquadro c={c}><p className="text-center">{errore}</p></Riquadro>;
  if (!pub) return <Riquadro c={c}><p className="text-center opacity-70">Un momento…</p></Riquadro>;
  if (!pub.trovata) {
    return (
      <Riquadro c={c}>
        <div style={{ fontFamily: SERIF }} className="text-2xl text-center mb-2">Buono non riconosciuto</div>
        <p className="text-center text-sm">Questo QR non corrisponde a nessun buono. Contattaci e controlliamo insieme.</p>
      </Riquadro>
    );
  }

  const cosa = pub.tipo === "esperienza" && pub.descrizione ? pub.descrizione : "Un buono regalo";
  const valido = pub.esito === "valida";

  return (
    <>
    <Riquadro c={c}>
      <div className="text-center text-sm uppercase mb-3" style={{ color: c.oro, letterSpacing: ".18em" }}>
        Ti hanno regalato
      </div>
      <div style={{ fontFamily: SERIF, color: c.fondo }} className="text-3xl leading-tight text-center">
        {cosa}
      </div>
      {nome && <div className="text-center mt-2" style={{ color: c.fondo }}>presso {nome}</div>}

      <div className="mt-6 pt-5 text-center" style={{ borderTop: `1px solid ${c.oro_chiaro}` }}>
        {valido && (
          <>
            <div className="font-semibold" style={{ color: c.fondo }}>
              {pub.data_scadenza ? `Valido fino al ${dataLunga(pub.data_scadenza)}` : "Valido, senza scadenza"}
            </div>
            <div className="text-sm mt-2" style={{ color: c.fondo }}>
              Prenotazione obbligatoria: al momento di prenotare dicci che hai un buono.
            </div>
          </>
        )}
        {pub.esito === "usata" && (
          <div className="font-semibold" style={{ color: c.fondo }}>
            Questo regalo è già stato utilizzato{pub.data_utilizzo ? ` il ${dataLunga(pub.data_utilizzo)}` : ""}.
          </div>
        )}
        {pub.esito === "scaduta" && (
          <div className="font-semibold" style={{ color: c.fondo }}>
            Questo buono è scaduto il {dataLunga(pub.data_scadenza)}. Contattaci: vediamo cosa si può fare.
          </div>
        )}
        {pub.esito === "non_attiva" && (
          <div className="font-semibold" style={{ color: c.fondo }}>
            Questo buono non è ancora stato attivato. Se l'hai appena ricevuto, contattaci e lo controlliamo.
          </div>
        )}
        {pub.esito === "annullata" && (
          <div className="font-semibold" style={{ color: c.fondo }}>Questo buono non è più valido.</div>
        )}
      </div>

      <div className="mt-6 text-center text-xs" style={{ color: c.oro, letterSpacing: ".12em" }}>
        {pub.codice}
      </div>
      {pub.locale?.sito && (
        <div className="mt-4 text-center">
          <a href={pub.locale.sito} className="text-sm underline inline-flex items-center min-h-[44px]" style={{ color: c.fondo }}>
            {pub.locale.sito.replace(/^https?:\/\//, "")}
          </a>
        </div>
      )}
    </Riquadro>
    {valido && <PrenotaRegalo pub={pub} c={c} />}
    </>
  );
}

// Prenotazione dalla pagina del regalo. Widget TRGB se è acceso: la prenotazione
// nasce con «Gift card <codice>» nelle note, così in sala si sa già. Se è spento
// (widget_attivo = 0) si prenota dal widget esterno del locale
// (locale.json → prenota_esterno, oggi TheFork), lo stesso del sito.
function PrenotaRegalo({ pub, c }) {
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState(null); // "trgb" | "esterno" | "nessuno"
  const nota = `Gift card ${pub.codice}`;

  const apri = async () => {
    setAperto(true);
    if (modo) return;
    const attivo = await widgetAttivo();
    setModo(attivo ? "trgb" : pub.locale?.prenota_esterno ? "esterno" : "nessuno");
  };

  if (!aperto) {
    return (
      <button type="button" onClick={apri}
        className="mt-6 w-full max-w-md min-h-[52px] rounded-xl font-semibold tracking-wide"
        style={{ background: c.oro_chiaro, color: c.fondo }}>
        Prenota il tavolo
      </button>
    );
  }

  return (
    <div className="mt-6 w-full max-w-xl bg-white rounded-2xl overflow-hidden shadow-lg">
      {!modo && <div className="p-6 text-center text-neutral-400">…</div>}
      {modo === "trgb" && <PrenotaIncorporata nota={nota} />}
      {modo === "esterno" && (
        <>
          <div className="px-5 pt-4 pb-2 text-sm text-neutral-700">
            Nelle note della prenotazione scrivi <b>{nota}</b>.
          </div>
          <iframe src={pub.locale.prenota_esterno} title="Prenota" allow="payment *"
            className="w-full border-0" style={{ height: 760 }} />
        </>
      )}
      {modo === "nessuno" && (
        <div className="p-6 text-center text-neutral-700">
          Le prenotazioni online non sono attive: contattaci e di' che hai la {nota}.
        </div>
      )}
    </div>
  );
}

function Riquadro({ c, children }) {
  return (
    <div className="w-full max-w-md rounded-2xl px-6 py-8"
      style={{ background: c.carta, color: c.fondo, border: `1.5px solid ${c.oro_chiaro}`, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
      {children}
    </div>
  );
}
