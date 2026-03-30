// @version: v4.0-ipratico-sync
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
// CantinaTools: contenuto ora in ViniImpostazioni (/vini/settings)

// --- DASHBOARD VINI ---
import DashboardVini from "./pages/vini/DashboardVini";

// --- IPRATICO SYNC ---
import IPraticoSync from "./pages/vini/iPraticoSync";

// --- GESTIONE RICETTE & FOOD COST ---
import RicetteMenu from "./pages/ricette/RicetteMenu";
import RicetteNuova from "./pages/ricette/RicetteNuova";
import RicetteArchivio from "./pages/ricette/RicetteArchivio";
import RicetteDettaglio from "./pages/ricette/RicetteDettaglio";
import RicetteModifica from "./pages/ricette/RicetteModifica";
import RicetteIngredienti from "./pages/ricette/RicetteIngredienti";
import RicetteIngredientiPrezzi from "./pages/ricette/RicetteIngredientiPrezzi";
import RicetteMatching from "./pages/ricette/RicetteMatching";
import RicetteDashboard from "./pages/ricette/RicetteDashboard";
import RicetteSettings from "./pages/ricette/RicetteSettings";

// --- CHIUSURA TURNO ---
import ChiusuraTurno from "./pages/admin/ChiusuraTurno";
import ChiusureTurnoLista from "./pages/admin/ChiusureTurnoLista";
import GestioneContanti from "./pages/admin/GestioneContanti";

// --- AREA AMMINISTRAZIONE ---
import AdminMenu from "./pages/admin/AdminMenu";
import CorrispettiviMenu from "./pages/admin/CorrispettiviMenu";
import CorrispettiviImport from "./pages/admin/CorrispettiviImport";
import CorrispettiviGestione from "./pages/admin/CorrispettiviGestione";
import CorrispettiviDashboard from "./pages/admin/CorrispettiviDashboard";
// CorrispettiviAnnual rimosso — integrato nella dashboard unificata
import CorrispettiviRiepilogo from "./pages/admin/CorrispettiviRiepilogo";
import FattureMenu from "./pages/admin/FattureMenu";
import FattureImport from "./pages/admin/FattureImport";
import FattureDashboard from "./pages/admin/FattureDashboard";
import FattureFornitoreDettaglio from "./pages/admin/FattureFornitoreDettaglio";
import FattureElenco from "./pages/admin/FattureElenco";
import FattureDettaglio from "./pages/admin/FattureDettaglio";
import FattureFornitoriElenco from "./pages/admin/FattureFornitoriElenco";
import FattureInCloud from "./pages/admin/FattureInCloud";
import FattureImpostazioni from "./pages/admin/FattureImpostazioni";
import DipendentiMenu from "./pages/admin/DipendentiMenu";
import DipendentiAnagrafica from "./pages/admin/DipendentiAnagrafica";
import DipendentiTurni from "./pages/admin/DipendentiTurni";
import DipendentiCosti from "./pages/admin/DipendentiCosti";

// --- CAMBIO PIN ---
import CambioPIN from "./pages/CambioPIN";

// --- BANCA ---
import BancaMenu from "./pages/banca/BancaMenu";
import BancaDashboard from "./pages/banca/BancaDashboard";
import BancaMovimenti from "./pages/banca/BancaMovimenti";
import BancaImport from "./pages/banca/BancaImport";
import BancaCategorie from "./pages/banca/BancaCategorie";
import BancaCrossRef from "./pages/banca/BancaCrossRef";
import BancaImpostazioni from "./pages/banca/BancaImpostazioni";

// --- CONTROLLO DI GESTIONE ---
import ControlloGestioneMenu from "./pages/controllo-gestione/ControlloGestioneMenu";
import ControlloGestioneDashboard from "./pages/controllo-gestione/ControlloGestioneDashboard";
import ControlloGestioneConfronto from "./pages/controllo-gestione/ControlloGestioneConfronto";
import ControlloGestioneUscite from "./pages/controllo-gestione/ControlloGestioneUscite";
import ControlloGestioneSpeseFisse from "./pages/controllo-gestione/ControlloGestioneSpeseFisse";

