import React from "react";
import LoginForm from "../components/LoginForm";

export default function Login({ setToken, setRole }) {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <LoginForm setToken={setToken} setRole={setRole} />

      {/* Firma creator — branding del prodotto TRGB (sessione 60, 2026-04-29).
          Posizionata fissa in basso al centro della viewport, fuori dal form.
          Visibile su tutti i dispositivi che useranno TRGB (futuri clienti inclusi).
          Modulo: platform/UI primitives. */}
      <a
        href="https://underlinestudio.it"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 hover:text-slate-700 transition select-none whitespace-nowrap"
        aria-label="Designed and developed by Marco Carminati — Underline Studio"
      >
        Designed &amp; developed by Marco Carminati
        <span className="mx-1.5 opacity-50">·</span>
        <span className="font-medium">Underline Studio</span>
      </a>
    </div>
  );
}
