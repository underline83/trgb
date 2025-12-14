// @version: v3.4-premium-magazzino-stabilizzato
// App principale — Routing TRGB Gestionale Web (fix validazione dettaglio)

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";

// --- GESTIONE VINI ---
import ViniMenu from "./pages/vini/ViniMenu";
import ViniCarta from "./pages/vini/ViniCarta";
import ViniDatabase from "./pages/vini/ViniDatabase";
import ViniVendite from "./pages/vini/ViniVendite";
import ViniImpostazioni from "./pages/vini/ViniImpostazioni";

// --- MAGAZZINO VINI ---
import MagazzinoVini from "./pages/vini/MagazzinoVini";
import MagazzinoViniDettaglio from "./pages/vini/MagazzinoViniDettaglio";
import MagazzinoViniNuovo from "./pages/vini/MagazzinoViniNuovo";

// --- GESTIONE RICETTE ---
import RicetteMenu from "./pages/ricette/RicetteMenu";
import RicetteNuova from "./pages/ricette/RicetteNuova";
import RicetteArchivio from "./pages/ricette/RicetteArchivio";
import RicetteImport from "./pages/ricette/RicetteImport";
import RicetteIngredienti from "./pages/ricette/RicetteIngredienti";
import RicetteIngredientiPrezzi from "./pages/ricette/RicetteIngredientiPrezzi";

// --- AREA AMMINISTRAZIONE ---
import AdminMenu from "./pages/admin/AdminMenu";

// Corrispettivi
import CorrispettiviMenu from "./pages/admin/CorrispettiviMenu";
import CorrispettiviImport from "./pages/admin/CorrispettiviImport";
import CorrispettiviGestione from "./pages/admin/CorrispettiviGestione";
import CorrispettiviDashboard from "./pages/admin/CorrispettiviDashboard";

// Fatture elettroniche
import FattureMenu from "./pages/admin/FattureMenu";
import FattureImport from "./pages/admin/FattureImport";
import FattureDashboard from "./pages/admin/FattureDashboard";

// Dipendenti
import DipendentiMenu from "./pages/admin/DipendentiMenu";
import DipendentiAnagrafica from "./pages/admin/DipendentiAnagrafica";
import DipendentiTurni from "./pages/admin/DipendentiTurni";
import DipendentiCosti from "./pages/admin/DipendentiCosti";

function MagazzinoDettaglioRoute() {
  const { id } = useParams();
  const vinoId = Number(id);

  if (!Number.isInteger(vinoId) || vinoId <= 0) {
    return <Navigate to="/vini/magazzino" replace />;
  }
  return <MagazzinoViniDettaglio />;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

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

        {/* --- MAGAZZINO VINI --- */}
        <Route path="/vini/magazzino" element={<MagazzinoVini />} />
        <Route path="/vini/magazzino/nuovo" element={<MagazzinoViniNuovo />} />
        <Route path="/vini/magazzino/:id" element={<MagazzinoDettaglioRoute />} />

        {/* --- GESTIONE RICETTE --- */}
        <Route path="/ricette" element={<RicetteMenu />} />
        <Route path="/ricette/nuova" element={<RicetteNuova />} />
        <Route path="/ricette/archivio" element={<RicetteArchivio />} />
        <Route path="/ricette/import" element={<RicetteImport />} />
        <Route path="/ricette/ingredienti" element={<RicetteIngredienti />} />
        <Route path="/ricette/ingredienti/:id/prezzi" element={<RicetteIngredientiPrezzi />} />

        {/* --- AREA AMMINISTRAZIONE --- */}
        <Route path="/admin" element={<AdminMenu />} />

        {/* Corrispettivi */}
        <Route path="/admin/corrispettivi" element={<CorrispettiviMenu />} />
        <Route path="/admin/corrispettivi/import" element={<CorrispettiviImport />} />
        <Route path="/admin/corrispettivi/gestione" element={<CorrispettiviGestione />} />
        <Route path="/admin/corrispettivi/dashboard" element={<CorrispettiviDashboard />} />

        {/* Fatture elettroniche */}
        <Route path="/admin/fatture" element={<FattureMenu />} />
        <Route path="/admin/fatture/import" element={<FattureImport />} />
        <Route path="/admin/fatture/dashboard" element={<FattureDashboard />} />

        {/* Dipendenti */}
        <Route path="/admin/dipendenti" element={<DipendentiMenu />} />
        <Route path="/admin/dipendenti/anagrafica" element={<DipendentiAnagrafica />} />
        <Route path="/admin/dipendenti/turni" element={<DipendentiTurni />} />
        <Route path="/admin/dipendenti/costi" element={<DipendentiCosti />} />

        {/* CATCH-ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}