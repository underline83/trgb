// FILE: frontend/src/components/widgets/Lavagna.jsx
// @version: v1.0 — La Lavagna (sostituisce il widget Bacheca nella Home)
//
// PERCHÉ ESISTE
// La Bacheca era l'unico blocco della Home che richiedeva lavoro umano per
// riempirsi, in mezzo a card che si riempiono da sole. Restava vuota, quindi
// nessuno la guardava, quindi nessuno ci scriveva. La Lavagna parte già piena
// e rende la scrittura facoltativa e a costo di una riga.
//
// TRE STRATI, UNA CARD SOLA
//   1. IL SERVIZIO — briefing auto-composto dal backend (coperti, tavoli da
//      segnalare, selezioni, chi è in turno, task aperti)
//   2. LA NOTA     — una riga scritta da qui, vive un turno e sparisce
//   3. GLI EVENTI  — prenotazioni entrate, disdette, alert dell'engine M.F
//      (questo strato assorbe la vecchia card "⚠️ Attenzione")
//
// Data shape: vedi app/services/lavagna_service.py → build_lavagna()

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const TONO_CHIP = {
  red: "bg-red-50 text-brand-red border-red-100",
  ambra: "bg-amber-50 text-amber-700 border-amber-100",
  neutro: "bg-brand-cream text-[#6b6862] border-[#e9e4db]",
};

