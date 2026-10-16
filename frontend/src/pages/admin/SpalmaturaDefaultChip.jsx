// @version: v1.0 (2026-10-16, mig 191)
// Modulo: acquisti
// Chip 📆 «spalmatura di default» per categoria/sottocategoria fornitori.
// Usato in Acquisti › Impostazioni › Categorie (FattureImpostazioni.jsx).
import React, { useState } from "react";
import { apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";

// ── Spalmatura di default (mig 191) ─────────────────────────────
function meseCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SpalmaturaDefaultChip({ url, item, onSaved, ereditata }) {
  const [edit, setEdit] = useState(null);   // { mesi: "3", dal: "2026-10" }
  const [err, setErr] = useState(null);
  const mesi = item.spalmatura_mesi_default;
  const dal = (item.spalmatura_valida_dal || "").slice(0, 7);

  const salva = async (body) => {
    setErr(null);
    const res = await apiFetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.detail || "Errore salvataggio");
      return;
    }
    setEdit(null); onSaved();
  };

  if (item.spalmatura_mesi_default === undefined) return null; // backend senza mig 191

  if (edit) {
    const n = parseInt(edit.mesi, 10);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
        📆 spalma su
        <input type="number" min="1" max="36" value={edit.mesi}
          onChange={e => setEdit({ ...edit, mesi: e.target.value })}
          className="w-14 px-1 py-0.5 border rounded text-xs" autoFocus />
        mesi
        {n > 1 && (
          <>
            per fatture dal
            <input type="month" value={edit.dal} onChange={e => setEdit({ ...edit, dal: e.target.value })}
              className="px-1 py-0.5 border rounded text-xs" />
          </>
        )}
        <button onClick={() => salva({ mesi: n || null, valida_dal: n > 1 ? edit.dal : null })}
          className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded">Salva</button>
        {mesi != null && (
          <button onClick={() => salva({ mesi: null, valida_dal: null })}
            className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded">Togli regola</button>
        )}
        <button onClick={() => { setEdit(null); setErr(null); }} className="px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
        {err && <span className="text-red-700">{err}</span>}
      </span>
    );
  }

  const apri = () => setEdit({ mesi: String(mesi || 3), dal: dal || meseCorrente() });
  if (mesi > 1) {
    return (
      <Tooltip label="Spalmatura di default nel Conto Economico — clic per modificare">
        <button onClick={apri}
          className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
          📆 {mesi} mesi dal {dal}
        </button>
      </Tooltip>
    );
  }
  if (mesi === 1) {
    return (
      <Tooltip label="Esclusa dalla spalmatura della categoria — clic per modificare">
        <button onClick={apri}
          className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200">
          📆 non spalmare
        </button>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={ereditata > 1 ? `Eredita dalla categoria: ${ereditata} mesi` : "Imposta una spalmatura di default"}>
      <button onClick={apri}
        className="text-[10px] px-1.5 py-0.5 rounded text-neutral-400 hover:text-violet-700 hover:bg-violet-50">
        📆{ereditata > 1 ? ` (${ereditata})` : ""}
      </button>
    </Tooltip>
  );
}
