// @version: v1.28 — è anche la vista «Mappa» (soloMappa): sala grande e, accanto, la stessa scheda di Servizio per il tavolo toccato (2026-11-28); v1.27 — sulla mappa ogni tavolo porta persone e ora («4p 19:30») e, sotto, chi viene dopo (2026-11-28); v1.26 — accanto a Pranzo e Cena il totale dei coperti prenotati (2026-11-28); v1.25 — nell'elenco il numero del tavolo in grassetto (2026-11-28); v1.24 — filtri rapidi sopra l'elenco: Tutte · Imminenti (toglie chi è già arrivato) · Al tavolo · Senza tavolo, col conto (2026-11-28); v1.23 — i tavoli uniti per una prenotazione restano separati finché non arriva lei, se prima sono di altri: 1, 2 e 0 col loro nome e il bollino, uniti dalle 21:30 (2026-11-28); v1.22 — nell'avviso TheFork: «Vuoi bloccare le stesse fasce anche su TRGB?» Sì / No (2026-11-27); v1.21 — avviso (non bloccante) quando su TheFork le fasce non sono prenotabili online e in TRGB risultano aperte, o il contrario (2026-11-27); v1.20 — spostando un tavolo che ha un'altra prenotazione abbinata (non ancora andata via) propone di spostarle insieme (2026-11-27); v1.19 — il bollino sui tavoli conta solo chi deve arrivare o è seduto, non chi è già andato via (2026-11-27); v1.18 — «tavolo +» su un altro tavolo quando ne ha già uno: chiede se spostare o unire; tavoli scelti come pastiglie che si tolgono una a una (2026-11-27); v1.17 — «tavolo +» su un tavolo occupato: chiede se sovrapporre o invertire (2026-11-27); v1.16 — numero sul tavolo quando ha più prenotazioni nel turno; ogni tocco passa alla successiva (2026-11-27); v1.15 — senza un orario toccato la mappa mostra tutto il turno, non più «adesso» (2026-11-27); v1.14 — colori secondo la regola del modulo (blu = azione, indaco scuro = scelto) e caselle dello stato da components/GiroStato (2026-11-26); v1.13 — riconferma WhatsApp: ✓ solo se il messaggio è partito davvero, «?» se WhatsApp è stato solo aperto (2026-11-26); v1.12 — azioni della prenotazione su una riga sola, tasti quadrati col disegno (matita, tavolo +, persona, WhatsApp, ⋯) (2026-11-26); v1.11 — tasto «tavolo +»: si assegnano i tavoli a una prenotazione toccandoli sulla mappa (2026-11-26); v1.10 — stato a quattro caselle in una riga (Prenotato · Confermato · Seduto · Libero): si tocca quella dove deve andare, avanti o indietro; le altre azioni sotto, piccole e uguali (2026-11-26); v1.9 — sul telefono gli orari sono un elenco a tendina (i tasti erano inutilizzabili) (2026-11-26); v1.8 — un tasto solo per lo stato che avanza (Prenotato → Confermato → Seduto → libera il tavolo), «↩» per tornare indietro, gli altri cambi in «Altro» (2026-11-26); v1.7 — riepilogo del turno nella riga sopra la sala (la testata resta su una riga) (2026-11-26); v1.6 — tutti i cambi di stato del Planning (stessi bottoni) e riconferma WhatsApp; testata comune del modulo (components/Testata.jsx) (2026-11-26); v1.5 — nell'elenco le stesse etichette del Planning (canale, stelle, segmento, bollino, no-show, allergie, doppione…), nome che apre la scheda cliente, note in riga (2026-11-26); v1.4 — niente barre di scorrimento (orari a colonne uguali, schede sale, elenco), piantina stretta sui tavoli, «tavoli liberi» solo nelle sale aperte (2026-11-26); v1.3 — nell'ingranaggio «Blocca le prenotazioni online» e «Chiudi servizio» (anche su TheFork), con conferma (2026-11-26); v1.2 — ingranaggio «Modifica servizio» (sale aperte, fasce e online, tavoli del turno) e matita per la sala (2026-11-26); v1.1 — stessa larghezza di pagina di Planning e Mappa, elenco a larghezza fissa e sala che non cambia misura; iPad in piedi: sala sopra, elenco sotto (2026-11-26); v1.0 — vista «Servizio»: elenco del turno e sala nella stessa schermata, striscia degli orari per vedere la sala a un'altra ora, due schede sul telefono (2026-11-26)
// Modulo: prenotazioni
// Idea presa da TheFork Manager (Marco 2026-11-26: «il mix tra prenotazioni e tavoli è una visual molto utile»).
// Non sostituisce Planning né Mappa Tavoli: è una terza vista, da provare in servizio.
// Legge tre cose che esistono già: /prenotazioni/planning/{data} (righe), /prenotazioni/tavoli/mappa/{data}/{turno}
// (piantina) e /prenotazioni/carico/{data}/{turno} (orari, capienza, da-a di ogni prenotazione).
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import PrenotazioniForm from "./PrenotazioniForm";
import StatoBadge from "./components/StatoBadge";
import TheForkInvioBadge from "./components/TheForkInvioBadge";
import FasceTurno from "./components/FasceTurno";
import EtichetteCliente from "./components/EtichetteCliente";
import CanaleBadge from "./components/CanaleBadge";
import ClientiScheda from "../clienti/ClientiScheda";
import usePrenotazioniStati, { azioneStato } from "./components/statiPrenotazioni";
import GiroStato, { passoDi, fuoriGiro, PASSI_STATI } from "./components/GiroStato";
import TestataGiorno, { TastoTestata, TastoNuova } from "./components/Testata";
import { CANVAS_W, CANVAS_H, FormaTavolo, FormaElemento, SchedeSale } from "./components/Piantina";
import { Btn } from "../../components/ui";
import useTelefono from "../../hooks/useTelefono";

const giornoLocale = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minuti = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const nomiTavolo = (t) => String(t || "").replace(/,/g, "+").split("+").map((x) => x.trim()).filter(Boolean);
const nomeDi = (p) => (p.persona_nome || [p.nome, p.cognome].filter(Boolean).join(" ") || (p.canale === "Walk-in" ? "Walk-in" : "Senza nome"));

// Colori del tavolo: diversi anche per chiarezza, non solo per tinta
const COLORI = {
  libero:  { fill: "#ffffff", stroke: "#a3a3a3", text: "#404040" },
  arrivo:  { fill: "#e0e7ff", stroke: "#6366f1", text: "#312e81" },
  seduto:  { fill: "#a7f3d0", stroke: "#047857", text: "#064e3b" },
  scelto:  { fill: "#4338ca", stroke: "#312e81", text: "#ffffff" },
  bloccato: { fill: "#e5e7eb", stroke: "#6b7280", text: "#6b7280" },
};
const LEGENDA = [["libero", "libero"], ["arrivo", "prenotato, deve arrivare"], ["seduto", "al tavolo"], ["scelto", "selezionato"]];


