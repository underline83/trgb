// frontend/src/pages/cucina/CucinaMobile.jsx
// Modulo: cucina
// @version: v1.0 — «Cucina da iPhone»: 4 tab Oggi / Scorte / Frigo / Spesa (2026-09-07)
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
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isCucinaWriterRole } from "../../utils/authHelpers";

const REFRESH_MS = 90_000;
/** Finestra dell'«Annulla». Stessa di CantinaMobile: in servizio è il tempo di
 *  accorgersi dell'errore e togliere le dita. Marco 2026-09-07: «basta 8s». */
const UNDO_MS = 8000;

const TABS = [
  { k: "oggi", label: "Oggi", icon: "📋" },
  { k: "scorte", label: "Scorte", icon: "📦" },
  { k: "frigo", label: "Frigo", icon: "🧊" },
  { k: "spesa", label: "Spesa", icon: "🛒" },
];

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
  position:fixed;inset:0;background:var(--cream);color:var(--ink);
  font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;display:flex;flex-direction:column;overflow:hidden;}
.km-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.km-serif{font-family:"Playfair Display",Georgia,serif;}

.km-head{padding:calc(env(safe-area-inset-top) + 10px) 18px 10px;background:var(--cream);
  border-bottom:1px solid var(--hair);flex:0 0 auto;}
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

.km-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;
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

.km-tabbar{position:absolute;bottom:0;left:0;right:0;height:calc(env(safe-area-inset-bottom) + 66px);
  background:rgba(244,241,236,.94);backdrop-filter:blur(12px);border-top:1px solid var(--hair);
  display:flex;padding:8px 6px calc(env(safe-area-inset-bottom));z-index:40;}
.km-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  font-size:10.5px;font-weight:600;color:var(--muted);cursor:pointer;position:relative;
  background:none;border:0;padding:0;}
.km-tab .ti{font-size:21px;line-height:1;}
.km-tab.on{color:var(--red);}
.km-badge{position:absolute;top:-2px;right:50%;transform:translateX(26px);background:var(--red);color:#fff;
  font-size:10px;font-weight:700;min-width:17px;height:17px;border-radius:99px;display:flex;
  align-items:center;justify-content:center;padding:0 4px;}

.km-toast{position:absolute;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 80px);z-index:60;
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

.km-sheet{position:absolute;inset:0;z-index:70;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;}
.km-sheet-in{background:var(--cream);width:100%;border-radius:20px 20px 0 0;padding:18px 18px calc(env(safe-area-inset-bottom) + 18px);
  max-height:88%;overflow-y:auto;}
.km-sheet-in h3{margin:0 0 4px;font:700 20px/1.2 "Playfair Display",Georgia,serif;}
.km-num{width:100%;padding:14px;border-radius:12px;border:1.5px solid var(--hair);background:#fff;
  text-align:center;font:700 26px/1 "Playfair Display",Georgia,serif;margin:14px 0 10px;}
.km-step{display:flex;gap:10px;align-items:center;justify-content:center;margin-bottom:12px;}
.km-step button{width:52px;height:44px;border-radius:12px;border:1px solid var(--hair);background:#fff;
  font-size:20px;font-weight:700;cursor:pointer;}
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
               testo="Nessuna checklist generata per oggi e nessun task in scadenza." />
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
function TabScorte({ canWrite, onCount, apri }) {
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
// Scheda articolo — solo per il regime MOVIMENTI ha davvero senso.
// Le azioni rapide portano la quantità dell'ultima volta: scaricare
// deve costare un tap, o nessuno scarica.
// ─────────────────────────────────────────────────────────────
function SchedaArticolo({ id, canWrite, indietro }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);   // {tipo, ripiano_id, val}
  const [busy, setBusy] = useState(false);

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
    setSheet({ tipo, ripiano_id: casa?.ripiano_id, val: suggerita || 1 });
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
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSheet(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !a) return (
    <div className="km-body">
      <button className="km-back" onClick={indietro}>‹ Scorte</button>
      <div className="km-err">{err}</div>
    </div>
  );
  if (!a) return <div className="km-body"><Vuoto icona="⏳" titolo="Carico…" /></div>;

  const sd = a.stato_dato;
  const movimenti = a.regime === "MOVIMENTI";

  return (
    <>
      <div className="km-head">
        <button className="km-back" onClick={indietro}>‹ Scorte</button>
        <div className="km-htop">
          <div>
            <h1 className="km-serif">{a.nome}</h1>
            <div className="km-sub">
              {[a.categoria, a.um, a.fornitore_freeform].filter(Boolean).join(" · ") || "—"}
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
            <div key={p.giacenza_id} className="km-tl">
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
                        {l.data_arrivo && `arrivato ${l.data_arrivo}`}
                        {sc && ` · ${sc.txt}`}
                        {l.ripiano && ` · rip. ${l.ripiano}`}
                      </div>
                    </div>
                    <div className="rq">{fmtQta(l.qta_residua)}</div>
                  </div>
                );
              })}
            </div>
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
                          onClick={() => setSheet({ ...sheet, ripiano_id: p.ripiano_id })}>
                    {p.ubicazione} · {p.ripiano}
                  </button>
                ))}
              </div>
            )}
            <button className="km-btn" disabled={busy || num(sheet.val) <= 0} onClick={conferma}>
              {busy ? "Registro…" : `${sheet.tipo === "CARICO" ? "Carica" : sheet.tipo === "SCARTO" ? "Butta" : "Scarica"} ${fmtQta(num(sheet.val))} ${a.um}`}
            </button>
            <button className="km-btn ghost" style={{ marginTop: 9 }} onClick={() => setSheet(null)}>Annulla</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 3 · FRIGO — il giro. È il gesto principale del modulo.
