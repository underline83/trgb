// FILE: frontend/src/components/Header.jsx
// @version: v2.0 — Tailwind, username, ruolo
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Header({ onLogout }) {
  const navigate = useNavigate();
  const username = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "";

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">

        {/* LEFT — Logo + titolo */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <img
            src="/logo_tregobbi.png"
            alt="Logo Tre Gobbi"
            className="h-8 w-auto object-contain"
          />
          <span className="hidden sm:inline text-sm font-semibold text-neutral-700 tracking-wide">
            TRGB Gestionale
          </span>
        </div>

        {/* RIGHT — User info + logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-neutral-800 leading-tight">{username}</div>
            {role && (
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider leading-tight">{role}</div>
            )}
          </div>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition"
          >
            Logout
          </button>
        </div>

      </div>
    </header>
  );
}
