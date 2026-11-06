// FILE: frontend/src/components/widgets/VendiOApriCard.jsx
// @version: v1.0 — «Vendi o apri» della Home sommelier (2026-11-05)
// Modulo: vini
//
// Vendita di una bottiglia o apertura per i calici in un tocco, dalla Home.
// La logica è quella di Vini › Vendite (useRegistraVenditaVino): stessa
// ricerca, stesso QR, stesse locazioni e celle della Matrice, stesso modale
// «Decidi prezzo calice». Qui cambia solo la faccia: due tasti grandi invece
// del selettore Bottiglia/Calici + «Registra».

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import useRegistraVenditaVino, { buildLocOptions } from "../../hooks/useRegistraVenditaVino";
import DecidiPrezzoCalice from "../vini/DecidiPrezzoCalice";
import MatriceCelleVendita from "../vini/MatriceCelleVendita";
import QrScanner from "../QrScanner";

const euro = (v) => (Number(v) > 0 ? `€ ${Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 })}` : null);
const ora = (iso) => { try { return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const giorno = (iso) => { try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }); } catch { return ""; } };

function tipoDaNota(note = "") {
  if (note.includes("[CALICI-RESIDUO]")) return { icon: "🥂", label: "aperto da residuo" };
  if (note.includes("[CALICI]")) return { icon: "🥂", label: "aperto" };
  return { icon: "🍾", label: "venduta" };
}

