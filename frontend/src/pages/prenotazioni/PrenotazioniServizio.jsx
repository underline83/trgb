// @version: v1.11 — tasto «tavolo +»: si assegnano i tavoli a una prenotazione toccandoli sulla mappa (2026-11-26); v1.10 — stato a quattro caselle in una riga (Prenotato · Confermato · Seduto · Libero): si tocca quella dove deve andare, avanti o indietro; le altre azioni sotto, piccole e uguali (2026-11-26); v1.9 — sul telefono gli orari sono un elenco a tendina (i tasti erano inutilizzabili) (2026-11-26); v1.8 — un tasto solo per lo stato che avanza (Prenotato → Confermato → Seduto → libera il tavolo), «↩» per tornare indietro, gli altri cambi in «Altro» (2026-11-26); v1.7 — riepilogo del turno nella riga sopra la sala (la testata resta su una riga) (2026-11-26); v1.6 — tutti i cambi di stato del Planning (stessi bottoni) e riconferma WhatsApp; testata comune del modulo (components/Testata.jsx) (2026-11-26); v1.5 — nell'elenco le stesse etichette del Planning (canale, stelle, segmento, bollino, no-show, allergie, doppione…), nome che apre la scheda cliente, note in riga (2026-11-26); v1.4 — niente barre di scorrimento (orari a colonne uguali, schede sale, elenco), piantina stretta sui tavoli, «tavoli liberi» solo nelle sale aperte (2026-11-26); v1.3 — nell'ingranaggio «Blocca le prenotazioni online» e «Chiudi servizio» (anche su TheFork), con conferma (2026-11-26); v1.2 — ingranaggio «Modifica servizio» (sale aperte, fasce e online, tavoli del turno) e matita per la sala (2026-11-26); v1.1 — stessa larghezza di pagina di Planning e Mappa, elenco a larghezza fissa e sala che non cambia misura; iPad in piedi: sala sopra, elenco sotto (2026-11-26); v1.0 — vista «Servizio»: elenco del turno e sala nella stessa schermata, striscia degli orari per vedere la sala a un'altra ora, due schede sul telefono (2026-11-26)
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

// Il giro di una prenotazione in sala, come lo dice Marco: prenota, conferma, si siede, va via
const PASSI = [
  { nome: "Prenotato", acceso: "bg-indigo-700" },
  { nome: "Confermato", acceso: "bg-teal-700" },
  { nome: "Seduto", acceso: "bg-emerald-700" },
  { nome: "Libero", acceso: "bg-neutral-700" },
];
const PASSI_STATI = ["RECORDED", "ARRIVED", "SEATED", "BILL", "PARTIALLY_ARRIVED", "LEFT"];

