// @version: v1.2 — PrenotaIncorporata: il widget dentro altre pagine pubbliche (gift card /regalo), con nota precompilata (2026-10-25); v1.1 — indirizzo dedicato prenota.<dominio>: API sullo stesso indirizzo (/api/public/prenota); v1.0 — prenotazioni dal sito (2026-10-20, mig 205)
// Pagina pubblica /prenota (anche dentro il sito in iframe) e /prenota/annulla/:token.
// Senza login: usa fetch diretto. Se nel browser c'è il token di un admin lo manda,
// così l'anteprima funziona anche quando il widget non è ancora attivo.
// In iframe comunica l'altezza al sito (postMessage «trgb-prenota-altezza»).
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";

const T = {
  it: {
    titolo: "Prenota un tavolo", persone: "Quante persone?", altro: "Di più", giorno: "Che giorno?", orario: "A che ora?",
    pranzo: "Pranzo", cena: "Cena", dati: "I tuoi dati", nome: "Nome", cognome: "Cognome", telefono: "Telefono",
    email: "Email", occasione: "Occasione (facoltativa)", allergie: "Allergie o intolleranze", note: "Note per noi",
    privacy: "Acconsento al trattamento dei miei dati per gestire la prenotazione.",
    prenota: "Prenota", richiedi: "Invia la richiesta", invio: "Invio…",
    richiestaInfo: (n) => `Per ${n} persone o più la prenotazione è una richiesta: te la confermiamo noi, di solito entro poche ore.`,
    gruppo: (tel) => `Per gruppi così numerosi chiamaci${tel ? ` al ${tel}` : ""}: troviamo insieme la soluzione.`,
    nessunOrario: "Nessun orario libero in questo giorno.", scegliGiorno: "Scegli un giorno sul calendario.",
    chiuso: "chiuso", pieno: "completo",
    fattoTitolo: "Prenotazione confermata", fattoTesto: "Ti abbiamo mandato un'email di conferma. Ci vediamo",
    richiestaTitolo: "Richiesta inviata", richiestaTesto: "Ti abbiamo mandato un'email: ti confermiamo noi la prenotazione per",
    altra: "Fai un'altra prenotazione",
    errori: {
      nome: "Scrivi nome e cognome.", telefono: "Il numero di telefono non sembra giusto.", email: "L'indirizzo email non sembra giusto.",
      privacy: "Serve il consenso per gestire la prenotazione.", occupato: "Quell'orario si è appena riempito: scegline un altro.",
      gruppo: "Per gruppi così numerosi chiamaci.", troppe: "Troppi tentativi: riprova fra qualche minuto.",
      generico: "Qualcosa non ha funzionato. Riprova.", rete: "Connessione assente. Riprova.",
    },
    nonAttive: "Le prenotazioni online non sono ancora attive.", chiamaci: (tel) => (tel ? `Chiamaci al ${tel}.` : ""),
    anteprima: "Anteprima: le prenotazioni online non sono attive, la vedi solo tu perché sei entrato nel gestionale.",
    occasioni: ["", "Compleanno", "Anniversario", "Cena di lavoro", "Altro"],
    mesi: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    gg: ["L", "M", "M", "G", "V", "S", "D"],
    annullaTitolo: "Annulla la prenotazione", annulla: "Annulla la prenotazione", annullata: "La prenotazione è annullata. Speriamo di vederti presto.",
    nonAnnullabile: "Questa prenotazione non si può più annullare online.", nonTrovata: "Prenotazione non trovata.",
    pers: (n) => (n === 1 ? "1 persona" : `${n} persone`), alle: "alle",
  },
  en: {
    titolo: "Book a table", persone: "How many guests?", altro: "More", giorno: "Which day?", orario: "What time?",
    pranzo: "Lunch", cena: "Dinner", dati: "Your details", nome: "First name", cognome: "Last name", telefono: "Phone",
    email: "Email", occasione: "Occasion (optional)", allergie: "Allergies or intolerances", note: "Notes for us",
    privacy: "I agree to the processing of my data to manage the booking.",
    prenota: "Book", richiedi: "Send request", invio: "Sending…",
    richiestaInfo: (n) => `For ${n} guests or more the booking is a request: we will confirm it, usually within a few hours.`,
    gruppo: (tel) => `For large groups please call us${tel ? ` on ${tel}` : ""} and we will find a solution together.`,
    nessunOrario: "No times available on this day.", scegliGiorno: "Pick a day on the calendar.",
    chiuso: "closed", pieno: "full",
    fattoTitolo: "Booking confirmed", fattoTesto: "We have sent you a confirmation email. See you",
    richiestaTitolo: "Request sent", richiestaTesto: "We have sent you an email: we will confirm your booking for",
    altra: "Make another booking",
    errori: {
      nome: "Please enter first and last name.", telefono: "The phone number does not look right.", email: "The email address does not look right.",
      privacy: "We need your consent to manage the booking.", occupato: "That time has just filled up: please choose another.",
      gruppo: "For large groups please call us.", troppe: "Too many attempts: please try again in a few minutes.",
      generico: "Something went wrong. Please try again.", rete: "No connection. Please try again.",
    },
    nonAttive: "Online booking is not available yet.", chiamaci: (tel) => (tel ? `Call us on ${tel}.` : ""),
    anteprima: "Preview: online booking is not active, only you can see it because you are logged in.",
    occasioni: ["", "Birthday", "Anniversary", "Business dinner", "Other"],
    mesi: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    gg: ["M", "T", "W", "T", "F", "S", "S"],
    annullaTitolo: "Cancel your booking", annulla: "Cancel the booking", annullata: "Your booking has been cancelled. We hope to see you soon.",
    nonAnnullabile: "This booking can no longer be cancelled online.", nonTrovata: "Booking not found.",
    pers: (n) => (n === 1 ? "1 guest" : `${n} guests`), alle: "at",
  },
};

