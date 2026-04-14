// @version: v1.9-mobile-day (Fase 9: vista giorno automatica <900px per iPad portrait)
// Foglio Settimana Turni v2 — TRGB Gestionale
//
// Matrice: 7 giorni (Lun..Dom) × slot (P1..Pn + C1..Cn) per reparto.
// - Tab reparto (SALA/CUCINA) in alto
// - Click cella → popover assegnazione (dipendente, orari, stato OPZIONALE)
// - Asterisco giallo per stato OPZIONALE (turno da confermare all'ultimo)
// - Badge "a chiamata" per dipendenti pagati a ore senza contratto fisso
// - Riga grigia per giorno di chiusura (letto da settings/closures-config)
// - Pannello destro: ore lorde/nette per dipendente con semaforo 40/48
// - Pulsanti ←/→ per navigazione settimana, pulsante "Copia settimana"
// - 📄 PDF: fetch server-side (WeasyPrint) → blob → apertura in nuova tab (niente dialog stampante)
// - 📷 Immagine: vista pulita fullscreen pronta per screenshot → WhatsApp staff
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

function formatWeekRange(iso) {
  const m = mondayOfWeek(iso);
  const end = new Date(m);
  end.setUTCDate(m.getUTCDate() + 6);
  const sameMonth = m.getUTCMonth() === end.getUTCMonth();
  const left = sameMonth
    ? `${pad(m.getUTCDate())}`
    : `${pad(m.getUTCDate())}/${pad(m.getUTCMonth() + 1)}`;
  const right = `${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}/${end.getUTCFullYear()}`;
  return `${left}–${right}`;
}

const NOMI_GIORNI_LUN = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

// Hook responsive: true sotto 900px (iPad portrait + smartphone)
function useIsNarrow(maxPx = 899) {
  const query = `(max-width: ${maxPx}px)`;
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e) => setNarrow(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);
  return narrow;
}

// Tailwind safelist — i colori reparto via inline style, non Tailwind classes
// (i reparti.colore sono HEX dinamici)