// ─────────────────────────────────────────────────────────────
function TabFrigo({ onCount, apri }) {
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
  const [err, setErr] = useState(null);
  const [soloMancanti, setSoloMancanti] = useState(false);

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
          <button className={`km-pill${!soloMancanti ? " on" : ""}`} onClick={() => setSoloMancanti(false)}>
            Tutti i ripiani
          </button>
          <button className={`km-pill${soloMancanti ? " on" : ""}`} onClick={() => setSoloMancanti(true)}>
            Solo mancanti{finiti > 0 && <span className="c">{finiti}</span>}
          </button>
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

        {(u.ripiani || []).length === 0 && (
          <Vuoto icona="📭" titolo="Nessun ripiano attivo"
                 testo="Ogni posto dovrebbe averne almeno uno." />
        )}

        {(u.ripiani || []).map((r) => {
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
              </div>
              {righe.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "6px 2px" }}>
                  Ripiano vuoto — niente in dotazione.
                </div>
              )}
              {righe.map((a) => (
                <RigaArticolo key={a.giacenza_id} a={a} canWrite={canWrite}
                              onTap={(art, stato) => tap(art, stato, r.id)}
                              onApri={(art) => apriArticolo(art.articolo_id)} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <Toast testo={toast} onAnnulla={annulla} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 4 · SPESA — la lista che si riempie da sola.
// Raggruppata per fornitore: prima chi ha un nome, in fondo il resto.
// ─────────────────────────────────────────────────────────────
function TabSpesa({ canWrite, onCount }) {
  const [dati, setDati] = useState(null);
  const [mostraFatti, setMostraFatti] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

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
        <div className="km-pills">
          <button className={`km-pill${!mostraFatti ? " on" : ""}`} onClick={() => setMostraFatti(false)}>Da fare</button>
          <button className={`km-pill${mostraFatti ? " on" : ""}`} onClick={() => setMostraFatti(true)}>Anche i fatti</button>
        </div>
      </div>

      <div className="km-body">
        {err && <div className="km-err">{err}</div>}
        {!dati && <Vuoto icona="⏳" titolo="Carico…" />}
        {dati && (dati.items || []).length === 0 && (
          <Vuoto icona="🛒" titolo="Lista vuota"
                 testo="Quello che segni finito nel tab Frigo finisce qui da solo." />
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
// Entry point
//   /cucina/mobile                → tab Oggi
//   /cucina/mobile/:tab           → oggi | scorte | frigo | spesa
//   /cucina/mobile/:tab/:id       → dentro un frigo / scheda articolo
// ─────────────────────────────────────────────────────────────
export default function CucinaMobile() {
  const { tab, id } = useParams();
  const navigate = useNavigate();
  const attivo = TABS.some((t) => t.k === tab) ? tab : "oggi";
  const role = localStorage.getItem("role");
  const canWrite = isCucinaWriterRole(role) || role === "sous_chef" || role === "commis";

  const [badge, setBadge] = useState({ oggi: 0, scorte: 0, frigo: 0, spesa: 0 });
  const setB = useCallback((k) => (n) => setBadge((b) => (b[k] === n ? b : { ...b, [k]: n })), []);

  const vai = useCallback((k) => navigate(`/cucina/mobile/${k}`), [navigate]);
  const apriFrigo = useCallback((uid) => navigate(`/cucina/mobile/frigo/${uid}`), [navigate]);
  const apriArticolo = useCallback((aid) => navigate(`/cucina/mobile/scorte/${aid}`), [navigate]);

  let vista;
  if (attivo === "frigo" && id) {
    vista = <DentroFrigo id={id} canWrite={canWrite} indietro={() => vai("frigo")} apriArticolo={apriArticolo} />;
  } else if (attivo === "scorte" && id) {
    vista = <SchedaArticolo id={id} canWrite={canWrite} indietro={() => vai("scorte")} />;
  } else if (attivo === "scorte") {
    vista = <TabScorte canWrite={canWrite} onCount={setB("scorte")} apri={apriArticolo} />;
  } else if (attivo === "frigo") {
    vista = <TabFrigo onCount={setB("frigo")} apri={apriFrigo} />;
  } else if (attivo === "spesa") {
    vista = <TabSpesa canWrite={canWrite} onCount={setB("spesa")} />;
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
        </div>
        <TabOggi canWrite={canWrite} onCount={setB("oggi")} />
      </>
    );
  }

  return (
    <div className="km-root">
      <style>{STYLE}</style>
      {vista}
      <TabBar attivo={attivo} badge={badge} vai={vai} />
    </div>
  );
}