export default function VendiOApriCard({ onRegistrata }) {
  const navigate = useNavigate();
  const [ultime, setUltime] = useState([]);

  const caricaUltime = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/movimenti-globali?tipo=VENDITA&limit=4&offset=0`);
      if (r.ok) setUltime((await r.json()).items || []);
    } catch { /* silenzioso */ }
  }, []);
  useEffect(() => { caricaUltime(); }, [caricaUltime]);

  const dopo = () => { caricaUltime(); onRegistrata?.(); };
  const v = useRegistraVenditaVino({ onRegistrata: dopo, onCaliceAttivato: dopo });
  const { selectedVino, regLoc, setRegLoc, regQta, setRegQta, usaGriglia } = v;

  // Se il vino sta in un posto solo, la locazione è già scelta.
  useEffect(() => {
    if (!selectedVino || regLoc) return;
    const posti = buildLocOptions(selectedVino).filter((o) => Number(o.qta) > 0);
    if (posti.length === 1) setRegLoc(posti[0].value);
  }, [selectedVino, regLoc, setRegLoc]);

  const posti = selectedVino ? buildLocOptions(selectedVino).filter((o) => Number(o.qta) > 0) : [];
  const qta = Math.max(1, Number(regQta) || 1);
  const msgOk = v.submitMsg && v.submitMsg.startsWith("✅");

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border-2 border-indigo-200 flex-shrink-0">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[12px] font-bold uppercase tracking-[1px] text-indigo-800">🍾 Vendi o apri</span>
        <button type="button" onClick={() => navigate("/vini/vendite")}
          className="text-[11px] font-semibold text-[#a8a49e] hover:text-brand-ink">Vendite →</button>
      </div>

      <div className="px-4 pb-3">
        {/* Ricerca + QR */}
        <div className="flex gap-2 relative">
          <div className="relative flex-1 min-w-0">
            <input
              ref={v.searchRef}
              type="text"
              value={v.searchText}
              onChange={(e) => { v.setSearchText(e.target.value); v.setSelectedVino(null); }}
              onFocus={() => v.suggestions.length > 0 && v.setShowSuggestions(true)}
              placeholder="Cerca il vino…"
              className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#e4e0d8] bg-[#fbfaf8] focus:outline-none focus:border-brand-blue focus:bg-white"
              style={{ fontSize: "16px" }}
            />
            {selectedVino && (
              <button type="button" onClick={v.clearVino} title="Togli il vino"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#efece7] text-[#8a857d] text-xs font-bold hover:bg-red-100 hover:text-red-600">✕</button>
            )}
            {v.showSuggestions && v.suggestions.length > 0 && (
              <div ref={v.suggestionsRef}
                className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#e4e0d8] rounded-xl shadow-lg max-h-72 overflow-y-auto">
                {v.suggestions.map((s) => (
                  <button key={s.id} type="button" onClick={() => v.selectVino(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-[#f4f2ee] last:border-0 flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-brand-ink truncate">{s.DESCRIZIONE}{s.ANNATA ? ` ${s.ANNATA}` : ""}</span>
                      {s.PRODUTTORE && <span className="block text-[11px] text-[#a8a49e] truncate">{s.PRODUTTORE}</span>}
                    </span>
                    <span className={`text-[12px] font-bold ${(s.QTA_TOTALE ?? 0) === 0 ? "text-brand-red" : "text-brand-ink"}`}>{s.QTA_TOTALE ?? 0} bt</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => v.setScanOpen(true)} title="Inquadra l'etichetta QR"
            className="min-w-[44px] min-h-[44px] rounded-[10px] border border-[#e4e0d8] bg-white text-lg">📷</button>
        </div>
        {v.scanOpen && (
          <QrScanner title="Inquadra l'etichetta della bottiglia" onResult={v.onScan} onClose={() => v.setScanOpen(false)} />
        )}

        {/* Vino scelto */}
        {selectedVino && (
          <div className="mt-3 rounded-[12px] border border-[#e9e4db] bg-[#fbfaf8] p-3">
            <div className="text-[15px] font-bold text-brand-ink leading-tight">
              {selectedVino.DESCRIZIONE}{selectedVino.ANNATA ? ` ${selectedVino.ANNATA}` : ""}
            </div>
            <div className="text-[11.5px] text-[#8a857d] mt-0.5">
              {[selectedVino.PRODUTTORE,
                euro(selectedVino.PREZZO_CARTA) && `in carta ${euro(selectedVino.PREZZO_CARTA)}`,
                euro(selectedVino.PREZZO_CALICE) && `calice ${euro(selectedVino.PREZZO_CALICE)}`,
                `${selectedVino.QTA_TOTALE ?? 0} bt`].filter(Boolean).join(" · ")}
            </div>

            {/* Da dove */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-[#8a857d] mr-0.5">da:</span>
              {posti.length === 0 && <span className="text-[12px] text-brand-red font-semibold">nessuna bottiglia in cantina</span>}
              {posti.map((o) => (
                <button key={o.value} type="button" onClick={() => setRegLoc(o.value)}
                  className={`min-h-[36px] px-3 rounded-full border text-[12px] font-semibold transition ${
                    regLoc === o.value ? "bg-brand-ink text-white border-brand-ink" : "bg-white border-[#e4e0d8] text-brand-ink hover:border-brand-ink/40"}`}>
                  {o.label} · {o.qta}
                </button>
              ))}
            </div>

            {regLoc === "loc3" && !v.matriceLoading && v.myCelleMatrice.length === 0 && (selectedVino?.QTA_LOC3 ?? 0) > 0 && (
              <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                In matrice ma senza celle in griglia: la vendita toglie la bottiglia senza toccare la griglia.
              </p>
            )}
            {regLoc === "loc3" && (v.matriceLoading || v.myCelleMatrice.length > 0) && (
              <MatriceCelleVendita
                matriceStato={v.matriceStato} myCelleMatrice={v.myCelleMatrice}
                selectedCelle={v.selectedCelle} matriceLoading={v.matriceLoading} toggleCella={v.toggleCella}
              />
            )}

            {/* Quante */}
            {!usaGriglia && (
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[11px] text-[#8a857d]">quante:</span>
                <button type="button" onClick={() => setRegQta(String(Math.max(1, qta - 1)))}
                  className="w-9 h-9 rounded-full border border-[#e4e0d8] bg-white font-bold">−</button>
                <span className="w-6 text-center font-bold tabular-nums">{qta}</span>
                <button type="button" onClick={() => setRegQta(String(qta + 1))}
                  className="w-9 h-9 rounded-full border border-[#e4e0d8] bg-white font-bold">+</button>
              </div>
            )}

            {!regLoc && posti.length > 1 && (
              <p className="mt-2.5 text-[11.5px] text-[#8a857d]">Tocca da dove prendi la bottiglia.</p>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button type="button" disabled={v.submitting || !regLoc} onClick={() => v.submitVendita("BOTTIGLIA")}
                className="min-h-[48px] rounded-[12px] bg-brand-ink text-white font-bold text-[14px] disabled:opacity-35">
                {v.submitting ? "…" : "🍾 Vendi bottiglia"}
              </button>
              <button type="button" disabled={v.submitting || !regLoc} onClick={() => v.submitVendita("CALICI")}
                className="min-h-[48px] rounded-[12px] bg-rose-50 border border-rose-200 text-rose-800 font-bold text-[14px] disabled:opacity-35">
                {v.submitting ? "…" : "🥂 Apri per calici"}
              </button>
            </div>
          </div>
        )}

        {v.submitMsg && (
          <p className={`mt-2.5 text-[12.5px] font-semibold ${msgOk ? "text-emerald-700" : "text-brand-red"}`}>{v.submitMsg}</p>
        )}

        {/* Ultime vendite / aperture */}
        {ultime.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-bold uppercase tracking-[.9px] text-[#a8a49e] mb-1">Ultime</div>
            {ultime.map((m) => {
              const t = tipoDaNota(m.note || "");
              const d = new Date();
              const oggiIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const oggi = (m.data_mov || "").slice(0, 10) === oggiIso;
              return (
                <div key={m.id} className="flex items-center gap-2 py-1.5 border-t border-[#f4f2ee] text-[12.5px]">
                  <span className="w-11 flex-shrink-0 text-[11px] font-semibold text-[#a8a49e] tabular-nums">{oggi ? ora(m.data_mov) : giorno(m.data_mov)}</span>
                  <span className="flex-shrink-0">{t.icon}</span>
                  <span className="flex-1 min-w-0 truncate text-brand-ink">{m.vino_desc}</span>
                  <span className="text-[11px] text-[#8a857d] flex-shrink-0">{m.qta > 1 ? `${m.qta} · ` : ""}{t.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {v.decidiPrezzo && (
        <DecidiPrezzoCalice
          vino={v.decidiPrezzo.vino}
          defaultPrezzo={v.decidiPrezzo.defaultPrezzo}
          prezzoIniziale={v.decidiPrezzo.prezzoIniziale}
          onCancel={() => v.setDecidiPrezzo(null)}
          onConfirm={v.confermaPrezzoCalice}
        />
      )}
    </div>
  );
}
