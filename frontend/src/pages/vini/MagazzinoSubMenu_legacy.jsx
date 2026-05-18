// =========================================================
// FILE: frontend/src/components/vini/MagazzinoSubMenu.jsx
// @version: v1.0-magazzino-submenu
// Sub-menu Magazzino Vini (stile allineato al menu premium)
// =========================================================

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function MagazzinoSubMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const btnBase =
    "px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition " +
    "hover:-translate-y-0.5";

  const btnActive =
    "bg-amber-700 text-white border-amber-700 hover:bg-amber-800";

  const btnInactive =
    "bg-neutral-50 text-neutral-800 border-neutral-300 hover:bg-neutral-100";

  const btnDisabled =
    "bg-neutral-50 text-neutral-400 border-neutral-200 cursor-not-allowed";

  return (
    <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate("/vini")}
          className={
            "px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
          }
        >
          ← Menu Vini
        </button>

        <button
          type="button"
          onClick={() => navigate("/vini/magazzino")}
          className={
            btnBase + " " + (isActive("/vini/magazzino") ? btnActive : btnInactive)
          }
        >
          🏷️ Lista Magazzino
        </button>

        <button
          type="button"
          onClick={() => navigate("/vini/magazzino/nuovo")}
          className={
            btnBase +
            " " +
            (isActive("/vini/magazzino/nuovo") ? btnActive : btnInactive)
          }
        >
          ➕ Nuovo vino
        </button>

        {/* Placeholder: quando faremo la pagina dedicata */}
        <button type="button" className={btnBase + " " + btnDisabled} disabled>
          📦 Movimenti (in sviluppo)
        </button>

        <button type="button" className={btnBase + " " + btnDisabled} disabled>
          📊 Dashboard (in sviluppo)
        </button>
      </div>
    </div>
  );
}

