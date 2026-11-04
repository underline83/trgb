// @version: v1.2 — Proroga e Libera tavolo con conferma dentro la card, errori in toast,
//   niente più prompt/confirm/alert del browser; chip nei colori del brand (2026-11-05)
// v1.1 — si ricarica da solo ogni 3 minuti (2026-11-04)
// v1.0 — widget Home «Preventivi in attesa» (2026-11-03)
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
import useAutoRefresh from "../../hooks/useAutoRefresh";
import useToast from "../../hooks/useToast";

const ggmm = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

function chipScadenza(it, avviso) {
  if (it.giorni === null || it.giorni === undefined) return { t: "senza scadenza", c: "bg-brand-cream text-[#8a857d]" };
  if (it.stato === "scaduto") return { t: "scaduto · tavolo tenuto", c: "bg-red-100 text-red-700" };
  if (it.giorni < 0) return { t: `scaduta da ${-it.giorni} gg`, c: "bg-red-100 text-red-700" };
  if (it.giorni === 0) return { t: "scade oggi", c: "bg-red-100 text-red-700" };
  if (it.giorni <= avviso) return { t: `tra ${it.giorni} gg`, c: "bg-amber-100 text-amber-800" };
  return { t: `tra ${it.giorni} gg`, c: "bg-brand-cream text-[#6b6862]" };
}

export default function PreventiviInAttesaCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "admin" || role === "superadmin";
  const [dati, setDati] = useState(null);
  const [lavoro, setLavoro] = useState(null);
  // Azione aperta sotto una riga: { id, tipo: "proroga" | "libera", giorni }
  const [aperta, setAperta] = useState(null);

  const carica = useCallback(() => {
    apiFetch(`${API_BASE}/preventivi/in-attesa?limite=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDati)
      .catch(() => setDati(null));
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useAutoRefresh(carica);

  if (!dati || !dati.totale) return null;
  const puoVedere = isAdmin || (dati.ruoli || []).includes(role);
  if (!puoVedere) return null;

  const apri = (e, it, tipo) => {
    e.stopPropagation();
    if (aperta && aperta.id === it.id && aperta.tipo === tipo) { setAperta(null); return; }
    setAperta({ id: it.id, tipo, giorni: String(dati.proroga_giorni ?? 5) });
  };

  const proroga = async (it) => {
    const giorni = parseInt(aperta?.giorni, 10);
    if (!giorni || giorni < 1) { toast("Scrivi un numero di giorni", { kind: "warn" }); return; }
    setLavoro(it.id);
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${it.id}/proroga`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giorni }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Errore proroga");
      toast(`Tavolo di ${it.cliente} tenuto altri ${giorni} giorni`, { kind: "success" });
      setAperta(null);
      carica();
    } catch (err) { toast(err.message, { kind: "error", duration: 4000 }); } finally { setLavoro(null); }
  };

  const libera = async (it) => {
    setLavoro(it.id);
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${it.id}/libera-tavolo`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Errore");
      if (d.prenotazione?.thefork && d.prenotazione?.cancellata) {
        toast("Tavolo liberato in TRGB. La prenotazione è di TheFork: cancellala anche in TheFork Manager.", { kind: "warn", duration: 8000 });
      } else {
        toast(`Tavolo di ${it.cliente} liberato`, { kind: "success" });
      }
      setAperta(null);
      carica();
    } catch (err) { toast(err.message, { kind: "error", duration: 4000 }); } finally { setLavoro(null); }
  };

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-amber-200 overflow-hidden flex-shrink-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e]">⏳ Preventivi in attesa</div>
        <span className="text-[11px] font-semibold text-amber-700">{dati.totale}</span>
      </div>
      <div className="divide-y divide-[#f0ede8]">
        {dati.items.map((it) => {
          const chip = chipScadenza(it, dati.avviso_giorni ?? 2);
          const qui = aperta && aperta.id === it.id ? aperta : null;
          return (
            <div key={it.id}>
              <div onClick={() => navigate(`/clienti/preventivi/${it.id}`)}
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
                    <button onClick={(e) => apri(e, it, "proroga")} disabled={lavoro === it.id} title="Proroga la scadenza"
                      className={`w-11 h-11 rounded-lg border text-sm ${qui?.tipo === "proroga" ? "border-amber-400 bg-amber-100" : "border-amber-200 bg-amber-50 hover:bg-amber-100"}`}>⏳</button>
                    {it.tavolo_tenuto && (it.giorni !== null && it.giorni <= 0) && (
                      <button onClick={(e) => apri(e, it, "libera")} disabled={lavoro === it.id} title="Libera il tavolo"
                        className={`w-11 h-11 rounded-lg border text-sm ${qui?.tipo === "libera" ? "border-red-400 bg-red-100" : "border-red-200 bg-red-50 hover:bg-red-100"}`}>🔓</button>
                    )}
                  </div>
                )}
              </div>

              {qui?.tipo === "proroga" && (
                <div className="px-4 pb-3 pt-1 bg-amber-50/60 flex flex-wrap items-center gap-2 text-[12.5px] text-brand-ink">
                  <span>Tieni il tavolo altri</span>
                  <input type="number" min="1" inputMode="numeric" value={qui.giorni}
                    onChange={(e) => setAperta({ ...qui, giorni: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") proroga(it); }}
                    className="w-16 px-2 py-1.5 rounded-lg border border-amber-200 bg-white text-center"
                    style={{ fontSize: "16px" }} />
                  <span>giorni</span>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => setAperta(null)} className="px-3 min-h-[40px] rounded-lg text-[#8a857d] hover:text-brand-ink">Annulla</button>
                    <button onClick={() => proroga(it)} disabled={lavoro === it.id}
                      className="px-3.5 min-h-[40px] rounded-lg bg-brand-ink text-white font-bold disabled:opacity-40">{lavoro === it.id ? "…" : "Proroga"}</button>
                  </div>
                </div>
              )}

              {qui?.tipo === "libera" && (
                <div className="px-4 pb-3 pt-1 bg-red-50/60 text-[12.5px] text-brand-ink">
                  <p className="leading-snug">
                    Liberi il tavolo di <b>{it.cliente}</b> ({ggmm(it.data_evento)})? La prenotazione viene cancellata e il preventivo passa a «scaduto». Al cliente non parte niente.
                  </p>
                  <div className="flex gap-2 justify-end mt-2">
                    <button onClick={() => setAperta(null)} className="px-3 min-h-[40px] rounded-lg text-[#8a857d] hover:text-brand-ink">Annulla</button>
                    <button onClick={() => libera(it)} disabled={lavoro === it.id}
                      className="px-3.5 min-h-[40px] rounded-lg bg-brand-red text-white font-bold disabled:opacity-40">{lavoro === it.id ? "…" : "Libera il tavolo"}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {dati.totale > dati.items.length && (
        <button onClick={() => navigate("/clienti/preventivi")}
          className="w-full text-[11px] text-[#a8a49e] hover:text-brand-ink py-2 border-t border-[#f0ede8]">
          Tutti i preventivi ({dati.totale}) →
        </button>
      )}
    </div>
  );
}
