// Modulo: task_manager
// @version: v1.0 — Registro attività (2026-10-18)
// Chi ha fatto cosa e quando: voci di checklist spuntate, checklist chiuse
// e task singoli completati, in ordine di ora, con filtro per persona,
// periodo e tipo. Sola lettura: legge GET /tasks/registro/ (dati già salvati
// in completato_da/completato_at, nessuna migrazione).
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "./Nav";
import { API_BASE, apiFetch } from "../../config/api";
import TrgbLoader from "../../components/TrgbLoader";
import { PillGroup, EmptyState } from "../../components/ui";

const REGISTRO = `${API_BASE}/tasks/registro/`;

const SHADOW = { boxShadow: "0 2px 10px rgba(0,0,0,.06)" };

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtGiorno(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  } catch { return iso; }
}
function fmtGiornoBreve(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso.slice(0, 10) + "T00:00:00");
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch { return iso; }
}
function ora(ts) {
  return ts ? ts.slice(11, 16) : "—";
}
function fmtNum(v) {
  if (v == null) return "";
  return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}
function initialOf(name) {
  return name ? name.trim().charAt(0).toUpperCase() : "?";
}

// Colore stabile per persona (stessa persona = stesso colore in tutta la pagina)
const AVATAR_COLORS = [
  "bg-brand-red text-white",
  "bg-brand-blue text-white",
  "bg-brand-green text-white",
  "bg-amber-600 text-white",
  "bg-violet-600 text-white",
  "bg-teal-600 text-white",
  "bg-neutral-700 text-white",
];
function avatarColor(name) {
  if (!name) return "bg-neutral-300 text-neutral-700";
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, size = 28 }) {
  return (
    <span
      className={"rounded-full inline-flex items-center justify-center font-playfair font-bold shrink-0 " + avatarColor(name)}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initialOf(name)}
    </span>
  );
}

