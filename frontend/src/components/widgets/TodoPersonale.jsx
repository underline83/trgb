// FILE: frontend/src/components/widgets/TodoPersonale.jsx
// @version: v1.0 — «Le mie cose da fare», lista personale (2026-10-03)
//   Ognuno la organizza come vuole (Marco): tocca il testo per correggerlo,
//   ↑ ↓ per spostare le righe, ✓ per chiuderle, × per cancellarle.
//
// Non sono task del Task Manager (quelli si assegnano e hanno scadenze): è il
// foglietto in tasca di ognuno. Aggiungi, spunta, cancella. Ognuno vede solo
// la sua lista; il superadmin ha in più il link alla board di tutti.
// Backend: /todo/ (todo_router.py, tabella todo_personali in tasks.sqlite3).
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

export default function TodoPersonale({ compact = false }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [items, setItems] = useState(null);
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [inModifica, setInModifica] = useState(null);   // {id, testo}

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/todo/`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((await r.json()).items || []);
      setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function chiama(url, opts) {
    setBusy(true);
    try {
      const r = await apiFetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      await load();
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  async function aggiungi(e) {
    e.preventDefault();
    const t = testo.trim();
    if (!t || busy) return;
    if (await chiama(`${API_BASE}/todo/`, { method: "POST", body: JSON.stringify({ testo: t }) })) setTesto("");
  }
  const segna = (it) => chiama(`${API_BASE}/todo/${it.id}`, { method: "PATCH", body: JSON.stringify({ fatto: !it.fatto }) });
  const togli = (it) => chiama(`${API_BASE}/todo/${it.id}`, { method: "DELETE" });

  async function salvaTesto() {
    const m = inModifica;
    setInModifica(null);
    if (!m) return;
    const t = m.testo.trim();
    const orig = (items || []).find((i) => i.id === m.id);
    if (!t || !orig || t === orig.testo) return;
    await chiama(`${API_BASE}/todo/${m.id}`, { method: "PATCH", body: JSON.stringify({ testo: t }) });
  }

  // ↑ ↓ fra le righe ancora da fare: si manda l'ordine intero, il backend
  // riscrive le posizioni (solo delle righe dell'utente).
  async function sposta(it, verso) {
    const aperte = (items || []).filter((i) => !i.fatto);
    const idx = aperte.findIndex((i) => i.id === it.id);
    const dest = idx + verso;
    if (idx < 0 || dest < 0 || dest >= aperte.length) return;
    const ids = aperte.map((i) => i.id);
    [ids[idx], ids[dest]] = [ids[dest], ids[idx]];
    setItems((prev) => {
      const byId = Object.fromEntries((prev || []).map((i) => [i.id, i]));
      return [...ids.map((id) => byId[id]), ...(prev || []).filter((i) => i.fatto)];
    });
    await chiama(`${API_BASE}/todo/riordina/`, { method: "POST", body: JSON.stringify({ ids }) });
  }

  const daFare = (items || []).filter((i) => !i.fatto).length;

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">
          📝 Le mie cose da fare{daFare > 0 ? ` · ${daFare}` : ""}
        </span>
        {role === "superadmin" && (
          <button onClick={() => navigate("/todo/board")} className="text-[11px] font-semibold text-brand-blue">
            Board di tutti →
          </button>
        )}
      </div>

      <form onSubmit={aggiungi} className="flex gap-2 px-4 pb-2.5">
        <input
          value={testo} onChange={(e) => setTesto(e.target.value)} maxLength={300}
          placeholder="Aggiungi una cosa da fare…"
          className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-[#e4e0d8] bg-[#fbfaf8] focus:outline-none focus:border-brand-blue focus:bg-white"
          style={{ fontSize: "16px" }}
        />
        <button type="submit" disabled={busy || !testo.trim()}
                className="flex-shrink-0 px-3.5 rounded-[10px] bg-brand-ink text-white text-[13px] font-bold disabled:opacity-30">
          +
        </button>
      </form>

      {err && <div className="px-4 pb-2 text-[12px] text-brand-red">{err}</div>}

      <div className={`overflow-y-auto ${compact ? "max-h-[220px]" : "max-h-[320px]"}`}>
        {items && items.length === 0 && (
          <div className="px-4 pb-4 text-[13px] text-[#a8a49e]">Niente in lista. Scrivi qui sopra quello che non vuoi dimenticare.</div>
        )}
        {(items || []).map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-2 border-t border-[#f3f0ea]">
            <button
              onClick={() => segna(it)} disabled={busy}
              aria-label={it.fatto ? "Segna da fare" : "Segna fatto"}
              className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center text-[13px] font-bold ${
                it.fatto ? "bg-brand-green border-brand-green text-white" : "border-[#cfc9be] bg-white"}`}
            >
              {it.fatto ? "✓" : ""}
            </button>
            {inModifica?.id === it.id ? (
              <input
                autoFocus value={inModifica.testo} maxLength={300}
                onChange={(e) => setInModifica({ ...inModifica, testo: e.target.value })}
                onBlur={salvaTesto}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setInModifica(null); }}
                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-brand-blue/40 bg-white"
                style={{ fontSize: "16px" }}
              />
            ) : (
              <span onClick={() => !it.fatto && setInModifica({ id: it.id, testo: it.testo })}
                    className={`flex-1 min-w-0 text-[14px] leading-snug break-words ${it.fatto ? "line-through text-[#a8a49e]" : "text-brand-ink cursor-text"}`}>
                {it.testo}
              </span>
            )}
            {!it.fatto && (
              <span className="flex flex-col flex-shrink-0">
                <button onClick={() => sposta(it, -1)} disabled={busy} aria-label="Su"
                        className="w-7 h-4 text-[10px] leading-none text-[#b5b0a6] hover:text-brand-ink">▲</button>
                <button onClick={() => sposta(it, 1)} disabled={busy} aria-label="Giù"
                        className="w-7 h-4 text-[10px] leading-none text-[#b5b0a6] hover:text-brand-ink">▼</button>
              </span>
            )}
            <button onClick={() => togli(it)} disabled={busy} aria-label="Cancella"
                    className="flex-shrink-0 w-8 h-8 text-[#c2bdb3] hover:text-brand-red text-lg leading-none">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
