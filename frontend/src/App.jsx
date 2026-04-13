// @version: v5.0-permessi-granulari
// App principale — Routing TRGB Gestionale Web

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import ImpostazioniSistema from "./pages/admin/ImpostazioniSistema";
// import useAppHeight from "./hooks/useAppHeight"; // disabilitato sessione 26+, da reinvestigare
import useUpdateChecker from "./hooks/useUpdateChecker";

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
// GestioneContanti e MancePage ora dentro Flussi di Cassa

// --- AREA AMMINISTRAZIONE ---
// AdminMenu rimosso — /admin ora redirect a /impostazioni
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
import FattureProformeElenco from "./pages/admin/FattureProformeElenco";
import DipendentiMenu from "./pages/dipendenti/DipendentiMenu";
import DipendentiAnagrafica from "./pages/dipendenti/DipendentiAnagrafica";
import DipendentiTurni from "./pages/dipendenti/DipendentiTurni";
import DipendentiCosti from "./pages/dipendenti/DipendentiCosti";
import DipendentiBustePaga from "./pages/dipendenti/DipendentiBustePaga";
import DipendentiScadenze from "./pages/dipendenti/DipendentiScadenze";

// --- GESTIONE CLIENTI CRM ---
import ClientiMenu from "./pages/clienti/ClientiMenu";
import ClientiLista from "./pages/clienti/ClientiLista";
import ClientiScheda from "./pages/clienti/ClientiScheda";
import ClientiDashboard from "./pages/clienti/ClientiDashboard";
import ClientiPrenotazioni from "./pages/clienti/ClientiPrenotazioni";
import ClientiImport from "./pages/clienti/ClientiImport";
import ClientiDuplicati from "./pages/clienti/ClientiDuplicati";
import ClientiMailchimp from "./pages/clienti/ClientiMailchimp";
import ClientiImpostazioni from "./pages/clienti/ClientiImpostazioni";

// --- PRENOTAZIONI ---
import PrenotazioniMenu from "./pages/prenotazioni/PrenotazioniMenu";
import PrenotazioniPlanning from "./pages/prenotazioni/PrenotazioniPlanning";
import PrenotazioniSettimana from "./pages/prenotazioni/PrenotazioniSettimana";
import PrenotazioniImpostazioni from "./pages/prenotazioni/PrenotazioniImpostazioni";
import TavoliEditor from "./pages/prenotazioni/TavoliEditor";
import TavoliMappa from "./pages/prenotazioni/TavoliMappa";

// --- COMUNICAZIONI (Bacheca Staff — 9.2) ---
import Comunicazioni from "./pages/Comunicazioni";

// --- CAMBIO PIN ---
import CambioPIN from "./pages/CambioPIN";

// --- FLUSSI DI CASSA (ex Banca) ---
import FlussiCassaMenu from "./pages/banca/FlussiCassaMenu";
import BancaDashboard from "./pages/banca/BancaDashboard";
import BancaMovimenti from "./pages/banca/BancaMovimenti";
import BancaImport from "./pages/banca/BancaImport";
import BancaCategorie from "./pages/banca/BancaCategorie";
import BancaCrossRef from "./pages/banca/BancaCrossRef";
import BancaImpostazioni from "./pages/banca/BancaImpostazioni";
import CartaCreditoPage from "./pages/banca/CartaCreditoPage";
import FlussiCassaContanti from "./pages/banca/FlussiCassaContanti";
import FlussiCassaMance from "./pages/banca/FlussiCassaMance";

// --- CONTROLLO DI GESTIONE ---
import ControlloGestioneMenu from "./pages/controllo-gestione/ControlloGestioneMenu";
import ControlloGestioneDashboard from "./pages/controllo-gestione/ControlloGestioneDashboard";
import ControlloGestioneConfronto from "./pages/controllo-gestione/ControlloGestioneConfronto";
import ControlloGestioneUscite from "./pages/controllo-gestione/ControlloGestioneUscite";
import ControlloGestioneSpeseFisse from "./pages/controllo-gestione/ControlloGestioneSpeseFisse";
import ControlloGestioneRiconciliazione from "./pages/controllo-gestione/ControlloGestioneRiconciliazione";

