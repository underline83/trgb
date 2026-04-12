// src/pages/banca/FlussiCassaContanti.jsx
// @version: v1.0 — Contanti dentro Flussi di Cassa
// Monta GestioneContantiContent (contanti, pre-conti, spese) con FlussiCassaNav
import React from "react";
import FlussiCassaNav from "./FlussiCassaNav";
import { GestioneContantiContent } from "../admin/GestioneContanti";

export default function FlussiCassaContanti() {
  return (
    <div className="min-h-screen bg-brand-cream">
      <FlussiCassaNav current="contanti" />
      <GestioneContantiContent />
    </div>
  );
}
