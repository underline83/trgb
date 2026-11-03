// @version: v1.0 — widget Home «Preventivi in attesa» (2026-11-03)
// Modulo: clienti (sub-modulo preventivi)
//
// I preventivi che aspettano la conferma del cliente, dalla scadenza più vicina
// (GET /preventivi/in-attesa). Lo vedono i ruoli che ricevono gli avvisi di
// scadenza (Impostazioni › Preventivi) e admin/superadmin; i tasti Proroga e
// Libera tavolo solo admin/superadmin (le scritture dei preventivi sono admin).
// Senza preventivi in attesa il widget non si mostra.
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const ggmm = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

function chipScadenza(it, avviso) {
  if (it.giorni === null || it.giorni === undefined) return { t: "senza scadenza", c: "bg-neutral-100 text-neutral-500" };
  if (it.stato === "scaduto") return { t: "scaduto · tavolo tenuto", c: "bg-red-100 text-red-700" };
  if (it.giorni < 0) return { t: `scaduta da ${-it.giorni} gg`, c: "bg-red-100 text-red-700" };
  if (it.giorni === 0) return { t: "scade oggi", c: "bg-red-100 text-red-700" };
  if (it.giorni <= avviso) return { t: `tra ${it.giorni} gg`, c: "bg-amber-100 text-amber-800" };
  return { t: `tra ${it.giorni} gg`, c: "bg-neutral-100 text-neutral-600" };
}

export default function PreventiviInAttesaCard() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "admin" || role === "superadmin";
  const [dati, setDati] = useState(null);
  const [lavoro, setLavoro] = useState(null);

  const carica = useCallback(() => {
    apiFetch(`${API_BASE}/preventivi/in-attesa?limite=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDati)
      .catch(() => setDati(null));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  if (!dati || !dati.totale) return null;
  const puoVedere = isAdmin || (dati.ruoli || []).includes(role);
  if (!puoVedere) return null;

  const proroga = async (e, it) => {
    e.stopPropagation();
    const v = window.prompt(`Tieni il tavolo di ${it.cliente} per altri quanti giorni?`, String(dati.proroga_giorni ?? 5));
    if (v === null) return;
    setLavoro(it.id);
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${it.id}/proroga`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giorni: parseInt(v, 10) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Errore proroga");
      carica();
    } catch (err) { window.alert(err.message); } finally { setLavoro(null); }
  };

  const libera = async (e, it) => {
    e.stopPropagation();
    if (!window.confirm(`Liberare il tavolo di ${it.cliente} (${ggmm(it.data_evento)})? La prenotazione viene cancellata (preventivo scaduto) e il preventivo passa a «scaduto». Al cliente non parte niente.`)) return;
    setLavoro(it.id);
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${it.id}/libera-tavolo`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Errore");
      if (d.prenotazione?.thefork && d.prenotazione?.cancellata) {
        window.alert("Tavolo liberato in TRGB. La prenotazione è di TheFork: cancellala anche in TheFork Manager.");
      }
      carica();
    } catch (err) { window.alert(err.message); } finally { setLavoro(null); }
  };

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-amber-200 overflow-hidden flex-shrink-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e]">⏳ Preventivi in attesa</div>
        <span className="text-[11px] font-semibold text-amber-700">{dati.totale}</span>
      </div>
      <div className="divide-y divide-neutral-100">
        {dati.items.map((it) => {
          const chip = chipScadenza(it, dati.avviso_giorni ?? 2);
          return (
            <div key={it.id} onClick={() => navigate(`/clienti/preventivi/${it.id}`)}
              className="px-4 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-amber-50 active:bg-amber-100 min-h-[48px]">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-brand-ink truncate">{it.cliente}</div>
                <div className="text-[11px] text-[#a8a49e] truncate">
                  {ggmm(it.data_evento)}{it.ora_evento ? ` · ${it.ora_evento}` : ""}{it.n_persone ? ` · ${it.n_persone} pax` : ""} · {it.numero}
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.c}`}>{chip.t}</span>
              {isAdmin && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={(e) => proroga(e, it)} disabled={lavoro === it.id} title="Proroga la scadenza"
                    className="w-9 h-9 rounded-lg border border-amber-200 bg-amber-50 text-sm hover:bg-amber-100">⏳</button>
                  {it.tavolo_tenuto && (it.giorni !== null && it.giorni <= 0) && (
                    <button onClick={(e) => libera(e, it)} disabled={lavoro === it.id} title="Libera il tavolo"
                      className="w-9 h-9 rounded-lg border border-red-200 bg-red-50 text-sm hover:bg-red-100">🔓</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {dati.totale > dati.items.length && (
        <button onClick={() => navigate("/clienti/preventivi")}
          className="w-full text-[11px] text-[#a8a49e] hover:text-brand-ink py-2 border-t border-neutral-100">
          Tutti i preventivi ({dati.totale}) →
        </button>
      )}
    </div>
  );
}