// --- STATISTICHE ---
import StatisticheMenu from "./pages/statistiche/StatisticheMenu";
import StatisticheDashboard from "./pages/statistiche/StatisticheDashboard";
import StatisticheProdotti from "./pages/statistiche/StatisticheProdotti";
import StatisticheImport from "./pages/statistiche/StatisticheImport";
import StatisticheCoperti from "./pages/statistiche/StatisticheCoperti";

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
        <Route path="/vini/magazzino/tools" element={<Navigate to="/vini/settings" replace />} />
        <Route path="/vini/magazzino/:id" element={<MagazzinoViniDettaglio />} />

        {/* --- DASHBOARD VINI --- */}
        <Route path="/vini/dashboard" element={<DashboardVini />} />
        <Route path="/vini/ipratico" element={<IPraticoSync />} />

        {/* --- GESTIONE RICETTE & FOOD COST --- */}
        <Route path="/ricette" element={<RicetteMenu />} />
        <Route path="/ricette/nuova" element={<RicetteNuova />} />
        <Route path="/ricette/archivio" element={<RicetteArchivio />} />
        <Route path="/ricette/:id" element={<RicetteDettaglio />} />
        <Route path="/ricette/modifica/:id" element={<RicetteModifica />} />
        <Route path="/ricette/ingredienti" element={<RicetteIngredienti />} />
        <Route path="/ricette/ingredienti/:id/prezzi" element={<RicetteIngredientiPrezzi />} />
        <Route path="/ricette/matching" element={<RicetteMatching />} />
        <Route path="/ricette/dashboard" element={<RicetteDashboard />} />
        <Route path="/ricette/settings" element={<RicetteSettings />} />
        <Route path="/ricette/import" element={<Navigate to="/ricette/settings" replace />} />

        {/* --- AREA AMMINISTRAZIONE --- */}
        <Route path="/admin" element={<AdminMenu />} />

        {/* --- GESTIONE VENDITE --- */}
        <Route path="/vendite" element={<CorrispettiviMenu />} />
        <Route path="/vendite/riepilogo" element={<CorrispettiviRiepilogo />} />
        <Route path="/vendite/chiusure" element={<ChiusureTurnoLista />} />
        <Route path="/vendite/contanti" element={<GestioneContanti />} />
        <Route path="/vendite/preconti" element={<Navigate to="/vendite/contanti" replace />} />
        <Route path="/vendite/chiusure-old" element={<CorrispettiviGestione />} />
        <Route path="/vendite/dashboard" element={<CorrispettiviDashboard />} />
        <Route path="/vendite/annual" element={<Navigate to="/vendite/dashboard?mode=annuale" replace />} />
        <Route path="/vendite/fine-turno" element={<ChiusuraTurno />} />
        <Route path="/vendite/impostazioni" element={<CorrispettiviImport />} />
        <Route path="/vendite/import" element={<Navigate to="/vendite/impostazioni" replace />} />

        {/* --- GESTIONE ACQUISTI --- */}
        <Route path="/acquisti" element={<Navigate to="/acquisti/dashboard" replace />} />
        <Route path="/acquisti/dashboard" element={<FattureDashboard />} />
        <Route path="/acquisti/fatture" element={<FattureElenco />} />
        <Route path="/acquisti/dettaglio/:id" element={<FattureDettaglio />} />
        <Route path="/acquisti/fornitori" element={<FattureFornitoriElenco />} />
        <Route path="/acquisti/categorie" element={<Navigate to="/acquisti/impostazioni" replace />} />
        <Route path="/acquisti/impostazioni" element={<FattureImpostazioni />} />
        <Route path="/acquisti/fornitore/:piva" element={<FattureFornitoreDettaglio />} />
        {/* Redirect vecchie rotte */}
        <Route path="/acquisti/elenco" element={<Navigate to="/acquisti/fatture" replace />} />
        <Route path="/acquisti/import" element={<Navigate to="/acquisti/impostazioni" replace />} />
        <Route path="/acquisti/fic" element={<Navigate to="/acquisti/impostazioni" replace />} />

        {/* --- BANCA --- */}
        <Route path="/banca" element={<BancaMenu />} />
        <Route path="/banca/dashboard" element={<BancaDashboard />} />
        <Route path="/banca/movimenti" element={<BancaMovimenti />} />
        <Route path="/banca/import" element={<Navigate to="/banca/impostazioni" replace />} />
        <Route path="/banca/categorie" element={<Navigate to="/banca/impostazioni" replace />} />
        <Route path="/banca/crossref" element={<BancaCrossRef />} />
        <Route path="/banca/impostazioni" element={<BancaImpostazioni />} />

        {/* --- CONTROLLO DI GESTIONE --- */}
        <Route path="/controllo-gestione" element={<ControlloGestioneMenu />} />
        <Route path="/controllo-gestione/dashboard" element={<ControlloGestioneDashboard />} />
        <Route path="/controllo-gestione/confronto" element={<ControlloGestioneConfronto />} />
        <Route path="/controllo-gestione/uscite" element={<ControlloGestioneUscite />} />
        <Route path="/controllo-gestione/spese-fisse" element={<ControlloGestioneSpeseFisse />} />

        {/* --- STATISTICHE --- */}
        <Route path="/statistiche" element={<StatisticheMenu />} />
        <Route path="/statistiche/dashboard" element={<StatisticheDashboard />} />
        <Route path="/statistiche/prodotti" element={<StatisticheProdotti />} />
        <Route path="/statistiche/import" element={<StatisticheImport />} />
        <Route path="/statistiche/coperti" element={<StatisticheCoperti />} />

        <Route path="/admin/dipendenti" element={<DipendentiMenu />} />
        <Route path="/admin/dipendenti/anagrafica" element={<DipendentiAnagrafica />} />
        <Route path="/admin/dipendenti/turni" element={<DipendentiTurni />} />
        <Route path="/admin/dipendenti/costi" element={<DipendentiCosti />} />

        {/* --- CAMBIO PIN --- */}
        <Route path="/cambio-pin" element={<CambioPIN />} />

        {/* --- IMPOSTAZIONI SISTEMA (admin only) --- */}
        <Route path="/admin/impostazioni" element={<ImpostazioniSistema />} />

        {/* CATCH-ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}