// ---- COMPONENTE PRINCIPALE ------------------------------------------------
export default function FoglioSettimana() {
  const navigate = useNavigate();

  // Deep-link da VistaMensile: se è stato memorizzato un target, usalo poi puliscilo
  const [settimana, setSettimana] = useState(() => {
    const last = localStorage.getItem("turni_last_settimana");
    if (last && /^\d{4}-W\d{2}$/.test(last)) {
      localStorage.removeItem("turni_last_settimana");
      return last;
    }
    return isoWeek(new Date());
  });
  const [reparti, setReparti] = useState([]);
  const [repartoId, setRepartoId] = useState(() => {
    const last = Number(localStorage.getItem("turni_last_reparto"));
    return last || null;
  });
  const [foglio, setFoglio] = useState(null);
  const [ore, setOre] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Popover state
  const [popover, setPopover] = useState(null);
  // shape: { data, servizio, slot_index, turno?, anchorRect }

  // Dialog copia settimana
  const [dlgCopia, setDlgCopia] = useState(false);

  // Vista immagine per screenshot WhatsApp (Fase 8)
  const [imageMode, setImageMode] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Fase 9 — Mobile: sotto 900px usiamo "vista giorno", indice 0..6 (Lun..Dom)
  const isNarrow = useIsNarrow(899);
  const [giornoIdx, setGiornoIdx] = useState(() => {
    const wd = new Date().getDay();
    return wd === 0 ? 6 : wd - 1;  // 0=lun..6=dom
  });

  // Fase 8: PDF server-side (WeasyPrint) — niente dialog stampante, scarica/apre PDF diretto
  async function scaricaPdf() {
    if (!repartoId) return;
    setLoadingPdf(true);
    try {
      const res = await apiFetch(`${API_BASE}/turni/foglio/pdf?reparto_id=${repartoId}&settimana=${settimana}`);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Errore PDF ${res.status}: ${msg}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Apri in nuova tab: il browser mostra anteprima PDF, l'utente sceglie se salvare/condividere
      const w = window.open(url, "_blank");
      if (!w) {
        // Popup bloccato → fallback download
        const a = document.createElement("a");
        a.href = url;
        a.download = `turni_${settimana}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Libera l'URL dopo un po' (il PDF è già caricato)
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert(e.message || "Errore durante generazione PDF");
    } finally {
      setLoadingPdf(false);
    }
  }

  // --- LOAD REPARTI ---
  useEffect(() => {
    apiFetch(`${API_BASE}/reparti/`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setReparti(list);
        // Se il reparto persisto non esiste più (o non è stato settato), fallback al primo
        if (list.length && !list.find(r => r.id === repartoId)) {
          setRepartoId(list[0].id);
        }
      })
      .catch(() => setError("Impossibile caricare i reparti"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisti reparto scelto (condiviso con VistaMensile per navigazione coerente)
  useEffect(() => {
    if (repartoId) localStorage.setItem("turni_last_reparto", String(repartoId));
  }, [repartoId]);

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
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={() => setSettimana(shiftIsoWeek(settimana, -1))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50">←</button>
            <div className="min-h-[44px] px-4 flex items-center bg-white border rounded-lg font-mono text-sm">
              {settimana}
            </div>
            <button onClick={() => setSettimana(shiftIsoWeek(settimana, 1))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50">→</button>
            <button onClick={() => setSettimana(isoWeek(new Date()))}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50 text-sm">Oggi</button>
            <button onClick={() => navigate("/dipendenti/turni/mese")}
              className="min-h-[44px] px-3 bg-white border rounded-lg hover:bg-neutral-50 text-sm"
              title="Passa alla vista mensile (griglia 6×7, sola lettura)">
              🗓 Mese
            </button>
            <button onClick={() => setDlgCopia(true)}
              className="min-h-[44px] px-3 bg-brand-blue text-white rounded-lg hover:opacity-90 text-sm">
              📋 Copia
            </button>
            <button onClick={scaricaPdf} disabled={loadingPdf}
              className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm disabled:opacity-50"
              title="Genera PDF brandizzato (A4 orizzontale) — niente dialog stampante">
              {loadingPdf ? "⏳ PDF…" : "📄 PDF"}
            </button>
            <button onClick={() => setImageMode(true)}
              className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm"
              title="Apri vista pulita per screenshot (da condividere su WhatsApp)">
              📷 Immagine
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
            {/* VISTA: matrice su desktop/landscape, vista giorno su mobile/portrait */}
            {isNarrow ? (
              <VistaGiornoMobile
                foglio={foglio} matrice={matrice} chiusi={chiusi}
                nSlotPranzo={nSlotPranzo} nSlotCena={nSlotCena}
                reparto={reparto}
                giornoIdx={giornoIdx} setGiornoIdx={setGiornoIdx}
                onCellClick={apriCella}
                onPrevSettimana={() => { setSettimana(shiftIsoWeek(settimana, -1)); setGiornoIdx(0); }}
                onNextSettimana={() => { setSettimana(shiftIsoWeek(settimana, 1)); setGiornoIdx(0); }}
              />
            ) : (
              <div className="bg-white rounded-xl shadow overflow-auto">
                <FoglioGrid
                  foglio={foglio} matrice={matrice} chiusi={chiusi}
                  nSlotPranzo={nSlotPranzo} nSlotCena={nSlotCena}
                  onCellClick={apriCella}
                />
              </div>
            )}

            {/* PANNELLO ORE — sempre visibile (su narrow va in fondo, full width) */}
            <OrePanel ore={ore} reparto={reparto} />
          </div>
        )}
      </div>

      {/* OVERLAY VISTA IMMAGINE (screenshot-ready per WhatsApp) */}
      {imageMode && foglio && (
        <VistaImmagine
          foglio={foglio} matrice={matrice} chiusi={chiusi}
          nSlotPranzo={nSlotPranzo} nSlotCena={nSlotCena}
          reparto={reparto} settimana={settimana}
          onClose={() => setImageMode(false)}
          onPdf={scaricaPdf}
        />
      )}

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

  // Larghezza colonna slot (px). Stretta: il pill colorato riempie meglio.
  const SLOT_W = 92;
  const totalMin = 80 + (nSlotPranzo + nSlotCena) * SLOT_W;

  return (
    <div style={{ minWidth: totalMin }}>
      <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 80 }} />
          {Array.from({length: nSlotPranzo + nSlotCena}).map((_, i) =>
            <col key={`cw${i}`} style={{ width: SLOT_W }} />
          )}
        </colgroup>
        <thead>
          <tr className="bg-neutral-50">
            <th className="px-2 py-1 border-b border-r text-left sticky left-0 bg-neutral-50">Giorno</th>
            <th className="px-1 py-1 border-b border-r text-center text-[11px] font-semibold text-amber-700 bg-amber-50"
                colSpan={nSlotPranzo}>☀️ PRANZO</th>
            <th className="px-1 py-1 border-b text-center text-[11px] font-semibold text-indigo-700 bg-indigo-50"
                colSpan={nSlotCena}>🌙 CENA</th>
          </tr>
          <tr className="bg-neutral-50 text-[11px] text-neutral-500">
            <th className="px-1 py-1 border-b border-r sticky left-0 bg-neutral-50"></th>
            {Array.from({length: nSlotPranzo}).map((_, i) =>
              <th key={`p${i}`} className="px-1 py-1 border-b border-r text-center">P{i+1}</th>
            )}
            {Array.from({length: nSlotCena}).map((_, i) =>
              <th key={`c${i}`} className="px-1 py-1 border-b border-r text-center">C{i+1}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {giorni.map((g, idx) => {
            const chiuso = chiusi.has(g);
            return (
              <tr key={g} className={chiuso ? "bg-neutral-100 text-neutral-400" : ""}>
                <td className="px-2 py-1 border-b border-r font-medium sticky left-0 bg-white">
                  <div className="text-[10px] text-neutral-500 leading-tight">{NOMI_GIORNI_LUN[idx]}</div>
                  <div className="text-xs leading-tight">{formatDayLabel(g)}</div>
                  {chiuso && <div className="text-[9px] text-red-500 leading-tight">CHIUSO</div>}
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
    return <td className="border-b border-r px-1 py-1 text-center text-neutral-300">—</td>;
  }
  if (!turno) {
    return (
      <td className="border-b border-r p-1 cursor-pointer hover:bg-blue-50"
          onClick={onClick}>
        <div className="text-center text-neutral-300 text-base leading-none">+</div>
      </td>
    );
  }
  const stato = (turno.stato || "").toUpperCase();
  const opzionale = stato === "OPZIONALE";
  const annullato = stato === "ANNULLATO";

  const bg = turno.dipendente_colore || "#d1d5db";
  const tone = textOn(bg);

  // Solo primo nome + iniziale cognome puntata (es. "Paolo S.", "Mirla D.")
  const primoNome = (turno.dipendente_nome || "").trim().split(/\s+/)[0] || "";
  const iniCog = (turno.dipendente_cognome || "").trim().charAt(0);
  const label = `${primoNome}${iniCog ? ` ${iniCog}.` : ""}`;

  return (
    <td className="border-b border-r p-1 cursor-pointer hover:ring-2 hover:ring-blue-300"
        onClick={onClick}>
      <div className="rounded px-1.5 py-1 leading-tight relative"
           style={{ backgroundColor: bg, color: tone, opacity: annullato ? 0.4 : 1 }}>
        {opzionale && (
          <span className="absolute -top-1 -right-1 text-yellow-400 text-sm leading-none drop-shadow" title="Turno opzionale">★</span>
        )}
        <div className="font-semibold truncate text-[12px]">
          {label}
        </div>
        <div className="opacity-80 text-[10px] font-mono leading-tight">
          {(turno.ora_inizio || "").slice(0,5)}-{(turno.ora_fine || "").slice(0,5)}
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
                {d.a_chiamata && (
                  <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0"
                        title="A chiamata — contratto a ore">📞</span>
                )}
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
      <div className="mt-1 text-[10px] text-neutral-400 leading-snug">
        Pausa pranzo dedotta solo per arrivi &lt; 11:30; pausa cena per arrivi &lt; 18:30 (chi entra 12/19 arriva già mangiato).
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
            { v: "OPZIONALE",  l: "★ Opzionale",  bg: "bg-yellow-500" },
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
  // Default sensato: copia DA settimana corrente A settimana prossima
  const [from_settimana, setFrom] = useState(settimanaCorrente);
  const [to_settimana, setTo] = useState(shiftIsoWeek(settimanaCorrente, 1));
  const [sovrascrivi, setSovrascrivi] = useState(false);

  // Range range ±8 settimane intorno alla settimana corrente per il selettore
  const opzioni = useMemo(() => {
    const out = [];
    for (let d = -8; d <= 8; d++) {
      const iso = shiftIsoWeek(settimanaCorrente, d);
      const monday = mondayOfWeek(iso);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const fmt = (dt) => `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth()+1)}`;
      const label = `${iso} — ${fmt(monday)}→${fmt(sunday)}${d === 0 ? "  (corrente)" : ""}`;
      out.push({ iso, label });
    }
    return out;
  }, [settimanaCorrente]);

  const stessa = from_settimana === to_settimana;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">📋 Copia settimana — {reparto?.nome}</h3>

        <label className="block text-xs font-medium mb-1">Dalla settimana</label>
        <div className="flex gap-1 mb-3">
          <button type="button" onClick={() => setFrom(shiftIsoWeek(from_settimana, -1))}
                  className="min-h-[44px] px-2 border rounded hover:bg-neutral-50">←</button>
          <select value={from_settimana} onChange={e => setFrom(e.target.value)}
                  className="flex-1 min-h-[44px] border rounded px-2 font-mono text-sm">
            {opzioni.map(o => (
              <option key={`f-${o.iso}`} value={o.iso}>{o.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => setFrom(shiftIsoWeek(from_settimana, 1))}
                  className="min-h-[44px] px-2 border rounded hover:bg-neutral-50">→</button>
        </div>

        <label className="block text-xs font-medium mb-1">Alla settimana</label>
        <div className="flex gap-1 mb-3">
          <button type="button" onClick={() => setTo(shiftIsoWeek(to_settimana, -1))}
                  className="min-h-[44px] px-2 border rounded hover:bg-neutral-50">←</button>
          <select value={to_settimana} onChange={e => setTo(e.target.value)}
                  className="flex-1 min-h-[44px] border rounded px-2 font-mono text-sm">
            {opzioni.map(o => (
              <option key={`t-${o.iso}`} value={o.iso}>{o.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => setTo(shiftIsoWeek(to_settimana, 1))}
                  className="min-h-[44px] px-2 border rounded hover:bg-neutral-50">→</button>
        </div>

        {stessa && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded">
            ⚠ Origine e destinazione sono la stessa settimana.
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input type="checkbox" checked={sovrascrivi} onChange={e => setSovrascrivi(e.target.checked)} />
          Sovrascrivi turni esistenti nella settimana destinazione
        </label>

        <div className="text-xs text-neutral-500 mb-4">
          I giorni chiusi nella settimana destinazione vengono saltati automaticamente.
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-[44px] px-3 bg-neutral-100 rounded">Annulla</button>
          <button disabled={stessa}
                  onClick={() => onSubmit({ from_settimana, to_settimana, sovrascrivi })}
                  className="min-h-[44px] px-3 bg-brand-blue text-white rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            Copia
          </button>
        </div>
      </div>
    </div>
  );
}


// ---- VISTA IMMAGINE (Fase 8) ---------------------------------------------
// Fullscreen pulito pronto per screenshot da condividere su WhatsApp con lo staff.
// Nasconde tutta la nav, mostra solo titolo + matrice + legenda.
function VistaImmagine({ foglio, matrice, chiusi, nSlotPranzo, nSlotCena, reparto, settimana, onClose, onPdf }) {
  // Previeni lo scroll body dietro l'overlay
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 bg-white z-[60] overflow-auto">
      {/* Toolbar — non viene nello screenshot se l'utente ritaglia */}
      <div className="sticky top-0 z-10 bg-neutral-100 border-b border-neutral-200 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-neutral-600">
          📷 Vista pulita — fai uno screenshot per condividere su WhatsApp
        </div>
        <div className="flex gap-2">
          <button onClick={onPdf}
            className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded text-sm hover:bg-neutral-50"
            title="Scarica PDF brandizzato (A4 orizzontale)">
            📄 PDF
          </button>
          <button onClick={onClose}
            className="min-h-[44px] px-4 bg-brand-ink text-white rounded text-sm hover:opacity-90">
            ✕ Chiudi
          </button>
        </div>
      </div>

      {/* Contenuto da screenshottare */}
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        {/* Intestazione */}
        <div className="text-center mb-4 pb-3 border-b-2 border-neutral-900">
          <div className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">
            🍷 Osteria Tre Gobbi
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-1 text-neutral-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Turni settimana {formatWeekRange(settimana)}
          </div>
          {reparto && (
            <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-semibold"
                 style={{ backgroundColor: reparto.colore || "#444" }}>
              <span>{reparto.icona}</span>
              <span>{reparto.nome}</span>
            </div>
          )}
        </div>

        {/* Matrice */}
        <div className="bg-white border border-neutral-300 rounded overflow-auto">
          <FoglioGrid
            foglio={foglio} matrice={matrice} chiusi={chiusi}
            nSlotPranzo={nSlotPranzo} nSlotCena={nSlotCena}
            onCellClick={() => {}}
          />
        </div>

        {/* Legenda compatta */}
        <div className="mt-3 flex flex-wrap gap-3 items-center text-[11px] text-neutral-600">
          <span><span className="text-yellow-500">★</span> turno opzionale (da confermare)</span>
          <span>📞 a chiamata</span>
          <span>— chiuso</span>
          <span className="ml-auto text-neutral-400">
            Generato {new Date().toLocaleDateString("it-IT")} • TRGB Gestionale
          </span>
        </div>
      </div>
    </div>
  );
}


// ---- VISTA GIORNO MOBILE (Fase 9) ----------------------------------------
// Sotto 900px (iPad portrait + smartphone) la matrice settimanale diventa
// "vista giorno": un giorno alla volta con due liste verticali (pranzo / cena).
// Touch target 48pt, swipe left/right per cambiare giorno (con bordo settimana).
function VistaGiornoMobile({
  foglio, matrice, chiusi, nSlotPranzo, nSlotCena, reparto,
  giornoIdx, setGiornoIdx, onCellClick,
  onPrevSettimana, onNextSettimana,
}) {
  const dataIso = foglio.giorni[giornoIdx];
  const chiuso = chiusi.has(dataIso);
  const turniDay = matrice[dataIso] || { PRANZO: {}, CENA: {} };
  const oggiIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const isOggi = dataIso === oggiIso;

  function vai(delta) {
    const next = giornoIdx + delta;
    if (next < 0) {
      // Giorno precedente "prima del lunedì" → settimana prima, parto da domenica
      onPrevSettimana();
      setGiornoIdx(6);
    } else if (next > 6) {
      // Oltre la domenica → settimana dopo, parto dal lunedì
      onNextSettimana();
      setGiornoIdx(0);
    } else {
      setGiornoIdx(next);
    }
  }

  function vaiOggi() {
    const wd = new Date().getDay();
    setGiornoIdx(wd === 0 ? 6 : wd - 1);
  }

  // Swipe gesture (touch) — soglia 60px, ignora movimenti verticali dominanti
  const touch = React.useRef({ x: 0, y: 0, t: 0 });
  function onTouchStart(e) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    const dt = Date.now() - touch.current.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    vai(dx > 0 ? -1 : 1);  // swipe right → giorno precedente; left → successivo
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden"
         onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header navigatore giorno */}
      <div className="flex items-center justify-between px-2 py-2 bg-neutral-50 border-b sticky top-0 z-10">
        <button onClick={() => vai(-1)}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center bg-white border rounded-lg active:bg-neutral-100"
          aria-label="Giorno precedente">←</button>
        <div className="flex-1 text-center px-2">
          <div className="text-[11px] text-neutral-500 leading-none uppercase tracking-wide">
            {NOMI_GIORNI_LUN[giornoIdx]}
          </div>
          <div className="text-base font-semibold leading-tight mt-0.5">
            {formatDayLabel(dataIso)}
            {isOggi && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-blue text-white align-middle">OGGI</span>}
            {chiuso && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-neutral-300 text-neutral-700 align-middle">CHIUSO</span>}
          </div>
        </div>
        <button onClick={() => vai(1)}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center bg-white border rounded-lg active:bg-neutral-100"
          aria-label="Giorno successivo">→</button>
      </div>

      {/* Bottone Oggi */}
      {!isOggi && (
        <div className="px-3 pt-2">
          <button onClick={vaiOggi}
            className="w-full min-h-[44px] px-3 bg-white border rounded-lg text-sm hover:bg-neutral-50">
            ↩ Vai a oggi
          </button>
        </div>
      )}

      {/* Body */}
      {chiuso ? (
        <div className="p-6 text-center text-neutral-500">
          <div className="text-4xl mb-2">🚪</div>
          <div className="font-semibold">Osteria chiusa</div>
          <div className="text-xs text-neutral-400 mt-1">Nessun turno per questa giornata</div>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <SezioneServizioMobile
            etichetta="☀️ Pranzo"
            orarioStd={`${reparto?.pranzo_inizio || ""}–${reparto?.pranzo_fine || ""}`}
            servizio="PRANZO"
            n={nSlotPranzo}
            slotMap={turniDay.PRANZO || {}}
            onSlotClick={(si, e) => onCellClick(dataIso, "PRANZO", si, e)}
          />
          <SezioneServizioMobile
            etichetta="🌙 Cena"
            orarioStd={`${reparto?.cena_inizio || ""}–${reparto?.cena_fine || ""}`}
            servizio="CENA"
            n={nSlotCena}
            slotMap={turniDay.CENA || {}}
            onSlotClick={(si, e) => onCellClick(dataIso, "CENA", si, e)}
          />
        </div>
      )}

      <div className="px-3 py-2 text-[10px] text-neutral-400 text-center border-t">
        Scorri ← / → o usa i pulsanti per cambiare giorno
      </div>
    </div>
  );
}


function SezioneServizioMobile({ etichetta, orarioStd, n, slotMap, onSlotClick }) {
  const slotsArr = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b">
        <div className="text-sm font-semibold">{etichetta}</div>
        <div className="text-[10px] text-neutral-500 font-mono">{orarioStd}</div>
      </div>
      <div>
        {slotsArr.map(si => (
          <SlotMobileRow key={si}
            slotIndex={si}
            turno={slotMap[si]}
            onClick={(e) => onSlotClick(si, e)}
          />
        ))}
      </div>
    </div>
  );
}


function SlotMobileRow({ slotIndex, turno, onClick }) {
  if (!turno) {
    return (
      <button type="button" onClick={onClick}
        className="w-full min-h-[48px] flex items-center justify-between px-3 py-2 border-b last:border-0 active:bg-blue-50 hover:bg-blue-50 text-left">
        <span className="text-[11px] text-neutral-400 font-mono shrink-0">#{slotIndex + 1}</span>
        <span className="text-neutral-300 text-base">+ assegna</span>
      </button>
    );
  }
  const stato = (turno.stato || "").toUpperCase();
  const opzionale = stato === "OPZIONALE";
  const annullato = stato === "ANNULLATO";
  const bg = turno.dipendente_colore || "#d1d5db";
  const tone = textOn(bg);
  const primoNome = (turno.dipendente_nome || "").trim().split(/\s+/)[0] || "";
  const cognome = (turno.dipendente_cognome || "").trim();
  const nomeFull = `${primoNome}${cognome ? " " + cognome : ""}`;

  return (
    <button type="button" onClick={onClick}
      className="w-full min-h-[48px] flex items-center gap-2 px-3 py-2 border-b last:border-0 active:bg-blue-50 hover:bg-blue-50 text-left">
      <span className="text-[11px] text-neutral-400 font-mono shrink-0">#{slotIndex + 1}</span>
      <span className="rounded px-2 py-1 text-sm font-semibold leading-tight relative shrink-0"
            style={{ backgroundColor: bg, color: tone, opacity: annullato ? 0.4 : 1 }}>
        {nomeFull}
        {opzionale && (
          <span className="absolute -top-1 -right-1 text-yellow-400 text-sm leading-none drop-shadow" title="Opzionale">★</span>
        )}
      </span>
      <span className="ml-auto text-[11px] text-neutral-500 font-mono shrink-0">
        {(turno.ora_inizio || "").slice(0, 5)}–{(turno.ora_fine || "").slice(0, 5)}
      </span>
    </button>
  );
}