export default function Lavagna({ lavagna, loading, saving, scriviNota, rimuoviNota, isAdmin }) {
  const navigate = useNavigate();
  const [bozza, setBozza] = useState("");
  const [copiato, setCopiato] = useState(false);

  const invia = async () => {
    if (!bozza.trim() || saving) return;
    const ok = await scriviNota(bozza);
    if (ok) setBozza("");
  };

  // Il mattone M.C costruisce link wa.me, che NON funzionano sui gruppi:
  // qui si copia soltanto, l'invio nel gruppo lo fa Marco a mano.
  const copiaWhatsapp = async () => {
    const testo = lavagna?.whatsapp;
    if (!testo) return;
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2200);
    } catch {
      console.warn("Lavagna: clipboard non disponibile");
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex-1 min-h-0 flex items-center justify-center py-10">
        <span className="text-[13px] text-[#a8a49e]">Caricamento…</span>
      </div>
    );
  }

  if (!lavagna) {
    return (
      <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex-1 min-h-0 flex items-center justify-center py-10">
        <span className="text-[13px] text-[#a8a49e]">Lavagna non disponibile</span>
      </div>
    );
  }

  const { nota, lede, notevoli = [], selezioni = [], staff = [], task, eventi = [] } = lavagna;

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-[#e7e2d9] flex flex-col overflow-hidden max-h-[560px] lg:max-h-none lg:flex-1 lg:min-h-0">

      {/* ═══ Testa ═══ */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-[#f0ede8]">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-[17px] font-bold text-brand-ink tracking-tight truncate"
                style={{ fontFamily: "'Playfair Display', serif" }}>
            La Lavagna
          </span>
          <span className="text-[11px] font-semibold text-[#a8a49e] flex-shrink-0">
            {lavagna.data_label}
          </span>
        </div>
        <button
          onClick={copiaWhatsapp}
          title="Copia il briefing per incollarlo nel gruppo staff"
          className="flex-shrink-0 text-[11px] font-bold rounded-[9px] px-2.5 py-1.5 border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
        >
          {copiato ? "Copiato ✓" : "Copia"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ═══ STRATO 2 — la nota del turno ═══ */}
        {nota && (
          <div className="px-4 py-3.5 bg-[#FFF9E6] border-b border-[#f2e7c4]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[.8px] text-[#a08b3a]">
                Nota di {lavagna.turno} · {nota.autore}
              </span>
              {isAdmin && (
                <button
                  onClick={rimuoviNota}
                  disabled={saving}
                  className="text-[12px] font-bold text-[#c2b280] hover:text-[#a08b3a] transition leading-none"
                  title="Togli la nota"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="text-[15px] font-semibold text-brand-ink leading-snug">
              {nota.messaggio}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="flex gap-2 px-4 py-2.5 border-b border-[#f0ede8]">
            <input
              type="text"
              value={bozza}
              maxLength={500}
              onChange={(e) => setBozza(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") invia(); }}
              placeholder="Scrivi una riga per il servizio…"
              className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-[#e4e0d8] bg-[#fbfaf8] text-[13px] focus:outline-none focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/15 transition"
              style={{ fontSize: "16px" }}
            />
            <button
              onClick={invia}
              disabled={saving || !bozza.trim()}
              className="flex-shrink-0 px-3.5 rounded-[10px] bg-brand-ink text-white text-[13px] font-bold disabled:opacity-30 transition"
            >
              {saving ? "…" : "Appendi"}
            </button>
          </div>
        )}

        {/* ═══ STRATO 1 — il servizio ═══ */}
        <div className="px-4 pt-3.5 pb-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[.9px] text-[#a8a49e]">Il servizio</span>
            <span className="text-[9px] font-bold uppercase tracking-[.5px] rounded-full px-1.5 py-0.5 bg-[#eef4fd] text-brand-blue">
              si compila da sola
            </span>
          </div>

          <p className="text-[15px] leading-relaxed text-brand-ink mb-2.5">{lede}</p>

          <div className="-mx-1">
            {notevoli.map((n, i) => (
              <div key={i} className="flex gap-2.5 items-start px-1 py-2 border-t border-[#f8f6f2]">
                <span className="w-[19px] flex-shrink-0 text-center text-[14px] leading-tight">{n.icona}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] leading-tight">
                    <b className={`font-bold ${n.tono === "red" ? "text-brand-red" : "text-brand-ink"}`}>{n.titolo}</b>
                    {n.chip && (
                      <span className={`inline-block ml-1.5 text-[10px] font-bold uppercase tracking-[.4px] rounded-md px-1.5 py-0.5 border ${TONO_CHIP[n.tono] || TONO_CHIP.neutro}`}>
                        {n.chip}
                      </span>
                    )}
                  </div>
                  {n.dettaglio && <div className="text-[11.5px] text-[#a8a49e] mt-0.5">{n.dettaglio}</div>}
                </div>
              </div>
            ))}

            {selezioni.length > 0 && (
              <div className="flex gap-2.5 items-start px-1 py-2 border-t border-[#f8f6f2]">
                <span className="w-[19px] flex-shrink-0 text-center text-[14px] leading-tight">🔪</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] leading-tight">Selezioni del giorno</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selezioni.map((s, i) => (
                      <span key={i} className="text-[11px] bg-brand-cream border border-[#e9e4db] rounded-[7px] px-1.5 py-0.5 text-[#5a564f]">
                        {s.label} <b className="text-brand-ink font-bold">{s.valore}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {staff.length > 0 && (
              <div className="flex gap-2.5 items-start px-1 py-2 border-t border-[#f8f6f2]">
                <span className="w-[19px] flex-shrink-0 text-center text-[14px] leading-tight">👥</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] leading-tight">In turno</div>
                  <div className="text-[11.5px] text-[#a8a49e] mt-0.5">
                    {staff.map((s) => `${s.reparto}: ${s.persone}`).join(" · ")}
                  </div>
                </div>
              </div>
            )}

            {task?.count > 0 && (
              <div
                className="flex gap-2.5 items-start px-1 py-2 border-t border-[#f8f6f2] cursor-pointer hover:bg-brand-cream rounded-lg transition"
                onClick={() => navigate("/tasks")}
              >
                <span className="w-[19px] flex-shrink-0 text-center text-[14px] leading-tight">✅</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] leading-tight">
                    {task.count} task apert{task.count === 1 ? "o" : "i"} per oggi
                  </div>
                  {task.titoli?.length > 0 && (
                    <div className="text-[11.5px] text-[#a8a49e] mt-0.5 truncate">
                      {task.titoli.join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ STRATO 3 — gli eventi ═══ */}
        {eventi.length > 0 && (
          <div className="border-t border-[#f0ede8] bg-[#fcfbf9] mt-2">
            <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[.9px] text-[#a8a49e]">Successo oggi</span>
              <span className="text-[10px] font-bold text-white rounded-full text-center"
                    style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20 }}>
                {eventi.length}
              </span>
            </div>
            {eventi.map((e, i) => (
              <div key={i} className="flex gap-2.5 items-start px-4 py-1.5 border-t border-[#f8f6f2]">
                <span className="w-[34px] flex-shrink-0 text-[10.5px] font-bold text-[#a8a49e] pt-0.5 tabular-nums">{e.ora}</span>
                <span className="w-[17px] flex-shrink-0 text-center text-[13px]">{e.icona}</span>
                <span className="flex-1 text-[12.5px] leading-snug text-brand-ink">{e.testo}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Piede: la bacheca classica resta raggiungibile ═══ */}
      <div className="px-4 py-2 border-t border-[#f0ede8] text-center flex-shrink-0">
        <button
          onClick={() => navigate("/comunicazioni")}
          className="text-[11.5px] font-bold text-brand-blue hover:underline"
        >
          Bacheca comunicazioni →
        </button>
      </div>
    </div>
  );
}
