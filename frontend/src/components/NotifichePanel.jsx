// @version: v1.0-notifiche-panel
// Pannello dropdown notifiche + comunicazioni — Header campanello
// Mattone M.A — componente condiviso

import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Icone per tipo notifica (emoji per coerenza con Home v3)
const TIPO_ICONA = {
  preventivi: "📋",
  prenotazioni: "📅",
  cantina: "🍷",
  dipendenti: "👥",
  foodcost: "🧮",
  flussi: "💶",
  sistema: "⚙️",
};

// Colori urgenza
const URGENZA_STYLE = {
  urgente: "border-l-4 border-l-brand-red bg-red-50/50",
  normale: "border-l-4 border-l-transparent",
};

function tempoFa(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  if (days < 7) return `${days}gg fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}


export default function NotifichePanel({
  notifiche,
  comunicazioni,
  loading,
  onSegnaLetta,
  onSegnaTutteLette,
  onSegnaComunicazioneLetta,
  onChiudi,
}) {
  const navigate = useNavigate();
  const panelRef = useRef(null);

  // Click-outside chiude
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onChiudi();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onChiudi]);

  const comNonLette = comunicazioni.filter(c => !c.letta);
  const notifNonLette = notifiche.filter(n => !n.letta);
  const notifLette = notifiche.filter(n => n.letta);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[calc(100dvh-80px)] bg-white rounded-2xl shadow-2xl border border-neutral-200 z-[100] overflow-hidden flex flex-col"
    >
      {/* ── Header pannello ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <span className="text-sm font-semibold text-brand-ink">Notifiche</span>
        {notifNonLette.length > 0 && (
          <button
            onClick={onSegnaTutteLette}
            className="text-xs text-brand-blue hover:underline"
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {loading && (
          <div className="py-8 text-center text-sm text-neutral-400">Caricamento…</div>
        )}

        {!loading && (
          <>
            {/* ── Comunicazioni staff (bacheca) ── */}
            {comNonLette.length > 0 && (
              <div>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    📌 Comunicazioni staff
                  </span>
                </div>
                {comNonLette.map(c => (
                  <div
                    key={`com-${c.id}`}
                    className={`px-4 py-3 cursor-pointer hover:bg-neutral-50 transition ${
                      c.urgenza === "urgente" ? URGENZA_STYLE.urgente : URGENZA_STYLE.normale
                    }`}
                    onClick={() => onSegnaComunicazioneLetta(c.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-brand-ink truncate">
                          {c.urgenza === "urgente" && <span className="text-brand-red mr-1">!</span>}
                          {c.titolo}
                        </div>
                        <div className="text-xs text-neutral-600 mt-0.5 line-clamp-2">{c.messaggio}</div>
                        <div className="text-[11px] text-neutral-400 mt-1">
                          {c.autore} · {tempoFa(c.created_at)}
                          {c.dest_ruolo !== "tutti" && (
                            <span className="ml-1 text-neutral-300">→ {c.dest_ruolo}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="border-t border-neutral-100 mx-2 my-1" />
              </div>
            )}

            {/* ── Notifiche non lette ── */}
            {notifNonLette.length > 0 && (
              <div>
                {notifNonLette.map(n => (
                  <div
                    key={`not-${n.id}`}
                    className={`px-4 py-3 cursor-pointer hover:bg-neutral-50 transition ${
                      n.urgenza === "urgente" ? URGENZA_STYLE.urgente : URGENZA_STYLE.normale
                    }`}
                    onClick={() => {
                      onSegnaLetta(n.id);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg mt-0.5 flex-shrink-0">
                        {n.icona || TIPO_ICONA[n.tipo] || TIPO_ICONA.sistema}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-brand-ink">{n.titolo}</div>
                        {n.messaggio && (
                          <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.messaggio}</div>
                        )}
                        <div className="text-[11px] text-neutral-400 mt-1">{tempoFa(n.created_at)}</div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-brand-blue mt-1.5 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Notifiche lette (recenti) ── */}
            {notifLette.length > 0 && (
              <div>
                <div className="border-t border-neutral-100 mx-2 my-1" />
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Precedenti
                  </span>
                </div>
                {notifLette.slice(0, 10).map(n => (
                  <div
                    key={`not-${n.id}`}
                    className="px-4 py-2.5 cursor-pointer hover:bg-neutral-50 transition opacity-60"
                    onClick={() => { if (n.link) navigate(n.link); }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base mt-0.5 flex-shrink-0">
                        {n.icona || TIPO_ICONA[n.tipo] || TIPO_ICONA.sistema}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-neutral-600">{n.titolo}</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">{tempoFa(n.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Vuoto ── */}
            {notifiche.length === 0 && comunicazioni.length === 0 && (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2">🔔</div>
                <div className="text-sm text-neutral-400">Nessuna notifica</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-neutral-100 px-4 py-2.5 flex justify-between items-center">
        <button
          onClick={() => { navigate("/comunicazioni"); onChiudi(); }}
          className="text-xs text-brand-blue hover:underline"
        >
          Bacheca completa
        </button>
        <button
          onClick={onChiudi}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