export default function PrenotazioniServizio() {
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
  const [scheda, setScheda] = useState("elenco");     // solo telefono: elenco | mappa
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
      if (rp.ok) setRighe((await rp.json())[turno] || []);
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
  useEffect(() => { navigate(`/prenotazioni/servizio/${data}/${turno}`, { replace: true }); }, [data, turno]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chi c'è, e quando ──
  const fuori = gruppo("fuori");
  const venuti = gruppo("venuto");
  const attive = useMemo(() => righe.filter((p) => !fuori.includes(p.stato) && p.stato !== "WAITLIST"), [righe, fuori.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const oggi = data === giornoLocale();
  const adessoMin = new Date().getHours() * 60 + new Date().getMinutes();
  const orari = carico.orari || [];
  const inTurno = oggi && orari.length > 0 && adessoMin >= minuti(orari[0].ora) - 60 && adessoMin <= minuti(orari[orari.length - 1].ora) + 180;
  const guardo = ora != null ? ora : (inTurno ? adessoMin : null);   // null = tutto il turno
  const vivo = ora == null && inTurno;                               // sto guardando «adesso»

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

  const scelta = attive.find((p) => p.id === sceltaId) || null;
  const tavoliScelta = new Set(scelta ? nomiTavolo(scelta.tavolo) : []);

  const tuttiTavoli = mappa?.tavoli || [];
  const sale = mappa?.sale?.length ? mappa.sale : [...new Set(tuttiTavoli.map((t) => t.zona || "sala"))];
  const salaAttiva = sala && sale.includes(sala) ? sala : sale[0];
  const tavoli = tuttiTavoli.filter((t) => (t.zona || "sala") === salaAttiva);
  const elementi = (mappa?.elementi || []).filter((e) => (e.zona || "sala") === salaAttiva);
  const nomiDelTavolo = (t) => (t.membri_nomi?.length ? t.membri_nomi : [t.nome]);
  const prenDelTavolo = (t) => nomiDelTavolo(t).map((n) => chiTiene[n]).find(Boolean) || null;
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

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return attive;
    return attive.filter((p) => `${nomeDi(p)} ${p.telefono || ""} ${p.tavolo || ""}`.toLowerCase().includes(q));
  }, [attive, cerca]);
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
    if (p.stato === "REQUESTED" && va("RECORDED")) avanti = passo("RECORDED", "✓ Accetta la richiesta", "bg-indigo-600 hover:bg-indigo-700");
    else if (p.stato === "RECORDED" && !p.riconfermata_at) avanti = { label: "👍 Confermato", cls: "bg-teal-600 hover:bg-teal-700", fai: () => segnaConfermata(p, true) };
    else if (["RECORDED", "ARRIVED", "PARTIALLY_ARRIVED"].includes(p.stato) && va("SEATED")) avanti = passo("SEATED", "✅ Seduto", "bg-emerald-600 hover:bg-emerald-700");
    else if (["SEATED", "BILL"].includes(p.stato) && va("LEFT")) avanti = passo("LEFT", "🚪 Libera il tavolo", "bg-neutral-700 hover:bg-neutral-800");
    if (p.stato === "RECORDED" && p.riconfermata_at) indietro = { label: "Torna a prenotato", corto: "Prenotato", fai: () => segnaConfermata(p, false) };
    else if (["SEATED", "ARRIVED"].includes(p.stato) && va("RECORDED")) { usati.add("RECORDED"); indietro = { label: "Torna indietro: non è ancora seduto", corto: p.riconfermata_at ? "Confermato" : "Prenotato", fai: () => cambiaStato(p, "RECORDED") }; }
    else if (["LEFT", "BILL"].includes(p.stato) && va("SEATED")) { usati.add("SEATED"); indietro = { label: "Torna a seduto", corto: "Seduto", fai: () => cambiaStato(p, "SEATED") }; }
    // «fuoriGiro»: i cambi che non sono una delle quattro caselle (arrivato, al conto, opzione, cancella, no-show, rifiuta)
    const delGiro = ["RECORDED", "SEATED", "LEFT"];
    return { avanti, indietro, altri: perm.filter((a) => !usati.has(a)), fuoriGiro: perm.filter((a) => !delGiro.includes(a) || !PASSI_STATI.includes(p.stato)) };
  };

  // In che casella del giro si trova (−1 = fuori dal giro: richiesta, opzione, lista d'attesa…)
  const passoDi = (p) => {
    if (p.stato === "RECORDED") return p.riconfermata_at ? 1 : 0;
    if (p.stato === "ARRIVED") return 1;
    if (["SEATED", "PARTIALLY_ARRIVED"].includes(p.stato)) return 2;
    if (["LEFT", "BILL"].includes(p.stato)) return 3;   // «Al conto» non si usa: se arriva, vale come libero
    return -1;
  };

  // Porta la prenotazione alla casella toccata, anche saltando o tornando indietro di più passi:
  // fa in fila i cambi che servono (es. da «Libero» a «Prenotato»: prima seduto, poi prenotato).
  const vaiAlPasso = async (p, k) => {
    const cambia = async (stato) => {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/stato`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Non riuscito"); }
    };
    const segno = async (valore) => {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/riconfermata`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valore }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Non riuscito"); }
    };
    setLavoro(true);
    try {
      let st = p.stato;
      if (k <= 1) {                                   // Prenotato o Confermato: lo stato è «prenotata»
        if (st === "LEFT") { await cambia("SEATED"); st = "SEATED"; }
        if (st === "BILL") { await cambia("SEATED"); st = "SEATED"; }
        if (st !== "RECORDED") await cambia("RECORDED");
        await segno(k === 1);
      } else if (k === 2) {                           // Seduto
        if (st !== "SEATED") await cambia("SEATED");
      } else {                                        // Libero
        if (!["SEATED", "BILL"].includes(st)) await cambia("SEATED");
        await cambia("LEFT");
      }
      flash("ok", `${nomeDi(p)}: ${PASSI[k].nome}`);
    } catch (e) { flash("err", e.message || "Errore di connessione"); }
    setLavoro(false);
    carica();
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
      flash("ok", `Riconferma aperta su WhatsApp per ${nomeDi(p)}`);
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
    if (p && p.id !== assegno.id) { flash("err", `Il tavolo ${t.nome} è di ${nomeDi(p)}`); return; }
    const nomi = nomiDelTavolo(t);
    setAssegno((a) => (!a ? a : nomi.every((n) => a.nomi.includes(n))
      ? { ...a, nomi: a.nomi.filter((n) => !nomi.includes(n)) }
      : { ...a, nomi: [...a.nomi, ...nomi.filter((n) => !a.nomi.includes(n))] }));
  };
  const postiAssegno = assegno ? tuttiTavoli.filter((t) => nomiDelTavolo(t).every((n) => assegno.nomi.includes(n))).reduce((tot, t) => tot + (t.posti_max || 0), 0) : 0;
  const salvaAssegno = async () => {
    if (!assegno || !inAssegno) { setAssegno(null); return; }
    const tavolo = assegno.nomi.join("+");
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/assegna/${assegno.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tavolo }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Tavolo non assegnato"); }
      flash("ok", tavolo ? `${nomeDi(inAssegno)}: tavolo ${assegno.nomi.join(" + ")}` : `${nomeDi(inAssegno)}: senza tavolo`);
      setAssegno(null);
      await carica();
    } catch (e) { flash("err", e.message || "Errore di connessione"); }
    finally { setLavoro(false); }
  };

  // ── Pezzi ──
  const Azioni = ({ p }) => {
    const g = giro(p);
    const a = passoDi(p);
    const quieto = "px-3 min-h-[40px] text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50";
    return (
    <div className="flex flex-col gap-2">
      {/* Il giro in una riga sola: quattro caselle, quella accesa è dove si trova la prenotazione.
          Si tocca la casella dove deve andare: avanti o indietro, senza altri tasti. */}
      {a >= 0 ? (
        <div className="grid grid-cols-4 rounded-lg border border-neutral-300 overflow-hidden bg-white" role="group" aria-label="Stato della prenotazione">
          {PASSI.map((s, k) => (
            <button key={s.nome} type="button" disabled={lavoro || k === a} onClick={() => vaiAlPasso(p, k)} aria-pressed={k === a}
              title={k === a ? `Adesso: ${s.nome}` : k < a ? `Torna a «${s.nome}»` : `Passa a «${s.nome}»`}
              className={`min-h-[44px] px-1 text-[13px] leading-tight border-l first:border-l-0 border-neutral-300 transition ${
                k === a ? `${s.acceso} text-white font-bold` : k < a ? "bg-neutral-100 text-neutral-500" : "bg-white text-neutral-800 hover:bg-neutral-50"}`}>
              {k < a ? "✓ " : ""}{s.nome}
            </button>
          ))}
        </div>
      ) : g.avanti ? (
        <button type="button" onClick={g.avanti.fai} className={`px-4 min-h-[44px] text-sm font-bold text-white rounded-lg ${g.avanti.cls}`}>{g.avanti.label}</button>
      ) : null}
      {/* Sotto, in piccolo e tutte uguali, le azioni che non sono il giro */}
      <div className="flex flex-wrap gap-1.5">
        {p.stato !== "LEFT" && <button type="button" className={quieto} onClick={() => setForm({ modifica: p })}>Modifica</button>}
        {p.cliente_id && <button type="button" className={quieto} onClick={() => setClienteAperto(p.cliente_id)}>Scheda cliente</button>}
        {p.telefono && ["RECORDED", "REQUESTED"].includes(p.stato) && (
          <button type="button" className={quieto} onClick={() => riconferma(p)}>{p.reminder_inviato === 1 ? "WhatsApp (reinvia)" : "WhatsApp"}</button>
        )}
        {telefono && <button type="button" className={quieto} onClick={() => setScheda(scheda === "elenco" ? "mappa" : "elenco")}>{scheda === "elenco" ? "Sulla mappa" : "In elenco"}</button>}
        {p.stato !== "LEFT" && (
          <button type="button" onClick={() => (assegno?.id === p.id ? setAssegno(null) : apriAssegno(p))} aria-pressed={assegno?.id === p.id}
            title="Assegna i tavoli toccandoli sulla mappa" aria-label="Assegna i tavoli toccandoli sulla mappa"
            className={`px-3 min-h-[40px] rounded-lg border flex items-center gap-1 text-sm font-bold ${assegno?.id === p.id ? "border-indigo-800 bg-indigo-800 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"}`}>
            <svg aria-hidden="true" width="22" height="18" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="8" rx="2" /><path d="M6 12v5M18 12v5" /></svg>
            <span aria-hidden="true">+</span>
          </button>
        )}
        {g.fuoriGiro.length > 0 && (
          <button type="button" className={quieto} onClick={() => setAltroAperto(altroAperto === p.id ? null : p.id)} aria-expanded={altroAperto === p.id}>Altro {altroAperto === p.id ? "▴" : "▾"}</button>
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
      {gruppi.length === 0 && <div className="text-sm text-neutral-500 py-6 text-center">{loading ? "Caricamento…" : "Nessuna prenotazione in questo turno."}</div>}
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
                      {p.pax} {p.pax === 1 ? "persona" : "persone"} · {p.tavolo ? `tavolo ${nomiTavolo(p.tavolo).join(" + ")}` : <span className="text-amber-700 font-medium">senza tavolo</span>}
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
        <option value="">{inTurno ? "Adesso" : "Tutto il turno"}</option>
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
              sel ? "bg-indigo-700 text-white border-indigo-700" : "bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-50"}`}>
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
              ? <><strong>{assegno.nomi.join(" + ")}</strong> · {postiAssegno} posti{postiAssegno < (inAssegno.pax || 0) ? " (pochi)" : ""}</>
              : "nessuno scelto"}</span>
            <span className="flex gap-1.5 flex-shrink-0">
              <button type="button" onClick={() => setAssegno(null)} className="px-3 min-h-[36px] rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800">Annulla</button>
              <button type="button" disabled={lavoro} onClick={salvaAssegno} className="px-3 min-h-[36px] rounded-lg bg-indigo-800 text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap">{assegno.nomi.length ? "Assegna" : "Togli il tavolo"}</button>
            </span>
          </>
        ) : ora != null ? (
          <>
            <span>Stai guardando la sala <strong>alle {hhmm(ora)}</strong>: {liberi} tavoli liberi. Tocca un tavolo libero per prenotarlo a quell'ora.</span>
            <button type="button" onClick={() => setOra(null)} className="flex-shrink-0 whitespace-nowrap px-3 min-h-[36px] rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800">{inTurno ? "Torna ad adesso" : "Tutto il turno"}</button>
          </>
        ) : (
          <span><strong className="text-neutral-800">{attive.length} prenotazioni · {coperti} coperti{carico.capienza ? ` su ${carico.capienza}` : ""} · {liberi} tavoli liberi {vivo ? "adesso" : "nel turno"}</strong> · tocca un orario per vedere la sala a quell'ora</span>
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
            const eScelto = assegno
              ? nomiDelTavolo(t).every((n) => assegno.nomi.includes(n))
              : nomiDelTavolo(t).some((n) => tavoliScelta.has(n)) && (!p || p.id === sceltaId);
            const c = COLORI[eScelto ? "scelto" : bloccato ? "bloccato" : !p ? "libero" : venuti.includes(p.stato) ? "seduto" : "arrivo"];
            const cx = t.posizione_x + t.larghezza / 2;
            const cy = t.posizione_y + t.altezza / 2;
            return (
              <g key={t.id} style={{ cursor: bloccato ? "default" : "pointer" }}
                onClick={() => {
                  if (assegno) toccaPerAssegno(t, p, bloccato);
                  else if (p) scegli(p, true);
                  else if (!bloccato) setForm({ nuova: { tavolo: nomiDelTavolo(t).join("+") } });
                }}>
                <FormaTavolo t={t} fill={c.fill} stroke={c.stroke} strokeWidth={eScelto ? 3 : 1.5} dash={bloccato ? "4 2" : "none"} />
                <text x={cx} y={p ? cy - 6 : cy} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="bold" fill={c.text} className="select-none pointer-events-none">{t.nome}</text>
                {p && <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={c.text} className="select-none pointer-events-none">{(p.cognome || nomeDi(p)).slice(0, 9)} · {p.pax}</text>}
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

        <TestataGiorno data={data} onData={setData} turno={turno} onTurno={setTurno} vista="servizio" corto={telefono}
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
          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
            <div className="order-2 lg:order-1">{Elenco}</div>
            <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-3">{Sala}</div>
          </div>
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
                        className={`relative w-14 h-8 rounded-full transition flex-shrink-0 ${s.aperta ? "bg-indigo-800" : "bg-neutral-300"}`}>
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
