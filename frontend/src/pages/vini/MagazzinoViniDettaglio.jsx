// src/pages/vini/MagazzinoViniDettaglio.jsx
// @version: v5.0-wrapper
// Pagina standalone scheda vino — wrapper sottile di SchedaVino

import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import ViniNav from "./ViniNav";
import SchedaVino from "./SchedaVino";

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();

  if (!id || id === "undefined") {
    navigate("/vini/magazzino");
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="cantina" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <SchedaVino
          vinoId={Number(id)}
          onClose={() => navigate("/vini/magazzino")}
        />
      </div>
    </div>
  );
}