// --- STATISTICHE ---
import StatisticheMenu from "./pages/statistiche/StatisticheMenu";
import StatisticheDashboard from "./pages/statistiche/StatisticheDashboard";
import StatisticheProdotti from "./pages/statistiche/StatisticheProdotti";
import StatisticheImport from "./pages/statistiche/StatisticheImport";
import StatisticheCoperti from "./pages/statistiche/StatisticheCoperti";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

  // useAppHeight() disabilitato sessione 26+ — causava crash su Cantina/RicetteNuova.
  // Da reinvestigare prima di rimettere.

  const { updateAvailable, reload } = useUpdateChecker();

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
        <Route path="/vini" element={<ProtectedRoute module="vini"><ViniMenu /></ProtectedRoute>} />
        <Route path="/vini/carta" element={<ProtectedRoute module="vini" sub="carta"><ViniCarta /></ProtectedRoute>} />
        <Route path="/vini/vendite" element={<ProtectedRoute module="vini" sub="vendite"><ViniVendite /></ProtectedRoute>} />
        <Route path="/vini/settings" element={<ProtectedRoute module="vini" sub="settings"><ViniImpostazioni /></ProtectedRoute>} />
        <Route path="/vini/magazzino" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoVini /></ProtectedRoute>} />
        <Route path="/vini/magazzino/nuovo" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoViniNuovo /></ProtectedRoute>} />
        <Route path="/vini/magazzino/admin" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoAdmin /></ProtectedRoute>} />
        <Route path="/vini/magazzino/registro" element={<ProtectedRoute module="vini" sub="magazzino"><RegistroMovimenti /></ProtectedRoute>} />
        <Route path="/vini/magazzino/tools" element={<Navigate to="/vini/settings" replace />} />
        <Route path="/vini/magazzino/:id" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoViniDettaglio /></ProtectedRoute>} />
        <Route path="/vini/dashboard" element={<ProtectedRoute module="vini" sub="dashboard"><DashboardVini /></ProtectedRoute>} />
        <Route path="/vini/ipratico" element={<ProtectedRoute module="vini" sub="ipratico"><IPraticoSync /></ProtectedRoute>} />

        {/* --- GESTIONE RICETTE & FOOD COST --- */}
        <Route path="/ricette" element={<ProtectedRoute module="ricette"><RicetteMenu /></ProtectedRoute>} />
        <Route path="/ricette/nuova" element={<ProtectedRoute module="ricette" sub="archivio"><RicetteNuova /></ProtectedRoute>} />
        <Route path="/ricette/archivio" element={<ProtectedRoute module="ricette" sub="archivio"><RicetteArchivio /></ProtectedRoute>} />
        <Route path="/ricette/:id" element={<ProtectedRoute module="ricette" sub="archivio"><RicetteDettaglio /></ProtectedRoute>} />
        <Route path="/ricette/modifica/:id" element={<ProtectedRoute module="ricette" sub="archivio"><RicetteModifica /></ProtectedRoute>} />
        <Route path="/ricette/ingredienti" element={<ProtectedRoute module="ricette" sub="ingredienti"><RicetteIngredienti /></ProtectedRoute>} />
        <Route path="/ricette/ingredienti/:id/prezzi" element={<ProtectedRoute module="ricette" sub="ingredienti"><RicetteIngredientiPrezzi /></ProtectedRoute>} />
        <Route path="/ricette/matching" element={<ProtectedRoute module="ricette" sub="matching"><RicetteMatching /></ProtectedRoute>} />
        <Route path="/ricette/dashboard" element={<ProtectedRoute module="ricette" sub="dashboard"><RicetteDashboard /></ProtectedRoute>} />
        <Route path="/ricette/settings" element={<ProtectedRoute module="ricette" sub="settings"><RicetteSettings /></ProtectedRoute>} />
        <Route path="/ricette/import" element={<Navigate to="/ricette/settings" replace />} />

        {/* --- AREA AMMINISTRAZIONE (redirect legacy) --- */}
        <Route path="/admin" element={<Navigate to="/impostazioni" replace />} />

        {/* --- GESTIONE VENDITE --- */}
        <Route path="/vendite" element={<ProtectedRoute module="vendite"><CorrispettiviMenu /></ProtectedRoute>} />
        <Route path="/vendite/riepilogo" element={<ProtectedRoute module="vendite" sub="riepilogo"><CorrispettiviRiepilogo /></ProtectedRoute>} />
        <Route path="/vendite/chiusure" element={<ProtectedRoute module="vendite" sub="chiusure"><ChiusureTurnoLista /></ProtectedRoute>} />
        <Route path="/vendite/mance" element={<Navigate to="/flussi-cassa/mance" replace />} />
        <Route path="/vendite/contanti" element={<Navigate to="/flussi-cassa/contanti" replace />} />
        <Route path="/vendite/preconti" element={<Navigate to="/flussi-cassa/contanti" replace />} />
        <Route path="/vendite/chiusure-old" element={<ProtectedRoute module="vendite"><CorrispettiviGestione /></ProtectedRoute>} />
        <Route path="/vendite/dashboard" element={<ProtectedRoute module="vendite" sub="dashboard"><CorrispettiviDashboard /></ProtectedRoute>} />
        <Route path="/vendite/annual" element={<Navigate to="/vendite/dashboard?mode=annuale" replace />} />
        <Route path="/vendite/fine-turno" element={<ProtectedRoute module="vendite" sub="fine-turno"><ChiusuraTurno /></ProtectedRoute>} />
        <Route path="/vendite/impostazioni" element={<ProtectedRoute module="vendite" sub="impostazioni"><CorrispettiviImport /></ProtectedRoute>} />
        <Route path="/vendite/import" element={<Navigate to="/vendite/impostazioni" replace />} />

        {/* --- GESTIONE ACQUISTI --- */}
        <Route path="/acquisti" element={<ProtectedRoute module="acquisti"><Navigate to="/acquisti/dashboard" replace /></ProtectedRoute>} />
        <Route path="/acquisti/dashboard" element={<ProtectedRoute module="acquisti" sub="dashboard"><FattureDashboard /></ProtectedRoute>} />
        <Route path="/acquisti/fatture" element={<ProtectedRoute module="acquisti" sub="fatture"><FattureElenco /></ProtectedRoute>} />
        <Route path="/acquisti/dettaglio/:id" element={<ProtectedRoute module="acquisti" sub="fatture"><FattureDettaglio /></ProtectedRoute>} />
        <Route path="/acquisti/fornitori" element={<ProtectedRoute module="acquisti" sub="fornitori"><FattureFornitoriElenco /></ProtectedRoute>} />
        <Route path="/acquisti/categorie" element={<Navigate to="/acquisti/impostazioni" replace />} />
        <Route path="/acquisti/proforme" element={<ProtectedRoute module="acquisti"><FattureProformeElenco /></ProtectedRoute>} />
        <Route path="/acquisti/impostazioni" element={<ProtectedRoute module="acquisti" sub="impostazioni"><FattureImpostazioni /></ProtectedRoute>} />
        <Route path="/acquisti/fornitore/:piva" element={<ProtectedRoute module="acquisti" sub="fornitori"><FattureFornitoreDettaglio /></ProtectedRoute>} />
        <Route path="/acquisti/elenco" element={<Navigate to="/acquisti/fatture" replace />} />
        <Route path="/acquisti/import" element={<Navigate to="/acquisti/impostazioni" replace />} />
        <Route path="/acquisti/fic" element={<Navigate to="/acquisti/impostazioni" replace />} />

        {/* --- FLUSSI DI CASSA (ex Banca) --- */}
        <Route path="/flussi-cassa" element={<ProtectedRoute module="flussi-cassa"><FlussiCassaMenu /></ProtectedRoute>} />
        <Route path="/flussi-cassa/dashboard" element={<ProtectedRoute module="flussi-cassa" sub="dashboard"><BancaDashboard /></ProtectedRoute>} />
        <Route path="/flussi-cassa/cc" element={<ProtectedRoute module="flussi-cassa" sub="cc"><BancaMovimenti /></ProtectedRoute>} />
        <Route path="/flussi-cassa/cc/crossref" element={<ProtectedRoute module="flussi-cassa" sub="cc"><BancaCrossRef /></ProtectedRoute>} />
        <Route path="/flussi-cassa/carta" element={<ProtectedRoute module="flussi-cassa" sub="carta"><CartaCreditoPage /></ProtectedRoute>} />
        <Route path="/flussi-cassa/contanti" element={<ProtectedRoute module="flussi-cassa" sub="contanti"><FlussiCassaContanti /></ProtectedRoute>} />
        <Route path="/flussi-cassa/mance" element={<ProtectedRoute module="flussi-cassa" sub="mance"><FlussiCassaMance /></ProtectedRoute>} />
        <Route path="/flussi-cassa/impostazioni" element={<ProtectedRoute module="flussi-cassa" sub="impostazioni"><BancaImpostazioni /></ProtectedRoute>} />
        {/* Redirect vecchie rotte /banca */}
        <Route path="/banca" element={<Navigate to="/flussi-cassa" replace />} />
        <Route path="/banca/dashboard" element={<Navigate to="/flussi-cassa/dashboard" replace />} />
        <Route path="/banca/movimenti" element={<Navigate to="/flussi-cassa/cc" replace />} />
        <Route path="/banca/crossref" element={<Navigate to="/flussi-cassa/cc/crossref" replace />} />
        <Route path="/banca/impostazioni" element={<Navigate to="/flussi-cassa/impostazioni" replace />} />
        <Route path="/banca/import" element={<Navigate to="/flussi-cassa/impostazioni" replace />} />
        <Route path="/banca/categorie" element={<Navigate to="/flussi-cassa/impostazioni" replace />} />

        {/* --- CONTROLLO DI GESTIONE --- */}
        <Route path="/controllo-gestione" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneMenu /></ProtectedRoute>} />
        <Route path="/controllo-gestione/dashboard" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneDashboard /></ProtectedRoute>} />
        <Route path="/controllo-gestione/confronto" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneConfronto /></ProtectedRoute>} />
        <Route path="/controllo-gestione/uscite" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneUscite /></ProtectedRoute>} />
        <Route path="/controllo-gestione/spese-fisse" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneSpeseFisse /></ProtectedRoute>} />
        <Route path="/controllo-gestione/riconciliazione" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneRiconciliazione /></ProtectedRoute>} />

        {/* --- STATISTICHE --- */}
        <Route path="/statistiche" element={<ProtectedRoute module="statistiche"><StatisticheMenu /></ProtectedRoute>} />
        <Route path="/statistiche/dashboard" element={<ProtectedRoute module="statistiche" sub="dashboard"><StatisticheDashboard /></ProtectedRoute>} />
        <Route path="/statistiche/prodotti" element={<ProtectedRoute module="statistiche"><StatisticheProdotti /></ProtectedRoute>} />
        <Route path="/statistiche/import" element={<ProtectedRoute module="statistiche"><StatisticheImport /></ProtectedRoute>} />
        <Route path="/statistiche/coperti" element={<ProtectedRoute module="statistiche" sub="coperti"><StatisticheCoperti /></ProtectedRoute>} />

        {/* --- DIPENDENTI (modulo top-level) --- */}
        <Route path="/dipendenti" element={<ProtectedRoute module="dipendenti"><DipendentiMenu /></ProtectedRoute>} />
        <Route path="/dipendenti/anagrafica" element={<ProtectedRoute module="dipendenti"><DipendentiAnagrafica /></ProtectedRoute>} />
        <Route path="/dipendenti/turni" element={<ProtectedRoute module="dipendenti"><DipendentiTurni /></ProtectedRoute>} />
        <Route path="/dipendenti/costi" element={<ProtectedRoute module="dipendenti"><DipendentiCosti /></ProtectedRoute>} />
        <Route path="/dipendenti/buste-paga" element={<ProtectedRoute module="dipendenti"><DipendentiBustePaga /></ProtectedRoute>} />
        <Route path="/dipendenti/scadenze" element={<ProtectedRoute module="dipendenti"><DipendentiScadenze /></ProtectedRoute>} />
        {/* Redirect vecchi path admin */}
        <Route path="/admin/dipendenti/*" element={<Navigate to="/dipendenti" replace />} />

        {/* --- GESTIONE CLIENTI CRM --- */}
        <Route path="/clienti" element={<ProtectedRoute module="clienti"><ClientiMenu /></ProtectedRoute>} />
        <Route path="/clienti/lista" element={<ProtectedRoute module="clienti" sub="lista"><ClientiLista /></ProtectedRoute>} />
        <Route path="/clienti/prenotazioni" element={<ProtectedRoute module="clienti"><ClientiPrenotazioni /></ProtectedRoute>} />
        <Route path="/clienti/dashboard" element={<ProtectedRoute module="clienti" sub="dashboard"><ClientiDashboard /></ProtectedRoute>} />
        <Route path="/clienti/impostazioni" element={<ProtectedRoute module="clienti" sub="import"><ClientiImpostazioni /></ProtectedRoute>} />
        <Route path="/clienti/impostazioni/:section" element={<ProtectedRoute module="clienti" sub="import"><ClientiImpostazioni /></ProtectedRoute>} />
        <Route path="/clienti/:id" element={<ProtectedRoute module="clienti" sub="lista"><ClientiScheda /></ProtectedRoute>} />

        {/* --- PRENOTAZIONI --- */}
        <Route path="/prenotazioni" element={<ProtectedRoute module="prenotazioni"><PrenotazioniMenu /></ProtectedRoute>} />
        <Route path="/prenotazioni/planning/:data" element={<ProtectedRoute module="prenotazioni"><PrenotazioniPlanning /></ProtectedRoute>} />
        <Route path="/prenotazioni/settimana/:data" element={<ProtectedRoute module="prenotazioni"><PrenotazioniSettimana /></ProtectedRoute>} />
        <Route path="/prenotazioni/impostazioni" element={<ProtectedRoute module="prenotazioni"><PrenotazioniImpostazioni /></ProtectedRoute>} />
        <Route path="/prenotazioni/tavoli" element={<ProtectedRoute module="prenotazioni"><TavoliEditor /></ProtectedRoute>} />
        <Route path="/prenotazioni/mappa" element={<ProtectedRoute module="prenotazioni"><TavoliMappa /></ProtectedRoute>} />
        <Route path="/prenotazioni/mappa/:data/:turno" element={<ProtectedRoute module="prenotazioni"><TavoliMappa /></ProtectedRoute>} />

        {/* --- COMUNICAZIONI (Bacheca Staff) — accessibile a tutti i loggati --- */}
        <Route path="/comunicazioni" element={<Comunicazioni />} />

        {/* --- CAMBIO PIN --- */}
        <Route path="/cambio-pin" element={<CambioPIN />} />

        {/* --- IMPOSTAZIONI SISTEMA (admin only) --- */}
        <Route path="/impostazioni" element={<ProtectedRoute module="impostazioni"><ImpostazioniSistema /></ProtectedRoute>} />
        <Route path="/admin/impostazioni" element={<Navigate to="/impostazioni" replace />} />

        {/* CATCH-ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Banner auto-update — polling /version.json */}
      {updateAvailable && (
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-3 bg-brand-blue px-4 py-2.5 text-white text-sm shadow-lg">
          <span>Nuova versione disponibile</span>
          <button
            onClick={reload}
            className="rounded bg-white/20 px-3 py-1 text-white font-medium hover:bg-white/30 transition-colors"
          >
            Aggiorna
          </button>
        </div>
      )}
    </BrowserRouter>
  );
}