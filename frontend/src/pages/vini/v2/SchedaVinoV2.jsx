// src/pages/vini/v2/SchedaVinoV2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2)
//
// Wrapper di SchedaVino classica con prop readOnly + apiBaseDettaglio="/vini/v2/bottiglie".
// Promessa: STESSO componente, niente codice duplicato. La pagina è identica
// alla scheda della Cantina classica, con i soli 3 bottoni di edit nascosti
// (Modifica anagrafica, Modifica giacenze, Duplica vino).
//
// Tab Movimenti/Note/Prezzi/Statistiche puntano alle tabelle uniche di
// vini_magazzino (`vini_magazzino_movimenti` ecc.) → letture identiche al
// classico per definizione.

import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import SchedaVino from "../SchedaVino";

export default function SchedaVinoV2() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div className="max-w-[1100px] mx-auto p-3">
      <div className="px-2 pb-2 flex items-center gap-2 text-xs">
        <button onClick={() => navigate("/vini/v2/cantina")}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
          ← Cantina v2
        </button>
        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-white">#{id}</span>
      </div>

      <SchedaVino
        vinoId={Number(id)}
        inline={true}
        readOnly={false}
        apiBaseDettaglio="/vini/v2/bottiglie"
        onClose={() => navigate("/vini/v2/cantina")}
      />
    </div>
  );
}
