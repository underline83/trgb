// @version: v3.5-auth-users
// App principale — Routing TRGB Gestionale Web

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Header from "./components/Header";
import ImpostazioniSistema from "./pages/admin/ImpostazioniSistema";

// --- GESTIONE VINI ---
import ViniMenu from "./pages/vini/ViniMenu";
import ViniCarta from "./pages/vini/ViniCarta";
import ViniVendite from "./pages/vini/ViniVendite";
import ViniImpostazioni from "./pages/vini/ViniImpostazioni";

// --- MAGAZZINO VINI ---
import MagazzinoVini from "./pages/vini/MagazzinoVini";
import MagazzinoViniDettaglio from "./pages/vini/MagazzinoViniDettaglio";
import MagazzinoViniNuovo from "./pages/vini/MagazzinoViniNuovo";

// --- ADMIN MAGAZZINO ---
import MagazzinoAdmin from "./pages/vini/MagazzinoAdmin";
import RegistroMovimenti from "./pages/vini/RegistroMovimenti";
import CantinaTools from "./pages/vini/CantinaTools";

// --- DASHBOARD VINI ---
import DashboardVini from "./pages/vini/DashboardVini";

// --- GESTIONE RICETTE & FOOD COST ---
import RicetteMenu from "./pages/ricette/RicetteMenu";
import RicetteNuova from "./pages/ricette/RicetteNuova";
import RicetteArchivio from "./pages/ricette/RicetteArchivio";
import RicetteDettaglio from "./pages/ricette/RicetteDettaglio";
import RicetteModifica from "./pages/ricette/RicetteModifica";
import RicetteImport from "./pages/ricette/RicetteImport";
import RicetteIngredienti from "./pages/ricette/RicetteIngredienti";
import RicetteIngredientiPrezzi from "./pages/ricette/RicetteIngredientiPrezzi";
import RicetteMatching from "./pages/ricette/RicetteMatching";

// --- AREA AMMINISTRAZIONE ---
import AdminMenu from "./pages/admin/AdminMenu";
import CorrispettiviMenu from "./pages/admin/CorrispettiviMenu";
import CorrispettiviImport from "./pages/admin/CorrispettiviImport";
import CorrispettiviGestione from "./pages/admin/CorrispettiviGestione";
import CorrispettiviDashboard from "./pages/admin/CorrispettiviDashboard";
import CorrispettiviAnnual from "./pages/admin/CorrispettiviAnnual";
import FattureMenu from "./pages/admin/FattureMenu";
import FattureImport from "./pages/admin/FattureImport";
import FattureDashboard from "./pages/admin/FattureDashboard";
import FattureCategorie from "./pages/admin/FattureCategorie";
import FattureFornitoreDettaglio from "./pages/admin/FattureFornitoreDettaglio";
import FattureElenco from "./pages/admin/FattureElenco";
import FattureDettaglio from "./pages/admin/FattureDettaglio";
import DipendentiMenu from "./pages/admin/DipendentiMenu";
import DipendentiAnagrafica from "./pages/admin/DipendentiAnagrafica";
import DipendentiTurni from "./pages/admin/DipendentiTurni";
import DipendentiCosti from "./pages/admin/DipendentiCosti";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

  if (!token) {
    return <Login setToken={setToken} setRole={setRole} />;
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    setToken(null);
    setRole(null);
  }

  return (
    <BrowserRouter>
      <Header onLogout={handleLogout} />
      <Routes>
        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* --- GESTIONE VINI --- */}
        <Route path="/vini" element={<ViniMenu />} />
        <Route path="/vini/carta" element={<ViniCarta />} />
        <Route path="/vini/vendite" element={<ViniVendite />} />
        <Route path="/vini/settings" element={<ViniImpostazioni />} />

        {/* --- MAGAZZINO VINI --- */}
        <Route path="/vini/magazzino" element={<MagazzinoVini />} />
        <Route path="/vini/magazzino/nuovo" element={<MagazzinoViniNuovo />} />
        <Route path="/vini/magazzino/admin" element={<MagazzinoAdmin />} />
        <Route path="/vini/magazzino/registro" element={<RegistroMovimenti />} />
        <Route path="/vini/magazzino/tools" element={<CantinaTools />} />
        <Route path="/vini/magazzino/:id" element={<MagazzinoViniDettaglio />} />

        {/* --- DASHBOARD VINI --- */}
        <Route path="/vini/dashboard" element={<DashboardVini />} />

        {/* --- GESTIONE RICETTE & FOOD COST --- */}
        <Route path="/ricette" element={<RicetteMenu />} />
        <Route path="/ricette/nuova" element={<RicetteNuova />} />
        <Route path="/ricette/archivio" element={<RicetteArchivio />} />
        <Route path="/ricette/:id" element={<RicetteDettaglio />} />
        <Route path="/ricette/modifica/:id" element={<RicetteModifica />} />
        <Route path="/ricette/import" element={<RicetteImport />} />
        <Route path="/ricette/ingredienti" element={<RicetteIngredienti />} />
        <Route path="/ricette/ingredienti/:id/prezzi" element={<RicetteIngredientiPrezzi />} />
        <Route path="/ricette/matching" element={<RicetteMatching />} />

        {/* --- AREA AMMINISTRAZIONE --- */}
        <Route path="/admin" element={<AdminMenu />} />

        <Route path="/admin/corrispettivi" element={<CorrispettiviMenu />} />
        <Route path="/admin/corrispettivi/import" element={<CorrispettiviImport />} />
        <Route path="/admin/corrispettivi/gestione" element={<CorrispettiviGestione />} />
        <Route path="/admin/corrispettivi/dashboard" element={<CorrispettiviDashboard />} />
        <Route path="/admin/corrispettivi/annual" element={<CorrispettiviAnnual />} />

        <Route path="/admin/fatture" element={<FattureMenu />} />
        <Route path="/admin/fatture/elenco" element={<FattureElenco />} />
        <Route path="/admin/fatture/dettaglio/:id" element={<FattureDettaglio />} />
        <Route path="/admin/fatture/import" element={<FattureImport />} />
        <Route path="/admin/fatture/dashboard" element={<FattureDashboard />} />
        <Route path="/admin/fatture/categorie" element={<FattureCategorie />} />
        <Route path="/admin/fatture/fornitore/:piva" element={<FattureFornitoreDettaglio />} />

        <Route path="/admin/dipendenti" element={<DipendentiMenu />} />
        <Route path="/admin/dipendenti/anagrafica" element={<DipendentiAnagrafica />} />
        <Route path="/admin/dipendenti/turni" element={<DipendentiTurni />} />
        <Route path="/admin/dipendenti/costi" element={<DipendentiCosti />} />

        {/* --- IMPOSTAZIONI SISTEMA (admin only) --- */}
        <Route path="/admin/impostazioni" element={<ImpostazioniSistema />} />

        {/* CATCH-ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}