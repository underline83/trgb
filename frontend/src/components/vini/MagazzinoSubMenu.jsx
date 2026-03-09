// FILE: frontend/src/components/vini/MagazzinoSubMenu.jsx
// @version: v2.0-reforming-cantina
// SubMenu Cantina — semplificato: Lista Vini · Nuovo vino · Admin (solo admin)

import React from "react";
import { NavLink } from "react-router-dom";

const base =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition";
const active = "bg-purple-50 border-purple-200 text-purple-900";
const inactive =
  "bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:-translate-y-0.5";

export default function MagazzinoSubMenu() {
  const role = localStorage.getItem("role");

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        <NavLink
          to="/vini/magazzino"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
          end
        >
          🍷 Lista Vini
        </NavLink>

        <NavLink
          to="/vini/magazzino/nuovo"
          className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
        >
          ➕ Nuovo vino
        </NavLink>

        {role === "admin" && (
          <NavLink
            to="/vini/magazzino/admin"
            className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
          >
            ⚙️ Admin
          </NavLink>
        )}
      </div>
    </div>
  );
}
