// frontend/src/pages/public/Regalo.jsx
// Modulo: clienti — Gift Card
// @version: v1.2 — testo leggibile nel riquadro anche per «non riconosciuto»/errori (era avorio su avorio) (2026-10-26); v1.1 — «Prenota il tavolo»: widget TRGB con la nota della gift card, TheFork se è spento (2026-10-25)
// v1.0 — pagina del QR sull'etichetta del buono (2026-10-25)
//
// /regalo/:token — la apre chi inquadra il QR incollato sul buono.
// Stesso QR, due risposte:
//   · CLIENTE (nessun login): cosa gli hanno regalato, se è valido, fino a
//     quando. Mai l'importo (decisione Marco 2026-10-25), mai chi l'ha
//     regalato. Dati da GET /public/regalo/{token}.
//   · STAFF (telefono loggato in TRGB): la card completa con Scarica, a due
//     tocchi (una scansione per sbaglio non la brucia). GET /clienti/giftcard/qr/{token}.
// Senza login: fetch diretto (apiFetch su 401 rimanda al login, qui no).
// Colori dal branding del locale (branding.json → giftcard), non di TRGB.

import React, { useEffect, useState, useCallback } from "react";
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

function euro(v) {
  return v == null ? "" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

export default function Regalo() {
  const { token } = useParams();
  const [pub, setPub] = useState(null);      // risposta pubblica
  const [staff, setStaff] = useState(null);  // risposta staff (se loggato)
  const [loginScaduto, setLoginScaduto] = useState(false);
  const [errore, setErrore] = useState("");
  const [vistaCliente, setVistaCliente] = useState(false);

  const caricaStaff = useCallback(async () => {
    let jwt = null;
    try { jwt = localStorage.getItem("token"); } catch { /* niente */ }
    if (!jwt) return;
    try {
      const r = await fetch(`${API_BASE}/clienti/giftcard/qr/${encodeURIComponent(token)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.status === 401) { setLoginScaduto(true); return; }
      if (!r.ok) return; // ruolo senza accesso alle gift card: vede come il cliente
      const d = await r.json();
      if (d.trovata) setStaff(d);
    } catch { /* rete: resta la vista cliente */ }
  }, [token]);

  useEffect(() => {
    fetch(`${API_BASE}/public/regalo/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPub)
      .catch(() => setErrore("Non riesco a leggere il buono. Controlla la connessione e riprova."));
    caricaStaff();
  }, [token, caricaStaff]);

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

      {staff && !vistaCliente ? (
        <VistaStaff gc={staff} token={token} onAggiornata={setStaff} onVistaCliente={() => setVistaCliente(true)} />
      ) : (
        <VistaCliente pub={pub} errore={errore} c={c} nome={nome} />
      )}

      {staff && vistaCliente && (
        <button type="button" onClick={() => setVistaCliente(false)}
          className="mt-6 text-sm underline min-h-[44px]" style={{ color: c.oro_chiaro }}>
          Torna alla vista staff
        </button>
      )}
      {loginScaduto && !staff && (
        <a href="/login" className="mt-8 text-xs underline min-h-[44px] flex items-center" style={{ color: c.oro_chiaro }}>
          Staff: l'accesso a TRGB è scaduto, rientra per scaricare il buono
        </a>
      )}
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

// ── Vista staff: stile gestionale, ma sul fondo del locale ──────────────
function VistaStaff({ gc, token, onAggiornata, onVistaCliente }) {
  const [conferma, setConferma] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, testo}

  const cosa = gc.tipo === "esperienza"
    ? (gc.descrizione || "Esperienza")
    : `Buono da ${euro(gc.importo)}${gc.descrizione ? ` — ${gc.descrizione}` : ""}`;
  const intestatario = [gc.cliente_nome, gc.cliente_cognome].filter(Boolean).join(" ") || gc.intestatario_nome;

  const scarica = async () => {
    if (!conferma) { setConferma(true); return; }
    setLavoro(true);
    try {
      const jwt = localStorage.getItem("token");
      const r = await fetch(`${API_BASE}/clienti/giftcard/${gc.id}/scarica`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ note: "scaricata da QR" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Scarico non riuscito");
      onAggiornata({ trovata: true, ...d, motivo: null });
      setMsg({ ok: true, testo: `Scaricata. ${gc.codice} ora è usata.` });
    } catch (e) {
      setMsg({ ok: false, testo: e.message });
    } finally {
      setLavoro(false);
      setConferma(false);
    }
  };

  const tono = gc.spendibile ? "bg-emerald-50 border-emerald-300 text-emerald-800"
    : "bg-red-50 border-red-300 text-red-800";

  return (
    <div className="w-full max-w-md bg-white text-brand-ink rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Vista staff · gift card</span>
        <span className="font-mono font-bold">{gc.codice}</span>
      </div>

      <div className={`rounded-xl border px-4 py-3 mb-4 font-semibold ${tono}`}>
        {gc.spendibile ? "✓ Valida, si può scaricare" : (gc.motivo || "Non spendibile")}
      </div>

      <div className="text-lg font-semibold leading-snug">{cosa}</div>
      <dl className="mt-3 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {intestatario && (<><dt className="text-neutral-500">Intestata a</dt><dd>{intestatario}</dd></>)}
        <dt className="text-neutral-500">Emessa il</dt><dd>{dataLunga(gc.data_emissione)}</dd>
        <dt className="text-neutral-500">Scadenza</dt><dd>{gc.data_scadenza ? dataLunga(gc.data_scadenza) : "nessuna"}</dd>
        {gc.data_utilizzo && (<><dt className="text-neutral-500">Usata il</dt><dd>{dataLunga(gc.data_utilizzo)}{gc.utilizzata_da ? ` (${gc.utilizzata_da})` : ""}</dd></>)}
        {gc.note && (<><dt className="text-neutral-500">Note</dt><dd>{gc.note}</dd></>)}
      </dl>

      {msg && (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {msg.testo}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {gc.spendibile && (
          <button type="button" onClick={scarica} disabled={lavoro}
            className={`w-full min-h-[48px] rounded-xl font-semibold text-white ${conferma ? "bg-brand-red" : "bg-brand-green"} disabled:opacity-60`}>
            {lavoro ? "Scarico…" : conferma ? "Tocca di nuovo per confermare lo scarico" : "Scarica"}
          </button>
        )}
        {conferma && !lavoro && (
          <button type="button" onClick={() => setConferma(false)} className="w-full min-h-[44px] rounded-xl border border-neutral-300 text-sm">
            Annulla
          </button>
        )}
        <a href="/clienti/giftcard" className="w-full min-h-[44px] rounded-xl border border-neutral-300 text-sm flex items-center justify-center">
          Apri le gift card in TRGB
        </a>
        <button type="button" onClick={onVistaCliente} className="w-full min-h-[44px] text-sm text-neutral-500 underline">
          Vedi cosa vede il cliente
        </button>
      </div>
    </div>
  );
}
