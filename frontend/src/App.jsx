// @version: v3.0-premium-magazzino
// App principale — Routing TRGB Gestionale Web

import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";

// --- GESTIONE VINI ---
import ViniMenu from "./pages/vini/ViniMenu";
import ViniCarta from "./pages/vini/ViniCarta";
import ViniDatabase from "./pages/vini/ViniDatabase";
import ViniVendite from "./pages/vini/ViniVendite";
import ViniImpostazioni from "./pages/vini/ViniImpostazioni";

// NUOVE PAGINE MAGAZZINO
import MagazzinoVini from "./pages/vini/MagazzinoVini";
import MagazzinoViniDettaglio from "./pages/vini/MagazzinoViniDettaglio";

// --- GESTIONE RICETTE ---
import RicetteMenu from "./pages/ricette/RicetteMenu";
import RicetteNuova from "./pages/ricette/RicetteNuova";
import RicetteArchivio from "./pages/ricette/RicetteArchivio";
import RicetteImport from "./pages/ricette/RicetteImport";
import RicetteIngredienti from "./pages/ricette/RicetteIngredienti";
import RicetteIngredientiPrezzi from "./pages/ricette/RicetteIngredientiPrezzi";

// --- AMMINISTRAZIONE ---
import AdminMenu from "./pages/admin/AdminMenu";
import CorrispettiviMenu from "./pages/admin/CorrispettiviMenu";
import CorrispettiviImport from "./pages/admin/CorrispettiviImport";
import CorrispettiviGestione from "./pages/admin/CorrispettiviGestione";


export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

  // Se non c'è token mostro sempre il login
  if (!token) {
    return <Login setToken={setToken} setRole={setRole} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* --- GESTIONE VINI --- */}
        <Route path="/vini" element={<ViniMenu />} />
        <Route path="/vini/carta" element={<ViniCarta />} />
        <Route path="/vini/database" element={<ViniDatabase />} />
        <Route path="/vini/vendite" element={<ViniVendite />} />
        <Route path="/vini/settings" element={<ViniImpostazioni />} />
        {/* --- AMMINISTRAZIONE --- */}
        <Route path="/admin" element={<AdminMenu />} />
        <Route path="/admin/corrispettivi" element={<CorrispettiviMenu />} />
        <Route path="/admin/corrispettivi/import" element={<CorrispettiviImport />} />
        <Route path="/admin/corrispettivi/gestione" element={<CorrispettiviGestione />} />

        {/* MAGAZZINO LISTA + DETTAGLIO */}
        <Route path="/vini/magazzino" element={<MagazzinoVini />} />
        <Route path="/vini/magazzino/:id" element={<MagazzinoViniDettaglio />} />
        {/* --- GESTIONE RICETTE --- */}
        <Route path="/ricette" element={<RicetteMenu />} />
        <Route path="/ricette/nuova" element={<RicetteNuova />} />
        <Route path="/ricette/archivio" element={<RicetteArchivio />} />
        <Route path="/ricette/import" element={<RicetteImport />} />
        <Route path="/ricette/ingredienti" element={<RicetteIngredienti />} />
        <Route
          path="/ricette/ingredienti/:id/prezzi"
          element={<RicetteIngredientiPrezzi />}
        />
      </Routes>
    </BrowserRouter>
  );
}