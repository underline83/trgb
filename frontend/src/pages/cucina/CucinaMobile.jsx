// frontend/src/pages/cucina/CucinaMobile.jsx
// Modulo: cucina
// @version: v1.7 — Spesa: si scrive a mano cosa serve (riga libera + quantità + urgente) (2026-10-03)
// v1.6 — «Gestione Frigoriferi e scorte»: la barra resta con Frigo e Scorte; Oggi e Spesa
//            diventano pagine a sé (stesse route, senza barra), aperte dai tasti della Home (2026-10-03)
// v1.5 — scheda articolo su una pagina sola: quantità, gesti, dove/lotti, DETTAGLI modificabili
//            in linea (niente più ✏️ Modifica), movimenti in fondo (2026-10-02)
// v1.4 — gate temperature: chi apre per primo la Cucina iPhone inserisce le temperature
//            di oggi; «Ignora per oggi» solo admin/superadmin/chef (2026-10-02)
// v1.3 — sugli articoli a MOVIMENTI il pallino lo decide la quantità: tocco = «Quanti ce
//            ne sono?» (CorreggiSheet condiviso); scorta minima da ✏️ Modifica (2026-10-02)
// v1.2 — congelatori: ↔ Sposta (anche fra frigo), date sul carico (lotto con
//            «congelato il / scade il», FIFO), ＋ Aggiungi dal ripiano, scadenza nel giro (2026-10-01)
// v1.1 — scheda articolo: ✏️ Modifica (nome/unità/confezione/regime/natura)
//            + «correggi quantità» per ripiano (RETTIFICA tracciata) + ritorno al frigo (2026-09-28)
// v1.0 — «Cucina da iPhone»: 4 tab Oggi / Scorte / Frigo / Spesa (2026-09-07)
//
// Doc: docs/modulo_scorte_cucina.md
// Mockup validato con Marco: docs/mockups/cucina_mobile_scorte_frigo.html
// Gemella di CantinaMobile.jsx (vini): stessa filosofia — telefono in mano, in
// piedi, con le mani sporche — applicata alla cucina.
//
// ═══════════════════════════════════════════════════════════════════
// LE TRE COSE DA SAPERE PRIMA DI TOCCARE QUESTO FILE
// ═══════════════════════════════════════════════════════════════════
//
// 1. SI PARTE DAL POSTO, NON DALL'ARTICOLO. Il tab «Frigo» è il gesto
//    principale: apri un frigo, vedi i suoi ripiani dall'alto in basso, spunti
//    cosa manca. La dotazione mostra ANCHE la roba finita — se sparisse quando
//    finisce, la lista nasconderebbe proprio ciò che stai cercando.
//
// 2. LA GIACENZA DI UN ARTICOLO È UNA SOMMA. Lo stesso articolo può stare su
//    più ripiani, ognuno con la sua riga. Non esiste «la» quantità letta da una
//    riga sola: il backend la somma e la manda in `giacenza`.
//
// 3. IL NUMERO PUÒ ESSERE UNA STIMA. `stato_dato` dice quanto fidarsi:
//    FRESCO → si mostra secco · DA_VERIFICARE → si mostra «≈ 4,2 · fermo da N
//    gg» · IGNOTO → si mostra «—». Rispettarlo sempre: se lo si ignora, il
//    modulo torna a mentire con la faccia seria.
//
// Due tab su quattro girano su endpoint che esistevano già:
//   Oggi  → /tasks/agenda/, /tasks/execution/item/{id}/check, /tasks/tasks/{id}/completa
//   Spesa → /lista-spesa/items/
// Gli altri due sulla mig 171:
//   Scorte → /cucina/scorte/...
//   Frigo  → /cucina/ubicazioni/...
//
// Prefisso classi: km- (kitchen mobile). NON cm-, che è di CantinaMobile:
// convivono nella stessa app e le regole si sovrascriverebbero.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isCucinaWriterRole } from "../../utils/authHelpers";

const REFRESH_MS = 90_000;
/** Finestra dell'«Annulla». Stessa di CantinaMobile: in servizio è il tempo di
 *  accorgersi dell'errore e togliere le dita. Marco 2026-09-07: «basta 8s». */
const UNDO_MS = 8000;

// Liste chiuse: specchio di app/models/cucina_scorte_db.py (UNITA_MISURA,
// REGIMI, NATURE_ARTICOLO). Se cambiano là, vanno cambiate qui.
const UM_OPZ = ["PZ", "CF", "KG", "G", "L", "ML"];
const REGIME_OPZ = [
  { k: "SEMAFORO", t: "semaforo", d: "solo c'è / sta finendo / finito" },
  { k: "CONTA", t: "conta", d: "una quantità, aggiornata quando conti" },
  { k: "MOVIMENTI", t: "movimenti", d: "ogni carico e scarico, con la storia" },
];
const NATURA_OPZ = ["CRUDO", "COTTO", "SEMILAVORATO", "PRONTO", "NON_FOOD"];

// La sotto-app è «Gestione Frigoriferi e scorte» (Marco 2026-10-03): nella
// barra restano solo questi due. Oggi e Spesa vivono alle stesse route
// (/cucina/mobile/oggi, /cucina/mobile/spesa) ma come pagine a sé, senza
// barra: ci si arriva dai tasti della Home.
const TABS = [
  { k: "frigo", label: "Frigo", icon: "🧊" },
  { k: "scorte", label: "Scorte", icon: "📦" },
];
const PAGINE_A_SE = ["oggi", "spesa"];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

