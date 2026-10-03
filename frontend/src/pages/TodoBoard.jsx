// FILE: frontend/src/pages/TodoBoard.jsx
// @version: v1.0 — Board delle liste personali, solo superadmin (2026-10-03)
//
// Una colonna per persona con le sue cose da fare (e quelle chiuse negli
// ultimi giorni). Sola lettura: le liste sono di chi le scrive.
// Backend: GET /todo/board/ (solo_superadmin).
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";

const RUOLO = {
  superadmin: "admin", admin: "admin", chef: "chef", sous_chef: "sous chef", commis: "commis",
  sala: "sala", sommelier: "sommelier", contabile: "contabile", viewer: "viewer",
};

export default function TodoBoard() {
  const role = localStorage.getItem("role");
  const [persone, setPersone] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (role !== "superadmin") return;
    apiFetch(`${API_BASE}/todo/board/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPersone(d.persone || []))
      .catch((e) => setErr(e.message));
  }, [role]);

  if (role !== "superadmin") return <Navigate to="/" replace />;

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-brand-cream px-4 lg:px-8 py-5">
      <div className="max-w-7xl mx-auto">
        <h1 className="font-playfair text-2xl font-bold text-brand-ink">📝 Le cose da fare di tutti</h1>
        <p className="text-xs text-[#a8a49e] mt-1 mb-4">
          Le liste personali di ognuno. Le vedi tu e basta; le scrive e le chiude chi le ha.
        </p>
        {err && <div className="text-sm text-brand-red">{err}</div>}
        {!err && !persone && <div className="text-sm text-[#a8a49e]">Carico…</div>}
        {persone && persone.length === 0 && <div className="text-sm text-[#a8a49e]">Nessuno ha ancora scritto niente.</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {(persone || []).map((p) => (
            <div key={p.username} className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0ede8]">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-brand-ink truncate">{p.display_name}</div>
                  <div className="text-[11px] text-[#a8a49e]">{RUOLO[p.role] || p.role || "—"}</div>
                </div>
                <span className={`text-[12px] font-bold rounded-full px-2.5 py-0.5 ${p.da_fare ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                  {p.da_fare ? `${p.da_fare} da fare` : "tutto fatto"}
                </span>
              </div>
              {p.items.map((it) => (
                <div key={it.id} className="flex gap-2.5 px-4 py-2 border-t border-[#f8f6f2] first:border-t-0">
                  <span className={`text-[13px] ${it.fatto ? "text-brand-green" : "text-[#cfc9be]"}`}>{it.fatto ? "✓" : "○"}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13.5px] leading-snug break-words ${it.fatto ? "line-through text-[#a8a49e]" : "text-brand-ink"}`}>{it.testo}</div>
                    <div className="text-[10.5px] text-[#b5b0a6]">
                      {it.fatto ? `fatto ${(it.fatto_at || "").slice(0, 16)}` : `scritto ${(it.created_at || "").slice(0, 16)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