const STILE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Courier+Prime:wght@400;700&display=swap');
.tp { font-family: 'Cormorant Garamond', Georgia, serif; color: #111; background: #fff; }
.tp-mono { font-family: 'Courier Prime', 'Courier New', monospace; letter-spacing: .08em; text-transform: uppercase; }
.tp-btn { border: 1px solid #111; padding: .45rem .8rem; background: #fff; color: #111; font-family: 'Courier Prime', monospace; font-size: .9rem; }
.tp-btn:hover:not(:disabled) { background: #f2f2f2; }
.tp-btn.on { background: #111; color: #fff; }
.tp-btn:disabled { border-color: #ccc; color: #bbb; text-decoration: line-through; }
.tp-input { width: 100%; border: 0; border-bottom: 1px solid #999; padding: .4rem 0; font-family: 'Cormorant Garamond', serif; font-size: 1.15rem; background: transparent; outline: none; }
.tp-input:focus { border-color: #111; }
.tp-go { width: 100%; background: #111; color: #fff; padding: .85rem; font-family: 'Courier Prime', monospace; letter-spacing: .15em; text-transform: uppercase; }
.tp-go:disabled { opacity: .4; }
`;

// Su prenota.<dominio> si parla col server attraverso lo stesso indirizzo (nginx inoltra
// solo /api/public/prenota): il cliente non vede mai l'indirizzo del gestionale.
const SU_PRENOTA = typeof window !== "undefined" && window.location.hostname.startsWith("prenota.");
const BASE = SU_PRENOTA ? "/api/public/prenota" : `${API_BASE}/public/prenota`;

function chiama(path, opts = {}) {
  // Il token (anteprima admin) esiste solo su app.<dominio>: su prenota.* il localStorage è un altro
  const token = (() => { try { return localStorage.getItem("token"); } catch { return null; } })();
  const headers = { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

function linguaIniziale() {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "it") return q;
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}

function useAltezzaIframe(ref) {
  useEffect(() => {
    if (window.parent === window || !ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      window.parent.postMessage({ type: "trgb-prenota-altezza", altezza: ref.current.scrollHeight + 24 }, "*");
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
}

function SceltaLingua({ lingua, setLingua }) {
  return (
    <div className="tp-mono text-xs flex gap-2">
      {["it", "en"].map((l) => (
        <button key={l} onClick={() => setLingua(l)} className={lingua === l ? "underline" : "text-neutral-400"}>{l}</button>
      ))}
    </div>
  );
}

function Calendario({ t, mese, setMese, giorni, scelto, onScegli, minMese, maxMese }) {
  const [anno, m] = mese.split("-").map(Number);
  const primo = new Date(anno, m - 1, 1);
  const offset = (primo.getDay() + 6) % 7;
  const nGiorni = new Date(anno, m, 0).getDate();
  const celle = [...Array(offset).fill(null), ...Array.from({ length: nGiorni }, (_, i) => i + 1)];
  const sposta = (d) => {
    const x = new Date(anno, m - 1 + d, 1);
    setMese(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button className="px-2 text-xl disabled:opacity-20" disabled={mese <= minMese} onClick={() => sposta(-1)}>‹</button>
        <div className="text-xl">{t.mesi[m - 1]} {anno}</div>
        <button className="px-2 text-xl disabled:opacity-20" disabled={mese >= maxMese} onClick={() => sposta(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {t.gg.map((g, i) => <div key={i} className="tp-mono text-[10px] text-neutral-500">{g}</div>)}
        {celle.map((g, i) => {
          if (!g) return <div key={i} />;
          const iso = `${mese}-${String(g).padStart(2, "0")}`;
          const st = giorni?.[iso];
          const libero = st === "libero";
          return (
            <button key={i} disabled={!libero} onClick={() => onScegli(iso)}
              title={st === "chiuso" ? t.chiuso : st === "pieno" ? t.pieno : ""}
              className={`h-10 text-lg ${scelto === iso ? "bg-black text-white" : libero ? "hover:bg-neutral-100" : "text-neutral-300"} ${st === "pieno" ? "line-through" : ""}`}>
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Prenotazione({ notaIniziale = "" }) {
  const [lingua, setLingua] = useState(linguaIniziale);
  const t = T[lingua];
  const radice = useRef(null);
  useAltezzaIframe(radice);
  const [info, setInfo] = useState(null);
  const [pax, setPax] = useState(2);
  const oggi = new Date();
  const meseOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
  const [mese, setMese] = useState(meseOggi);
  const [giorni, setGiorni] = useState(null);
  const [data, setData] = useState(null);
  const [orari, setOrari] = useState(null);
  const [ora, setOra] = useState(null);
  const vuoto = { nome: "", cognome: "", telefono: "", email: "", occasione: "", allergie: "", note: notaIniziale, privacy: false, sito_web: "" };
  const [f, setF] = useState(vuoto);
  const [errore, setErrore] = useState(null);
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(null);
  const aperto = useRef(Date.now());

  useEffect(() => {
    chiama("/info").then((r) => r.json()).then(setInfo).catch(() => setInfo({ attivo: false }));
  }, []);

  const maxMese = useMemo(() => {
    const x = new Date(Date.now() + (info?.giorni_max || 60) * 86400000);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  }, [info]);

  const gruppoGrande = info && pax > info.max_richiesta;
  const richiesta = info && pax > info.max_automatica && !gruppoGrande;

  useEffect(() => {
    if (!info?.attivo || gruppoGrande) return;
    setGiorni(null);
    chiama(`/calendario?mese=${mese}&pax=${pax}`).then((r) => r.json()).then((d) => setGiorni(d.giorni || {})).catch(() => setGiorni({}));
  }, [info, mese, pax, gruppoGrande]);

  const caricaOrari = useCallback(() => {
    if (!data || gruppoGrande) { setOrari(null); return; }
    setOrari(null);
    chiama(`/orari?data=${data}&pax=${pax}`).then((r) => r.json()).then(setOrari).catch(() => setOrari({ turni: [] }));
  }, [data, pax, gruppoGrande]);
  useEffect(() => { setOra(null); caricaOrari(); }, [caricaOrari]);

  const invia = async () => {
    setErrore(null);
    setInvio(true);
    try {
      const r = await chiama("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, data, ora, pax, lingua, aperto_ms: Date.now() - aperto.current }),
      });
      const d = await r.json();
      if (r.ok) { setFatto(d); return; }
      const campo = d?.detail?.campo || "generico";
      setErrore(t.errori[campo] || t.errori.generico);
      if (campo === "occupato") { setOra(null); caricaOrari(); }
    } catch {
      setErrore(t.errori.rete);
    } finally {
      setInvio(false);
    }
  };

  const dataLunga = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(lingua === "it" ? "it-IT" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  };

  if (!info) return <div ref={radice} className="tp p-6 text-center text-neutral-400">…</div>;

  if (!info.attivo) return (
    <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-2">
      <div className="text-3xl">{info.locale}</div>
      <p className="text-lg">{t.nonAttive}</p>
    </div>
  );

  if (fatto) return (
    <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-4">
      <div className="tp-mono text-xs">{info.locale}</div>
      <div className="text-3xl">{fatto.stato === "REQUESTED" ? t.richiestaTitolo : t.fattoTitolo}</div>
      <p className="text-lg">
        {fatto.stato === "REQUESTED" ? t.richiestaTesto : t.fattoTesto} {dataLunga(fatto.data)} {t.alle} {fatto.ora}, {t.pers(fatto.pax)}.
      </p>
      <button className="tp-btn" onClick={() => { setFatto(null); setData(null); setOra(null); aperto.current = Date.now(); }}>{t.altra}</button>
    </div>
  );

  const datiOk = f.nome.trim() && f.cognome.trim() && f.telefono.trim() && f.email.trim() && f.privacy;

  return (
    <div ref={radice} className="tp max-w-xl mx-auto p-5 space-y-7">
      <div className="flex items-start justify-between">
        <div>
          <div className="tp-mono text-xs">{info.locale}</div>
          <h1 className="text-3xl">{t.titolo}</h1>
        </div>
        <SceltaLingua lingua={lingua} setLingua={setLingua} />
      </div>
      {info.anteprima && <div className="text-sm border border-dashed border-neutral-400 p-2">{t.anteprima}</div>}
      {info.nota && <p className="text-lg italic">{info.nota}</p>}

      <section>
        <div className="tp-mono text-xs mb-2">1 · {t.persone}</div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} className={`tp-btn ${pax === n ? "on" : ""}`} onClick={() => setPax(n)}>{n}</button>
          ))}
          <select className={`tp-btn ${pax > 8 ? "on" : ""}`} value={pax > 8 ? pax : ""} onChange={(e) => e.target.value && setPax(+e.target.value)}>
            <option value="">{t.altro}</option>
            {Array.from({ length: Math.max(0, info.max_richiesta - 8) + 1 }, (_, i) => i + 9).map((n) => (
              <option key={n} value={n}>{n > info.max_richiesta ? `${info.max_richiesta}+` : n}</option>
            ))}
          </select>
        </div>
        {richiesta && <p className="mt-2 text-base">{t.richiestaInfo(info.max_automatica + 1)}</p>}
        {gruppoGrande && <p className="mt-2 text-lg">{t.gruppo(info.telefono)}</p>}
      </section>

      {!gruppoGrande && (
        <section>
          <div className="tp-mono text-xs mb-2">2 · {t.giorno}</div>
          <Calendario t={t} mese={mese} setMese={setMese} giorni={giorni} scelto={data} onScegli={setData}
            minMese={meseOggi} maxMese={maxMese} />
        </section>
      )}

      {!gruppoGrande && data && (
        <section>
          <div className="tp-mono text-xs mb-2">3 · {t.orario} <span className="normal-case tracking-normal font-sans text-neutral-500">— {dataLunga(data)}</span></div>
          {!orari ? <div className="text-neutral-400">…</div> : orari.turni.length === 0 ? (
            <p>{t.nessunOrario} {info.messaggio_pieno ? "" : t.chiamaci(info.telefono)}</p>
          ) : orari.turni.map((tu) => (
            <div key={tu.turno} className="mb-3">
              <div className="text-lg mb-1">{tu.turno === "pranzo" ? t.pranzo : t.cena}</div>
              <div className="flex flex-wrap gap-2">
                {tu.orari.map((o) => (
                  <button key={o.ora} disabled={!o.libero} className={`tp-btn ${ora === o.ora ? "on" : ""}`} onClick={() => setOra(o.ora)}>{o.ora}</button>
                ))}
              </div>
            </div>
          ))}
          {orari && orari.motivo === "pieno" && info.messaggio_pieno && <p className="text-base mt-1">{info.messaggio_pieno}</p>}
        </section>
      )}

      {!gruppoGrande && data && ora && (
        <section className="space-y-4">
          <div className="tp-mono text-xs">4 · {t.dati}</div>
          <div className="grid grid-cols-2 gap-4">
            <input className="tp-input" placeholder={t.nome} autoComplete="given-name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
            <input className="tp-input" placeholder={t.cognome} autoComplete="family-name" value={f.cognome} onChange={(e) => setF({ ...f, cognome: e.target.value })} />
            <input className="tp-input" placeholder={t.telefono} type="tel" autoComplete="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            <input className="tp-input" placeholder={t.email} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <select className="tp-input" value={f.occasione} onChange={(e) => setF({ ...f, occasione: e.target.value })}>
            {t.occasioni.map((o, i) => <option key={i} value={o}>{o || t.occasione}</option>)}
          </select>
          <input className="tp-input" placeholder={t.allergie} value={f.allergie} onChange={(e) => setF({ ...f, allergie: e.target.value })} />
          <textarea className="tp-input" rows={2} placeholder={t.note} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          {/* esca per i programmi automatici: nascosta alle persone */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.sito_web} onChange={(e) => setF({ ...f, sito_web: e.target.value })}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} name="sito_web" />
          <label className="flex gap-2 items-start text-base">
            <input type="checkbox" className="mt-1.5" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} />
            <span>{t.privacy}</span>
          </label>
          <div className="text-lg">{dataLunga(data)} {t.alle} {ora} · {t.pers(pax)}</div>
          {errore && <div className="text-base text-red-700">{errore}</div>}
          <button className="tp-go" disabled={!datiOk || invio} onClick={invia}>
            {invio ? t.invio : richiesta ? t.richiedi : t.prenota}
          </button>
        </section>
      )}
    </div>
  );
}

function Annulla() {
  const { token } = useParams();
  const radice = useRef(null);
  useAltezzaIframe(radice);
  const [d, setD] = useState(null);
  const [stato, setStato] = useState(null); // null | "fatto" | "errore" | "non_trovata"
  const [lingua, setLingua] = useState(linguaIniziale);
  useEffect(() => {
    chiama(`/annulla/${token}`).then(async (r) => {
      if (!r.ok) { setStato("non_trovata"); return; }
      const x = await r.json();
      setD(x);
      if (x.lingua) setLingua(x.lingua.startsWith("en") ? "en" : "it");
    }).catch(() => setStato("non_trovata"));
  }, [token]);
  const t = T[lingua];
  const annulla = async () => {
    const r = await chiama(`/annulla/${token}`, { method: "POST" });
    setStato(r.ok ? "fatto" : "errore");
  };
  const dataLunga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lingua === "it" ? "it-IT" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-4">
      <div className="tp-mono text-xs">{d?.locale || ""}</div>
      <div className="text-3xl">{t.annullaTitolo}</div>
      {stato === "non_trovata" && <p className="text-lg">{t.nonTrovata}</p>}
      {d && stato !== "fatto" && (
        <>
          <p className="text-lg">{d.nome ? `${d.nome}, ` : ""}{dataLunga(d.data)} {t.alle} {d.ora} · {t.pers(d.pax)}</p>
          {d.annullabile && stato !== "errore" ? (
            <button className="tp-go" onClick={annulla}>{t.annulla}</button>
          ) : <p className="text-lg">{t.nonAnnullabile}</p>}
        </>
      )}
      {stato === "fatto" && <p className="text-lg">{t.annullata}</p>}
    </div>
  );
}

/**
 * Il widget dentro un'altra pagina pubblica (es. /regalo/<chiave> della gift card).
 * `nota` precompila «Note per noi» (il cliente la vede e la può cambiare).
 * Le regole restano quelle del widget: se `widget_attivo` è 0 mostra «non attive»,
 * quindi chi lo incorpora controlla prima /public/prenota/info (vedi `widgetAttivo`).
 */
export function PrenotaIncorporata({ nota }) {
  return (
    <>
      <style>{STILE}</style>
      <Prenotazione notaIniziale={nota || ""} />
    </>
  );
}

/** true se il widget TRGB accetta prenotazioni (o se un admin loggato è in anteprima). */
export async function widgetAttivo() {
  try {
    const r = await chiama("/info");
    const d = await r.json();
    return !!d.attivo;
  } catch {
    return false;
  }
}

export default function Prenota({ annulla }) {
  return (
    <>
      <style>{STILE}</style>
      <div className="min-h-screen bg-white">{annulla ? <Annulla /> : <Prenotazione />}</div>
    </>
  );
}
