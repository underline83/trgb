// @version: v1.0-controllo-gestione-confronto
// Placeholder — sara' sviluppato in fase successiva
import React from "react";
import { useNavigate } from "react-router-dom";
import ControlloGestioneNav from "./ControlloGestioneNav";

export default function ControlloGestioneConfronto() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <ControlloGestioneNav current="confronto" />
      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200 mt-4">
        <h1 className="text-2xl font-bold text-sky-900 font-playfair mb-4">Confronto Periodi</h1>
        <p className="text-neutral-500">In sviluppo — confronta due periodi per vendite, acquisti e margine.</p>
      </div>
    </div>
  );
}
