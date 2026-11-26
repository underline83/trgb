// @version: v1.1 — stessa larghezza di pagina di Planning e Mappa, elenco a larghezza fissa e sala che non cambia misura; iPad in piedi: sala sopra, elenco sotto (2026-11-26); v1.0 — vista «Servizio»: elenco del turno e sala nella stessa schermata, striscia degli orari per vedere la sala a un'altra ora, due schede sul telefono (2026-11-26)
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
import usePrenotazioniStati from "./components/statiPrenotazioni";
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
  useEffect(() => { setLoading(true); setOra(null); setSceltaId(null); carica(); }, [carica]);
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
  const liberi = tuttiTavoli.filter((t) => !prenDelTavolo(t) && t.stato_tavolo !== "BLOCCATO").length;

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

  const giorno = (n) => { const d = new Date(`${data}T12:00:00`); d.setDate(d.getDate() + n); setData(giornoLocale(d)); };
  const titoloGiorno = new Date(`${data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const slotAdesso = inTurno ? [...orari].reverse().find((o) => minuti(o.ora) <= adessoMin)?.ora : null;

  // ── Pezzi ──
  const Azioni = ({ p }) => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {["ARRIVED", "SEATED", "LEFT"].filter((s) => puo(p.stato, s)).map((s, i) => (
          <Btn key={s} size="md" variant={i === 0 ? "primary" : "secondary"} onClick={() => cambiaStato(p, s)}>{info(s).etichetta}</Btn>
        ))}
        <Btn size="md" variant="secondary" onClick={() => setForm({ modifica: p })}>Modifica</Btn>
        {telefono && <Btn size="md" variant="secondary" onClick={() => setScheda(scheda === "elenco" ? "mappa" : "elenco")}>{scheda === "elenco" ? "Vedi sulla mappa" : "Apri in elenco"}</Btn>}
      </div>
      {(p.nota_ristorante || p.allergie_segnalate || p.nota_cliente) && (
        <div className="text-xs text-neutral-600">
          {p.allergie_segnalate && <span className="text-red-700 font-medium">Allergie: {p.allergie_segnalate} · </span>}
          {[p.nota_ristorante, p.nota_cliente].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );

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
                <button type="button" onClick={() => (sel ? setSceltaId(null) : scegli(p))} aria-expanded={sel}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center text-left min-h-[32px]">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold truncate">{nomeDi(p)}{p.vip === 1 ? " ★" : ""}</span>
                    <span className="block text-xs text-neutral-600">
                      {p.pax} {p.pax === 1 ? "persona" : "persone"} · {p.tavolo ? `tavolo ${nomiTavolo(p.tavolo).join(" + ")}` : <span className="text-amber-700 font-medium">senza tavolo</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5"><TheForkInvioBadge pren={p} /><StatoBadge stato={p.stato} /></span>
                </button>
                {sel && <Azioni p={p} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const Striscia = (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {orari.map((o) => {
        const m = minuti(o.ora);
        const sel = ora === m;
        const eAdesso = o.ora === slotAdesso;
        return (
          <button key={o.ora} type="button" onClick={() => setOra(sel ? null : m)} aria-pressed={sel}
            className={`flex-1 min-w-[62px] rounded-lg border px-1 py-1.5 flex flex-col items-center gap-0.5 tabular-nums transition min-h-[64px] ${
              sel ? "bg-indigo-700 text-white border-indigo-700" : "bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-50"}`}>
            <span className={`text-[10px] font-bold leading-none ${sel ? "text-white" : "text-indigo-700"}`}>{eAdesso ? "adesso" : " "}</span>
            <span className="text-[13px] font-bold leading-tight">{o.ora}</span>
            <span className={`text-[11px] leading-tight ${sel ? "text-indigo-100" : "text-neutral-600"}`}>{o.coperti}{carico.capienza ? `/${carico.capienza}` : ""}</span>
            <span className={`text-[11px] leading-tight ${sel ? "text-indigo-100" : "text-neutral-600"}`}>{o.tavoli} tav.</span>
          </button>
        );
      })}
    </div>
  );

  const Sala = (
    <div className="flex flex-col gap-2">
      {Striscia}
      {ora != null && (
        <div className="flex items-center justify-between gap-2 text-[13px] text-emerald-900 bg-emerald-50 border border-emerald-600 rounded-lg pl-3 pr-1.5 py-1.5">
          <span>Stai guardando la sala <strong>alle {hhmm(ora)}</strong>: {liberi} tavoli liberi. Tocca un tavolo libero per prenotarlo a quell'ora.</span>
          <Btn size="md" variant="secondary" onClick={() => setOra(null)}>{inTurno ? "Torna ad adesso" : "Tutto il turno"}</Btn>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><SchedeSale sale={sale} attiva={salaAttiva} onChange={setSala} /></div>
        {/* La matita: la sala di QUESTO turno nella Mappa Tavoli (sposta, unisci, blocca); la piantina fissa non cambia */}
        <button type="button" title={`Modifica la sala ${salaAttiva || ""} per questo turno`} aria-label="Modifica la sala per questo turno"
          onClick={() => navigate(`/prenotazioni/mappa/${data}/${turno}?sposta=1${salaAttiva ? `&sala=${encodeURIComponent(salaAttiva)}` : ""}`)}
          className="flex-shrink-0 w-11 h-11 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center justify-center text-neutral-700">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
        </button>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="w-full h-auto block" role="img" aria-label={`Sala ${salaAttiva}`}>
          {elementi.map((e) => <FormaElemento key={`e${e.id}`} e={e} />)}
          {tavoli.map((t) => {
            const p = prenDelTavolo(t);
            const bloccato = !p && t.stato_tavolo === "BLOCCATO";
            const eScelto = nomiDelTavolo(t).some((n) => tavoliScelta.has(n)) && (!p || p.id === sceltaId);
            const c = COLORI[eScelto ? "scelto" : bloccato ? "bloccato" : !p ? "libero" : venuti.includes(p.stato) ? "seduto" : "arrivo"];
            const cx = t.posizione_x + t.larghezza / 2;
            const cy = t.posizione_y + t.altezza / 2;
            return (
              <g key={t.id} style={{ cursor: bloccato ? "default" : "pointer" }}
                onClick={() => {
                  if (p) scegli(p, true);
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
            <span aria-hidden="true" className="inline-block w-3.5 h-3.5 rounded" style={{ background: COLORI[k].fill, border: `2px solid ${COLORI[k].stroke}` }} />{t}
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

        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => giorno(-1)} aria-label="Giorno prima" className="w-11 h-11 rounded-lg border border-neutral-300 bg-white">◀</button>
            <h1 className="text-xl sm:text-2xl font-bold capitalize" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{titoloGiorno}</h1>
            <button type="button" onClick={() => giorno(1)} aria-label="Giorno dopo" className="w-11 h-11 rounded-lg border border-neutral-300 bg-white">▶</button>
            {!oggi && <Btn size="md" variant="secondary" onClick={() => setData(giornoLocale())}>Oggi</Btn>}
            <span className="flex rounded-lg border border-neutral-400 overflow-hidden text-sm">
              {["pranzo", "cena"].map((t) => (
                <button key={t} type="button" onClick={() => setTurno(t)} aria-pressed={turno === t}
                  className={`px-3.5 min-h-[44px] capitalize ${turno === t ? "bg-indigo-900 text-white font-bold" : "bg-white text-neutral-700"}`}>{t}</button>
              ))}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-neutral-700">{attive.length} prenotazioni · {coperti} coperti{carico.capienza ? ` su ${carico.capienza}` : ""} · {liberi} tavoli liberi {vivo ? "adesso" : ora != null ? `alle ${hhmm(ora)}` : "nel turno"}</span>
            <Btn size="md" variant="primary" onClick={() => setForm({ nuova: {} })}>+ Nuova prenotazione</Btn>
          </div>
        </div>

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
          // da un turno all'altro; l'elenco scorre dentro il suo riquadro. iPad in piedi: sala sopra, elenco sotto.
          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
            <div className="order-2 lg:order-1 lg:h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-1">{Elenco}</div>
            <div className="order-1 lg:order-2 min-w-0">{Sala}</div>
          </div>
        )}
      </div>

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
