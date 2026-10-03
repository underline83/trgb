// FILE: frontend/src/pages/pranzo/PranzoVista.jsx
// @version: v1.0 — Menu pranzo in sola lettura (2026-10-03)
//
// Marco: ai commis «togli selezioni, menu pranzo e menu carta; mettigli solo
// due link alla visualizzazione dei menu». Questa è la vista del pranzo: il
// menu della settimana corrente come lo legge il cliente, senza niente da
// modificare, prezzi o food cost. L'altra vista è la carta pubblica /carta/menu.
// Dati: GET /pranzo/menu/oggi/ (lettura aperta ai commis; le scritture del
// router pranzo sono chiuse a admin/chef/sous_chef).
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const SEZIONI = [
  { key: "antipasto", label: "Antipasti" },
  { key: "primo", label: "Primi" },
  { key: "secondo", label: "Secondi" },
  { key: "contorno", label: "Contorni" },
  { key: "dolce", label: "Dolci" },
  { key: "altro", label: "Altro" },
];

function fmtData(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

export default function PranzoVista() {
  const [dati, setDati] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/pranzo/menu/oggi/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDati)
      .catch((e) => setErr(e.message));
  }, []);

  const menu = dati?.menu;
  const st = dati?.settings || {};
  const righe = menu?.righe || [];
  const venerdi = dati?.settimana_inizio
    ? (() => { const d = new Date(dati.settimana_inizio + "T12:00:00"); d.setDate(d.getDate() + 4); return d.toISOString().slice(0, 10); })()
    : null;

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-brand-cream px-4 py-6">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-200 px-6 py-7">
        <div className="text-center">
          <div className="font-playfair text-3xl font-bold tracking-wide">{menu?.titolo || st.titolo_default || "Pranzo"}</div>
          {(menu?.sottotitolo || st.sottotitolo_default) && (
            <div className="text-sm italic text-neutral-500 mt-1">{menu?.sottotitolo || st.sottotitolo_default}</div>
          )}
          {dati?.settimana_inizio && (
            <div className="text-xs uppercase tracking-widest text-neutral-400 mt-3">
              Settimana {fmtData(dati.settimana_inizio)} – {fmtData(venerdi)}
            </div>
          )}
        </div>

        {err && <div className="mt-6 text-center text-sm text-brand-red">Non riesco a caricare il menu ({err}).</div>}
        {!err && !dati && <div className="mt-6 text-center text-sm text-neutral-400">Carico…</div>}
        {dati && !menu && <div className="mt-6 text-center text-sm text-neutral-500">Il menu di questa settimana non è ancora pronto.</div>}

        {SEZIONI.map((s) => {
          const piatti = righe.filter((r) => (r.categoria || "altro") === s.key)
            .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
          if (!piatti.length) return null;
          return (
            <div key={s.key} className="mt-7">
              <div className="text-[11px] font-bold uppercase tracking-[2px] text-neutral-400 text-center mb-2">{s.label}</div>
              {piatti.map((p) => (
                <div key={p.id ?? p.nome} className="text-center py-1.5">
                  <div className="text-[16px] text-brand-ink leading-snug">{p.nome}</div>
                  {p.note && <div className="text-xs text-neutral-500 italic">{p.note}</div>}
                </div>
              ))}
            </div>
          );
        })}

        {(menu?.footer_note || st.footer_default) && (
          <div className="mt-8 text-center text-xs text-neutral-400 whitespace-pre-line">{menu?.footer_note || st.footer_default}</div>
        )}
      </div>
    </div>
  );
}
