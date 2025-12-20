// FILE: frontend/src/components/vini/MagazzinoSubMenu.jsx
// @version: v1.1-magazzino-submenu-movimenti-attivo
// SubMenu Magazzino Vini — allineato alla struttura finale del modulo
// NOTE: se passi vinoId abilita "Movimenti Cantina" sul vino selezionato

import React from "react";
import { NavLink } from "react-router-dom";

const base =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition";
const active = "bg-purple-50 border-purple-200 text-purple-900";
const inactive =
  "bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:-translate-y-0.5";
const disabled =
  "bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed";

export default function MagazzinoSubMenu({ vinoId = null }) {
  const movimentiHref =
    vinoId && Number(vinoId) > 0 ? `/vini/magazzino/${vinoId}/movimenti` : null;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        <NavLink
          to="/vini/magazzino"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
          end
        >
          🏷️ Magazzino
        </NavLink>

        <NavLink
          to="/vini/magazzino/nuovo"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          ➕ Nuovo vino
        </NavLink>

        {/* MOVIMENTI (attivo solo se ho un vino selezionato) */}
        {movimentiHref ? (
          <NavLink
            to={movimentiHref}
            className={({ isActive }) =>
              `${base} ${isActive ? active : inactive}`
            }
          >
            📦 Movimenti Cantina
          </NavLink>
        ) : (
          <div className={`${base} ${disabled}`} title="Seleziona un vino per aprire i movimenti">
            📦 Movimenti Cantina
          </div>
        )}

        {/* FUTURO */}
        <div className={`${base} ${disabled}`} title="In sviluppo">
          📊 Dashboard Vini
        </div>
      </div>
    </div>
  );
}