/** Quantità all'italiana, senza decimali inutili: 4.2 → «4,2», 6.0 → «6». */
function fmtQta(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** Come si scrive una giacenza tenendo conto di quanto ci si può fidare.
 *  È il punto 3 dell'intestazione: qui e in un posto solo. */
function fmtGiacenza(qta, statoDato) {
  const s = statoDato?.stato;
  if (s === "IGNOTO" || qta == null) return "—";
  return s === "DA_VERIFICARE" ? `≈ ${fmtQta(qta)}` : fmtQta(qta);
}

function giorniA(dataIso) {
  if (!dataIso) return null;
  const d = new Date(dataIso + (dataIso.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return Math.round((d - oggi) / 86400000);
}

function scadenzaLabel(gg) {
  if (gg == null) return null;
  if (gg < 0) return { txt: "scaduto", tone: "r" };
  if (gg === 0) return { txt: "scade oggi", tone: "r" };
  if (gg === 1) return { txt: "scade domani", tone: "r" };
  return { txt: `scade tra ${gg} gg`, tone: "a" };
}

/** Date: ISO «2026-10-01» ↔ «01/10/26». */
function oggiIso() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function piuGiorni(iso, n) {
  if (!iso || !n) return "";
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + Number(n));
  return d.toISOString().slice(0, 10);
}
function fmtData(iso) {
  if (!iso) return "—";
  const [y, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${y.slice(2)}`;
}
/** Dove la roba si CONGELA: lì il carico chiede la data e propone la scadenza. */
const TIPI_GELO = ["FREEZER", "ABBATTITORE"];
const eGelo = (tipo) => TIPI_GELO.includes((tipo || "").toUpperCase());

/** Config del modulo (scadenza proposta ecc.): una sola chiamata per sessione. */
let _cfgPromise = null;
function useScorteConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    if (!_cfgPromise) {
      _cfgPromise = apiFetch(`${API_BASE}/cucina/scorte/config/`)
        .then((r) => (r.ok ? r.json() : { config: {} }))
        .then((d) => d.config || {})
        .catch(() => { _cfgPromise = null; return {}; });
    }
    _cfgPromise.then(setCfg);
  }, []);
  return cfg;
}
/** Scadenza proposta per un carico: solo nei congelatori, dalla config. */
function scadenzaProposta(cfg, tipo, data) {
  if (!eGelo(tipo)) return "";
  return piuGiorni(data || oggiIso(), cfg?.scadenza_congelato_gg);
}

/** I due campi data di un carico. In congelatore «congelato il», altrove «arrivato il». */
function CampiData({ gelo, data, scad, onChange }) {
  return (
    <div className="km-date">
      <div>
        <label>{gelo ? "Congelato il" : "Arrivato il"}</label>
        <input type="date" value={data || ""} onChange={(e) => onChange({ data: e.target.value })} />
      </div>
      <div>
        <label>Scade il{gelo ? "" : " (se c'è)"}</label>
        <input type="date" value={scad || ""} onChange={(e) => onChange({ scad: e.target.value })} />
      </div>
    </div>
  );
}

const CICLO = { OK: "ESAURIMENTO", ESAURIMENTO: "FINITO", FINITO: "OK" };
const DOT_LABEL = { OK: "✓", ESAURIMENTO: "!", FINITO: "✕" };

// ─────────────────────────────────────────────────────────────
// Stile — palette TRGB-02, coerente con CantinaMobile
// ─────────────────────────────────────────────────────────────
const STYLE = `
.km-root{--cream:#F4F1EC;--cream2:#EFEBE3;--ink:#111;--inks:#4b4b4f;--muted:#7a7a80;
  --hair:#e6e1d8;--red:#E8402B;--redi:#9c1f10;--red50:#fbe6e2;--green:#2EB872;
  --greeni:#1a7549;--green50:#e1f2e8;--blue:#2E7BE8;--blue50:#e1ecfc;--bluei:#1a4d96;
  --amber:#E8A828;--amber50:#fdf3dc;--amberi:#8a5a00;
  background:var(--cream);color:var(--ink);min-height:100vh;
  font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;}
.km-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.km-serif{font-family:"Playfair Display",Georgia,serif;}

/* La pagina SCORRE nel documento, non e' un overlay. L'app monta il suo Header
   globale (sticky, z-50) su ogni rotta: un root in position fixed a inset 0
   finirebbe SOTTO quell'header e nasconderebbe la propria intestazione — era
   il bug del primo giro. Niente backtick in questi commenti: stanno dentro un
   template literal e lo chiuderebbero.
   Su desktop la colonna resta stretta come un telefono: e' pensata per quello. */
.km-head{padding:14px 18px 10px;background:var(--cream);
  border-bottom:1px solid var(--hair);max-width:640px;margin:0 auto;}
.km-head h1{margin:0;font:700 26px/1.15 "Playfair Display",Georgia,serif;}
.km-sub{font-size:12.5px;color:var(--muted);margin-top:3px;}
.km-htop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.km-back{background:none;border:0;color:var(--red);font-size:14px;font-weight:600;padding:2px 0 6px;cursor:pointer;}
.km-fab{width:40px;height:40px;border-radius:50%;background:var(--red);color:#fff;border:0;
  font-size:21px;font-weight:600;box-shadow:0 6px 14px rgba(232,64,43,.35);flex:0 0 auto;cursor:pointer;}

.km-search{width:100%;padding:10px 14px;border-radius:11px;border:1px solid var(--hair);
  background:#fff;font-size:16px;margin-top:6px;}
.km-pills{display:flex;gap:7px;overflow-x:auto;padding:9px 0 3px;scrollbar-width:none;}
.km-pills::-webkit-scrollbar{display:none;}
.km-pill{flex:0 0 auto;padding:7px 13px;border-radius:999px;background:#fff;border:1px solid var(--hair);
  font-size:12.5px;font-weight:600;color:var(--inks);white-space:nowrap;cursor:pointer;}
.km-pill.on{background:var(--red);color:#fff;border-color:var(--red);}
.km-pill .c{margin-left:4px;opacity:.6;font-weight:500;}

.km-body{max-width:640px;margin:0 auto;
  padding:12px 18px calc(env(safe-area-inset-bottom) + 108px);display:flex;flex-direction:column;gap:11px;}
.km-lbl{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--muted);margin:8px 0 -3px;}

.km-card{background:#fff;border:1px solid var(--hair);border-radius:14px;padding:13px 14px;
  box-shadow:0 2px 10px rgba(0,0,0,.05);}
.km-card.warn{border-left:4px solid var(--amber);}
.km-card.bad{border-left:4px solid var(--red);}
.km-card.good{border-left:4px solid var(--green);}
.km-ct{font:700 16px/1.25 "Playfair Display",Georgia,serif;}
.km-cm{margin-top:5px;font-size:12px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;align-items:center;}

.km-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;
  font-size:11px;font-weight:700;}
.km-chip.g{background:var(--green50);color:var(--greeni);}
.km-chip.a{background:var(--amber50);color:var(--amberi);}
.km-chip.r{background:var(--red50);color:var(--redi);}
.km-chip.b{background:var(--blue50);color:var(--bluei);}
.km-chip.n{background:var(--cream2);color:var(--inks);}
.km-chip.v{background:#efe9dd;color:#8a7a55;}

.km-frigo{background:#fff;border:1px solid var(--hair);border-radius:14px;padding:14px;
  display:flex;gap:13px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.05);
  cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit;}
.km-frigo.ko{border-left:4px solid var(--red);}
.km-frigo .ico{font-size:27px;width:38px;text-align:center;flex:0 0 auto;}
.km-frigo .gr{flex:1;min-width:0;}
.km-frigo .nm{font:700 17px/1.2 "Playfair Display",Georgia,serif;}
.km-frigo .ln{font-size:12px;color:var(--muted);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.km-arrow{color:#c3bdb2;font-size:20px;flex:0 0 auto;}
.km-temp{font:700 19px/1 "Playfair Display",Georgia,serif;}
.km-temp.ok{color:var(--greeni);} .km-temp.ko{color:var(--red);}

.km-rip{display:flex;align-items:center;gap:9px;margin:14px 0 -2px;padding-bottom:7px;
  border-bottom:1.5px solid var(--hair);}
.km-rip .num{width:27px;height:27px;border-radius:8px;background:var(--ink);color:var(--cream);
  font:700 14px/27px "Playfair Display",Georgia,serif;text-align:center;flex:0 0 auto;}
.km-rip .lb{font-size:12.5px;font-weight:700;color:var(--inks);}
.km-rip .rest{margin-left:auto;font-size:11.5px;color:var(--muted);}
.km-dest{padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700;text-transform:uppercase;}
.km-dest.CRUDO{background:#fde8e4;color:var(--redi);}
.km-dest.COTTO{background:var(--blue50);color:var(--bluei);}
.km-dest.SEMILAVORATI{background:var(--amber50);color:var(--amberi);}
.km-dest.PRONTI{background:var(--green50);color:var(--greeni);}
.km-dest.NON_FOOD,.km-dest.MISTO{background:var(--cream2);color:var(--inks);}

.km-art{background:#fff;border:1px solid var(--hair);border-radius:13px;padding:11px 13px;
  display:flex;align-items:center;gap:12px;box-shadow:0 1px 6px rgba(0,0,0,.04);}
.km-art.finito{background:linear-gradient(90deg,var(--red50),#fff 55%);}
.km-art.allarme{box-shadow:0 0 0 1.5px var(--amber),0 1px 6px rgba(0,0,0,.04);}
.km-art .gr{flex:1;min-width:0;}
.km-art .nm{font-size:14.5px;font-weight:600;line-height:1.3;}
.km-art .ln{font-size:11.5px;color:var(--muted);margin-top:3px;display:flex;gap:9px;flex-wrap:wrap;align-items:center;}
.km-qta{font:700 15px/1 "Playfair Display",Georgia,serif;color:var(--inks);flex:0 0 auto;}
.km-qta.stima{color:var(--muted);font-weight:600;}

.km-dot{width:38px;height:38px;min-width:38px;border-radius:50%;border:2.5px solid var(--green);
  background:var(--green);flex:0 0 auto;cursor:pointer;color:#fff;font-size:17px;font-weight:700;
  display:flex;align-items:center;justify-content:center;transition:transform .12s,background .15s,border-color .15s;padding:0;}
.km-dot:active{transform:scale(.88);}
.km-dot.ESAURIMENTO{background:var(--amber);border-color:var(--amber);}
.km-dot.FINITO{background:var(--red);border-color:var(--red);}
.km-dot:disabled{opacity:.45;cursor:default;}

.km-tick{width:30px;height:30px;min-width:30px;border-radius:9px;border:2px solid #cfc9bd;background:#fff;
  flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;
  font-weight:700;cursor:pointer;padding:0;}
.km-tick.on{background:var(--green);border-color:var(--green);}
.km-tick.fail{background:var(--red);border-color:var(--red);}
.km-prog{height:6px;border-radius:99px;background:var(--cream2);overflow:hidden;margin-top:9px;}
.km-prog i{display:block;height:100%;border-radius:99px;background:var(--green);}

/* I TAB STANNO IN DUE POSTI, e non e' un ripensamento.
   In alto, in flusso: sempre visibili, qualunque sia l'altezza della finestra,
   e immuni a qualsiasi contenitore che possa rompere il position fixed. E' il
   selettore che si vede su desktop, stesso pattern del cambio modo in
   CantinaMobile.
   In basso, fisso: solo sul telefono, dove il pollice arriva li' e non in cima
   allo schermo. Sopra i 768px sparisce, cosi' non resta una barra vuota
   appiccicata al fondo di un monitor. */
.km-modes{display:flex;gap:6px;background:var(--cream2);border-radius:12px;padding:4px;margin-top:12px;}
.km-modes button{flex:1;border:0;background:transparent;color:var(--muted);
  padding:9px 4px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;position:relative;}
.km-modes button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.km-modes .n{background:var(--red);color:#fff;font-size:10px;font-weight:700;
  min-width:16px;height:16px;border-radius:99px;display:inline-flex;
  align-items:center;justify-content:center;padding:0 4px;}

.km-tabbar{position:fixed;bottom:0;left:50%;transform:translateX(-50%);
  width:min(640px,100%);height:calc(env(safe-area-inset-bottom) + 66px);
  background:rgba(244,241,236,.96);backdrop-filter:blur(12px);
  border-top:1px solid var(--hair);box-shadow:0 -4px 18px rgba(0,0,0,.06);
  display:flex;padding:8px 6px calc(env(safe-area-inset-bottom));z-index:40;}
@media (min-width:769px){
  .km-tabbar{display:none;}
  .km-body{padding-bottom:40px;}
}
.km-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  font-size:10.5px;font-weight:600;color:var(--muted);cursor:pointer;position:relative;
  background:none;border:0;padding:0;}
.km-tab .ti{font-size:21px;line-height:1;}
.km-tab.on{color:var(--red);}
.km-badge{position:absolute;top:-2px;right:50%;transform:translateX(26px);background:var(--red);color:#fff;
  font-size:10px;font-weight:700;min-width:17px;height:17px;border-radius:99px;display:flex;
  align-items:center;justify-content:center;padding:0 4px;}

.km-toast{position:fixed;left:50%;transform:translateX(-50%);width:min(608px,calc(100% - 32px));
  bottom:calc(env(safe-area-inset-bottom) + 80px);z-index:60;
  background:#1c1c1e;color:#fff;border-radius:13px;padding:13px 15px;display:flex;align-items:center;
  gap:12px;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.4);overflow:hidden;}
.km-toast button{background:none;border:0;color:#ff9a8a;font-weight:700;font-size:13.5px;cursor:pointer;}
.km-toast .bar{position:absolute;left:0;bottom:0;height:3px;background:#ff9a8a;
  animation:km-drain ${UNDO_MS}ms linear forwards;}
@keyframes km-drain{from{width:100%}to{width:0}}

.km-banner{border-radius:13px;padding:12px 14px;font-size:13px;line-height:1.45;display:flex;gap:10px;align-items:flex-start;}
.km-banner.r{background:var(--red50);color:var(--redi);border:1px solid #f3c9c1;}
.km-banner.a{background:var(--amber50);color:var(--amberi);border:1px solid #f0dcb0;}

.km-btn{width:100%;padding:14px;border-radius:13px;border:0;background:var(--red);color:#fff;
  font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(232,64,43,.3);}
.km-btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--hair);box-shadow:none;}
.km-btn:disabled{opacity:.5;}
.km-qa{display:flex;gap:9px;}
.km-qa button{flex:1;padding:12px 6px;border-radius:12px;border:1px solid var(--hair);background:#fff;
  font-size:12px;font-weight:700;color:var(--inks);cursor:pointer;display:flex;flex-direction:column;
  align-items:center;gap:4px;}
.km-qa button .e{font-size:19px;}
.km-qa button:disabled{opacity:.45;}

.km-tl{display:flex;gap:11px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--cream2);}
.km-tl:last-child{border-bottom:0;}
.km-tl .bul{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto;}
.km-tl .t1{font-size:13.5px;font-weight:600;}
.km-tl .t2{font-size:11.5px;color:var(--muted);margin-top:2px;}
.km-tl .rq{margin-left:auto;font:700 13.5px/1 "Playfair Display",Georgia,serif;color:var(--inks);flex:0 0 auto;}

.km-empty{text-align:center;color:var(--muted);padding:44px 20px;font-size:14px;line-height:1.6;}
.km-empty .e{font-size:38px;display:block;margin-bottom:10px;}
.km-err{background:var(--red50);color:var(--redi);border:1px solid #f3c9c1;border-radius:12px;
  padding:12px 14px;font-size:13px;}

.km-sheet{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.35);
  display:flex;align-items:flex-end;justify-content:center;}
.km-sheet-in{background:var(--cream);width:min(640px,100%);border-radius:20px 20px 0 0;
  padding:18px 18px calc(env(safe-area-inset-bottom) + 18px);max-height:88vh;overflow-y:auto;}
.km-sheet-in h3{margin:0 0 4px;font:700 20px/1.2 "Playfair Display",Georgia,serif;}
.km-num{width:100%;padding:14px;border-radius:12px;border:1.5px solid var(--hair);background:#fff;
  text-align:center;font:700 26px/1 "Playfair Display",Georgia,serif;margin:14px 0 10px;}
.km-step{display:flex;gap:10px;align-items:center;justify-content:center;margin-bottom:12px;}
.km-step button{width:52px;height:44px;border-radius:12px;border:1px solid var(--hair);background:#fff;
  font-size:20px;font-weight:700;cursor:pointer;}
.km-date{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:2px 0 12px;}
.km-date label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
.km-date input{width:100%;padding:10px 11px;border-radius:11px;border:1px solid var(--hair);background:#fff;
  font-size:16px;margin-top:3px;}
.km-add{margin-left:8px;background:#fff;border:1px solid var(--hair);border-radius:9px;padding:4px 10px;
  font-size:12.5px;font-weight:700;color:var(--red);cursor:pointer;}
.km-res{display:flex;flex-direction:column;gap:6px;margin:8px 0 4px;}
.km-res button{text-align:left;padding:11px 13px;border-radius:11px;border:1px solid var(--hair);background:#fff;
  font-size:14.5px;cursor:pointer;display:flex;justify-content:space-between;gap:8px;}
.km-res button.on{border-color:var(--red);background:var(--red50);}
.km-res .m{font-size:12px;color:var(--muted);}
.km-gate{position:fixed;inset:0;z-index:90;background:var(--cream);overflow-y:auto;
  padding:calc(env(safe-area-inset-top) + 18px) 18px calc(env(safe-area-inset-bottom) + 24px);}
.km-gate-in{max-width:520px;margin:0 auto;}
.km-gate h2{margin:0;font:700 26px/1.15 "Playfair Display",Georgia,serif;}
.km-trow{background:#fff;border:1px solid var(--hair);border-radius:13px;padding:12px 13px;margin-top:10px;}
.km-trow.ko{border-color:var(--red);background:var(--red50);}
.km-trow .t{font-size:15px;font-weight:700;}
.km-trow .s{font-size:12px;color:var(--muted);margin-top:2px;}
.km-tin{display:flex;gap:8px;align-items:center;margin-top:9px;}
.km-tin button{width:48px;height:48px;border-radius:12px;border:1px solid var(--hair);background:var(--cream2);
  font-size:22px;font-weight:700;cursor:pointer;}
.km-tin input{flex:1;height:48px;border-radius:12px;border:1.5px solid var(--hair);background:#fff;
  text-align:center;font:700 22px/1 "Playfair Display",Georgia,serif;}
.km-tin .u{font-size:15px;font-weight:700;color:var(--muted);}
.km-root.a-se .km-body{padding-bottom:calc(env(safe-area-inset-bottom) + 32px);}
.km-pills.wrap{flex-wrap:wrap;overflow:visible;padding-top:4px;}
.km-in{width:100%;padding:12px 14px;border-radius:11px;border:1px solid var(--hair);background:#fff;
  font-size:16px;margin:4px 0 2px;}
.km-flbl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  margin-top:12px;}
.km-edit{background:#fff;border:1px solid var(--hair);border-radius:11px;padding:7px 12px;font-size:14px;
  font-weight:600;cursor:pointer;flex:0 0 auto;}
.km-tl.tap{cursor:pointer;}
.km-tl.tap .rq::after{content:" ✎";font-size:12px;color:var(--muted);}
`;

// ─────────────────────────────────────────────────────────────
// Pezzi condivisi
// ─────────────────────────────────────────────────────────────

function Chip({ tone = "n", children }) {
  return <span className={`km-chip ${tone}`}>{children}</span>;
}

function Vuoto({ icona, titolo, testo }) {
  return (
    <div className="km-empty">
      <span className="e">{icona}</span>
      <b>{titolo}</b>
      {testo && <div style={{ marginTop: 6 }}>{testo}</div>}
    </div>
  );
}

/** L'annulla a 8 secondi. Una sola azione alla volta: se ne arriva un'altra,
 *  la precedente si considera confermata — è quello che succede davvero
 *  quando qualcuno tocca tre pallini di fila. */
function Toast({ testo, onAnnulla }) {
  if (!testo) return null;
  return (
    <div className="km-toast">
      <div style={{ flex: 1 }}>{testo}</div>
      <button onClick={onAnnulla}>Annulla</button>
      <div className="bar" />
    </div>
  );
}

/** Il selettore in alto, in flusso. È quello che si vede su desktop e non può
 *  finire fuori schermo qualunque cosa succeda al layout intorno. */
function Modi({ attivo, badge, vai }) {
  return (
    <div className="km-modes" role="tablist">
      {TABS.map((t) => (
        <button key={t.k} role="tab" aria-selected={attivo === t.k}
                className={attivo === t.k ? "on" : ""} onClick={() => vai(t.k)}>
          <span>{t.icon}</span>{t.label}
          {badge[t.k] > 0 && <span className="n">{badge[t.k]}</span>}
        </button>
      ))}
    </div>
  );
}

/** La barra in fondo: solo sul telefono, dove il pollice arriva lì. */
function TabBar({ attivo, badge, vai }) {
  return (
    <nav className="km-tabbar">
      {TABS.map((t) => (
        <button key={t.k} className={`km-tab${attivo === t.k ? " on" : ""}`}
                onClick={() => vai(t.k)} aria-label={t.label}>
          <span className="ti">{t.icon}</span>
          {t.label}
          {badge[t.k] > 0 && <span className="km-badge">{badge[t.k]}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Il pallino: verde → giallo → rosso → verde. Il gesto più usato del modulo. */
function Pallino({ stato, disabled, onClick }) {
  const s = stato || "OK";
  return (
    <button className={`km-dot ${s}`} disabled={disabled} onClick={onClick}
            aria-label={`Stato: ${s.toLowerCase()}`}>
      {DOT_LABEL[s]}
    </button>
  );
}

/** Riga articolo dentro un ripiano o in elenco. */
function RigaArticolo({ a, canWrite, onTap, onApri }) {
  const cfg = useScorteConfig();
  const avvisoGg = num(cfg?.scadenza_avviso_gg ?? 5);
  const stato = a.stato_semaforo || "OK";
  const sd = a.stato_dato;
  const cls = ["km-art", stato === "FINITO" ? "finito" : "", a.fuori_posto ? "allarme" : ""]
    .filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <Pallino stato={stato} disabled={!canWrite} onClick={() => onTap(a, stato)} />
      <div className="gr" onClick={() => onApri && onApri(a)} style={{ cursor: onApri ? "pointer" : "default" }}>
        <div className="nm">{a.nome}</div>
        <div className="ln">
          {stato === "FINITO" && <Chip tone="r">finito</Chip>}
          {stato === "ESAURIMENTO" && <Chip tone="a">agli sgoccioli</Chip>}
          {a.fuori_posto && <Chip tone="a">⚠ {(a.natura || "").toLowerCase()} qui</Chip>}
          {sd?.stato === "DA_VERIFICARE" && <Chip tone="v">fermo da {sd.giorni} gg</Chip>}
          {a.regime === "MOVIMENTI" && stato === "OK" && !a.fuori_posto && sd?.stato !== "DA_VERIFICARE"
            && <Chip tone="b">movimenti</Chip>}
          {a.prossima_scadenza && (() => {
            // Chip colorata solo dentro la finestra d'avviso (config scadenza_avviso_gg,
            // la stessa dell'alert): oltre, la data e basta.
            const sc = a.giorni_scadenza != null && a.giorni_scadenza <= avvisoGg ? scadenzaLabel(a.giorni_scadenza) : null;
            return sc ? <Chip tone={sc.tone}>{sc.txt}</Chip> : <span>scade {fmtData(a.prossima_scadenza)}</span>;
          })()}
          {a.confezione && <span>{a.confezione}</span>}
        </div>
      </div>
      <div className={`km-qta${sd?.stato === "DA_VERIFICARE" ? " stima" : ""}`}>
        {fmtGiacenza(a.qta ?? a.giacenza, sd)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook: il semaforo con l'undo. Vive qui perché lo usano due tab.
// ─────────────────────────────────────────────────────────────
function useSemaforo(ricarica) {
  const [toast, setToast] = useState(null);
  const undoRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const tap = useCallback(async (articolo, statoCorrente, ripianoId) => {
    const nuovo = CICLO[statoCorrente || "OK"];
    const artId = articolo.articolo_id || articolo.id;
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/${artId}/semaforo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ripiano_id: ripianoId, stato: nuovo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      clearTimeout(timerRef.current);
      undoRef.current = { artId, ripianoId, statoPrima: statoCorrente || "OK", spesaId: data.spesa_id };
      setToast(nuovo === "FINITO"
        ? `${articolo.nome} → in lista spesa`
        : `${articolo.nome} · ${nuovo === "ESAURIMENTO" ? "agli sgoccioli" : "a posto"}`);
      timerRef.current = setTimeout(() => { setToast(null); undoRef.current = null; }, UNDO_MS);
      ricarica();
    } catch (e) {
      setToast(`Non ha funzionato: ${e.message}`);
      timerRef.current = setTimeout(() => setToast(null), 4000);
    }
  }, [ricarica]);

  const annulla = useCallback(async () => {
    const u = undoRef.current;
    clearTimeout(timerRef.current);
    setToast(null);
    undoRef.current = null;
    if (!u) return;
    try {
      await apiFetch(`${API_BASE}/cucina/scorte/articoli/${u.artId}/semaforo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ripiano_id: u.ripianoId, stato: u.statoPrima }),
      });
      // Seconda metà dell'undo: la riga di spesa nata col rosso se ne va con lui.
      if (u.spesaId) {
        await apiFetch(`${API_BASE}/cucina/scorte/spesa/${u.spesaId}`, { method: "DELETE" });
      }
    } catch { /* l'undo è best-effort: il ricarica sotto mostra la verità */ }
    ricarica();
  }, [ricarica]);

  return { toast, tap, annulla };
}

