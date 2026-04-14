// @version: v1.0-foglio-settimana
// Foglio Settimana Turni v2 — TRGB Gestionale
//
// Matrice: 7 giorni (Lun..Dom) × slot (P1..Pn + C1..Cn) per reparto.
// - Tab reparto (SALA/CUCINA) in alto
// - Click cella → popover assegnazione (dipendente, orari, stato CHIAMATA)
// - Asterisco giallo per stato CHIAMATA
// - Riga grigia per giorno di chiusura (letto da settings/closures-config)
// - Pannello destro: ore lorde/nette per dipendente con semaforo 40/48
// - Pulsanti ←/→ per navigazione settimana, pulsante "Copia settimana"
//
// Touch target 48pt, mobile-aware.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

// ---- UTIL DATE / ISO WEEK -------------------------------------------------
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

function isoWeek(date) {
  // ISO week according to Mozilla doc
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(wk)}`;
}

function mondayOfWeek(iso) {
  const [y, w] = iso.split("-W").map(Number);
  // Find Jan 4 (always in W1), backtrack to Monday, add (w-1)*7
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const d = new Date(mondayW1);
  d.setUTCDate(mondayW1.getUTCDate() + (w - 1) * 7);
  return d;
}

function shiftIsoWeek(iso, delta) {
  const m = mondayOfWeek(iso);
  m.setUTCDate(m.getUTCDate() + delta * 7);
  return isoWeek(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()));
}

function formatDayLabel(iso) {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const giorni = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  return `${giorni[dt.getDay()]} ${pad(d)}/${pad(mo)}`;
}

const NOMI_GIORNI_LUN = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

// Tailwind safelist — i colori reparto via inline style, non Tailwind classes
// (i reparti.colore sono HEX dinamici)

// ---- COMPONENTE PRINCIPALE ------------------------------------------------
export default function FoglioSettimana() {
  const navigate = useNavigate();

  const [settimana, setSettimana] = useState(() => isoWeek(new Date()));
  const [reparti, setReparti] = useState([]);
  const [repartoId, setRepartoId] = useState(null);
  const [foglio, setFoglio] = useState(null);
  const [ore, setOre] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Popover state
  const [popover, setPopover] = useState(null);
  // shape: { data, servizio, slot_index, turno?, anchorRect }

  // Dialog copia settimana
  const [dlgCopia, setDlgCopia] = useState(false);

  // --- LOAD REPARTI ---
  useEffect(() => {
    apiFetch(`${API_BASE}/reparti/`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setReparti(list);
        if (list.length && repartoId == null) {
          setRepartoId(list[0].id);
        }
      })
      .catch(() => setError("Impossibile caricare i reparti"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- LOAD FOGLIO ---
  const caricaFoglio = useCallback(async () => {
    if (!repartoId) return;
    setLoading(true); setError(null);
    try {
      const [fRes, oRes] = await Promise.all([
        apiFetch(`${API_BASE}/turni/foglio?reparto_id=${repartoId}&settimana=${settimana}`),
        apiFetch(`${API_BASE}/turni/ore-nette?reparto_id=${repartoId}&settimana=${settimana}`),
      ]);
      if (!fRes.ok) throw new Error(`GET /turni/foglio ${fRes.status}`);
      if (!oRes.ok) throw new Error(`GET /turni/ore-nette ${oRes.status}`);
      setFoglio(await fRes.json());
      setOre(await oRes.json());
    } catch (e) {
      setError(e.message || "Errore caricamento foglio");
    } finally {
      setLoading(false);
    }
  }, [repartoId, settimana]);

  useEffect(() => { caricaFoglio(); }, [caricaFoglio]);

  const reparto = useMemo(
    () => reparti.find(r => r.id === repartoId) || null,
    [reparti, repartoId]
  );

  // --- MATRICE: [data][servizio][slot_index] → turno ---
  const matrice = useMemo(() => {
    const out = {};
    if (!foglio) return out;
    for (const g of foglio.giorni) out[g] = { PRANZO: {}, CENA: {} };
    for (const t of foglio.turni) {
      const serv = (t.servizio || "").toUpperCase();
      if (!out[t.data]) continue;
      if (serv === "PRANZO" || serv === "CENA") {
        if (t.slot_index != null) out[t.data][serv][t.slot_index] = t;
      }
    }
    return out;
  }, [foglio]);

  const chiusi = useMemo(() => new Set(foglio?.chiusure || []), [foglio]);

  // Slot count
  const nSlotPranzo = foglio ? Math.max(4, (foglio.max_slot_pranzo || 3) + 1) : 4;
  const nSlotCena = foglio ? Math.max(4, (foglio.max_slot_cena || 3) + 1) : 4;

  // ---- AZIONI TURNO --------------------------------------------------------
  async function assegnaTurno({ dipendente_id, data, servizio, slot_index, stato, note, ora_inizio, ora_fine }) {
    const r = await apiFetch(`${API_BASE}/turni/foglio/assegna`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reparto_id: repartoId,
        dipendente_id, data, servizio, slot_index,
        stato: stato || "CONFERMATO",
        note: note || null,
        ora_inizio: ora_inizio || null,
        ora_fine: ora_fine || null,
      }),
    });
    if (!r.ok) throw new Error((await r.json()).detail || `Errore ${r.status}`);
    return r.json();
  }

  async function aggiornaTurno(turno_id, patch) {
    const r = await apiFetch(`${API_BASE}/turni/foglio/${turno_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error((await r.json()).detail || `Errore ${r.status}`);
    return r.json();
  }

  async function cancellaTurno(turno_id) {
    const r = await apiFetch(`${API_BASE}/turni/foglio/${turno_id}`, { method: "DELETE" });
    if (!r.ok) throw new Error((await r.json()).detail || `Errore ${r.status}`);
    return true;
  }

  // ---- POPOVER HANDLERS ----------------------------------------------------
  function apriCella(data, servizio, slot_index, event) {
    if (chiusi.has(data)) return;
    const turno = matrice[data]?.[servizio]?.[slot_index] || null;
    const rect = event.currentTarget.getBoundingClientRect();
    setPopover({ data, servizio, slot_index, turno, anchorRect: rect });
  }

  function chiudiPopover() { setPopover(null); }

  async function onSubmitPopover(form) {
    try {
      if (popover.turno && form.action === "delete") {
        await cancellaTurno(popover.turno.id);
      } else if (popover.turno) {
        await aggiornaTurno(popover.turno.id, {
          dipendente_id: form.dipendente_id,
          ora_inizio: form.ora_inizio,
          ora_fine: form.ora_fine,
          stato: form.stato,
          note: form.note,
        });
      } else {
        await assegnaTurno({
          dipendente_id: form.dipendente_id,
          data: popover.data,
          servizio: popover.servizio,
          slot_index: popover.slot_index,
          stato: form.stato,
          note: form.note,
          ora_inizio: form.ora_inizio,
          ora_fine: form.ora_fine,
        });
      }
      chiudiPopover();
      caricaFoglio();
    } catch (e) {
      alert(e.message);
    }
  }

  // ---- COPIA SETTIMANA -----------------------------------------------------
  async function onCopiaSettimana({ from_settimana, to_settimana, sovrascrivi }) {
    try {
      const r = await apiFetch(`${API_BASE}/turni/copia-settimana`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reparto_id: repartoId, from_settimana, to_settimana, sovrascrivi,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      setDlgCopia(false);
      setSettimana(to_settimana);
      alert(`Copia OK — copiati ${j.copiati}, saltati chiusure ${j.saltati_chiusure}${j.cancellati ? `, cancellati ${j.cancellati}` : ""}`);
    } catch (e) {
      alert(e.message);
    }
  }

  // ---- RENDER --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <button onClick={() => navigate("/dipendenti")}
              className="text-sm text-neutral-500 hover:text-neutral-700">← Dipendenti</button>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">📅 Foglio Settimana</h1>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => setSettimana(shiftIsoWeek(settimana, -1))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50">←</button>
            <div className="min-h-[44px] px-4 flex items-center bg-white border rounded-lg font-mono text-sm">
              {settimana}
            </div>
            <button onClick={() => setSettimana(shiftIsoWeek(settimana, 1))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50">→</button>
            <button onClick={() => setSettimana(isoWeek(new Date()))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50 text-sm">Oggi</button>
            <button onClick={() => setDlgCopia(true)}
              className="min-h-[44px] px-3 bg-brand-blue text-white rounded-lg hover:opacity-90 text-sm">
              📋 Copia settimana
            </button>
          </div>
        </div>

        {/* TAB REPARTI */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {reparti.map(r => {
            const active = r.id === repartoId;
            return (
              <button key={r.id} onClick={() => setRepartoId(r.id)}
                style={{
                  borderColor: active ? r.colore : "transparent",
                  backgroundColor: active ? r.colore : "white",
                  color: active ? "white" : "#111",
                }}
                className="min-h-[44px] px-4 rounded-lg border-2 font-semibold transition hover:opacity-90">
                {r.icona} {r.nome}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-10 text-neutral-500">Caricamento…</div>}

        {!loading && foglio && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            {/* MATRICE */}
            <div className="bg-white rounded-xl shadow overflow-auto">
              <FoglioGrid
                foglio={foglio} matrice={matrice} chiusi={chiusi}
                nSlotPranzo={nSlotPranzo} nSlotCena={nSlotCena}
                onCellClick={apriCella}
              />
            </div>

            {/* PANNELLO ORE */}
            <OrePanel ore={ore} reparto={reparto} />
          </div>
        )}
      </div>

      {/* POPOVER */}
      {popover && foglio && (
        <PopoverAssegna
          popover={popover}
          dipendenti={foglio.dipendenti}
          reparto={reparto}
          onClose={chiudiPopover}
          onSubmit={onSubmitPopover}
        />
      )}

      {/* DIALOG COPIA SETTIMANA */}
      {dlgCopia && (
        <DialogCopia
          reparto={reparto}
          settimanaCorrente={settimana}
          onClose={() => setDlgCopia(false)}
          onSubmit={onCopiaSettimana}
        />
      )}
    </div>
  );
}


// ---- FOGLIO GRID ----------------------------------------------------------
function FoglioGrid({ foglio, matrice, chiusi, nSlotPranzo, nSlotCena, onCellClick }) {
  const giorni = foglio.giorni;

  return (
    <div className="min-w-[900px]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-neutral-50">
            <th className="p-2 border-b border-r text-left sticky left-0 bg-neutral-50 w-28">Giorno</th>
            <th className="p-1 border-b border-r text-center text-xs font-semibold text-amber-700 bg-amber-50"
                colSpan={nSlotPranzo}>☀️ PRANZO</th>
            <th className="p-1 border-b text-center text-xs font-semibold text-indigo-700 bg-indigo-50"
                colSpan={nSlotCena}>🌙 CENA</th>
          </tr>
          <tr className="bg-neutral-50 text-[11px] text-neutral-500">
            <th className="p-1 border-b border-r sticky left-0 bg-neutral-50"></th>
            {Array.from({length: nSlotPranzo}).map((_, i) =>
              <th key={`p${i}`} className="p-1 border-b border-r text-center">P{i+1}</th>
            )}
            {Array.from({length: nSlotCena}).map((_, i) =>
              <th key={`c${i}`} className="p-1 border-b border-r text-center">C{i+1}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {giorni.map((g, idx) => {
            const chiuso = chiusi.has(g);
            return (
              <tr key={g} className={chiuso ? "bg-neutral-100 text-neutral-400" : ""}>
                <td className="p-2 border-b border-r font-medium sticky left-0 bg-white">
                  <div className="text-[11px] text-neutral-500">{NOMI_GIORNI_LUN[idx]}</div>
                  <div>{formatDayLabel(g)}</div>
                  {chiuso && <div className="text-[10px] text-red-500">CHIUSO</div>}
                </td>
                {Array.from({length: nSlotPranzo}).map((_, si) => (
                  <SlotCell key={`${g}-p${si}`} turno={matrice[g]?.PRANZO?.[si]}
                    onClick={(e) => !chiuso && onCellClick(g, "PRANZO", si, e)} disabled={chiuso} />
                ))}
                {Array.from({length: nSlotCena}).map((_, si) => (
                  <SlotCell key={`${g}-c${si}`} turno={matrice[g]?.CENA?.[si]}
                    onClick={(e) => !chiuso && onCellClick(g, "CENA", si, e)} disabled={chiuso} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ---- SLOT CELL ------------------------------------------------------------
function SlotCell({ turno, onClick, disabled }) {
  if (disabled) {
    return <td className="border-b border-r p-1 text-center text-neutral-300">—</td>;
  }
  if (!turno) {
    return (
      <td className="border-b border-r p-1 min-h-[44px] cursor-pointer hover:bg-blue-50"
          onClick={onClick}>
        <div className="text-center text-neutral-300 text-xl leading-none">+</div>
      </td>
    );
  }
  const stato = (turno.stato || "").toUpperCase();
  const chiamata = stato === "CHIAMATA";
  const annullato = stato === "ANNULLATO";

  const bg = turno.dipendente_colore || "#d1d5db";
  const tone = textOn(bg);

  return (
    <td className="border-b border-r p-1 cursor-pointer hover:ring-2 hover:ring-blue-300"
        onClick={onClick}>
      <div className="rounded-md px-2 py-1 text-xs leading-tight relative"
           style={{ backgroundColor: bg, color: tone, opacity: annullato ? 0.4 : 1 }}>
        {chiamata && (
          <span className="absolute -top-1 -right-1 text-yellow-400 text-lg leading-none drop-shadow">★</span>
        )}
        <div className="font-semibold truncate">
          {turno.dipendente_nome} {turno.dipendente_cognome?.[0]}.
        </div>
        <div className="opacity-80 text-[10px]">
          {turno.ora_inizio}-{turno.ora_fine}
        </div>
      </div>
    </td>
  );
}


// Contrasto bianco/nero su background HEX
function textOn(hex) {
  if (!hex) return "#111";
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#111" : "#fff";
}


// ---- PANNELLO ORE ---------------------------------------------------------
function OrePanel({ ore, reparto }) {
  if (!ore) return null;
  const pausaP = reparto?.pausa_pranzo_min ?? 30;
  const pausaC = reparto?.pausa_cena_min ?? 30;

  const sorted = [...(ore.dipendenti || [])].sort((a, b) => (b.ore_nette - a.ore_nette));
  const totLordo = sorted.reduce((s, d) => s + d.ore_lorde, 0);
  const totNetto = sorted.reduce((s, d) => s + d.ore_nette, 0);

  return (
    <div className="bg-white rounded-xl shadow p-4 h-fit sticky top-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">⏱ Ore {reparto?.nome}</h3>
        <div className="text-[10px] text-neutral-500">
          pause staff: {pausaP}+{pausaC} min
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="text-sm text-neutral-400 text-center py-6">Nessun dipendente</div>
      )}

      <div className="space-y-1">
        {sorted.map(d => {
          const sem = d.semaforo === "verde" ? "bg-green-500" : d.semaforo === "giallo" ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={d.dipendente_id} className="flex items-center justify-between py-1 border-b last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${sem} shrink-0`}></span>
                <span className="inline-block w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: d.colore || "#d1d5db" }}></span>
                <span className="text-sm truncate">{d.nome} {d.cognome}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-mono font-semibold">{d.ore_nette.toFixed(1)}h</div>
                <div className="text-[10px] text-neutral-400 font-mono">lordo {d.ore_lorde.toFixed(1)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          <div className="text-xs text-neutral-500">Totale</div>
          <div className="text-sm font-mono font-semibold">
            {totNetto.toFixed(1)}h
            <span className="text-[10px] text-neutral-400 font-normal ml-1">(lordo {totLordo.toFixed(1)})</span>
          </div>
        </div>
      )}

      <div className="mt-3 text-[10px] text-neutral-400 leading-snug">
        Semaforo: ≤40h <span className="text-green-600">verde</span>, 40–48 <span className="text-amber-600">giallo</span>, &gt;48 <span className="text-red-600">rosso</span>
      </div>
    </div>
  );
}


// ---- POPOVER ASSEGNA ------------------------------------------------------
function PopoverAssegna({ popover, dipendenti, reparto, onClose, onSubmit }) {
  const t = popover.turno;
  const def_ora_ini = popover.servizio === "PRANZO" ? (reparto?.pranzo_inizio || "12:00") : (reparto?.cena_inizio || "19:00");
  const def_ora_fin = popover.servizio === "PRANZO" ? (reparto?.pranzo_fine || "15:00") : (reparto?.cena_fine || "23:00");

  const [form, setForm] = useState({
    dipendente_id: t?.dipendente_id || (dipendenti[0]?.id ?? null),
    ora_inizio: t?.ora_inizio || def_ora_ini,
    ora_fine: t?.ora_fine || def_ora_fin,
    stato: t?.stato || "CONFERMATO",
    note: t?.note || "",
  });

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  const canSubmit = !!form.dipendente_id;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-2">
          {t ? "Modifica turno" : "Nuovo turno"} — {popover.servizio} {popover.slot_index + 1}
        </h3>
        <div className="text-xs text-neutral-500 mb-3">{formatDayLabel(popover.data)}</div>

        <label className="block text-xs font-medium mb-1">Dipendente</label>
        <select value={form.dipendente_id || ""}
                onChange={e => update("dipendente_id", Number(e.target.value))}
                className="w-full min-h-[44px] border rounded px-2 mb-3">
          {dipendenti.map(d => (
            <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Dalle</label>
            <input type="time" value={form.ora_inizio}
                   onChange={e => update("ora_inizio", e.target.value)}
                   className="w-full min-h-[44px] border rounded px-2" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Alle</label>
            <input type="time" value={form.ora_fine}
                   onChange={e => update("ora_fine", e.target.value)}
                   className="w-full min-h-[44px] border rounded px-2" />
          </div>
        </div>

        <label className="block text-xs font-medium mb-1">Stato</label>
        <div className="flex gap-2 mb-3 flex-wrap">
          {[
            { v: "CONFERMATO", l: "✓ Confermato", bg: "bg-green-600" },
            { v: "CHIAMATA",   l: "★ Chiamata",   bg: "bg-yellow-500" },
            { v: "ANNULLATO",  l: "✕ Annullato",  bg: "bg-neutral-500" },
          ].map(opt => (
            <button key={opt.v} type="button" onClick={() => update("stato", opt.v)}
                    className={`min-h-[44px] px-3 rounded text-sm font-semibold ${
                      form.stato === opt.v ? `${opt.bg} text-white` : "bg-neutral-100 text-neutral-700"
                    }`}>{opt.l}</button>
          ))}
        </div>

        <label className="block text-xs font-medium mb-1">Note</label>
        <input type="text" value={form.note}
               onChange={e => update("note", e.target.value)}
               placeholder="es. sostituisce Luca"
               className="w-full min-h-[44px] border rounded px-2 mb-4" />

        <div className="flex justify-between gap-2">
          {t && (
            <button onClick={() => onSubmit({ ...form, action: "delete" })}
              className="min-h-[44px] px-3 bg-red-50 text-red-700 rounded hover:bg-red-100">
              🗑 Rimuovi
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose}
                    className="min-h-[44px] px-3 bg-neutral-100 rounded">Annulla</button>
            <button disabled={!canSubmit}
                    onClick={() => onSubmit(form)}
                    className="min-h-[44px] px-3 bg-brand-blue text-white rounded hover:opacity-90 disabled:opacity-40">
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ---- DIALOG COPIA SETTIMANA ----------------------------------------------
function DialogCopia({ reparto, settimanaCorrente, onClose, onSubmit }) {
  const [from_settimana, setFrom] = useState(shiftIsoWeek(settimanaCorrente, -1));
  const [to_settimana, setTo] = useState(settimanaCorrente);
  const [sovrascrivi, setSovrascrivi] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">📋 Copia settimana — {reparto?.nome}</h3>

        <label className="block text-xs font-medium mb-1">Dalla settimana</label>
        <input type="text" value={from_settimana} onChange={e => setFrom(e.target.value)}
               className="w-full min-h-[44px] border rounded px-2 mb-3 font-mono" placeholder="2026-W15" />

        <label className="block text-xs font-medium mb-1">Alla settimana</label>
        <input type="text" value={to_settimana} onChange={e => setTo(e.target.value)}
               className="w-full min-h-[44px] border rounded px-2 mb-3 font-mono" placeholder="2026-W16" />

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input type="checkbox" checked={sovrascrivi} onChange={e => setSovrascrivi(e.target.checked)} />
          Sovrascrivi turni esistenti nella settimana destinazione
        </label>

        <div className="text-xs text-neutral-500 mb-4">
          I giorni chiusi nella settimana destinazione vengono saltati automaticamente.
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-[44px] px-3 bg-neutral-100 rounded">Annulla</button>
          <button onClick={() => onSubmit({ from_settimana, to_settimana, sovrascrivi })}
                  className="min-h-[44px] px-3 bg-brand-blue text-white rounded hover:opacity-90">
            Copia
          </button>
        </div>
      </div>
    </div>
  );
}
