// FILE: frontend/src/components/widgets/MieiTurniCard.jsx
// @version: v1.0 — «I miei turni» come widget condiviso (2026-11-06)
// Modulo: dipendenti (sola lettura via /turni/miei-turni)
//
// Nato dentro HomeCucina (2026-10-02). Marco 2026-11-06: «è un widget molto
// comodo che terrei» → spostato qui e messo in tutte le Home (admin/capo
// sala, sala, sommelier, cucina). Oggi + i 6 giorni dopo, tocco → /miei-turni.
// Con `nascondiSeNonCollegato` sparisce se l'utente non è collegato a un
// dipendente (404) invece di mostrare l'avviso.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

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
const SERVIZIO = {
  PRANZO: { icon: "☀️", label: "Pranzo", cls: "bg-amber-50 border-amber-200 text-amber-900" },
  CENA:   { icon: "🌙", label: "Cena",   cls: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  ALTRO:  { icon: "•",  label: "Turno",  cls: "bg-neutral-50 border-neutral-200 text-neutral-800" },
};


/* ── I miei turni: oggi + 6 giorni ─────────────────────────────── */
export default function MieiTurniCard({ nascondiSeNonCollegato = false }) {
  const navigate = useNavigate();
  const [giorni, setGiorni] = useState(null);
  const [msg, setMsg] = useState(null);
  const [nonCollegato, setNonCollegato] = useState(false);

  useEffect(() => {
    let vivo = true;
    const oggi = new Date();
    const url = `${API_BASE}/turni/miei-turni?settimana_inizio=${encodeURIComponent(isoWeek(oggi))}&num_settimane=2`;
    apiFetch(url)
      .then(async (r) => {
        if (r.status === 404) {
          if (vivo) setNonCollegato(true);
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

  // Nelle Home di admin/sala/sommelier chi non è collegato a un dipendente
  // (es. l'account dell'oste) non vede il riquadro invece del messaggio.
  if (nascondiSeNonCollegato && nonCollegato) return null;

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">🗓️ I miei turni</span>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/mie-buste-paga")} className="text-[11px] font-semibold text-brand-blue">
            📄 Buste paga
          </button>
          <button onClick={() => navigate("/miei-turni")} className="text-[11px] font-semibold text-brand-blue">
            Tutto il mese →
          </button>
        </div>
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
