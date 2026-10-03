// FILE: frontend/src/pages/HomeCucina.jsx
// @version: v1.0 — Home dei ruoli di cucina (chef, sous_chef, commis) (2026-10-02)
//
// Marco: «quando entrano vedono la bacheca, va bene; non devono vedere il
// fatturato del giorno prima, né i coperti, né le prenotazioni. Facciamo un
// widget con i turni del dipendente, la lavagna e sotto i tasti che useranno».
//
// Gemella di DashboardSala.jsx, ma senza scappatoia «tutti i moduli»: per la
// cucina la Home è questa. I numeri di cassa li toglie anche il backend
// (/dashboard/home → vuoti per RUOLI_CUCINA), non solo questa pagina.
//
//   1. I miei turni — oggi + i prossimi 6 giorni, da /turni/miei-turni
//   2. La Lavagna   — stesso widget della Home, sola lettura
//   3. I tasti      — configurabili da Impostazioni → Home per ruolo
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import useLavagna from "../hooks/useLavagna";
import useHomeActions from "../hooks/useHomeActions";
import Lavagna from "../components/widgets/Lavagna";
import TodoPersonale from "../components/widgets/TodoPersonale";

const GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
function isoLocale(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(wk)}`;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}
function formatDate() {
  const d = new Date();
  const giorni = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}

const SERVIZIO = {
  PRANZO: { icon: "☀️", label: "Pranzo", cls: "bg-amber-50 border-amber-200 text-amber-900" },
  CENA:   { icon: "🌙", label: "Cena",   cls: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  ALTRO:  { icon: "•",  label: "Turno",  cls: "bg-neutral-50 border-neutral-200 text-neutral-800" },
};

/* ── I miei turni: oggi + 6 giorni ─────────────────────────────── */
function MieiTurniCard() {
  const navigate = useNavigate();
  const [giorni, setGiorni] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let vivo = true;
    const oggi = new Date();
    const url = `${API_BASE}/turni/miei-turni?settimana_inizio=${encodeURIComponent(isoWeek(oggi))}&num_settimane=2`;
    apiFetch(url)
      .then(async (r) => {
        if (r.status === 404) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.detail || "Il tuo utente non è collegato a un dipendente.");
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((v) => {
        if (!vivo) return;
        const perGiorno = {};
        (v.settimane || []).forEach((s) => Object.assign(perGiorno, s.per_giorno || {}));
        const out = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(oggi); d.setDate(oggi.getDate() + i);
          const iso = isoLocale(d);
          out.push({ iso, d, cella: perGiorno[iso] || { turni: [], is_chiusura: false, is_riposo: true } });
        }
        setGiorni(out);
      })
      .catch((e) => { if (vivo) setMsg(e.message); });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">🗓️ I miei turni</span>
        <button onClick={() => navigate("/miei-turni")} className="text-[11px] font-semibold text-brand-blue">
          Tutto il mese →
        </button>
      </div>
      {msg && <div className="px-4 pb-4 text-[13px] text-[#a8a49e]">{msg}</div>}
      {!msg && !giorni && <div className="px-4 pb-4 text-[13px] text-[#a8a49e]">Carico…</div>}
      {giorni && giorni.map(({ iso, d, cella }, i) => {
        const turni = (cella.turni || []).filter((t) => (t.stato || "").toUpperCase() !== "ANNULLATO")
          .sort((a, b) => (a.ora_inizio || "").localeCompare(b.ora_inizio || ""));
        const oggi = i === 0;
        return (
          <div key={iso}
               className={`flex items-center gap-3 px-4 py-2.5 border-t border-[#f3f0ea] ${oggi ? "bg-brand-blue/5" : ""}`}>
            <div className="w-14 flex-shrink-0">
              <div className={`text-[12px] font-bold ${oggi ? "text-brand-blue" : "text-brand-ink"}`}>
                {oggi ? "Oggi" : i === 1 ? "Domani" : GIORNI[d.getDay()]}
              </div>
              <div className="text-[11px] text-[#a8a49e]">{d.getDate()} {MESI[d.getMonth()]}</div>
            </div>
            <div className="flex-1 flex flex-wrap gap-1.5">
              {cella.is_chiusura && <span className="text-[12px] text-[#a8a49e]">🚪 Chiuso</span>}
              {!cella.is_chiusura && turni.length === 0 && <span className="text-[12px] text-[#a8a49e] italic">Riposo</span>}
              {!cella.is_chiusura && turni.map((t) => {
                const cfg = SERVIZIO[(t.servizio || "").toUpperCase()] || SERVIZIO.ALTRO;
                const ora = (t.ora_inizio || "").slice(0, 5);
                const fine = (t.ora_fine || "").slice(0, 5);
                return (
                  <span key={t.id} className={`rounded-lg border px-2 py-1 text-[12px] font-semibold tabular-nums ${cfg.cls}`}
                        title={[t.turno_nome, t.note].filter(Boolean).join(" — ")}>
                    {(t.stato || "").toUpperCase() === "OPZIONALE" && "★ "}{cfg.icon} {ora && fine ? `${ora}–${fine}` : (t.turno_nome || cfg.label)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── La pagina ─────────────────────────────────────────────────── */
export default function HomeCucina() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const { lavagna, loading: lavagnaLoading, saving, scriviNota, rimuoviNota } = useLavagna();
  const { actions } = useHomeActions(role);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-brand-cream px-4 lg:px-8 pt-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-playfair text-2xl lg:text-[28px] font-bold text-brand-ink tracking-tight leading-tight">
          {getGreeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-xs text-[#a8a49e] font-medium mt-1 mb-4">{formatDate()}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <MieiTurniCard />
          <Lavagna lavagna={lavagna} loading={lavagnaLoading} saving={saving}
                   scriviNota={scriviNota} rimuoviNota={rimuoviNota} isAdmin={false} />
          <div className="lg:col-span-2"><TodoPersonale /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
          {actions.map((a) => (
            <button key={a.id ?? a.key} type="button"
                    onClick={() => (a.route.startsWith("/carta")
                      // /carta/* è la pagina pubblica (fuori dal router del gestionale):
                      // serve un caricamento pieno, non una navigazione interna.
                      ? window.location.assign(a.route)
                      : navigate(a.route))}
                    className={`rounded-[14px] border text-left active:scale-[.97] transition-transform flex items-center gap-3 px-4 py-3.5 min-h-[64px] ${a.color || "bg-white border-neutral-200"}`}
                    style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <span className="text-2xl leading-none">{a.emoji}</span>
              <span>
                <span className="block text-[14px] font-bold leading-tight">{a.label}</span>
                {a.sub && <span className="block text-[11px] opacity-60 mt-0.5">{a.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