// ─────────────────────────────────────────────────────────────
// TAB 1 · OGGI — checklist e task. Gira su /tasks, che esisteva già.
// ─────────────────────────────────────────────────────────────
function TabOggi({ canWrite, onCount }) {
  const [agenda, setAgenda] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/tasks/agenda/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgenda(await res.json());
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);

  const istanze = useMemo(
    () => (agenda?.turni || []).flatMap((t) => t.instances || []), [agenda]);

  useEffect(() => {
    const aperte = istanze.filter((i) => i.stato !== "COMPLETATA" && i.stato !== "SALTATA").length;
    const task = (agenda?.tasks || []).filter((t) => t.stato === "APERTO").length;
    onCount(aperte + task);
  }, [istanze, agenda, onCount]);

  async function spuntaItem(inst, item) {
    if (!canWrite || busy) return;
    // Le voci con un numero (temperature, pesi) non si spuntano al volo: senza
    // il valore l'endpoint rifiuta, ed è giusto — una temperatura va letta.
    if (item.item_tipo === "TEMPERATURA" || item.item_tipo === "NUMERICO") {
      setErr(`«${item.item_titolo}» vuole un valore: aprila dall'agenda completa.`);
      setTimeout(() => setErr(null), 4000);
      return;
    }
    setBusy(item.item_id);
    try {
      const res = await apiFetch(`${API_BASE}/tasks/execution/item/${item.item_id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_id: inst.id,
          stato: item.stato === "OK" ? "SKIPPED" : "OK",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function completaTask(t) {
    if (!canWrite || busy) return;
    setBusy(`t${t.id}`);
    try {
      const res = await apiFetch(`${API_BASE}/tasks/tasks/${t.id}/completa`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  if (err && !agenda) return <div className="km-body"><div className="km-err">{err}</div></div>;
  if (!agenda) return <div className="km-body"><Vuoto icona="⏳" titolo="Carico…" /></div>;

  const tasks = agenda.tasks || [];

  return (
    <div className="km-body">
      {err && <div className="km-err">{err}</div>}

      {istanze.length === 0 && tasks.length === 0 && (
        <Vuoto icona="☕" titolo="Niente in programma"
               testo="Nessuna checklist generata per oggi e nessun task in scadenza. Le altre tre schede sono in fondo allo schermo." />
      )}

      {istanze.length > 0 && <div className="km-lbl">Checklist</div>}
      {istanze.map((inst) => {
        const items = inst.items || [];
        const fatti = items.filter((i) => i.stato === "OK").length;
        const pct = items.length ? Math.round((fatti / items.length) * 100) : 0;
        const chiusa = inst.stato === "COMPLETATA" || inst.stato === "SALTATA";
        const tone = chiusa ? "good" : inst.stato === "SCADUTA" ? "bad" : pct > 0 ? "warn" : "";
        return (
          <div key={inst.id} className={`km-card ${tone}`}>
            <div className="km-ct">{inst.template_nome}</div>
            <div className="km-cm">
              <Chip tone={chiusa ? "g" : pct > 0 ? "a" : "n"}>{fatti} / {items.length}</Chip>
              {inst.turno && <span>{inst.turno.toLowerCase()}</span>}
              {inst.scadenza_at && !chiusa && <span>entro le {inst.scadenza_at.slice(11, 16)}</span>}
              {inst.completato_da && <span>{inst.completato_da}</span>}
            </div>
            <div className="km-prog">
              <i style={{ width: `${pct}%`, background: chiusa ? "var(--green)" : "var(--amber)" }} />
            </div>
            {!chiusa && items.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                {items.map((it) => (
                  <div key={it.item_id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className={`km-tick${it.stato === "OK" ? " on" : it.stato === "FAIL" ? " fail" : ""}`}
                            disabled={!canWrite || busy === it.item_id}
                            onClick={() => spuntaItem(inst, it)}>
                      {it.stato === "OK" ? "✓" : it.stato === "FAIL" ? "✕" : ""}
                    </button>
                    <div style={{ flex: 1, fontSize: 14, opacity: it.stato === "OK" ? 0.55 : 1 }}>
                      {it.item_titolo}
                      {(it.item_tipo === "TEMPERATURA" || it.item_tipo === "NUMERICO") && (
                        <span style={{ marginLeft: 6 }}>
                          <Chip tone="b">{it.valore_numerico != null
                            ? `${fmtQta(it.valore_numerico)}${it.item_unita || ""}`
                            : "da misurare"}</Chip>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {tasks.length > 0 && <div className="km-lbl">Task</div>}
      {tasks.map((t) => {
        const fatto = t.stato === "COMPLETATO";
        return (
          <div key={t.id} className={`km-card ${t.priorita === "ALTA" && !fatto ? "bad" : ""}`}
               style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className={`km-tick${fatto ? " on" : ""}`}
                    disabled={!canWrite || fatto || busy === `t${t.id}`}
                    onClick={() => completaTask(t)}>{fatto ? "✓" : ""}</button>
            <div style={{ flex: 1, opacity: fatto ? 0.6 : 1 }}>
              <div className="km-ct" style={{ fontSize: 15, textDecoration: fatto ? "line-through" : "none" }}>
                {t.titolo}
              </div>
              <div className="km-cm">
                {!fatto && t.priorita === "ALTA" && <Chip tone="r">alta</Chip>}
                {t.ora_scadenza && <span>{t.ora_scadenza}</span>}
                {t.assegnato_user && <span>{t.assegnato_user}</span>}
                {fatto && t.completato_da && <span>fatto · {t.completato_da}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2 · SCORTE — la vista per articolo, per quando sai cosa cerchi
// ─────────────────────────────────────────────────────────────
function TabScorte({ canWrite, onCount, apri, modi }) {
  const [dati, setDati] = useState(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("mancanti");
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ reparto: "cucina", limit: "800" });
      if (q.trim()) p.set("q", q.trim());
      const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDati(await res.json());
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  // In questo tab il pallino non c'è: si tocca la riga e si apre la scheda.
  // Del semaforo serve solo il toast, per l'undo che arriva da altrove.
  const { toast, annulla } = useSemaforo(load);
  // Memoizzato: senza, ogni render creerebbe un array nuovo e farebbe
  // ricalcolare tutti i useMemo che dipendono da lui.
  const articoli = useMemo(() => dati?.articoli || [], [dati]);

  const mancanti = useMemo(() => articoli.filter((a) => a.peggior_stato <= 1), [articoli]);
  useEffect(() => { onCount(articoli.filter((a) => a.peggior_stato === 0).length); }, [articoli, onCount]);

  const mostrati = useMemo(() => {
    if (filtro === "mancanti") return mancanti;
    if (filtro === "verificare") return articoli.filter((a) => a.stato_dato?.stato === "DA_VERIFICARE");
    return articoli;
  }, [filtro, articoli, mancanti]);

  return (
    <>
      <div className="km-head">
        <div className="km-htop">
          <div>
            <h1 className="km-serif">Scorte</h1>
            <div className="km-sub">{articoli.length} articoli · {mancanti.length} da comprare</div>
          </div>
        </div>
        {modi}
        <input className="km-search" placeholder="🔍  Cerca un articolo…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="km-pills">
          {[["mancanti", `Da comprare`, mancanti.length],
            ["verificare", "Da verificare", articoli.filter((a) => a.stato_dato?.stato === "DA_VERIFICARE").length],
            ["tutti", "Tutti", articoli.length]].map(([k, lbl, n]) => (
            <button key={k} className={`km-pill${filtro === k ? " on" : ""}`} onClick={() => setFiltro(k)}>
              {lbl}{n > 0 && <span className="c">{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="km-body">
        {err && <div className="km-err">{err}</div>}
        {!dati && <Vuoto icona="⏳" titolo="Carico…" />}
        {dati && mostrati.length === 0 && (
          <Vuoto icona={filtro === "mancanti" ? "✅" : "📦"}
                 titolo={filtro === "mancanti" ? "Non manca niente" : "Nessun articolo"}
                 testo={filtro === "mancanti"
                   ? "Tutto quello che è in dotazione risulta a posto."
                   : q ? `Nessun risultato per «${q}».`
                       : "Le scorte si popolano dal tab Frigo, ripiano per ripiano."} />
        )}
        {mostrati.map((a) => (
          <div key={a.id} className="km-art" onClick={() => apri(a.id)} style={{ cursor: "pointer" }}>
            <div className="gr">
              <div className="nm">{a.nome}</div>
              <div className="ln">
                {a.peggior_stato === 0 && <Chip tone="r">finito</Chip>}
                {a.peggior_stato === 1 && <Chip tone="a">agli sgoccioli</Chip>}
                {a.stato_dato?.stato === "DA_VERIFICARE" && <Chip tone="v">fermo da {a.stato_dato.giorni} gg</Chip>}
                {a.posti > 1 && <Chip tone="n">{a.posti} posti</Chip>}
                {a.categoria && <span>{a.categoria}</span>}
              </div>
            </div>
            <div className={`km-qta${a.stato_dato?.stato === "DA_VERIFICARE" ? " stima" : ""}`}>
              {fmtGiacenza(a.giacenza, a.stato_dato)}
              <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 3, color: "var(--muted)" }}>{a.um}</span>
            </div>
            <span className="km-arrow">›</span>
          </div>
        ))}
      </div>
      <Toast testo={toast} onAnnulla={annulla} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// «Quanti ce ne sono?» — la correzione di una quantità su un ripiano.
// Scrive una RETTIFICA col delta e qta_precedente ESPLICITA (lezione del bug
// RETTIFICA fantasma dei vini): la storia dice chi, quando, da quanto a quanto.
// La usano la scheda articolo e il giro del frigo (tocco sul pallino di un
// articolo a MOVIMENTI: lì il colore lo decide il numero, non il dito).
// ─────────────────────────────────────────────────────────────
function CorreggiSheet({ artId, nome, um, ripianoId, dove, prima, onChiudi, onFatto }) {
  const [val, setVal] = useState(prima ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function salva() {
    if (busy) return;
    const p = num(prima);
    const d = num(val);
    // Numero invariato: si chiude senza scrivere — tranne a zero, dove
    // confermare «finito» e' un fatto (e fa uscire la riga vuota se
    // l'articolo c'e' su un altro ripiano, Marco 2026-10-04).
    if (d === p && prima != null && d !== 0) { onChiudi(); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/movimenti/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articolo_id: artId, ripiano_id: ripianoId, tipo: "RETTIFICA",
          qta: d - p, qta_precedente: p, motivo: "correzione a mano",
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      onFatto();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="km-sheet" onClick={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <div className="km-sheet-in">
        <h3 className="km-serif">Quanti ce ne sono? · {nome}</h3>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {dove} · prima: {prima == null ? "—" : `${fmtQta(prima)} ${um}`}
        </div>
        {err && <div className="km-err" style={{ marginTop: 8 }}>{err}</div>}
        <input className="km-num" type="number" inputMode="decimal" step="0.1" min="0"
               value={val} autoFocus onChange={(e) => setVal(e.target.value)} />
        <div className="km-step">
          <button onClick={() => setVal(Math.max(0, num(val) - 1))}>−1</button>
          <button onClick={() => setVal(0)} style={{ width: "auto", padding: "0 14px", fontSize: 14 }}>finito</button>
          <button onClick={() => setVal(num(val) + 1)}>+1</button>
        </div>
        <button className="km-btn" disabled={busy || val === "" || num(val) < 0} onClick={salva}>
          {busy ? "Salvo…" : `Sono ${fmtQta(num(val))} ${um}`}
        </button>
        <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
          Resta nella storia come rettifica. A zero il pallino diventa rosso e va in spesa.
        </div>
        <button className="km-btn ghost" style={{ marginTop: 9 }} onClick={onChiudi}>Annulla</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Scheda articolo — solo per il regime MOVIMENTI ha davvero senso.
// Le azioni rapide portano la quantità dell'ultima volta: scaricare
// deve costare un tap, o nessuno scarica.
// ─────────────────────────────────────────────────────────────
function SchedaArticolo({ id, canWrite, indietro, etichettaIndietro = "Scorte" }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);   // {tipo, ripiano_id, val}
  const [mod, setMod] = useState(null);       // bozza anagrafica: {nome, um, confezione, regime, natura}
  const [corr, setCorr] = useState(null);     // {ripiano_id, dove, prima, val}
  const [sposta, setSposta] = useState(null); // {da, qta, ubiId, a}
  const [ubis, setUbis] = useState(null);     // posti per lo Sposta: [{id,nome,tipo,ripiani:[]}]
  const [busy, setBusy] = useState(false);
  const cfg = useScorteConfig();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setA(d.articolo);
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function apriSheet(tipo) {
    const casa = (a.posti || []).find((p) => p.e_casa) || (a.posti || [])[0];
    const suggerita = tipo === "SCARICO" ? a.azioni_rapide?.scarico
                    : tipo === "CARICO" ? a.azioni_rapide?.carico : null;
    const data = oggiIso();
    setSheet({
      tipo, ripiano_id: casa?.ripiano_id, val: suggerita || 1,
      data, scad: tipo === "CARICO" ? scadenzaProposta(cfg, casa?.tipo, data) : "",
    });
  }

  async function apriSposta() {
    const pieni = (a.posti || []).filter((p) => num(p.qta) > 0);
    const da = (pieni.find((p) => p.e_casa) || pieni[0] || (a.posti || [])[0]);
    setSposta({ da: da?.ripiano_id, qta: num(da?.qta) || 1, ubiId: null, a: null });
    if (!ubis) {
      try {
        const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/`);
        const d = await res.json();
        const lista = await Promise.all((d.ubicazioni || []).map(async (u) => {
          const r = await apiFetch(`${API_BASE}/cucina/ubicazioni/${u.id}/ripiani`);
          const rr = r.ok ? await r.json() : { ripiani: [] };
          return { id: u.id, nome: u.nome, tipo: u.tipo, ripiani: rr.ripiani || [] };
        }));
        setUbis(lista);
      } catch (e) { setErr(e.message); }
    }
  }

  async function confermaSposta() {
    if (!sposta || busy || !sposta.da || !sposta.a) return;
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/movimenti/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articolo_id: a.id, tipo: "TRASFERIMENTO", qta: num(sposta.qta),
          ripiano_id: sposta.da, ripiano_dest_id: sposta.a,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      setSposta(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function conferma() {
    if (!sheet || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/movimenti/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articolo_id: a.id, ripiano_id: sheet.ripiano_id,
          tipo: sheet.tipo, qta: Number(sheet.val),
          // Il lotto nasce solo se c'è una scadenza (o siamo in congelatore):
          // un carico di sale senza date resta un carico e basta.
          ...(sheet.tipo === "CARICO"
              && (sheet.scad || eGelo((a.posti || []).find((p) => p.ripiano_id === sheet.ripiano_id)?.tipo))
            ? { data_lotto: sheet.data || null, data_scadenza: sheet.scad || null } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSheet(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // I dettagli stanno sempre in pagina (Marco 2026-10-02: niente «Modifica»
  // da aprire). La bozza riparte dall'articolo a ogni ricarica; «Salva»
  // compare solo se qualcosa è cambiato davvero.
  const daArticolo = (x) => ({
    nome: x.nome || "", um: x.um || "PZ", confezione: x.confezione || "",
    regime: x.regime || "SEMAFORO", natura: x.natura || null,
    scorta_minima: x.scorta_minima ?? "",
  });
  useEffect(() => { if (a) setMod(daArticolo(a)); }, [a]);
  function resetModifica() { if (a) setMod(daArticolo(a)); }
  const modCambiato = !!(a && mod) && JSON.stringify(mod) !== JSON.stringify(daArticolo(a));

  async function salvaModifica() {
    if (!mod || busy || !mod.nome.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: mod.nome.trim(), um: mod.um, confezione: mod.confezione.trim() || null,
          regime: mod.regime, natura: mod.natura,
          scorta_minima: mod.scorta_minima === "" ? null : num(mod.scorta_minima),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !a) return (
    <div className="km-body">
      <button className="km-back" onClick={indietro}>‹ {etichettaIndietro}</button>
      <div className="km-err">{err}</div>
    </div>
  );
  if (!a) return <div className="km-body"><Vuoto icona="⏳" titolo="Carico…" /></div>;

  const sd = a.stato_dato;
  const movimenti = a.regime === "MOVIMENTI";

  return (
    <>
      <div className="km-head">
        <button className="km-back" onClick={indietro}>‹ {etichettaIndietro}</button>
        <div className="km-htop">
          <div>
            <h1 className="km-serif">{a.nome}</h1>
            <div className="km-sub">
              {[a.categoria, a.um, a.confezione, a.fornitore_freeform].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="km-body">
        {err && <div className="km-err">{err}</div>}

        <div className="km-card" style={{ textAlign: "center", padding: 18 }}>
          <div style={{ font: "700 44px/1 'Playfair Display',Georgia,serif" }}>
            {fmtGiacenza(a.giacenza, sd)}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            {a.um}{a.posti?.length > 1 ? ` · su ${a.posti.filter((p) => p.qta > 0).length || a.posti.length} ripiani` : ""}
          </div>
          <div style={{ marginTop: 9, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            <Chip tone="b">regime: {(a.regime || "").toLowerCase()}</Chip>
            {a.natura && <Chip tone="n">{a.natura.toLowerCase()}</Chip>}
            {sd?.stato === "DA_VERIFICARE" && <Chip tone="v">fermo da {sd.giorni} gg · da verificare</Chip>}
            {sd?.stato === "IGNOTO" && <Chip tone="v">mai movimentato</Chip>}
          </div>
        </div>

        {movimenti && canWrite && (
          <>
            <div className="km-qa">
              <button style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => apriSheet("SCARICO")}>
                <span className="e">➖</span>Scarico
                {a.azioni_rapide?.scarico != null &&
                  <span style={{ fontSize: 10, opacity: .7 }}>{fmtQta(a.azioni_rapide.scarico)} {a.um}</span>}
              </button>
              <button onClick={() => apriSheet("CARICO")}>
                <span className="e">➕</span>Carico
                {a.azioni_rapide?.carico != null &&
                  <span style={{ fontSize: 10, opacity: .55 }}>{fmtQta(a.azioni_rapide.carico)} {a.um}</span>}
              </button>
              <button onClick={() => apriSheet("SCARTO")}><span className="e">🗑️</span>Scarto</button>
              <button onClick={apriSposta}><span className="e">↔️</span>Sposta</button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: -3 }}>
              Le quantità sono quelle dell'ultima volta: un tap e via.
            </div>
          </>
        )}

        <div className="km-lbl">Dove si trova</div>
        <div className="km-card" style={{ padding: "6px 14px" }}>
          {(a.posti || []).length === 0 && (
            <div style={{ padding: "12px 0", color: "var(--muted)", fontSize: 13 }}>
              Non è ancora in dotazione da nessuna parte.
            </div>
          )}
          {(a.posti || []).map((p) => (
            <div key={p.giacenza_id} className={`km-tl${canWrite ? " tap" : ""}`}
                 onClick={() => canWrite && setCorr({
                   ripiano_id: p.ripiano_id, dove: `${p.ubicazione} · rip. ${p.ripiano}`,
                   prima: p.qta, val: p.qta ?? 0,
                 })}>
              <div className="bul" style={{ background: num(p.qta) > 0 ? "var(--blue)" : "#d5cfc3" }} />
              <div>
                <div className="t1">{p.ubicazione} · rip. {p.ripiano}</div>
                <div className="t2">
                  {p.e_casa ? "di casa" : "in dotazione"}
                  {p.destinazione && ` · ${p.destinazione.toLowerCase()}`}
                  {p.fuori_posto && " · ⚠ fuori posto"}
                </div>
              </div>
              <div className="rq" style={{ color: num(p.qta) > 0 ? undefined : "var(--muted)" }}>
                {p.qta == null ? "—" : fmtQta(p.qta)}
              </div>
            </div>
          ))}
        </div>

        {(a.lotti || []).length > 0 && (
          <>
            <div className="km-lbl">Lotti</div>
            <div className="km-card" style={{ padding: "6px 14px" }}>
              {a.lotti.map((l) => {
                const sc = scadenzaLabel(giorniA(l.data_scadenza));
                return (
                  <div key={l.id} className="km-tl">
                    <div className="bul" style={{ background: l.stato === "APERTO" ? "var(--amber)" : "var(--green)" }} />
                    <div>
                      <div className="t1">{l.lotto_codice || `Lotto #${l.id}`}{l.stato === "APERTO" ? " · aperto" : ""}</div>
                      <div className="t2">
                        {l.data_arrivo && `dentro dal ${fmtData(l.data_arrivo)}`}
                        {l.data_scadenza && ` · scade ${fmtData(l.data_scadenza)}`}
                        {sc && (giorniA(l.data_scadenza) ?? 9999) <= num(cfg?.scadenza_avviso_gg ?? 5) && ` · ${sc.txt}`}
                        {l.ubicazione && ` · ${l.ubicazione}`}{l.ripiano && ` rip. ${l.ripiano}`}
                      </div>
                    </div>
                    <div className="rq">{fmtQta(l.qta_residua)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mod && (
          <>
            <div className="km-lbl">Dettagli</div>
            <fieldset className="km-card" disabled={!canWrite}
                      style={{ padding: "4px 14px 14px", border: "1px solid var(--hair)", margin: 0, minWidth: 0 }}>
            <div className="km-flbl">Nome</div>
              <input className="km-in" value={mod.nome}
                     onChange={(e) => setMod({ ...mod, nome: e.target.value })} />

              <div className="km-flbl">Si conta in</div>
              <div className="km-pills wrap">
                {UM_OPZ.map((u) => (
                  <button key={u} className={`km-pill${mod.um === u ? " on" : ""}`}
                          onClick={() => setMod({ ...mod, um: u })}>{u.toLowerCase()}</button>
                ))}
              </div>

              <div className="km-flbl">Confezione</div>
              <input className="km-in" value={mod.confezione} placeholder="vaschetta 500 g, sacchetto, porzione…"
                     onChange={(e) => setMod({ ...mod, confezione: e.target.value })} />

              <div className="km-flbl">Come lo seguiamo</div>
              <div className="km-pills wrap">
                {REGIME_OPZ.map((r) => (
                  <button key={r.k} className={`km-pill${mod.regime === r.k ? " on" : ""}`}
                          onClick={() => setMod({ ...mod, regime: r.k })}>{r.t}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {REGIME_OPZ.find((r) => r.k === mod.regime)?.d}
              </div>

              {mod.regime === "MOVIMENTI" && (
                <>
                  <div className="km-flbl">Scorta minima ({(mod.um || "pz").toLowerCase()})</div>
                  <input className="km-in" type="number" inputMode="decimal" step="0.1" min="0"
                         value={mod.scorta_minima} placeholder="vuoto = niente giallo"
                         onChange={(e) => setMod({ ...mod, scorta_minima: e.target.value })} />
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Quando in tutto ne restano così pochi il pallino diventa giallo.
                  </div>
                </>
              )}

              <div className="km-flbl">Cos'è</div>
              <div className="km-pills wrap">
                {NATURA_OPZ.map((n) => (
                  <button key={n} className={`km-pill${mod.natura === n ? " on" : ""}`}
                          onClick={() => setMod({ ...mod, natura: mod.natura === n ? null : n })}>
                    {n.replace("_", "-").toLowerCase()}
                  </button>
                ))}
              </div>

            </fieldset>
            {modCambiato && (
              <div style={{ display: "flex", gap: 9 }}>
                <button className="km-btn ghost" disabled={busy} onClick={resetModifica}>Annulla</button>
                <button className="km-btn" disabled={busy || !mod.nome.trim()} onClick={salvaModifica}>
                  {busy ? "Salvo…" : "Salva modifiche"}
                </button>
              </div>
            )}
          </>
        )}

        {(a.movimenti || []).length > 0 && (
          <>
            <div className="km-lbl">Movimenti</div>
            <div className="km-card" style={{ padding: "6px 14px" }}>
              {a.movimenti.map((m) => (
                <div key={m.id} className="km-tl" style={{ opacity: m.annullato_at ? 0.45 : 1 }}>
                  <div className="bul" style={{
                    background: m.tipo === "CARICO" ? "var(--green)"
                              : m.tipo === "RETTIFICA" ? "var(--amber)" : "var(--red)" }} />
                  <div>
                    <div className="t1" style={{ textDecoration: m.annullato_at ? "line-through" : "none" }}>
                      {m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()} {fmtQta(Math.abs(num(m.qta_delta)))} {a.um}
                    </div>
                    <div className="t2">
                      {(m.created_at || "").slice(0, 16).replace("T", " ")} · {m.utente}
                      {m.motivo && ` · ${m.motivo}`}
                      {m.annullato_at && ` · annullato da ${m.annullato_da}`}
                    </div>
                  </div>
                  <div className="rq">{fmtQta(m.qta_risultante)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {sheet && (
        <div className="km-sheet" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="km-sheet-in">
            <h3 className="km-serif">
              {sheet.tipo === "SCARICO" ? "Scarico" : sheet.tipo === "CARICO" ? "Carico" : "Scarto"} · {a.nome}
            </h3>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {(a.posti || []).find((p) => p.ripiano_id === sheet.ripiano_id)
                ? `${(a.posti).find((p) => p.ripiano_id === sheet.ripiano_id).ubicazione} · rip. ${(a.posti).find((p) => p.ripiano_id === sheet.ripiano_id).ripiano}`
                : "nessun ripiano"}
            </div>
            <input className="km-num" type="number" inputMode="decimal" step="0.1" min="0"
                   value={sheet.val}
                   onChange={(e) => setSheet({ ...sheet, val: e.target.value })} />
            <div className="km-step">
              <button onClick={() => setSheet({ ...sheet, val: Math.max(0, num(sheet.val) - 1) })}>−1</button>
              <button onClick={() => setSheet({ ...sheet, val: num(sheet.val) + 1 })}>+1</button>
            </div>
            {(a.posti || []).length > 1 && (
              <div className="km-pills" style={{ marginBottom: 10 }}>
                {a.posti.map((p) => (
                  <button key={p.giacenza_id}
                          className={`km-pill${sheet.ripiano_id === p.ripiano_id ? " on" : ""}`}
                          onClick={() => setSheet({
                            ...sheet, ripiano_id: p.ripiano_id,
                            scad: sheet.tipo === "CARICO" ? scadenzaProposta(cfg, p.tipo, sheet.data) : sheet.scad,
                          })}>
                    {p.ubicazione} · {p.ripiano}
                  </button>
                ))}
              </div>
            )}
            {sheet.tipo === "CARICO" && (() => {
              const gelo = eGelo((a.posti || []).find((p) => p.ripiano_id === sheet.ripiano_id)?.tipo);
              return (
                <CampiData gelo={gelo} data={sheet.data} scad={sheet.scad}
                           onChange={(v) => setSheet({ ...sheet, ...v })} />
              );
            })()}
            <button className="km-btn" disabled={busy || num(sheet.val) <= 0} onClick={conferma}>
              {busy ? "Registro…" : `${sheet.tipo === "CARICO" ? "Carica" : sheet.tipo === "SCARTO" ? "Butta" : "Scarica"} ${fmtQta(num(sheet.val))} ${a.um}`}
            </button>
            <button className="km-btn ghost" style={{ marginTop: 9 }} onClick={() => setSheet(null)}>Annulla</button>
          </div>
        </div>
      )}

      {sposta && (
        <div className="km-sheet" onClick={(e) => { if (e.target === e.currentTarget) setSposta(null); }}>
          <div className="km-sheet-in">
            <h3 className="km-serif">Sposta · {a.nome}</h3>

            <div className="km-flbl">Da</div>
            <div className="km-pills wrap">
              {(a.posti || []).map((p) => (
                <button key={p.giacenza_id} className={`km-pill${sposta.da === p.ripiano_id ? " on" : ""}`}
                        onClick={() => setSposta({ ...sposta, da: p.ripiano_id, qta: num(p.qta) || sposta.qta })}>
                  {p.ubicazione} · {p.ripiano} <span className="c">{fmtQta(p.qta)}</span>
                </button>
              ))}
            </div>

            <input className="km-num" type="number" inputMode="decimal" step="0.1" min="0"
                   value={sposta.qta} onChange={(e) => setSposta({ ...sposta, qta: e.target.value })} />

            <div className="km-flbl">A</div>
            {!ubis && <div style={{ fontSize: 13, color: "var(--muted)", padding: "6px 0" }}>Carico i posti…</div>}
            <div className="km-pills wrap">
              {(ubis || []).map((u) => (
                <button key={u.id} className={`km-pill${sposta.ubiId === u.id ? " on" : ""}`}
                        onClick={() => setSposta({ ...sposta, ubiId: u.id, a: u.ripiani.length === 1 ? u.ripiani[0].id : null })}>
                  {u.nome}
                </button>
              ))}
            </div>
            {sposta.ubiId && (
              <div className="km-pills wrap" style={{ marginBottom: 12 }}>
                {((ubis || []).find((u) => u.id === sposta.ubiId)?.ripiani || []).map((r) => (
                  <button key={r.id} disabled={r.id === sposta.da}
                          className={`km-pill${sposta.a === r.id ? " on" : ""}`}
                          onClick={() => setSposta({ ...sposta, a: r.id })}>
                    rip. {r.codice}{r.nome ? ` · ${r.nome}` : ""}
                  </button>
                ))}
              </div>
            )}

            <button className="km-btn" disabled={busy || !sposta.da || !sposta.a || num(sposta.qta) <= 0}
                    onClick={confermaSposta}>
              {busy ? "Sposto…" : `Sposta ${fmtQta(num(sposta.qta))} ${a.um}`}
            </button>
            <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
              Le date viaggiano con la roba: prima esce quella che scade prima.
            </div>
            <button className="km-btn ghost" style={{ marginTop: 9 }} onClick={() => setSposta(null)}>Annulla</button>
          </div>
        </div>
      )}

      {corr && (
        <CorreggiSheet artId={a.id} nome={a.nome} um={a.um} ripianoId={corr.ripiano_id}
                       dove={corr.dove} prima={corr.prima}
                       onChiudi={() => setCorr(null)}
                       onFatto={() => { setCorr(null); load(); }} />
      )}

    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 3 · FRIGO — il giro. È il gesto principale del modulo.
// ─────────────────────────────────────────────────────────────
function TabFrigo({ onCount, apri, modi }) {
  const [ubi, setUbi] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/?reparto=cucina&con_stato=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setUbi(d.ubicazioni || []);
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!ubi) return;
    onCount(ubi.filter((u) => u.guasti_aperti > 0 || u.ultima_temperatura?.fuori_soglia).length);
  }, [ubi, onCount]);

  const fuoriSoglia = (ubi || []).filter((u) => u.ultima_temperatura?.fuori_soglia);

  return (
    <>
      <div className="km-head">
        <div className="km-htop">
          <div>
            <h1 className="km-serif">Frigo</h1>
            <div className="km-sub">Il giro · {(ubi || []).length} posti</div>
          </div>
        </div>
        {modi}
      </div>
      <div className="km-body">
        {err && <div className="km-err">{err}</div>}
        {!ubi && <Vuoto icona="⏳" titolo="Carico…" />}

        {fuoriSoglia.map((u) => (
          <div key={`w${u.id}`} className="km-banner r">
            <span>🚨</span>
            <div><b>{u.nome} a {fmtQta(u.ultima_temperatura.valore)} °C.</b> Fuori dalla soglia dichiarata.</div>
          </div>
        ))}

        {ubi && ubi.length === 0 && (
          <Vuoto icona="🧊" titolo="Nessun posto configurato"
                 testo="I frigoriferi, la cella e la dispensa si creano dal gestionale. Ogni posto nasce con almeno un ripiano." />
        )}

        {(ubi || []).map((u) => {
          const t = u.ultima_temperatura;
          const guasto = u.guasti_aperti > 0;
          const d = u.dotazione || {};
          return (
            <button key={u.id} className={`km-frigo${t?.fuori_soglia || guasto ? " ko" : ""}`} onClick={() => apri(u.id)}>
              <div className="ico">{u.tipo === "CELLA" || u.tipo === "FREEZER" ? "❄️"
                : u.tipo === "ABBATTITORE" ? "🔥" : u.tipo === "DISPENSA" || u.tipo === "SCAFFALE" ? "🗄️" : "🧊"}</div>
              <div className="gr">
                <div className="nm">{u.nome}</div>
                <div className="ln">
                  {d.finiti > 0 && <Chip tone="r">{d.finiti} finiti</Chip>}
                  {d.finiti === 0 && d.in_esaurimento > 0 && <Chip tone="a">{d.in_esaurimento} in esaurimento</Chip>}
                  {d.finiti === 0 && d.in_esaurimento === 0 && d.articoli > 0 && <Chip tone="g">tutto a posto</Chip>}
                  {guasto && <Chip tone="a">guasto</Chip>}
                  <span>{u.ripiani} ripiani · {d.articoli || 0} articoli</span>
                </div>
              </div>
              {u.refrigerato ? (
                <div style={{ textAlign: "right" }}>
                  <div className={`km-temp ${t?.fuori_soglia ? "ko" : "ok"}`}>
                    {t ? `${fmtQta(t.valore)}°` : "—"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {u.temp_min != null || u.temp_max != null
                      ? `${u.temp_min ?? "?"} / ${u.temp_max ?? "?"} °C` : "senza soglia"}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>niente<br />sonda</div>
              )}
              <span className="km-arrow">›</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Dentro un frigo — ripiani dall'alto in basso, con i pallini.
// La dotazione mostra ANCHE la roba finita: è il punto di tutto.
// ─────────────────────────────────────────────────────────────
function DentroFrigo({ id, canWrite, indietro, apriArticolo }) {
  const [u, setU] = useState(null);
  const [aggiungi, setAggiungi] = useState(null);   // il ripiano su cui aggiungere
  const [corr, setCorr] = useState(null);           // correzione da tocco sul pallino (MOVIMENTI)
  const [err, setErr] = useState(null);
  // Vista: "tutti" | "mancanti" | "registro" (registro dei finiti, chef/sous chef)
  const [vista, setVista] = useState("tutti");
  const soloMancanti = vista === "mancanti";
  const ruolo = localStorage.getItem("role");
  const vedeRegistro = ["superadmin", "admin", "chef", "sous_chef"].includes(ruolo);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setU(d.ubicazione);
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const { toast, tap, annulla } = useSemaforo(load);

  if (err && !u) return (
    <div className="km-body">
      <button className="km-back" onClick={indietro}>‹ Il giro</button>
      <div className="km-err">{err}</div>
    </div>
  );
  if (!u) return <div className="km-body"><Vuoto icona="⏳" titolo="Carico…" /></div>;

  const t = u.temperature?.[0];
  const finiti = (u.ripiani || []).reduce((s, r) => s + (r.finiti || 0), 0);
  const totArt = (u.ripiani || []).reduce((s, r) => s + (r.dotazione || []).length, 0);

  return (
    <>
      <div className="km-head">
        <button className="km-back" onClick={indietro}>‹ Il giro</button>
        <div className="km-htop">
          <div>
            <h1 className="km-serif">{u.nome}</h1>
            <div className="km-sub">
              {finiti} da comprare · {(u.ripiani || []).length} ripiani · {totArt} articoli
            </div>
          </div>
          {u.refrigerato && (
            <div style={{ textAlign: "right" }}>
              <div className={`km-temp ${t?.fuori_soglia ? "ko" : "ok"}`}>{t ? `${fmtQta(t.valore)}°` : "—"}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                {t?.completato_at ? `letta ${t.completato_at.slice(11, 16)}` : "mai letta"}
              </div>
            </div>
          )}
        </div>
        <div className="km-pills">
          <button className={`km-pill${vista === "tutti" ? " on" : ""}`} onClick={() => setVista("tutti")}>
            Tutti i ripiani
          </button>
          <button className={`km-pill${vista === "mancanti" ? " on" : ""}`} onClick={() => setVista("mancanti")}>
            Solo mancanti{finiti > 0 && <span className="c">{finiti}</span>}
          </button>
          {vedeRegistro && (
            <button className={`km-pill${vista === "registro" ? " on" : ""}`} onClick={() => setVista("registro")}>
              Registro
            </button>
          )}
        </div>
      </div>

      <div className="km-body">
        {err && <div className="km-err">{err}</div>}

        {(u.manutenzioni_aperte || []).map((m) => (
          <div key={m.id} className="km-banner a">
            <span>🔧</span>
            <div><b>{m.tipo.toLowerCase()} aperto dal {m.data}.</b> {m.descrizione || ""}</div>
          </div>
        ))}
        {t?.fuori_soglia && (
          <div className="km-banner r">
            <span>🚨</span>
            <div><b>{fmtQta(t.valore)} °C, fuori dalla soglia {u.temp_min ?? "?"} / {u.temp_max ?? "?"}.</b></div>
          </div>
        )}

        {vista === "registro" && <RegistroFiniti ubicazioneId={id} onCambio={load} />}

        {vista !== "registro" && (u.ripiani || []).length === 0 && (
          <Vuoto icona="📭" titolo="Nessun ripiano attivo"
                 testo="Ogni posto dovrebbe averne almeno uno." />
        )}

        {vista !== "registro" && (u.ripiani || []).map((r) => {
          const righe = soloMancanti
            ? (r.dotazione || []).filter((d) => d.stato_semaforo === "FINITO" || d.stato_semaforo === "ESAURIMENTO")
            : (r.dotazione || []);
          if (soloMancanti && righe.length === 0) return null;
          return (
            <React.Fragment key={r.id}>
              <div className="km-rip">
                <div className="num">{r.codice}</div>
                <div className="lb">{r.nome || `Ripiano ${r.codice}`}</div>
                {r.destinazione && <span className={`km-dest ${r.destinazione}`}>{r.destinazione.toLowerCase()}</span>}
                <div className="rest">{(r.dotazione || []).length} articoli</div>
                {canWrite && <button className="km-add" onClick={() => setAggiungi(r)}>＋ Aggiungi</button>}
              </div>
              {righe.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "6px 2px" }}>
                  Ripiano vuoto — niente in dotazione.
                </div>
              )}
              {righe.map((a) => (
                <RigaArticolo key={a.giacenza_id} a={a} canWrite={canWrite}
                              onTap={(art, stato) => (art.regime === "MOVIMENTI"
                                ? setCorr({ art, ripiano: r })
                                : tap(art, stato, r.id))}
                              onApri={(art) => apriArticolo(art.articolo_id,
                                { path: `/cucina/mobile/frigo/${id}`, label: u.nome })} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <Toast testo={toast} onAnnulla={annulla} />
      {corr && (
        <CorreggiSheet artId={corr.art.articolo_id} nome={corr.art.nome} um={corr.art.um}
                       ripianoId={corr.ripiano.id} dove={`${u.nome} · rip. ${corr.ripiano.codice}`}
                       prima={corr.art.qta}
                       onChiudi={() => setCorr(null)}
                       onFatto={() => { setCorr(null); load(); }} />
      )}
      {aggiungi && (
        <AggiungiSheet ubicazione={u} ripiano={aggiungi}
                       onChiudi={() => setAggiungi(null)}
                       onFatto={() => { setAggiungi(null); load(); }} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Registro dei finiti (Marco 2026-10-04): gli articoli a regime «conta»
// contati a zero escono dal ripiano e restano qui. Lo vedono chef e sous
// chef. «Rimetti» annulla l'uscita e riporta l'articolo sul suo ripiano.
// ─────────────────────────────────────────────────────────────
function RegistroFiniti({ ubicazioneId, onCambio }) {
  const [righe, setRighe] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/finiti/?ubicazione_id=${ubicazioneId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRighe(d.finiti || []);
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, [ubicazioneId]);

  useEffect(() => { load(); }, [load]);

  async function rimetti(r) {
    setBusy(r.id);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/movimenti/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      onCambio && onCambio();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  if (err && !righe) return <div className="km-err">{err}</div>;
  if (!righe) return <Vuoto icona="⏳" titolo="Carico…" />;
  if (righe.length === 0) return (
    <Vuoto icona="📒" titolo="Registro vuoto"
           testo="Qui finiscono gli articoli a regime «conta» che alla conta risultano a zero: escono dal ripiano e resta la traccia." />
  );

  return (
    <>
      {err && <div className="km-err">{err}</div>}
      {righe.map((r) => (
        <div key={r.id} className="km-card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <b>{r.articolo}</b>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                rip. {r.ripiano || "—"} · c'erano {fmtQta(num(r.qta_precedente))} {(r.um || "").toLowerCase()}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {(r.created_at || "").slice(8, 10)}/{(r.created_at || "").slice(5, 7)} {(r.created_at || "").slice(11, 16)}
                {r.utente ? ` · ${r.utente}` : ""}{r.motivo ? ` · ${r.motivo}` : ""}
              </div>
            </div>
            <button className="km-pill" disabled={busy === r.id} onClick={() => rimetti(r)}>
              {busy === r.id ? "…" : "↩︎ Rimetti"}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ＋ Aggiungi su un ripiano — dal telefono, senza passare dal computer.
// Prima cerca fra gli articoli che esistono già: «ragù» deve trovare il
// Ragù di lepre, non creare un doppione. Solo se non c'è, lo crea.
// In congelatore il nuovo articolo nasce a regime MOVIMENTI e famiglia
// CONGELATO (decisione Marco 2026-10-01), e il carico chiede le date.
// ─────────────────────────────────────────────────────────────
function AggiungiSheet({ ubicazione, ripiano, onChiudi, onFatto }) {
  const cfg = useScorteConfig();
  const gelo = eGelo(ubicazione.tipo);
  const [q, setQ] = useState("");
  const [ris, setRis] = useState([]);
  const [scelto, setScelto] = useState(null);     // articolo esistente
  const [nuovo, setNuovo] = useState(false);
  const [um, setUm] = useState("PZ");
  const [confezione, setConfezione] = useState("");
  const [qta, setQta] = useState("");
  const [data, setData] = useState(oggiIso());
  const [scad, setScad] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { if (cfg && !scad) setScad(scadenzaProposta(cfg, ubicazione.tipo, data)); }, [cfg]); // eslint-disable-line

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2 || scelto) { setRis([]); return; }
    const h = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/?q=${encodeURIComponent(t)}&limit=8`);
        const d = await res.json();
        setRis((d.articoli || []).filter((x) => !(x.nome || "").startsWith("[DEMO]")));
      } catch { setRis([]); }
    }, 250);
    return () => clearTimeout(h);
  }, [q, scelto]);

  const esatto = ris.some((x) => (x.nome || "").trim().toLowerCase() === q.trim().toLowerCase());
  const pronto = scelto || (nuovo && q.trim());

  async function salva() {
    if (!pronto || busy) return;
    setBusy(true); setErr(null);
    const json = { "Content-Type": "application/json" };
    try {
      let artId = scelto?.id;
      if (!artId) {
        const res = await apiFetch(`${API_BASE}/cucina/scorte/articoli/`, {
          method: "POST", headers: json,
          body: JSON.stringify({
            nome: q.trim(), um, confezione: confezione.trim() || null,
            regime: gelo ? "MOVIMENTI" : "SEMAFORO",
            famiglia_freschezza: gelo ? "CONGELATO" : "SECCO",
            ripiano_casa_id: ripiano.id,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        artId = (await res.json()).articolo.id;
      } else {
        const res = await apiFetch(`${API_BASE}/cucina/scorte/dotazione/`, {
          method: "POST", headers: json,
          body: JSON.stringify({ articolo_id: artId, ripiano_id: ripiano.id }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      }
      if (num(qta) > 0) {
        const res = await apiFetch(`${API_BASE}/cucina/scorte/movimenti/`, {
          method: "POST", headers: json,
          body: JSON.stringify({
            articolo_id: artId, ripiano_id: ripiano.id, tipo: "CARICO", qta: num(qta),
            motivo: "aggiunto dal ripiano",
            ...(gelo || scad ? { data_lotto: data || null, data_scadenza: scad || null } : {}),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      }
      onFatto();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="km-sheet" onClick={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <div className="km-sheet-in">
        <h3 className="km-serif">Aggiungi · {ubicazione.nome} rip. {ripiano.codice}</h3>
        {err && <div className="km-err" style={{ marginTop: 8 }}>{err}</div>}

        <div className="km-flbl">Cosa metti?</div>
        <input className="km-in" value={q} placeholder="es. ragù di lepre" autoFocus
               onChange={(e) => { setQ(e.target.value); setScelto(null); setNuovo(false); }} />

        {!scelto && (ris.length > 0 || (q.trim().length >= 2 && !esatto)) && (
          <div className="km-res">
            {ris.map((x) => (
              <button key={x.id} onClick={() => { setScelto(x); setNuovo(false); setQ(x.nome); }}>
                <span>{x.nome}</span>
                <span className="m">{x.um}{x.giacenza != null ? ` · ${fmtQta(x.giacenza)} in casa` : ""}</span>
              </button>
            ))}
            {q.trim().length >= 2 && !esatto && (
              <button className={nuovo ? "on" : ""} onClick={() => setNuovo(true)}>
                <span>＋ Nuovo: «{q.trim()}»</span><span className="m">non c'è ancora</span>
              </button>
            )}
          </div>
        )}

        {pronto && (
          <>
            {nuovo && (
              <>
                <div className="km-flbl">Si conta in</div>
                <div className="km-pills wrap">
                  {UM_OPZ.map((x) => (
                    <button key={x} className={`km-pill${um === x ? " on" : ""}`} onClick={() => setUm(x)}>
                      {x.toLowerCase()}
                    </button>
                  ))}
                </div>
                <div className="km-flbl">Confezione</div>
                <input className="km-in" value={confezione} placeholder="vaschetta 500 g, sacchetto…"
                       onChange={(e) => setConfezione(e.target.value)} />
              </>
            )}

            <div className="km-flbl">Quanti ne metti? <span style={{ textTransform: "none", fontWeight: 500 }}>(vuoto = solo «sta qui»)</span></div>
            <input className="km-num" type="number" inputMode="decimal" step="0.1" min="0"
                   value={qta} onChange={(e) => setQta(e.target.value)} />

            {num(qta) > 0 && (
              <CampiData gelo={gelo} data={data} scad={scad}
                         onChange={(v) => {
                           if (v.data !== undefined) {
                             setData(v.data);
                             if (gelo) setScad(scadenzaProposta(cfg, ubicazione.tipo, v.data));
                           }
                           if (v.scad !== undefined) setScad(v.scad);
                         }} />
            )}
          </>
        )}

        <button className="km-btn" disabled={busy || !pronto} onClick={salva}>
          {busy ? "Salvo…" : num(qta) > 0
            ? `Metti ${fmtQta(num(qta))} ${scelto?.um || um} su rip. ${ripiano.codice}`
            : `Metti su rip. ${ripiano.codice}`}
        </button>
        <button className="km-btn ghost" style={{ marginTop: 9 }} onClick={onChiudi}>Annulla</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 4 · SPESA — la lista che si riempie da sola.
// Raggruppata per fornitore: prima chi ha un nome, in fondo il resto.
// ─────────────────────────────────────────────────────────────
function TabSpesa({ canWrite, onCount, modi }) {
  const [dati, setDati] = useState(null);
  const [mostraFatti, setMostraFatti] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  // Riga scritta a mano (Marco 2026-10-03): non tutto passa dal frigo.
  const [nuova, setNuova] = useState({ titolo: "", qta: "", urgente: false });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/lista-spesa/items/?stato=${mostraFatti ? "tutti" : "da_fare"}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDati(await res.json());
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, [mostraFatti]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (dati?.kpi) onCount(dati.kpi.da_fare || 0); }, [dati, onCount]);

  async function toggle(item) {
    if (!canWrite || busy) return;
    setBusy(item.id);
    try {
      const res = await apiFetch(`${API_BASE}/lista-spesa/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatto: !item.fatto }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function aggiungi(e) {
    e && e.preventDefault();
    const titolo = nuova.titolo.trim();
    if (!canWrite || !titolo || busy) return;
    setBusy("nuova");
    try {
      const res = await apiFetch(`${API_BASE}/lista-spesa/items/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo, quantita_libera: nuova.qta.trim() || null, urgente: nuova.urgente,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      setNuova({ titolo: "", qta: "", urgente: false });
      await load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(null); }
  }

  const gruppi = useMemo(() => {
    const items = dati?.items || [];
    const map = new Map();
    for (const it of items) {
      const k = (it.fornitore_freeform || "").trim() || "__nessuno__";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    // Chi ha un fornitore in alto, «senza fornitore» sempre in fondo.
    return [...map.entries()].sort((a, b) =>
      a[0] === "__nessuno__" ? 1 : b[0] === "__nessuno__" ? -1 : a[0].localeCompare(b[0]));
  }, [dati]);

  return (
    <>
      <div className="km-head">
        <div className="km-htop">
          <div>
            <h1 className="km-serif">Spesa</h1>
            <div className="km-sub">
              {dati?.kpi?.da_fare ?? 0} da comprare
              {gruppi.length > 0 && ` · ${gruppi.filter(([k]) => k !== "__nessuno__").length} fornitori`}
            </div>
          </div>
        </div>
        {modi}
        <div className="km-pills">
          <button className={`km-pill${!mostraFatti ? " on" : ""}`} onClick={() => setMostraFatti(false)}>Da fare</button>
          <button className={`km-pill${mostraFatti ? " on" : ""}`} onClick={() => setMostraFatti(true)}>Anche i fatti</button>
        </div>
        {canWrite && (
          <form onSubmit={aggiungi} style={{ marginTop: 10 }}>
            <input className="km-search" style={{ marginTop: 0 }} placeholder="✏️  Cosa serve? (es. limoni)"
                   value={nuova.titolo} onChange={(e) => setNuova({ ...nuova, titolo: e.target.value })}
                   enterKeyHint="done" />
            {nuova.titolo.trim() && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <input className="km-search" style={{ marginTop: 0, flex: 1 }} placeholder="Quanto? (facoltativo)"
                       value={nuova.qta} onChange={(e) => setNuova({ ...nuova, qta: e.target.value })} />
                <button type="button" className={`km-pill${nuova.urgente ? " on" : ""}`}
                        onClick={() => setNuova({ ...nuova, urgente: !nuova.urgente })}>⚡ urgente</button>
                <button type="submit" className="km-pill on" disabled={busy === "nuova"}>
                  {busy === "nuova" ? "…" : "Aggiungi"}
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      <div className="km-body">
        {err && <div className="km-err">{err}</div>}
        {!dati && <Vuoto icona="⏳" titolo="Carico…" />}
        {dati && (dati.items || []).length === 0 && (
          <Vuoto icona="🛒" titolo="Lista vuota"
                 testo="Scrivi qui sopra cosa serve, oppure segna finito un articolo nel Frigo: arriva qui da solo." />
        )}

        {gruppi.map(([forn, items]) => (
          <React.Fragment key={forn}>
            <div className="km-lbl">
              {forn === "__nessuno__" ? "Senza fornitore" : forn}
            </div>
            {items.map((it) => (
              <div key={it.id} className="km-art">
                <button className={`km-tick${it.fatto ? " on" : ""}`}
                        disabled={!canWrite || busy === it.id}
                        onClick={() => toggle(it)}>{it.fatto ? "✓" : ""}</button>
                <div className="gr" style={{ opacity: it.fatto ? 0.55 : 1 }}>
                  <div className="nm" style={{ textDecoration: it.fatto ? "line-through" : "none" }}>
                    {it.titolo}{it.quantita_libera ? ` · ${it.quantita_libera}` : ""}
                  </div>
                  <div className="ln">
                    {!it.fatto && it.urgente && <Chip tone="r">urgente</Chip>}
                    {it.note && <Chip tone="n">{it.note}</Chip>}
                    {it.fatto && it.completato_da && <span>preso · {it.completato_da}</span>}
                    {!it.fatto && it.created_at && <span>{it.created_at.slice(0, 10)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 🌡 Le temperature di oggi — il «gate» (Marco 2026-10-02)
// «Il primo che apre deve inserire la temperatura; solo admin, superadmin e
// chef hanno il tasto ignora.» Si chiede al backend se oggi c'è una checklist
// di temperature aperta (voci TEMPERATURA agganciate a un frigo); se sì, copre
// tutta la sotto-app finché non è fatta. I valori vanno nel registro HACCP
// del Task Manager con i suoi endpoint: il registro resta uno solo.
// Nei congelatori (soglia massima ≤ 0) il numero nasce col «−»: sul tastierino
// numerico dell'iPhone il meno non c'è, e nessuno deve doverlo cercare.
// ─────────────────────────────────────────────────────────────
function TemperatureGate() {
  const [dati, setDati] = useState(null);
  const [val, setVal] = useState({});     // item_id → {segno: -1|1, testo}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [chiuso, setChiuso] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiFetch(`${API_BASE}/cucina/ubicazioni/temperature/oggi`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setDati(d);
        const init = {};
        (d.istanze || []).forEach((i) => i.voci.forEach((v) => {
          init[v.item_id] = { segno: v.max_valore != null && v.max_valore <= 0 ? -1 : 1, testo: "" };
        }));
        setVal(init);
      })
      .catch(() => {});   // il gate non blocca mai la cucina per un problema tecnico
    return () => { vivo = false; };
  }, []);

  if (chiuso || !dati?.da_fare) return null;

  const voci = dati.istanze.flatMap((i) => i.voci.filter((v) => v.valore == null)
    .map((v) => ({ ...v, instance_id: i.instance_id })));
  const numero = (id) => {
    const x = val[id];
    if (!x || x.testo.trim() === "") return null;
    const n = Number(x.testo.replace(",", "."));
    return Number.isFinite(n) ? x.segno * Math.abs(n) : null;
  };
  const fuori = (v) => {
    const n = numero(v.item_id);
    if (n == null) return false;
    return (v.min_valore != null && n < v.min_valore) || (v.max_valore != null && n > v.max_valore);
  };
  const tutte = voci.every((v) => numero(v.item_id) != null);

  async function registra() {
    if (!tutte || busy) return;
    setBusy(true); setErr(null);
    const json = { "Content-Type": "application/json" };
    try {
      for (const v of voci) {
        const n = numero(v.item_id);
        const res = await apiFetch(`${API_BASE}/tasks/execution/item/${v.item_id}/check`, {
          method: "POST", headers: json,
          body: JSON.stringify({
            instance_id: v.instance_id, stato: fuori(v) ? "FAIL" : "OK", valore_numerico: n,
            note: fuori(v) ? "fuori soglia, registrata dalla Cucina iPhone" : null,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      }
      for (const i of dati.istanze) {
        await apiFetch(`${API_BASE}/tasks/instances/${i.instance_id}/completa`, { method: "POST" });
      }
      setChiuso(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function ignora() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      for (const i of dati.istanze) {
        const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/temperature/oggi/ignora`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instance_id: i.instance_id }),
        });
        if (!res.ok && res.status !== 409) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      }
      setChiuso(true);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const fuoriSoglia = voci.filter(fuori);

  return (
    <div className="km-gate" role="dialog" aria-label="Temperature di oggi">
      <div className="km-gate-in">
        <h2>🌡 Temperature di oggi</h2>
        <div className="km-sub" style={{ marginTop: 4 }}>
          Prima di cominciare: leggi il termometro di ogni frigo e congelatore.
        </div>
        {err && <div className="km-err" style={{ marginTop: 10 }}>{err}</div>}

        {voci.map((v) => {
          const x = val[v.item_id] || { segno: 1, testo: "" };
          return (
            <div key={v.item_id} className={`km-trow${fuori(v) ? " ko" : ""}`}>
              <div className="t">{v.titolo}</div>
              <div className="s">
                deve stare fra {fmtQta(v.min_valore)} e {fmtQta(v.max_valore)} {v.unita_misura || "°C"}
                {fuori(v) && " · FUORI SOGLIA"}
              </div>
              <div className="km-tin">
                <button type="button" aria-label="cambia segno"
                        onClick={() => setVal({ ...val, [v.item_id]: { ...x, segno: -x.segno } })}>
                  {x.segno < 0 ? "−" : "+"}
                </button>
                <input type="text" inputMode="decimal" placeholder="—" value={x.testo}
                       onChange={(e) => setVal({ ...val, [v.item_id]: { ...x, testo: e.target.value.replace(/[^0-9.,]/g, "") } })} />
                <span className="u">{v.unita_misura || "°C"}</span>
              </div>
            </div>
          );
        })}

        {fuoriSoglia.length > 0 && (
          <div className="km-banner r" style={{ marginTop: 12 }}>
            <span>🚨</span>
            <div><b>{fuoriSoglia.map((v) => v.titolo).join(", ")} fuori soglia.</b> Si registra lo stesso: avvisa subito l'oste.</div>
          </div>
        )}

        <button className="km-btn" style={{ marginTop: 16 }} disabled={busy || !tutte} onClick={registra}>
          {busy ? "Registro…" : tutte ? "Registra le temperature" : `Mancano ${voci.filter((v) => numero(v.item_id) == null).length}`}
        </button>
        {dati.puo_ignorare && (
          <button className="km-btn ghost" style={{ marginTop: 9 }} disabled={busy} onClick={ignora}>
            Ignora per oggi
          </button>
        )}
        {dati.puo_ignorare && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
            Ignorare resta scritto nel registro HACCP, con il tuo nome.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Entry point
//   /cucina/mobile                → tab Oggi
//   /cucina/mobile/:tab           → oggi | scorte | frigo | spesa
//   /cucina/mobile/:tab/:id       → dentro un frigo / scheda articolo
// ─────────────────────────────────────────────────────────────
export default function CucinaMobile() {
  const { tab, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const aSe = PAGINE_A_SE.includes(tab);
  const attivo = aSe || TABS.some((t) => t.k === tab) ? tab : "frigo";
  const role = localStorage.getItem("role");
  const canWrite = isCucinaWriterRole(role) || role === "sous_chef" || role === "commis";

  const [badge, setBadge] = useState({ oggi: 0, scorte: 0, frigo: 0, spesa: 0 });
  const setB = useCallback((k) => (n) => setBadge((b) => (b[k] === n ? b : { ...b, [k]: n })), []);

  const vai = useCallback((k) => navigate(`/cucina/mobile/${k}`), [navigate]);
  const apriFrigo = useCallback((uid) => navigate(`/cucina/mobile/frigo/${uid}`), [navigate]);
  // `da` = da dove arrivo ({path, label}): dal frigo si torna al frigo, non alle Scorte.
  const apriArticolo = useCallback(
    (aid, da) => navigate(`/cucina/mobile/scorte/${aid}`, da ? { state: { da } } : undefined),
    [navigate],
  );
  const da = location.state?.da;

  const modi = aSe ? null : <Modi attivo={attivo} badge={badge} vai={vai} />;

  let vista;
  if (attivo === "frigo" && id) {
    vista = <DentroFrigo id={id} canWrite={canWrite} indietro={() => vai("frigo")} apriArticolo={apriArticolo} />;
  } else if (attivo === "scorte" && id) {
    vista = <SchedaArticolo id={id} canWrite={canWrite}
                            indietro={() => (da?.path ? navigate(da.path) : vai("scorte"))}
                            etichettaIndietro={da?.label || "Scorte"} />;
  } else if (attivo === "scorte") {
    vista = <TabScorte canWrite={canWrite} onCount={setB("scorte")} apri={apriArticolo} modi={modi} />;
  } else if (attivo === "frigo") {
    vista = <TabFrigo onCount={setB("frigo")} apri={apriFrigo} modi={modi} />;
  } else if (attivo === "spesa") {
    vista = <TabSpesa canWrite={canWrite} onCount={setB("spesa")} modi={modi} />;
  } else {
    vista = (
      <>
        <div className="km-head">
          <div className="km-htop">
            <div>
              <h1 className="km-serif">Oggi</h1>
              <div className="km-sub">
                {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
          </div>
          {modi}
        </div>
        <TabOggi canWrite={canWrite} onCount={setB("oggi")} />
      </>
    );
  }

  return (
    <div className={`km-root${aSe ? " a-se" : ""}`}>
      <style>{STYLE}</style>
      {vista}
      {!aSe && <TabBar attivo={attivo} badge={badge} vai={vai} />}
      <TemperatureGate />
    </div>
  );
}