const ESITO = {
  OK:         { label: "OK",        cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  FAIL:       { label: "Non OK",    cls: "bg-red-50 text-red-800 border-red-200" },
  SKIPPED:    { label: "Saltata",   cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
  COMPLETATA: { label: "Chiusa",    cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  SALTATA:    { label: "Saltata",   cls: "bg-amber-50 text-amber-800 border-amber-200" },
  COMPLETATO: { label: "Fatto",     cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

const TIPO_ICON = { voce: "☑️", checklist: "📋", task: "✅" };

const PERIODI = [
  { value: "oggi",  label: "Oggi" },
  { value: "ieri",  label: "Ieri" },
  { value: "7",     label: "7 giorni" },
  { value: "30",    label: "30 giorni" },
  { value: "custom", label: "Date…" },
];

function rangeFor(periodo, oggi) {
  if (periodo === "oggi") return [isoDay(oggi), isoDay(oggi)];
  if (periodo === "ieri") { const d = isoDay(addDays(oggi, -1)); return [d, d]; }
  if (periodo === "30") return [isoDay(addDays(oggi, -29)), isoDay(oggi)];
  return [isoDay(addDays(oggi, -6)), isoDay(oggi)];
}

export default function RegistroAttivita() {
  const navigate = useNavigate();
  const oggi = useMemo(() => new Date(), []);

  const [periodo, setPeriodo] = useState("oggi");
  const [custom, setCustom] = useState(() => rangeFor("7", new Date()));
  const [utente, setUtente] = useState("");
  const [tipo, setTipo] = useState("");

  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [da, a] = periodo === "custom" ? custom : rangeFor(periodo, oggi);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ data_da: da, data_a: a });
      if (tipo) qs.set("tipo", tipo);
      const r = await apiFetch(`${REGISTRO}?${qs.toString()}`);
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = await r.json(); if (j.detail) msg = j.detail; } catch { /* */ }
        throw new Error(msg);
      }
      setDati(await r.json());
    } catch (e) {
      setError(e.message || "Errore caricamento registro");
    } finally {
      setLoading(false);
    }
  }, [da, a, tipo]);

  useEffect(() => { load(); }, [load]);

  // Filtro persona lato client: il riepilogo resta su tutte le persone
  const eventi = useMemo(() => {
    const ev = dati?.eventi || [];
    return utente ? ev.filter(e => e.chi === utente) : ev;
  }, [dati, utente]);

  // Raggruppo per giorno (giorno in cui è stato fatto)
  const perGiorno = useMemo(() => {
    const m = new Map();
    for (const e of eventi) {
      const g = (e.quando || "").slice(0, 10);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(e);
    }
    return [...m.entries()];
  }, [eventi]);

  const persone = dati?.per_utente || [];

  return (
    <div className="min-h-screen bg-brand-cream pb-24 sm:pb-8">
      <Nav current="registro" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">

        {/* ═══ Header ═══ */}
        <div className="mb-4">
          <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-brand-red tracking-tight leading-tight">
            👥 Registro attività
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-1">
            Chi ha fatto cosa e quando · {da === a ? fmtGiorno(da) : `dal ${fmtGiornoBreve(da)} al ${fmtGiornoBreve(a)}`}
          </p>
        </div>

        {/* ═══ Filtri ═══ */}
        <div className="bg-white rounded-[14px] border border-neutral-200 p-3 mb-4 flex flex-col gap-3" style={SHADOW}>
          <div className="flex flex-wrap items-center gap-2">
            <PillGroup value={periodo} onChange={setPeriodo} options={PERIODI} tone="rose" size="lg" />
            {periodo === "custom" && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={custom[0]} max={custom[1]}
                  onChange={e => e.target.value && setCustom([e.target.value, custom[1]])}
                  className="border border-neutral-300 rounded-lg px-2 min-h-[40px]" />
                <span className="text-neutral-400">→</span>
                <input type="date" value={custom[1]} min={custom[0]} max={isoDay(oggi)}
                  onChange={e => e.target.value && setCustom([custom[0], e.target.value])}
                  className="border border-neutral-300 rounded-lg px-2 min-h-[40px]" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillGroup value={tipo} onChange={setTipo} tone="rose" size="md" options={[
              { value: "",          label: "Tutto" },
              { value: "voce",      label: "☑️ Voci" },
              { value: "checklist", label: "📋 Checklist chiuse" },
              { value: "task",      label: "✅ Task" },
            ]} />
            <select value={utente} onChange={e => setUtente(e.target.value)}
              className="ml-auto border border-neutral-300 rounded-lg px-2 min-h-[40px] text-sm bg-white">
              <option value="">Tutte le persone</option>
              {(dati?.utenti || []).map(u => <option key={u} value={u}>@{u}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between" style={SHADOW}>
            <span>⚠ {error}</span>
            <button onClick={load} className="text-xs font-semibold underline">Riprova</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><TrgbLoader /></div>
        ) : !dati || dati.eventi.length === 0 ? (
          <EmptyState icon="👥" title="Niente in questo periodo"
            description="Nessuna voce spuntata, checklist chiusa o task completato." />
        ) : (
          <>
            {/* ═══ Riepilogo per persona (tap = filtra) ═══ */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              {persone.map(p => {
                const sel = utente === p.utente;
                return (
                  <button key={p.utente} type="button"
                    onClick={() => setUtente(sel ? "" : p.utente)}
                    className={"text-left rounded-[14px] border p-3 min-h-[44px] transition " +
                      (sel ? "bg-red-50 border-brand-red" : "bg-white border-neutral-200 hover:border-red-200")}
                    style={SHADOW}>
                    <div className="flex items-center gap-2">
                      <Avatar name={p.utente} />
                      <span className="font-semibold text-brand-ink truncate">@{p.utente}</span>
                    </div>
                    <div className="mt-2 text-xs text-neutral-600 leading-relaxed">
                      <b className="text-brand-ink">{p.voci}</b> voci
                      {p.checklist > 0 && <> · <b className="text-brand-ink">{p.checklist}</b> checklist</>}
                      {p.task > 0 && <> · <b className="text-brand-ink">{p.task}</b> task</>}
                      {p.fail > 0 && <> · <b className="text-brand-red">{p.fail}</b> non OK</>}
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      {da === a
                        ? `dalle ${ora(p.primo)} alle ${ora(p.ultimo)}`
                        : `ultima: ${fmtGiornoBreve(p.ultimo)} ${ora(p.ultimo)}`}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ═══ Elenco per giorno ═══ */}
            {eventi.length === 0 ? (
              <EmptyState icon="👤" title={`Niente da @${utente} in questo periodo`} />
            ) : perGiorno.map(([giorno, lista]) => (
              <div key={giorno} className="mb-5">
                <div className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2 capitalize">
                  {fmtGiorno(giorno)} <span className="font-normal normal-case">· {lista.length}</span>
                </div>
                <div className="bg-white rounded-[14px] border border-neutral-200 divide-y divide-neutral-100 overflow-hidden" style={SHADOW}>
                  {lista.map(e => (
                    <Riga key={`${e.tipo}-${e.id}`} e={e}
                      onOpen={e.instance_id ? () => navigate(`/tasks/instances/${e.instance_id}`) : null} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Riga({ e, onOpen }) {
  const es = ESITO[e.esito] || { label: e.esito, cls: "bg-neutral-100 text-neutral-600 border-neutral-200" };
  const fuori = e.fuori_soglia;
  const contesto = e.tipo === "task"
    ? "Task"
    : [e.tipo === "voce" ? e.checklist : null, e.gruppo, e.turno?.toLowerCase(),
       e.data_riferimento && e.data_riferimento !== (e.quando || "").slice(0, 10)
         ? `del ${fmtGiornoBreve(e.data_riferimento)}` : null]
        .filter(Boolean).join(" · ");
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag type={onOpen ? "button" : undefined} onClick={onOpen || undefined}
      className={"w-full text-left flex items-start gap-3 px-3 py-2.5 min-h-[44px] " +
        (onOpen ? "hover:bg-[#F7F4EF] " : "") + (e.tipo === "checklist" ? "bg-[#FBF9F5]" : "")}>
      <span className="font-mono text-xs text-neutral-500 tabular-nums pt-1 w-10 shrink-0">{ora(e.quando)}</span>
      <Avatar name={e.chi} size={24} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-brand-ink leading-snug">
          <span className="mr-1">{TIPO_ICON[e.tipo]}</span>
          {e.tipo === "checklist"
            ? <><b>{e.esito === "SALTATA" ? "Ha saltato" : "Ha chiuso"}</b> «{e.cosa}»</>
            : <span className={e.tipo === "task" ? "font-semibold" : ""}>{e.cosa}</span>}
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
          <span className="font-semibold text-neutral-600">@{e.chi || "?"}</span>
          {contesto && <> · {contesto}</>}
          {e.tipo !== "voce" && e.assegnato_a && e.assegnato_a !== e.chi && <> · assegnata a @{e.assegnato_a}</>}
        </div>
        {e.note && <div className="text-xs text-neutral-600 italic mt-0.5">«{e.note}»</div>}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {e.valore_numerico != null && (
          <span className={"text-sm font-bold tabular-nums " + (fuori ? "text-brand-red" : "text-brand-ink")}>
            {fmtNum(e.valore_numerico)}{e.unita ? ` ${e.unita}` : ""}{fuori ? " ⚠" : ""}
          </span>
        )}
        {e.valore_testo && <span className="text-xs text-neutral-700 max-w-[140px] truncate">{e.valore_testo}</span>}
        <span className={"text-[10px] font-semibold px-1.5 py-0.5 rounded border " + es.cls}>
          {e.tipo === "checklist" && e.score != null ? `${es.label} · ${e.score}%` : es.label}
        </span>
      </div>
    </Tag>
  );
}