// `soloMappa`: la vista «Mappa» è questa stessa pagina con la sala grande e, accanto, la scheda della prenotazione
// del tavolo toccato (Marco 2026-11-28: «se clicco sul tavolo dovrei avere la stessa visualizzazione di Servizio»).
export default function PrenotazioniServizio({ soloMappa = false }) {
  const { data: paramData, turno: paramTurno } = useParams();
  const navigate = useNavigate();
  const telefono = useTelefono();
  const { gruppo, puo, info } = usePrenotazioniStati();

  const [data, setData] = useState(paramData || giornoLocale());
  const [turno, setTurno] = useState(paramTurno || "cena");
  const [righe, setRighe] = useState([]);
  const [mappa, setMappa] = useState(null);
  const [carico, setCarico] = useState({ orari: [], capienza: 0, intervalli: {} });
  const [loading, setLoading] = useState(true);
  const [sceltaId, setSceltaId] = useState(null);     // prenotazione selezionata
  const [ora, setOra] = useState(null);               // minuto guardato sulla striscia; null = adesso / tutto il turno
  const [sala, setSala] = useState(null);
  const [cerca, setCerca] = useState("");
  const [contatori, setContatori] = useState({});   // coperti di pranzo e cena, accanto ai due tasti del turno
  const [filtro, setFiltro] = useState("tutte");   // filtro rapido dell'elenco: tutte | imminenti | tavolo | senza
  const [scheda, setScheda] = useState(soloMappa ? "mappa" : "elenco");     // solo telefono: elenco | mappa
  const [form, setForm] = useState(null);             // {nuova:{tavolo}} | {modifica: riga}
  const [toast, setToast] = useState(null);
  const [impServizio, setImpServizio] = useState(false);   // ingranaggio: «Modifica servizio» di questo giorno e turno
  const [fasceAperte, setFasceAperte] = useState(false);
  const [rapidi, setRapidi] = useState(null);              // {fasce:[], chiusure:{}} letti quando si apre l'ingranaggio
  const [chiedo, setChiedo] = useState(null);              // "online" | "chiudi": conferma in due tempi
  const [motivo, setMotivo] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [altroAperto, setAltroAperto] = useState(null);       // id della prenotazione con «Altro» aperto
  const [clienteAperto, setClienteAperto] = useState(null);   // scheda cliente aperta dall'elenco, come nel Planning
  const [tfk, setTfk] = useState(null);                       // confronto con TheFork: fasce aperte qui ma non prenotabili lì (solo avviso)
  const [tfkVisto, setTfkVisto] = useState(null);             // «data/turno» per cui l'avviso è stato chiuso
  const [seguono, setSeguono] = useState(null);               // prenotazioni abbinate allo stesso tavolo: spostare anche loro?
  const [sposto, setSposto] = useState(null);                 // {nomi, nome}: «tavolo +» su un altro tavolo quando ne ha già uno → sposta o unisci?
  const [conflitto, setConflitto] = useState(null);           // {nomi, nome, altra}: ho toccato per «tavolo +» un tavolo che è di un'altra prenotazione
  const [assegno, setAssegno] = useState(null);               // {id, nomi:[…]}: sto scegliendo sulla mappa i tavoli di quella prenotazione
  const righeRef = useRef({});

  const flash = (type, text) => { setToast({ type, text }); setTimeout(() => setToast(null), 3000); };

  const carica = useCallback(async () => {
    try {
      const [rp, rm, rc] = await Promise.all([
        apiFetch(`${API_BASE}/prenotazioni/planning/${data}`),
        apiFetch(`${API_BASE}/prenotazioni/tavoli/mappa/${data}/${turno}`),
        apiFetch(`${API_BASE}/prenotazioni/carico/${data}/${turno}`),
      ]);
      if (rp.ok) { const pj = await rp.json(); setRighe(pj[turno] || []); setContatori(pj.contatori || {}); }
      if (rm.ok) setMappa(await rm.json());
      if (rc.ok) setCarico(await rc.json());
    } catch {
      flash("err", "Errore di caricamento");
    }
    setLoading(false);
  }, [data, turno]);

  // Aperta senza turno: pranzo o cena secondo l'ora e la soglia delle Impostazioni
  useEffect(() => {
    if (paramTurno) return;
    apiFetch(`${API_BASE}/prenotazioni/config`).then((r) => (r.ok ? r.json() : null)).then((cfg) => {
      const soglia = cfg?.soglia_pranzo_cena;
      if (soglia && giornoLocale() === data && new Date().toTimeString().slice(0, 5) < soglia) setTurno("pranzo");
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); setOra(null); setSceltaId(null); setAssegno(null); carica(); }, [carica]);
  useEffect(() => { const t = setInterval(carica, 30000); return () => clearInterval(t); }, [carica]);
  useEffect(() => { navigate(`/prenotazioni/${soloMappa ? "mappa" : "servizio"}/${data}/${turno}`, { replace: true }); }, [data, turno, soloMappa]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chi c'è, e quando ──
  const fuori = gruppo("fuori");
  const venuti = gruppo("venuto");
  const attive = useMemo(() => righe.filter((p) => !fuori.includes(p.stato) && p.stato !== "WAITLIST"), [righe, fuori.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const oggi = data === giornoLocale();
  const adessoMin = new Date().getHours() * 60 + new Date().getMinutes();
  const orari = carico.orari || [];
  const inTurno = oggi && orari.length > 0 && adessoMin >= minuti(orari[0].ora) - 60 && adessoMin <= minuti(orari[orari.length - 1].ora) + 180;
  // Senza un orario toccato si vede TUTTO il turno: ogni tavolo assegnato risulta di chi l'ha prenotato
  // (Marco 2026-11-27: la vista «adesso» prima del servizio mostrava la sala vuota e «crea confusione»).
  const guardo = ora;                                                // null = tutto il turno
  const vivo = false;                                                // la vista «adesso» automatica non c'è più
  const tuttoIlTurno = turno === "cena" ? "Tutta la serata" : "Tutto il pranzo";

  const occupaA = useCallback((p, m) => {
    if (m == null) return p.stato !== "LEFT";
    const iv = (carico.intervalli || {})[String(p.id)];
    if (vivo) {
      if (p.stato === "LEFT") return false;
      if (venuti.includes(p.stato)) return true;            // sono seduti: il tavolo è loro finché non escono
    }
    return iv ? iv[0] <= m && m < iv[1] : false;
  }, [carico.intervalli, vivo, venuti.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // tavolo (nome) → prenotazione che lo tiene all'ora guardata
  const chiTiene = useMemo(() => {
    const out = {};
    for (const p of attive) {
      if (!occupaA(p, guardo)) continue;
      for (const n of nomiTavolo(p.tavolo)) if (!out[n] || venuti.includes(p.stato)) out[n] = p;
    }
    return out;
  }, [attive, guardo, occupaA]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confronto con TheFork (solo avviso): alla scelta di giorno e turno e poi ogni 5 minuti; TheFork si chiama dal server
  useEffect(() => {
    let vivo2 = true;
    const leggi = () => apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}/confronto-thefork`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (vivo2) setTfk(d); }).catch(() => {});
    setTfk(null);
    leggi();
    const t = setInterval(leggi, 300000);
    return () => { vivo2 = false; clearInterval(t); };
  }, [data, turno]);
  // «Vuoi bloccare le stesse fasce anche su TRGB?» (Marco 2026-11-27): chiude l'online qui, a TheFork non manda niente
  // aperta=false: chiude in TRGB le fasce ferme su TheFork; aperta=true: riapre in TRGB quelle che TheFork ha riaperto
  const allineaATheFork = async (aperta = false) => {
    const ore = aperta ? tfk?.riapribili : tfk?.non_prenotabili;
    const testo = aperta ? tfk?.riapribili_testo : tfk?.non_prenotabili_testo;
    if (!ore?.length) return;
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ore, online_aperta: aperta, solo_trgb: true, motivo: "come su TheFork Manager" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Fasce non cambiate");
      flash("ok", `Online ${aperta ? "riaperto" : "chiuso"} anche in TRGB: ${testo.join(", ")}`);
      const c = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}/confronto-thefork`);
      if (c.ok) setTfk(await c.json());
      carica();
    } catch (e) { flash("err", e.message || "Errore di connessione"); }
    finally { setLavoro(false); }
  };
  const avvisoTfk = tfk?.controllato && tfkVisto !== `${data}/${turno}` && (tfk.non_prenotabili?.length || tfk.aperte_solo_thefork?.length) ? tfk : null;

  // tavolo (nome) → tutte le prenotazioni del turno su quel tavolo, in ordine d'arrivo: due turni sullo stesso tavolo
  // si segnano con un numero sul tavolo (Marco 2026-11-27)
  const tutteSul = useMemo(() => {
    const out = {};
    // chi è già andato via non conta: il tavolo l'ha lasciato (Marco 2026-11-27: il 5 segnava «3» con uno solo seduto)
    for (const p of attive.filter((x) => x.stato !== "LEFT").sort((a, b) => String(a.ora_pasto).localeCompare(String(b.ora_pasto)))) {
      for (const n of nomiTavolo(p.tavolo)) (out[n] = out[n] || []).push(p);
    }
    return out;
  }, [attive]);

  const scelta = attive.find((p) => p.id === sceltaId) || null;
  const tavoliScelta = new Set(scelta ? nomiTavolo(scelta.tavolo) : []);

  // Un'unione fatta per una prenotazione vale da quando arriva lei: prima (e in «tutto il turno») i suoi tavoli si
  // vedono separati, se nel turno sono anche di qualcun altro; ognuno col bollino di chi segue (Marco 2026-11-28)
  const tuttiTavoli = useMemo(() => (mappa?.tavoli || []).flatMap((t) => {
    if (!t.pezzi?.length || !t.dalle) return [t];
    if (guardo != null && guardo >= minuti(t.dalle)) return [t];
    const insieme = [...t.membri_nomi].sort().join("+");
    const diAltri = t.membri_nomi.some((n) => (tutteSul[n] || []).some((p) => nomiTavolo(p.tavolo).sort().join("+") !== insieme));
    return diAltri ? t.pezzi : [t];
  }), [mappa, guardo, tutteSul]);
  const sale = mappa?.sale?.length ? mappa.sale : [...new Set(tuttiTavoli.map((t) => t.zona || "sala"))];
  const salaAttiva = sala && sale.includes(sala) ? sala : sale[0];
  const tavoli = tuttiTavoli.filter((t) => (t.zona || "sala") === salaAttiva);
  const elementi = (mappa?.elementi || []).filter((e) => (e.zona || "sala") === salaAttiva);
  const nomiDelTavolo = (t) => (t.membri_nomi?.length ? t.membri_nomi : [t.nome]);
  const prenDelTavolo = (t) => nomiDelTavolo(t).map((n) => chiTiene[n]).find(Boolean) || null;
  const turniDelTavolo = (t) => { const visti = new Map(); for (const n of nomiDelTavolo(t)) for (const p of tutteSul[n] || []) visti.set(p.id, p); return [...visti.values()]; };
  const saleAperte = new Set((mappa?.sale_stato || []).filter((x) => x.aperta).map((x) => x.zona));
  const inSalaAperta = (t) => saleAperte.size === 0 || saleAperte.has(t.zona);
  const liberi = tuttiTavoli.filter((t) => inSalaAperta(t) && !prenDelTavolo(t) && t.stato_tavolo !== "BLOCCATO").length;
  // La piantina si stringe su tavoli e arredi della sala (stessa proporzione sempre, 5:3): tavoli più grandi da toccare
  const riquadro = (() => {
    const pezzi = [...tavoli, ...elementi];
    if (!pezzi.length) return `0 0 ${CANVAS_W} ${CANVAS_H}`;
    const x1 = Math.min(...pezzi.map((p) => p.posizione_x)), y1 = Math.min(...pezzi.map((p) => p.posizione_y));
    const x2 = Math.max(...pezzi.map((p) => p.posizione_x + p.larghezza)), y2 = Math.max(...pezzi.map((p) => p.posizione_y + p.altezza));
    const m = 24, prop = CANVAS_W / CANVAS_H;
    let w = x2 - x1 + m * 2, h = y2 - y1 + m * 2;
    if (w / h > prop) h = w / prop; else w = h * prop;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    return `${Math.round(cx - w / 2)} ${Math.round(cy - h / 2)} ${Math.round(w)} ${Math.round(h)}`;
  })();

  // Filtri rapidi (Marco 2026-11-28, come su TheFork Manager): «Imminenti» toglie dall'elenco chi è già arrivato,
  // così restano in vista quelli che devono ancora venire. Un filtro compare solo se ha qualcosa da mostrare.
  const filtriRapidi = useMemo(() => {
    const arrivato = (p) => venuti.includes(p.stato) || p.stato === "LEFT";
    return [
      { k: "tutte", nome: "Tutte", passa: () => true },
      { k: "imminenti", nome: "Imminenti", passa: (p) => !arrivato(p) },
      { k: "tavolo", nome: "Al tavolo", passa: (p) => venuti.includes(p.stato) && p.stato !== "LEFT" },
      { k: "senza", nome: "Senza tavolo", passa: (p) => !nomiTavolo(p.tavolo).length },
    ].map((f) => ({ ...f, quante: attive.filter(f.passa).length }));
  }, [attive, venuti.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtroAttivo = filtriRapidi.find((f) => f.k === filtro && (f.quante > 0 || f.k === "tutte")) || filtriRapidi[0];
  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    // Vista Mappa: accanto alla sala c'è solo la prenotazione scelta (o, senza una scelta, quelle ancora senza tavolo);
    // scrivendo nella ricerca si cerca in tutto il turno
    const base = !soloMappa ? attive.filter(filtroAttivo.passa)
      : q ? attive
      : attive.filter((p) => (sceltaId ? p.id === sceltaId : !nomiTavolo(p.tavolo).length));
    if (!q) return base;
    return base.filter((p) => `${nomeDi(p)} ${p.telefono || ""} ${p.tavolo || ""}`.toLowerCase().includes(q));
  }, [attive, cerca, filtroAttivo.k, venuti.join(), soloMappa, sceltaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const gruppi = useMemo(() => {
    const m = new Map();
    for (const p of filtrate) { const k = String(p.ora_pasto || "").slice(0, 5); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
    return [...m.entries()];
  }, [filtrate]);
  const coperti = attive.reduce((t, p) => t + (p.pax || 0), 0);

  const scegli = (p, daMappa = false) => {
    setSceltaId(p.id);
    const z = tuttiTavoli.find((t) => nomiDelTavolo(t).some((n) => nomiTavolo(p.tavolo).includes(n)))?.zona;
    if (z && sale.includes(z)) setSala(z);
    if (daMappa) setTimeout(() => righeRef.current[p.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };

  const cambiaStato = async (p, stato) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/stato`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato }),
      });
      if (r.ok) { flash("ok", `${nomeDi(p)}: ${info(stato).etichetta}`); carica(); }
      else { const e = await r.json().catch(() => ({})); flash("err", e.detail || "Non riuscito"); }
    } catch { flash("err", "Errore di connessione"); }
  };

  // «Confermato»: il cliente ha confermato che viene. È un segno sulla prenotata, non uno stato (mig 250)
  const segnaConfermata = async (p, valore) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/riconfermata`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valore }),
      });
      if (r.ok) { flash("ok", `${nomeDi(p)}: ${valore ? "Confermato" : info("RECORDED").etichetta}`); carica(); }
      else { const e = await r.json().catch(() => ({})); flash("err", e.detail || "Non riuscito"); }
    } catch { flash("err", "Errore di connessione"); }
  };

  // Il giro in sala di una prenotazione: il passo avanti, il passo indietro e tutti gli altri cambi permessi
  const giro = (p) => {
    const perm = info(p.stato).transizioni || [];
    const va = (a) => perm.includes(a);
    let avanti = null, indietro = null;
    const usati = new Set();
    const passo = (a, label, cls) => { usati.add(a); return { label, cls, fai: () => cambiaStato(p, a) }; };
    if (p.stato === "REQUESTED" && va("RECORDED")) avanti = passo("RECORDED", "✓ Accetta la richiesta", "bg-brand-blue hover:bg-blue-700");
    else if (p.stato === "RECORDED" && !p.riconfermata_at) avanti = { label: "👍 Confermato", cls: "bg-teal-600 hover:bg-teal-700", fai: () => segnaConfermata(p, true) };
    else if (["RECORDED", "ARRIVED", "PARTIALLY_ARRIVED"].includes(p.stato) && va("SEATED")) avanti = passo("SEATED", "✅ Seduto", "bg-emerald-600 hover:bg-emerald-700");
    else if (["SEATED", "BILL"].includes(p.stato) && va("LEFT")) avanti = passo("LEFT", "🚪 Libera il tavolo", "bg-neutral-700 hover:bg-neutral-800");
    if (p.stato === "RECORDED" && p.riconfermata_at) indietro = { label: "Torna a prenotato", corto: "Prenotato", fai: () => segnaConfermata(p, false) };
    else if (["SEATED", "ARRIVED"].includes(p.stato) && va("RECORDED")) { usati.add("RECORDED"); indietro = { label: "Torna indietro: non è ancora seduto", corto: p.riconfermata_at ? "Confermato" : "Prenotato", fai: () => cambiaStato(p, "RECORDED") }; }
    else if (["LEFT", "BILL"].includes(p.stato) && va("SEATED")) { usati.add("SEATED"); indietro = { label: "Torna a seduto", corto: "Seduto", fai: () => cambiaStato(p, "SEATED") }; }
    // «fuoriGiro»: i cambi che non sono una delle quattro caselle (arrivato, al conto, opzione, cancella, no-show, rifiuta)
    return { avanti, indietro, altri: perm.filter((a) => !usati.has(a)), fuoriGiro: fuoriGiro(p.stato, perm) };
  };

  // Riconferma su WhatsApp, come nel Planning: la finestra si apre subito, poi arriva il link
  const riconferma = async (p) => {
    const finestra = window.open("", "_blank");
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/wa-link?tipo=reminder`);
      const d = await r.json();
      if (!r.ok) { finestra && finestra.close(); flash("err", d.detail || "Errore"); return; }
      if (finestra) finestra.location.href = d.link; else window.open(d.link, "_blank");
      await apiFetch(`${API_BASE}/prenotazioni/${p.id}/inviato?tipo=reminder`, { method: "POST" });
      flash("ok", `WhatsApp aperto per ${nomeDi(p)}: la spunta arriva quando il messaggio parte`);
      carica();
    } catch { finestra && finestra.close(); flash("err", "Errore di connessione"); }
  };

  // Apre/chiude una sala per questo giorno e turno (la stessa chiamata del Planning)
  const cambiaSala = async (zona, aperta) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/sale/${encodeURIComponent(zona)}/giorno`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, turno, aperta }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) flash("ok", `${zona} ${aperta ? "aperta" : "chiusa"} a ${turno} · ${d.capienza} posti`);
      else flash("err", d.detail || "Non riuscito");
      carica();
    } catch { flash("err", "Errore di connessione"); }
  };

  // ── Bottoni rapidi dell'ingranaggio (come «Blocca le prenotazioni online» e «Chiudi servizio» di TheFork Manager) ──
  const leggiRapidi = useCallback(async () => {
    try {
      const [rf, rc] = await Promise.all([
        apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}`),
        apiFetch(`${API_BASE}/settings/closures-config/`),
      ]);
      setRapidi({ fasce: rf.ok ? ((await rf.json()).fasce || []) : [], chiusure: rc.ok ? await rc.json() : null });
    } catch { setRapidi({ fasce: [], chiusure: null }); }
  }, [data, turno]);
  useEffect(() => { if (impServizio) { setChiedo(null); setMotivo(""); leggiRapidi(); } }, [impServizio, leggiRapidi]);

  const fasceTurno = rapidi?.fasce || [];
  const onlineTuttoChiuso = fasceTurno.length > 0 && fasceTurno.every((f) => !f.online_aperta);
  const turnoChiusoQui = !!(rapidi?.chiusure?.turni_chiusi || []).find((t) => t.data === data && t.turno === turno);
  const giornoChiuso = (rapidi?.chiusure?.giorni_chiusi || []).includes(data);

  // Spegne (o riaccende) la vendita online di TUTTI gli orari del turno: la stessa scrittura delle fasce, quindi anche su TheFork
  const bloccaOnline = async (aperta) => {
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/fasce/${data}/${turno}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ore: fasceTurno.map((f) => f.ora), online_aperta: aperta }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) flash("err", d.detail || "Non riuscito");
      else {
        const errori = (d.thefork || []).filter((e) => !String(e.esito).startsWith("ok"));
        if (errori.length) flash("err", `TheFork: ${errori.map((e) => e.esito).join(" · ")}`);
        else flash("ok", aperta ? "Online riaperto, anche su TheFork" : "Online bloccato per questo servizio, anche su TheFork");
      }
    } catch { flash("err", "Errore di connessione"); }
    setChiedo(null); setLavoro(false); leggiRapidi(); carica();
  };

  // Chiude (o riapre) questo turno nel calendario chiusure di Vendite: vale per TRGB, sito e online di TheFork
  const chiudiServizio = async (chiudi) => {
    setLavoro(true);
    try {
      const rc = await apiFetch(`${API_BASE}/settings/closures-config/`);
      const cfg = await rc.json();
      const altri = (cfg.turni_chiusi || []).filter((t) => !(t.data === data && t.turno === turno));
      const r = await apiFetch(`${API_BASE}/settings/closures-config/`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, turni_chiusi: chiudi ? [...altri, { data, turno, motivo: motivo.trim() }] : altri }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) flash("ok", chiudi ? `${turno === "pranzo" ? "Pranzo" : "Cena"} chiuso: niente nuove prenotazioni, online spento` : "Servizio riaperto");
      else flash("err", d.detail || "Non riuscito (serve un amministratore)");
    } catch { flash("err", "Errore di connessione"); }
    setChiedo(null); setLavoro(false); leggiRapidi(); carica();
  };

  const titoloGiorno = new Date(`${data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const slotAdesso = inTurno ? [...orari].reverse().find((o) => minuti(o.ora) <= adessoMin)?.ora : null;

  // ── Tavoli scelti sulla mappa (Marco 2026-11-26: «un tavolo con il +, per assegnare i tavoli selezionandoli sulla mappa») ──
  const inAssegno = assegno ? attive.find((x) => x.id === assegno.id) || null : null;
  const apriAssegno = (p) => {
    setSceltaId(p.id); setAltroAperto(null);
    setAssegno({ id: p.id, nomi: nomiTavolo(p.tavolo) });
    if (telefono) setScheda("mappa");
  };
  const toccaPerAssegno = (t, p, bloccato) => {
    if (bloccato) { flash("err", `Il tavolo ${t.nome} è bloccato`); return; }
    const nomi = nomiDelTavolo(t);
    // Tavolo di un altro (Marco 2026-11-27): si chiede se sovrapporre o invertire. Se era già stato sovrapposto, il tocco lo toglie.
    if (p && p.id !== assegno.id && !nomi.every((n) => assegno.nomi.includes(n))) { setConflitto({ nomi, nome: t.nome, altra: p }); return; }
    const gia = nomi.every((n) => assegno.nomi.includes(n));
    // Ha già un tavolo e ne tocco un altro (Marco 2026-11-27: Balestra era al 3, toccato il 7 è diventato «3+7»
    // senza avviso): si chiede una volta se spostarlo o unire i tavoli. Dopo «Unisci» i tocchi aggiungono.
    if (!gia && assegno.nomi.length > 0 && !assegno.unisci) { setSposto({ nomi, nome: t.nome }); return; }
    setAssegno((a) => (!a ? a : gia
      ? { ...a, nomi: a.nomi.filter((n) => !nomi.includes(n)) }
      : { ...a, nomi: [...a.nomi, ...nomi.filter((n) => !a.nomi.includes(n))] }));
  };
  const spostaQui = () => { setAssegno((a) => (!a ? a : { ...a, nomi: [...sposto.nomi] })); setSposto(null); };
  const unisciQui = () => { setAssegno((a) => (!a ? a : { ...a, unisci: true, nomi: [...a.nomi, ...sposto.nomi.filter((n) => !a.nomi.includes(n))] })); setSposto(null); };
  const togliDaAssegno = (n) => setAssegno((a) => (!a ? a : { ...a, nomi: a.nomi.filter((x) => x !== n) }));
  // Sovrapponi: va sul tavolo dell'altro. Se aveva già un tavolo lo lascia (è uno spostamento), a meno che stia unendo.
  const sovrapponi = () => {
    const nomi = conflitto.nomi;
    setAssegno((a) => (!a ? a : { ...a, nomi: a.unisci ? [...a.nomi, ...nomi.filter((n) => !a.nomi.includes(n))] : [...nomi] }));
    setConflitto(null);
  };
  // Inverti: chi sto sistemando prende i tavoli dell'altro, l'altro prende i suoi di prima (o resta senza). Si salva subito.
  const inverti = async () => {
    if (!conflitto || !inAssegno) { setConflitto(null); return; }
    const mio = nomiTavolo(inAssegno.tavolo).join("+"), suo = nomiTavolo(conflitto.altra.tavolo).join("+");
    const metti = async (id, tavolo) => {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/assegna/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tavolo }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Tavolo non assegnato"); }
    };
    setLavoro(true);
    try {
      await metti(inAssegno.id, suo);
      await metti(conflitto.altra.id, mio);
      flash("ok", `${nomeDi(inAssegno)} al ${suo.replace(/\+/g, " + ")} · ${nomeDi(conflitto.altra)} ${mio ? `al ${mio.replace(/\+/g, " + ")}` : "senza tavolo"}`);
      setConflitto(null); setAssegno(null);
    } catch (e) { flash("err", e.message || "Errore di connessione"); }
    finally { setLavoro(false); carica(); }
  };
  const postiAssegno = assegno ? tuttiTavoli.filter((t) => nomiDelTavolo(t).every((n) => assegno.nomi.includes(n))).reduce((tot, t) => tot + (t.posti_max || 0), 0) : 0;
  // Chi condivide con questa prenotazione un tavolo che sto lasciando (doppio turno: finita la prima, il tavolo
  // passa alla seconda). Chi è già andato via non c'è: il suo tavolo resta quello, per lo storico e la consumazione.
  const abbinateAlloSpostamento = () => {
    if (!assegno || !inAssegno) return [];
    const lasciati = nomiTavolo(inAssegno.tavolo).filter((n) => !assegno.nomi.includes(n));
    if (!lasciati.length || !assegno.nomi.length) return [];
    const viste = new Map();
    for (const n of lasciati) for (const x of tutteSul[n] || []) if (x.id !== inAssegno.id) viste.set(x.id, x);
    return [...viste.values()];
  };
  const mettiTavolo = async (id, tavolo) => {
    const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/assegna/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tavolo }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Tavolo non assegnato"); }
  };
  // conAbbinate: undefined = prima volta (se ci sono abbinate si chiede), true = sposta anche loro, false = solo questa
  const salvaAssegno = async (conAbbinate) => {
    if (!assegno || !inAssegno) { setAssegno(null); return; }
    const abbinate = abbinateAlloSpostamento();
    if (abbinate.length && conAbbinate === undefined) { setSeguono(abbinate); return; }
    const tavolo = assegno.nomi.join("+");
    const lasciati = nomiTavolo(inAssegno.tavolo).filter((n) => !assegno.nomi.includes(n));
    const nuovi = assegno.nomi.filter((n) => !nomiTavolo(inAssegno.tavolo).includes(n));
    setSeguono(null);
    setLavoro(true);
    try {
      await mettiTavolo(assegno.id, tavolo);
      if (conAbbinate === true) {
        // ognuna lascia i tavoli lasciati da questa e prende quelli nuovi; gli altri suoi tavoli restano
        for (const x of abbinate) {
          const suoi = nomiTavolo(x.tavolo).filter((n) => !lasciati.includes(n));
          await mettiTavolo(x.id, [...suoi, ...nuovi.filter((n) => !suoi.includes(n))].join("+"));
        }
      }
      flash("ok", (tavolo ? `${nomeDi(inAssegno)}: tavolo ${assegno.nomi.join(" + ")}` : `${nomeDi(inAssegno)}: senza tavolo`)
        + (conAbbinate === true ? ` · con ${abbinate.map(nomeDi).join(", ")}` : ""));
      setAssegno(null);
    } catch (e) { flash("err", e.message || "Errore di connessione"); }
    finally { setLavoro(false); carica(); }
  };

  // ── Pezzi ──
  const Azioni = ({ p }) => {
    const g = giro(p);
    const a = passoDi(p);
    const quieto = "px-3 min-h-[40px] text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50";
    const icona = "w-11 h-11 flex-shrink-0 rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 flex items-center justify-center";
    const SVG = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    return (
    <div className="flex flex-col gap-2">
      {/* Il giro in una riga sola: quattro caselle, quella accesa è dove si trova la prenotazione.
          Si tocca la casella dove deve andare: avanti o indietro, senza altri tasti. */}
      {a >= 0 ? (
        <GiroStato p={p} onFatto={(t) => { flash("ok", `${nomeDi(p)}: ${t}`); carica(); }} onErrore={(t) => { flash("err", t); carica(); }} />
      ) : g.avanti ? (
        <button type="button" onClick={g.avanti.fai} className={`px-4 min-h-[44px] text-sm font-bold text-white rounded-lg ${g.avanti.cls}`}>{g.avanti.label}</button>
      ) : null}
      {/* Sotto, su una riga sola: tasti quadrati col disegno al posto della scritta (Marco 2026-11-26); il nome sta nel title */}
      <div className="flex flex-nowrap gap-1.5">
        {p.stato !== "LEFT" && (
          <button type="button" className={icona} title="Modifica la prenotazione" aria-label="Modifica la prenotazione" onClick={() => setForm({ modifica: p })}>
            <svg aria-hidden="true" {...SVG}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
          </button>
        )}
        {p.stato !== "LEFT" && (
          <button type="button" onClick={() => (assegno?.id === p.id ? setAssegno(null) : apriAssegno(p))} aria-pressed={assegno?.id === p.id}
            title="Assegna i tavoli toccandoli sulla mappa" aria-label="Assegna i tavoli toccandoli sulla mappa"
            className={`${icona} ${assegno?.id === p.id ? "!border-indigo-900 !bg-indigo-900 !text-white" : ""}`}>
            <svg aria-hidden="true" {...SVG}><rect x="2" y="7" width="15" height="6" rx="1.5" /><path d="M5 13v5M14 13v5" /><path d="M20 3v6M17 6h6" /></svg>
          </button>
        )}
        {p.cliente_id && (
          <button type="button" className={icona} title="Scheda del cliente" aria-label="Scheda del cliente" onClick={() => setClienteAperto(p.cliente_id)}>
            <svg aria-hidden="true" {...SVG}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          </button>
        )}
        {p.telefono && ["RECORDED", "REQUESTED"].includes(p.stato) && (
          <button type="button" className={`${icona} relative`} onClick={() => riconferma(p)}
            title={p.reminder_stato === "mandata" ? "Riconferma su WhatsApp (già mandata: reinvia)" : p.reminder_stato === "aperta" ? "WhatsApp aperto, ma il messaggio non risulta mandato: tocca per riprovare" : "Riconferma su WhatsApp"}
            aria-label={p.reminder_stato === "mandata" ? "Riconferma su WhatsApp, già mandata: reinvia" : p.reminder_stato === "aperta" ? "Riconferma su WhatsApp: aperta ma non risulta mandata, riprova" : "Riconferma su WhatsApp"}>
            <svg aria-hidden="true" {...SVG}><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" /></svg>
            {p.reminder_stato === "mandata" && <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] leading-4 text-center font-bold">✓</span>}
            {p.reminder_stato === "aperta" && <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] leading-4 text-center font-bold">?</span>}
          </button>
        )}
        {telefono && (
          <button type="button" className={icona} title={scheda === "elenco" ? "Vedi sulla mappa" : "Torna all'elenco"} aria-label={scheda === "elenco" ? "Vedi sulla mappa" : "Torna all'elenco"}
            onClick={() => setScheda(scheda === "elenco" ? "mappa" : "elenco")}>
            {scheda === "elenco"
              ? <svg aria-hidden="true" {...SVG}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
              : <svg aria-hidden="true" {...SVG}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>}
          </button>
        )}
        {g.fuoriGiro.length > 0 && (
          <button type="button" className={`${icona} ml-auto`} title="Altre azioni" aria-label="Altre azioni" onClick={() => setAltroAperto(altroAperto === p.id ? null : p.id)} aria-expanded={altroAperto === p.id}>
            <svg aria-hidden="true" {...SVG}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
          </button>
        )}
      </div>
      {altroAperto === p.id && (
        <div className="flex flex-wrap gap-1.5">
          {g.fuoriGiro.map((x) => {
            const az = azioneStato(p.stato, x);
            const rosso = ["CANCELED", "NO_SHOW", "REFUSED"].includes(x);
            return <button key={x} type="button" onClick={() => cambiaStato(p, x)}
              className={`px-3 min-h-[40px] text-sm font-medium rounded-lg border bg-white hover:bg-neutral-50 ${rosso ? "border-red-300 text-red-700" : "border-neutral-300 text-neutral-800"}`}>{az.label.replace(/^[^A-Za-zÀ-ú]+/, "")}</button>;
          })}
        </div>
      )}
      {(p.nota_ristorante || p.allergie_segnalate || p.nota_cliente) && (
        <div className="text-xs text-neutral-600">
          {p.allergie_segnalate && <span className="text-red-700 font-medium">Allergie: {p.allergie_segnalate} · </span>}
          {[p.nota_ristorante, p.nota_cliente].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
    );
  };

  const Elenco = (
    <div className="flex flex-col gap-1.5">
      <input type="text" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca: nome, telefono, tavolo" aria-label="Cerca nel turno"
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm min-h-[44px] bg-white" />
      {!soloMappa && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtri rapidi dell'elenco">
        {filtriRapidi.filter((f) => f.k === "tutte" || f.quante > 0).map((f) => (
          <button key={f.k} type="button" aria-pressed={filtroAttivo.k === f.k}
            onClick={() => setFiltro(filtroAttivo.k === f.k ? "tutte" : f.k)}
            className={`px-3 min-h-[44px] rounded-full border text-sm font-medium whitespace-nowrap ${filtroAttivo.k === f.k ? "bg-indigo-900 text-white border-indigo-900" : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50"}`}>
            {f.nome} <span className={`ml-1 tabular-nums ${filtroAttivo.k === f.k ? "text-indigo-100" : "text-neutral-500"}`}>{f.quante}</span>
          </button>
        ))}
      </div>}
      {soloMappa && !sceltaId && !cerca.trim() && <div className="text-sm text-neutral-600 px-0.5">Tocca un tavolo per vedere la sua prenotazione.{gruppi.length > 0 ? " Qui sotto quelle ancora senza tavolo." : ""}</div>}
      {gruppi.length === 0 && !(soloMappa && !sceltaId && !cerca.trim()) && <div className="text-sm text-neutral-500 py-6 text-center">{loading ? "Caricamento…" : "Nessuna prenotazione in questo turno."}</div>}
      {gruppi.map(([o, lista]) => (
        <div key={o} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 pt-1.5 px-0.5">
            <span className="text-[13px] font-bold text-indigo-900">{o}</span>
            <span className="text-xs text-neutral-500">{lista.length} {lista.length === 1 ? "prenotazione" : "prenotazioni"} · {lista.reduce((t, p) => t + (p.pax || 0), 0)} coperti</span>
          </div>
          {lista.map((p) => {
            const sel = p.id === sceltaId;
            return (
              <div key={p.id} ref={(el) => { righeRef.current[p.id] = el; }}
                className={`rounded-xl px-3 py-2.5 flex flex-col gap-2 ${sel ? "bg-indigo-50 border-2 border-indigo-700" : "bg-white border border-neutral-200"}`}>
                {/* Tutta la riga seleziona; il nome apre la scheda cliente. Stesse etichette del Planning (stelle, bollino, allergie…) */}
                <div role="button" tabIndex={0} aria-expanded={sel}
                  onClick={() => (sel ? setSceltaId(null) : scegli(p))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel ? setSceltaId(null) : scegli(p); } }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start text-left min-h-[32px] cursor-pointer">
                  <span className="min-w-0">
                    <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
                      <CanaleBadge canale={p.canale} fonte={p.fonte} />
                      {p.cliente_id ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setClienteAperto(p.cliente_id); }}
                          className="text-[15px] font-semibold text-indigo-800 hover:underline text-left">{nomeDi(p)}</button>
                      ) : <span className="text-[15px] font-semibold">{nomeDi(p)}</span>}
                      {p.vip === 1 && <span title="VIP" className="text-amber-500">★</span>}
                      {p.persona_nome && (p.nome || p.cognome) && <span className="text-xs text-indigo-700">· scheda {[p.nome, p.cognome].filter(Boolean).join(" ")}</span>}
                      <EtichetteCliente pren={p} />
                      <TheForkInvioBadge pren={p} />
                    </span>
                    <span className="block text-xs text-neutral-600 mt-0.5">
                      {p.pax} {p.pax === 1 ? "persona" : "persone"} · {p.tavolo ? <>tavolo <strong className="text-[15px] font-bold text-neutral-900 tabular-nums">{nomiTavolo(p.tavolo).join(" + ")}</strong></> : <span className="text-amber-700 font-medium">senza tavolo</span>}
                      {p.tavolo_esterno === 1 ? " · esterno" : ""}{p.occasione ? ` · ${p.occasione}` : ""}
                    </span>
                    {(p.nota_ristorante || p.nota_cliente) && !sel && <span className="block text-xs text-neutral-500 truncate">{[p.nota_ristorante, p.nota_cliente].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <StatoBadge stato={p.stato} riconfermata={!!p.riconfermata_at} />
                </div>
                {sel && <Azioni p={p} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  // Sul telefono i tasti degli orari sono troppo piccoli da toccare: lì c'è un elenco a tendina
  const ElencoOrari = (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">
      Vedi la sala
      <select value={ora == null ? "" : String(ora)} onChange={(e) => setOra(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full px-3 min-h-[48px] rounded-lg border border-neutral-300 bg-white text-base text-neutral-900 tabular-nums">
        <option value="">{tuttoIlTurno}</option>
        {orari.map((o) => (
          <option key={o.ora} value={minuti(o.ora)}>
            {o.ora} — {o.coperti}{carico.capienza ? `/${carico.capienza}` : ""} coperti · {o.tavoli} tavoli{o.ora === slotAdesso ? " (adesso)" : ""}
          </option>
        ))}
      </select>
    </label>
  );

  const Striscia = telefono ? ElencoOrari : (
    // Tutti gli orari stanno nella riga, a colonne uguali: nessuna barra di scorrimento (né di lato né in verticale)
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(orari.length, 1)}, minmax(0, 1fr))` }}>
      {orari.map((o) => {
        const m = minuti(o.ora);
        const sel = ora === m;
        const eAdesso = o.ora === slotAdesso;
        return (
          <button key={o.ora} type="button" onClick={() => setOra(sel ? null : m)} aria-pressed={sel}
            className={`min-w-0 rounded-lg border px-0.5 py-1.5 flex flex-col items-center gap-0.5 tabular-nums transition overflow-hidden ${
              sel ? "bg-indigo-900 text-white border-indigo-900" : "bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-50"}`}>
            <span className={`text-[10px] font-bold leading-none ${sel ? "text-white" : "text-indigo-700"}`}>{eAdesso ? "adesso" : " "}</span>
            <span className="text-[11px] sm:text-[13px] font-bold leading-tight">{o.ora}</span>
            <span className={`text-[10px] sm:text-[11px] leading-tight ${sel ? "text-indigo-100" : "text-neutral-600"}`}>{o.coperti}{carico.capienza ? <span className="hidden sm:inline">/{carico.capienza}</span> : ""}</span>
            <span className={`hidden sm:block text-[11px] leading-tight whitespace-nowrap ${sel ? "text-indigo-100" : "text-neutral-600"}`}>{o.tavoli} tav.</span>
          </button>
        );
      })}
    </div>
  );

  const Sala = (
    <div className="flex flex-col gap-2">
      {Striscia}
      {/* Riga sempre presente e alta uguale: toccando un orario la sala sotto non si sposta */}
      <div className={`flex items-center justify-between gap-2 text-[13px] rounded-lg pr-1.5 min-h-[48px] border ${inAssegno ? "pl-3 text-indigo-950 bg-indigo-50 border-indigo-700" : ora != null ? "pl-3 text-emerald-900 bg-emerald-50 border-emerald-600" : "pl-0.5 text-neutral-600 bg-transparent border-transparent"}`}>
        {inAssegno ? (
          <>
            <span>Tocca i tavoli per <strong>{nomeDi(inAssegno)}</strong> ({inAssegno.pax} p): {assegno.nomi.length
              ? <>{assegno.nomi.map((n) => (
                  <button key={n} type="button" onClick={() => togliDaAssegno(n)} title={`Togli il tavolo ${n}`} aria-label={`Togli il tavolo ${n}`}
                    className="inline-flex items-center gap-1 mx-0.5 px-2 min-h-[32px] rounded-lg bg-indigo-900 text-white text-sm font-bold align-middle">{n}<span aria-hidden="true" className="font-normal">✕</span></button>
                ))} · {postiAssegno} posti{postiAssegno < (inAssegno.pax || 0) ? " (pochi)" : ""}</>
              : "nessuno scelto"}</span>
            <span className="flex gap-1.5 flex-shrink-0">
              <button type="button" onClick={() => setAssegno(null)} className="px-3 min-h-[36px] rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800">Annulla</button>
              <button type="button" disabled={lavoro} onClick={() => salvaAssegno()} className="px-3 min-h-[36px] rounded-lg bg-brand-blue hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap">{assegno.nomi.length ? "Assegna" : "Togli il tavolo"}</button>
            </span>
          </>
        ) : ora != null ? (
          <>
            <span>Stai guardando la sala <strong>alle {hhmm(ora)}</strong>: {liberi} tavoli liberi. Tocca un tavolo libero per prenotarlo a quell'ora.</span>
            <button type="button" onClick={() => setOra(null)} className="flex-shrink-0 whitespace-nowrap px-3 min-h-[36px] rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800">{tuttoIlTurno}</button>
          </>
        ) : (
          <span><strong className="text-neutral-800">{attive.length} prenotazioni · {coperti} coperti{carico.capienza ? ` su ${carico.capienza}` : ""} · {liberi} tavoli senza prenotazione</strong> · tocca un orario per vedere la sala a quell'ora</span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><SchedeSale sale={sale} attiva={salaAttiva} onChange={setSala}
            aperte={Object.fromEntries((mappa?.sale_stato || []).map((x) => [x.zona, !!x.aperta]))} /></div>
        {/* La matita: la sala di QUESTO turno nella Mappa Tavoli (sposta, unisci, blocca); la piantina fissa non cambia */}
        <button type="button" title={`Modifica la sala ${salaAttiva || ""} per questo turno`} aria-label="Modifica la sala per questo turno"
          onClick={() => navigate(`/prenotazioni/mappa/${data}/${turno}?sposta=1${salaAttiva ? `&sala=${encodeURIComponent(salaAttiva)}` : ""}`)}
          className="flex-shrink-0 w-11 h-11 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center justify-center text-neutral-700">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
        </button>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <svg viewBox={riquadro} className="w-full h-auto block" role="img" aria-label={`Sala ${salaAttiva}`}>
          {elementi.map((e) => <FormaElemento key={`e${e.id}`} e={e} />)}
          {tavoli.map((t) => {
            const p = prenDelTavolo(t);
            const bloccato = !p && t.stato_tavolo === "BLOCCATO";
            const turni = turniDelTavolo(t);
            // chi viene dopo su questo tavolo: l'etichetta bordata sotto il tavolo
            const dopo = p ? turni.find((x) => x.id !== p.id && String(x.ora_pasto) > String(p.ora_pasto)) : null;
            const eScelto = assegno
              ? nomiDelTavolo(t).every((n) => assegno.nomi.includes(n))
              : nomiDelTavolo(t).some((n) => tavoliScelta.has(n)) && (!p || p.id === sceltaId || (guardo == null && turni.some((x) => x.id === sceltaId)));
            const c = COLORI[eScelto ? "scelto" : bloccato ? "bloccato" : !p ? "libero" : venuti.includes(p.stato) ? "seduto" : "arrivo"];
            const cx = t.posizione_x + t.larghezza / 2;
            const cy = t.posizione_y + t.altezza / 2;
            return (
              <g key={t.id} style={{ cursor: bloccato ? "default" : "pointer" }}
                onClick={() => {
                  if (assegno) toccaPerAssegno(t, p, bloccato);
                  else if (p && guardo == null && turni.length > 1) {
                    // più prenotazioni sullo stesso tavolo: ogni tocco passa alla successiva
                    const i = turni.findIndex((x) => x.id === sceltaId);
                    scegli(turni[(i + 1) % turni.length], true);
                  }
                  else if (p) scegli(p, true);
                  else if (!bloccato) setForm({ nuova: { tavolo: nomiDelTavolo(t).join("+") } });
                }}>
                <FormaTavolo t={t} fill={c.fill} stroke={c.stroke} strokeWidth={eScelto ? 3 : 1.5} dash={bloccato ? "4 2" : "none"} />
                <text x={cx} y={p ? cy - 13 : cy} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="bold" fill={c.text} className="select-none pointer-events-none">{t.nome}</text>
                {p && <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill={c.text} className="select-none pointer-events-none">{(p.cognome || nomeDi(p)).slice(0, Math.max(7, Math.floor(t.larghezza / 5.5)))}</text>}
                {/* persone e ora sul tavolo, come su TheFork Manager (Marco 2026-11-28: «i ragazzi lo trovano comodo») */}
                {p && (
                  <g className="pointer-events-none">
                    <rect x={cx - 20} y={cy + 5} width="40" height="13" rx="3" fill="#111111" />
                    <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="bold" fill="#ffffff" className="select-none">{p.pax}p {String(p.ora_pasto).slice(0, 5)}</text>
                  </g>
                )}
                {dopo && (
                  <g className="pointer-events-none">
                    <rect x={cx - 31} y={t.posizione_y + t.altezza - 3} width="62" height="13" rx="3" fill="#ffffff" stroke="#b91c1c" strokeWidth="1.2" />
                    <text x={cx} y={t.posizione_y + t.altezza + 4} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="bold" fill="#991b1b" className="select-none">{(dopo.cognome || nomeDi(dopo)).slice(0, 7)} {dopo.pax}p {String(dopo.ora_pasto).slice(0, 5)}</text>
                  </g>
                )}
                {turni.length > 1 && (
                  <g className="pointer-events-none">
                    <title>{turni.map((x) => `${String(x.ora_pasto).slice(0, 5)} ${nomeDi(x)}`).join(" · ")}</title>
                    <circle cx={t.posizione_x + t.larghezza - 3} cy={t.posizione_y + 3} r="9" fill="#111111" stroke="#ffffff" strokeWidth="1.5" />
                    <text x={t.posizione_x + t.larghezza - 3} y={t.posizione_y + 3.5} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="bold" fill="#ffffff" className="select-none">{turni.length}</text>
                  </g>
                )}
                {!p && !bloccato && <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={c.text} className="select-none pointer-events-none">{t.posti_max} p</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {LEGENDA.map(([k, t]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-3.5 h-3.5 rounded-lg" style={{ background: COLORI[k].fill, border: `2px solid ${COLORI[k].stroke}` }} />{t}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-ink text-white text-[10px] font-bold">2</span>più prenotazioni sullo stesso tavolo (tocca per passare dall'una all'altra)
        </span>
      </div>
      {telefono && scelta && (
        <div className="rounded-xl px-3 py-2.5 bg-indigo-50 border-2 border-indigo-700 flex flex-col gap-2">
          <div className="text-[15px] font-semibold">{nomeDi(scelta)} · {String(scelta.ora_pasto).slice(0, 5)} · {scelta.pax} p{scelta.tavolo ? ` · tavolo ${nomiTavolo(scelta.tavolo).join(" + ")}` : ""}</div>
          <Azioni p={scelta} />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="servizio" />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        {toast && <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{toast.text}</div>}
        {avvisoTfk && (
          <div role="status" className="mb-3 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm flex items-start justify-between gap-3">
            <div>
              {avvisoTfk.non_prenotabili.length > 0 && (
                <div>
                  <strong>TheFork: {avvisoTfk.tutto_fermo ? `online non si può prenotare per ${turno === "cena" ? "questa cena" : "questo pranzo"}` : `online non prenotabili ${avvisoTfk.non_prenotabili_testo.join(", ")}`}</strong>
                  {" "}(fermate da TheFork Manager, oppure al completo). In TRGB queste fasce risultano aperte.
                </div>
              )}
              {avvisoTfk.aperte_solo_thefork.length > 0 && (
                <div><strong>TheFork: online si può prenotare alle {avvisoTfk.aperte_solo_thefork_testo.join(", ")}</strong>, che in TRGB hai chiuso.</div>
              )}
              {avvisoTfk.non_prenotabili.length > 0 ? (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Vuoi bloccare le stesse fasce anche su TRGB?</span>
                  <button type="button" disabled={lavoro} onClick={() => allineaATheFork(false)} className="px-4 min-h-[40px] rounded-lg bg-brand-blue text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">Sì</button>
                  <button type="button" onClick={() => setTfkVisto(`${data}/${turno}`)} className="px-4 min-h-[40px] rounded-lg border border-neutral-300 bg-white text-neutral-800 text-sm font-semibold hover:bg-neutral-50">No</button>
                  <span className="text-xs text-amber-800">Con «Sì» l'online si chiude solo qui: a TheFork non viene mandato niente.</span>
                </div>
              ) : avvisoTfk.riapribili?.length > 0 ? (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Vuoi riaprire le stesse fasce anche su TRGB?</span>
                  <button type="button" disabled={lavoro} onClick={() => allineaATheFork(true)} className="px-4 min-h-[40px] rounded-lg bg-brand-blue text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">Sì</button>
                  <button type="button" onClick={() => setTfkVisto(`${data}/${turno}`)} className="px-4 min-h-[40px] rounded-lg border border-neutral-300 bg-white text-neutral-800 text-sm font-semibold hover:bg-neutral-50">No</button>
                  <span className="text-xs text-amber-800">Con «Sì» l'online si riapre solo qui ({avvisoTfk.riapribili_testo.join(", ")}): a TheFork non viene mandato niente.</span>
                </div>
              ) : (
                <div className="text-xs text-amber-800 mt-0.5">È solo un avviso: TRGB non cambia niente né qui né su TheFork.</div>
              )}
            </div>
            <button type="button" onClick={() => setTfkVisto(`${data}/${turno}`)} aria-label="Chiudi l'avviso" className="flex-shrink-0 w-9 h-9 rounded-lg hover:bg-amber-100 text-amber-900">✕</button>
          </div>
        )}

        <TestataGiorno data={data} onData={setData} turno={turno} onTurno={setTurno} vista={soloMappa ? "mappa" : "servizio"} corto={telefono}
          totali={{ pranzo: contatori.pranzo_pax, cena: contatori.cena_pax }}
          destra={<>
            <TastoNuova onClick={() => setForm({ nuova: {} })} />
          </>}>
          <TastoTestata onClick={() => setImpServizio(true)} title="Modifica questo servizio: sale aperte, fasce orarie e online" aria-label="Modifica questo servizio">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </TastoTestata>
        </TestataGiorno>

        {telefono ? (
          <>
            <div className="flex rounded-xl border border-neutral-400 overflow-hidden mb-3">
              {[["elenco", "Elenco"], ["mappa", "Mappa"]].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setScheda(k)} aria-pressed={scheda === k}
                  className={`flex-1 min-h-[48px] text-[15px] ${scheda === k ? "bg-indigo-900 text-white font-bold" : "bg-white text-neutral-700"}`}>{t}</button>
              ))}
            </div>
            {scheda === "elenco" ? Elenco : Sala}
          </>
        ) : (
          // iPad orizzontale e computer: elenco a larghezza fissa e sala accanto, così la sala non cambia misura
          // da un turno all'altro. Nessun riquadro con la sua barra: se l'elenco è lungo scorre la pagina e la sala
          // resta ferma in vista. iPad in piedi: sala sopra, elenco sotto.
          soloMappa ? (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
              <div className="min-w-0">{Sala}</div>
              <div className="lg:sticky lg:top-3">{Elenco}</div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
            <div className="order-2 lg:order-1">{Elenco}</div>
            <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-3">{Sala}</div>
          </div>
          )
        )}
      </div>

      {clienteAperto && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-0 sm:p-4 overflow-y-auto" onClick={() => { setClienteAperto(null); carica(); }}>
          <div className="bg-white w-full sm:max-w-5xl sm:rounded-2xl shadow-xl p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setClienteAperto(null); carica(); }} className="mb-2 text-sm text-indigo-700 font-medium min-h-[44px]">← Torna al servizio</button>
            <ClientiScheda clienteId={clienteAperto} embedded onClose={() => { setClienteAperto(null); carica(); }} />
          </div>
        </div>
      )}
      {seguono && inAssegno && assegno && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-3" onClick={() => setSeguono(null)}>
          <div role="dialog" aria-label="Sposto anche le prenotazioni abbinate" className="bg-white w-full max-w-md rounded-2xl shadow-xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-lg font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Sul tavolo {nomiTavolo(inAssegno.tavolo).join(" + ")} c'è anche {seguono.map(nomeDi).join(", ")}</div>
              <div className="text-sm text-neutral-600">
                {seguono.map((x) => `${nomeDi(x)} · ${String(x.ora_pasto).slice(0, 5)} · ${x.pax} p`).join(" — ")}.
                Stai spostando {nomeDi(inAssegno)} al {assegno.nomi.join(" + ")}.
              </div>
            </div>
            <button type="button" disabled={lavoro} onClick={() => salvaAssegno(true)} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50">
              <span className="block text-[15px] font-bold text-neutral-900">{seguono.length > 1 ? "Sposta tutte" : "Sposta tutte e due"} al {assegno.nomi.join(" + ")}</span>
              <span className="block text-sm text-neutral-600">Il tavolo resta abbinato: finita una, passa all'altra.</span>
            </button>
            <button type="button" disabled={lavoro} onClick={() => salvaAssegno(false)} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50">
              <span className="block text-[15px] font-bold text-neutral-900">Solo {nomeDi(inAssegno)}</span>
              <span className="block text-sm text-neutral-600">{seguono.map(nomeDi).join(", ")} {seguono.length > 1 ? "restano" : "resta"} al {nomiTavolo(inAssegno.tavolo).join(" + ")}.</span>
            </button>
            <button type="button" onClick={() => setSeguono(null)} className="self-end px-4 min-h-[44px] rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100">Annulla</button>
          </div>
        </div>
      )}
      {sposto && inAssegno && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-3" onClick={() => setSposto(null)}>
          <div role="dialog" aria-label="Sposta o unisci" className="bg-white w-full max-w-md rounded-2xl shadow-xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-lg font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{nomeDi(inAssegno)} è già al {assegno.nomi.join(" + ")}</div>
              <div className="text-sm text-neutral-600">Hai toccato il {sposto.nome}. Cosa faccio?</div>
            </div>
            <button type="button" onClick={spostaQui} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50">
              <span className="block text-[15px] font-bold text-neutral-900">Sposta al {sposto.nome}</span>
              <span className="block text-sm text-neutral-600">Lascia il {assegno.nomi.join(" + ")} e va al {sposto.nome}.</span>
            </button>
            <button type="button" onClick={unisciQui} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50">
              <span className="block text-[15px] font-bold text-neutral-900">Unisci: {[...assegno.nomi, ...sposto.nomi.filter((n) => !assegno.nomi.includes(n))].join(" + ")}</span>
              <span className="block text-sm text-neutral-600">Tiene tutti i tavoli insieme, per una tavolata.</span>
            </button>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-500">Poi premi «Assegna» per salvare.</span>
              <button type="button" onClick={() => setSposto(null)} className="px-4 min-h-[44px] rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100">Annulla</button>
            </div>
          </div>
        </div>
      )}
      {conflitto && inAssegno && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-3" onClick={() => setConflitto(null)}>
          <div role="dialog" aria-label="Tavolo occupato" className="bg-white w-full max-w-md rounded-2xl shadow-xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-lg font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Il tavolo {conflitto.nome} è di {nomeDi(conflitto.altra)}</div>
              <div className="text-sm text-neutral-600">{String(conflitto.altra.ora_pasto).slice(0, 5)} · {conflitto.altra.pax} persone{conflitto.altra.tavolo ? ` · tavolo ${nomiTavolo(conflitto.altra.tavolo).join(" + ")}` : ""}. Cosa faccio con {nomeDi(inAssegno)} ({String(inAssegno.ora_pasto).slice(0, 5)}, {inAssegno.pax} p)?</div>
            </div>
            <button type="button" disabled={lavoro} onClick={sovrapponi} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50">
              <span className="block text-[15px] font-bold text-neutral-900">Sovrapponi</span>
              <span className="block text-sm text-neutral-600">Tutti e due sul {conflitto.nome} (per esempio uno dopo l'altro){assegno.nomi.length && !assegno.unisci ? `: lascia il ${assegno.nomi.join(" + ")}` : ""}. Poi premi «Assegna».</span>
            </button>
            <button type="button" disabled={lavoro} onClick={inverti} className="text-left px-3 py-2.5 min-h-[56px] rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50">
              <span className="block text-[15px] font-bold text-neutral-900">Inverti</span>
              <span className="block text-sm text-neutral-600">{nomeDi(inAssegno)} va al {nomiTavolo(conflitto.altra.tavolo).join(" + ")}; {nomeDi(conflitto.altra)} {nomiTavolo(inAssegno.tavolo).length ? `va al ${nomiTavolo(inAssegno.tavolo).join(" + ")}` : "resta senza tavolo"}. Si salva subito.</span>
            </button>
            <button type="button" onClick={() => setConflitto(null)} className="self-end px-4 min-h-[44px] rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100">Annulla</button>
          </div>
        </div>
      )}
      {impServizio && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4" onClick={() => setImpServizio(false)}>
          <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-xl max-h-screen sm:max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <div>
                <h2 className="text-lg font-bold">Modifica servizio</h2>
                <div className="text-sm text-neutral-600 capitalize">{titoloGiorno} · {turno} · {attive.length} prenotazioni · {coperti} coperti</div>
              </div>
              <button type="button" onClick={() => setImpServizio(false)} aria-label="Chiudi" className="w-11 h-11 rounded-lg hover:bg-neutral-100 text-xl">✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-5">
              <section>
                <h3 className="text-sm font-bold mb-1">Sale e tavoli</h3>
                <p className="text-xs text-neutral-600 mb-2">Apri o chiudi una sala solo per questo servizio: la capienza si ricalcola dai suoi tavoli.</p>
                <div className="flex flex-col divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                  {(mappa?.sale_stato || []).map((s) => (
                    <div key={s.zona} className="flex items-center justify-between gap-3 px-3 py-2 min-h-[52px]">
                      <div>
                        <div className="text-[15px] font-semibold">{s.zona}</div>
                        <div className="text-xs text-neutral-600">{s.tavoli} tavoli · fino a {s.posti_max} posti{s.eccezione ? " · cambiata per questo servizio" : ""}</div>
                      </div>
                      <button type="button" role="switch" aria-checked={!!s.aperta} aria-label={`Sala ${s.zona}`} onClick={() => cambiaSala(s.zona, !s.aperta)}
                        className={`relative w-14 h-8 rounded-full transition flex-shrink-0 ${s.aperta ? "bg-indigo-900" : "bg-neutral-300"}`}>
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${s.aperta ? "left-7" : "left-1"}`} />
                      </button>
                    </div>
                  ))}
                  {!(mappa?.sale_stato || []).length && <div className="px-3 py-3 text-sm text-neutral-500">Nessuna sala.</div>}
                </div>
                <div className="text-xs text-neutral-600 mt-1.5">Capienza del servizio: <strong>{carico.capienza || "—"}</strong> posti · durata del pasto di regola: <strong>{carico.durata_regola ? `${Math.floor(carico.durata_regola / 60)} h${carico.durata_regola % 60 ? ` ${carico.durata_regola % 60} min` : ""}` : "—"}</strong></div>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1">Fasce orarie e online</h3>
                <p className="text-xs text-neutral-600 mb-2">Apri o chiudi un orario, metti un limite di coperti, accendi o spegni la vendita online (scritta anche su TheFork).</p>
                <Btn size="md" variant="secondary" onClick={() => { setImpServizio(false); setFasceAperte(true); }}>Apri le fasce di questo servizio</Btn>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1">Tavoli di questo servizio</h3>
                <p className="text-xs text-neutral-600 mb-2">Sposta, unisci, dividi o blocca i tavoli solo per questo turno.</p>
                <Btn size="md" variant="secondary" onClick={() => navigate(`/prenotazioni/mappa/${data}/${turno}?sposta=1${salaAttiva ? `&sala=${encodeURIComponent(salaAttiva)}` : ""}`)}>Apri la Mappa Tavoli</Btn>
              </section>
              <section>
                <h3 className="text-sm font-bold mb-1">Blocca o chiudi</h3>
                <div className="flex flex-col gap-3">
                  <div className="border border-neutral-200 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                    <div className="text-[15px] font-semibold">Prenotazioni online {onlineTuttoChiuso ? "bloccate" : "aperte"}</div>
                    <p className="text-xs text-neutral-600">Blocca tutti gli orari di questo servizio su TheFork e sul sito. Al telefono si continua a prenotare.</p>
                    {chiedo === "online" ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">Bloccare l'online di tutto il {turno}?</span>
                        <Btn size="md" variant="danger" loading={lavoro} onClick={() => bloccaOnline(false)}>Sì, blocca</Btn>
                        <Btn size="md" variant="secondary" onClick={() => setChiedo(null)}>Annulla</Btn>
                      </div>
                    ) : onlineTuttoChiuso ? (
                      <div><Btn size="md" variant="secondary" loading={lavoro} onClick={() => bloccaOnline(true)}>Riapri le prenotazioni online</Btn></div>
                    ) : (
                      <div><Btn size="md" variant="secondary" disabled={!fasceTurno.length} onClick={() => setChiedo("online")}>Blocca le prenotazioni online</Btn></div>
                    )}
                  </div>
                  <div className="border border-neutral-200 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                    <div className="text-[15px] font-semibold">Servizio {turnoChiusoQui || giornoChiuso ? "chiuso" : "aperto"}</div>
                    <p className="text-xs text-neutral-600">Chiude questo turno: non si inseriscono nuove prenotazioni e l'online si spegne su TheFork e sul sito. Le prenotazioni già prese restano. Serve un amministratore.</p>
                    {giornoChiuso ? (
                      <p className="text-xs text-neutral-700">Tutto il giorno è chiuso dal calendario: si riapre da Vendite › Chiusure.</p>
                    ) : turnoChiusoQui ? (
                      <div><Btn size="md" variant="secondary" loading={lavoro} onClick={() => chiudiServizio(false)}>Riapri il servizio</Btn></div>
                    ) : chiedo === "chiudi" ? (
                      <div className="flex flex-col gap-2">
                        {attive.length > 0 && <span className="text-sm text-amber-800">Ci sono {attive.length} prenotazioni ({coperti} coperti): restano, vanno avvisate a parte.</span>}
                        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (facoltativo)" aria-label="Motivo della chiusura"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm min-h-[44px]" />
                        <div className="flex gap-2">
                          <Btn size="md" variant="danger" loading={lavoro} onClick={() => chiudiServizio(true)}>Sì, chiudi il {turno}</Btn>
                          <Btn size="md" variant="secondary" onClick={() => setChiedo(null)}>Annulla</Btn>
                        </div>
                      </div>
                    ) : (
                      <div><Btn size="md" variant="secondary" disabled={!rapidi?.chiusure} onClick={() => setChiedo("chiudi")}>Chiudi servizio</Btn></div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {fasceAperte && <FasceTurno data={data} turno={turno} onClose={() => setFasceAperte(false)} onChange={carica} />}

      {form && (
        <PrenotazioniForm
          {...(form.modifica ? { prenotazione: form.modifica } : {
            defaultData: data, defaultTurno: turno, defaultTavolo: form.nuova.tavolo || "",
            defaultOra: ora != null ? hhmm(ora) : (slotAdesso || undefined),
          })}
          onClose={() => setForm(null)}
          onSuccess={() => { setForm(null); carica(); flash("ok", form.modifica ? "Prenotazione aggiornata" : "Prenotazione salvata"); }}
        />
      )}
    </div>
  );
}
