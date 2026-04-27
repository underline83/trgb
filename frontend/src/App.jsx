// @version: v5.2-lazy-routes — code-splitting per modulo via React.lazy + Suspense
// App principale — Routing TRGB Gestionale Web

import React, { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

// Eager: necessari al primo paint (login, header, guardie, error/toast, auto-update)
import Login from "./pages/Login";
import Home from "./pages/Home";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import ModuleRedirect from "./components/ModuleRedirect";
import ErrorBoundary from "./components/ErrorBoundary";
import TrgbLoader from "./components/TrgbLoader";
import { ToastProvider } from "./components/Toast";
import useUpdateChecker from "./hooks/useUpdateChecker";

// --- Lazy: pagine modulo (chunk on-demand, raggruppati per cartella in vite.config) ---

// GESTIONE VINI
// Nota: CartaVini e CartaSezioneEditor sono importati staticamente da CartaBevande
// (sono pannelli interni della shell), quindi non servono lazy qui.
const CartaBevande = lazy(() => import("./pages/vini/CartaBevande"));
const CartaAnteprima = lazy(() => import("./pages/vini/CartaAnteprima"));
// PUBBLICA: pagina cliente accessibile da QR — sessione 58 fase 2
const CartaClienti = lazy(() => import("./pages/public/CartaClienti"));
const CartaMenuPubblica = lazy(() => import("./pages/public/CartaMenuPubblica"));
// STAFF: vista sommelier (loggata) — sessione 58 fase 2 iter 5
const CartaStaff = lazy(() => import("./pages/vini/CartaStaff"));
const ViniVendite = lazy(() => import("./pages/vini/ViniVendite"));
const ViniImpostazioni = lazy(() => import("./pages/vini/ViniImpostazioni"));
const MagazzinoVini = lazy(() => import("./pages/vini/MagazzinoVini"));
const MagazzinoViniDettaglio = lazy(() => import("./pages/vini/MagazzinoViniDettaglio"));
const MagazzinoViniNuovo = lazy(() => import("./pages/vini/MagazzinoViniNuovo"));
const MagazzinoAdmin = lazy(() => import("./pages/vini/MagazzinoAdmin"));
const RegistroMovimenti = lazy(() => import("./pages/vini/RegistroMovimenti"));
const DashboardVini = lazy(() => import("./pages/vini/DashboardVini"));

// RICETTE & FOOD COST
const RicetteNuova = lazy(() => import("./pages/ricette/RicetteNuova"));
const RicetteArchivio = lazy(() => import("./pages/ricette/RicetteArchivio"));
const RicetteDettaglio = lazy(() => import("./pages/ricette/RicetteDettaglio"));
const RicetteModifica = lazy(() => import("./pages/ricette/RicetteModifica"));
const RicetteIngredienti = lazy(() => import("./pages/ricette/RicetteIngredienti"));
const RicetteIngredientiPrezzi = lazy(() => import("./pages/ricette/RicetteIngredientiPrezzi"));
const RicetteMatching = lazy(() => import("./pages/ricette/RicetteMatching"));
const RicetteDashboard = lazy(() => import("./pages/ricette/RicetteDashboard"));
const DashboardCucina = lazy(() => import("./pages/cucina/DashboardCucina"));
const RicetteSettings = lazy(() => import("./pages/ricette/RicetteSettings"));
const MenuCartaElenco = lazy(() => import("./pages/cucina/MenuCartaElenco"));
const MenuCartaDettaglio = lazy(() => import("./pages/cucina/MenuCartaDettaglio"));
const PranzoMenu = lazy(() => import("./pages/pranzo/PranzoMenu"));

// VENDITE
const ChiusuraTurno = lazy(() => import("./pages/admin/ChiusuraTurno"));
const ChiusureTurnoLista = lazy(() => import("./pages/admin/ChiusureTurnoLista"));
const CorrispettiviImport = lazy(() => import("./pages/admin/CorrispettiviImport"));
const CorrispettiviGestione = lazy(() => import("./pages/admin/CorrispettiviGestione"));
const CorrispettiviDashboard = lazy(() => import("./pages/admin/CorrispettiviDashboard"));
const CorrispettiviRiepilogo = lazy(() => import("./pages/admin/CorrispettiviRiepilogo"));

// ACQUISTI / FATTURE
const FattureImport = lazy(() => import("./pages/admin/FattureImport"));
const FattureDashboard = lazy(() => import("./pages/admin/FattureDashboard"));
const FattureFornitoreDettaglio = lazy(() => import("./pages/admin/FattureFornitoreDettaglio"));
const FattureElenco = lazy(() => import("./pages/admin/FattureElenco"));
const FattureDettaglio = lazy(() => import("./pages/admin/FattureDettaglio"));
const FattureFornitoriElenco = lazy(() => import("./pages/admin/FattureFornitoriElenco"));
const FattureInCloud = lazy(() => import("./pages/admin/FattureInCloud"));
const FattureImpostazioni = lazy(() => import("./pages/admin/FattureImpostazioni"));
const FattureProformeElenco = lazy(() => import("./pages/admin/FattureProformeElenco"));

// DIPENDENTI
const DipendentiAnagrafica = lazy(() => import("./pages/dipendenti/DipendentiAnagrafica"));
const DipendentiTurni = lazy(() => import("./pages/dipendenti/DipendentiTurni"));
const FoglioSettimana = lazy(() => import("./pages/dipendenti/FoglioSettimana"));
const VistaMensile = lazy(() => import("./pages/dipendenti/VistaMensile"));
const PerDipendente = lazy(() => import("./pages/dipendenti/PerDipendente"));
const MieiTurni = lazy(() => import("./pages/dipendenti/MieiTurni"));
const GestioneReparti = lazy(() => import("./pages/dipendenti/GestioneReparti"));
const DipendentiImpostazioni = lazy(() => import("./pages/dipendenti/DipendentiImpostazioni"));
const DipendentiCosti = lazy(() => import("./pages/dipendenti/DipendentiCosti"));
const DipendentiBustePaga = lazy(() => import("./pages/dipendenti/DipendentiBustePaga"));
const DipendentiScadenze = lazy(() => import("./pages/dipendenti/DipendentiScadenze"));
const DashboardDipendenti = lazy(() => import("./pages/dipendenti/DashboardDipendenti"));

// CLIENTI / CRM
const ClientiLista = lazy(() => import("./pages/clienti/ClientiLista"));
const ClientiScheda = lazy(() => import("./pages/clienti/ClientiScheda"));
const ClientiDashboard = lazy(() => import("./pages/clienti/ClientiDashboard"));
const ClientiPrenotazioni = lazy(() => import("./pages/clienti/ClientiPrenotazioni"));
const ClientiPreventivi = lazy(() => import("./pages/clienti/ClientiPreventivi"));
const ClientiPreventivoScheda = lazy(() => import("./pages/clienti/ClientiPreventivoScheda"));
const ClientiImport = lazy(() => import("./pages/clienti/ClientiImport"));
const ClientiDuplicati = lazy(() => import("./pages/clienti/ClientiDuplicati"));
const ClientiMailchimp = lazy(() => import("./pages/clienti/ClientiMailchimp"));
const ClientiImpostazioni = lazy(() => import("./pages/clienti/ClientiImpostazioni"));

// PRENOTAZIONI
const PrenotazioniPlanning = lazy(() => import("./pages/prenotazioni/PrenotazioniPlanning"));
const PrenotazioniSettimana = lazy(() => import("./pages/prenotazioni/PrenotazioniSettimana"));
const PrenotazioniImpostazioni = lazy(() => import("./pages/prenotazioni/PrenotazioniImpostazioni"));
const TavoliEditor = lazy(() => import("./pages/prenotazioni/TavoliEditor"));
const TavoliMappa = lazy(() => import("./pages/prenotazioni/TavoliMappa"));

// CUCINA (MVP checklist + task)
// SceltaMacellaio appartiene semanticamente al modulo "ricette" ma il file
// vive ancora in pages/tasks/ per retrocompatibilita' (era in pages/cucina/).
// Spostarlo in pages/ricette/ e' un follow-up cosmetico di Phase C.
const SceltaMacellaio = lazy(() => import("./pages/tasks/SceltaMacellaio"));
const SceltaSalumi = lazy(() => import("./pages/tasks/SceltaSalumi"));
const SceltaFormaggi = lazy(() => import("./pages/tasks/SceltaFormaggi"));

// SELEZIONI DEL GIORNO (modulo unico — macellaio/pescato/salumi/formaggi via :zona)
const SelezioniDelGiorno = lazy(() => import("./pages/selezioni/SelezioniDelGiorno"));
// Task Manager (ex-Cucina, rinominato Phase B sessione 46)
const TasksHome = lazy(() => import("./pages/tasks/TasksHome"));
const TasksAgendaGiornaliera = lazy(() => import("./pages/tasks/AgendaGiornaliera"));
const TasksAgendaSettimana = lazy(() => import("./pages/tasks/AgendaSettimana"));
const TasksInstanceDetail = lazy(() => import("./pages/tasks/InstanceDetail"));
const TasksTemplateList = lazy(() => import("./pages/tasks/TemplateList"));
const TasksTemplateEditor = lazy(() => import("./pages/tasks/TemplateEditor"));
const TasksTaskList = lazy(() => import("./pages/tasks/TaskList"));

// COMUNICAZIONI + CAMBIO PIN + IMPOSTAZIONI SISTEMA
const Comunicazioni = lazy(() => import("./pages/Comunicazioni"));
const CambioPIN = lazy(() => import("./pages/CambioPIN"));
const ImpostazioniSistema = lazy(() => import("./pages/admin/ImpostazioniSistema"));

// DEMO / VETRINA MATTONI (admin only, non linkata da menu)
const CalendarDemo = lazy(() => import("./pages/admin/CalendarDemo"));

// FLUSSI DI CASSA (ex Banca)
const BancaDashboard = lazy(() => import("./pages/banca/BancaDashboard"));
const BancaMovimenti = lazy(() => import("./pages/banca/BancaMovimenti"));
const BancaImport = lazy(() => import("./pages/banca/BancaImport"));
const BancaCategorie = lazy(() => import("./pages/banca/BancaCategorie"));
const BancaCrossRef = lazy(() => import("./pages/banca/BancaCrossRef"));
const BancaImpostazioni = lazy(() => import("./pages/banca/BancaImpostazioni"));
const CartaCreditoPage = lazy(() => import("./pages/banca/CartaCreditoPage"));
const FlussiCassaContanti = lazy(() => import("./pages/banca/FlussiCassaContanti"));
const FlussiCassaMance = lazy(() => import("./pages/banca/FlussiCassaMance"));

// CONTROLLO DI GESTIONE
const ControlloGestioneDashboard = lazy(() => import("./pages/controllo-gestione/ControlloGestioneDashboard"));
const ControlloGestioneConfronto = lazy(() => import("./pages/controllo-gestione/ControlloGestioneConfronto"));
const ControlloGestioneUscite = lazy(() => import("./pages/controllo-gestione/ControlloGestioneUscite"));
const ControlloGestioneSpeseFisse = lazy(() => import("./pages/controllo-gestione/ControlloGestioneSpeseFisse"));
const ControlloGestioneRiconciliazione = lazy(() => import("./pages/controllo-gestione/ControlloGestioneRiconciliazione"));
const ControlloGestioneLiquidita = lazy(() => import("./pages/controllo-gestione/ControlloGestioneLiquidita"));

// STATISTICHE
const StatisticheDashboard = lazy(() => import("./pages/statistiche/StatisticheDashboard"));
const StatisticheProdotti = lazy(() => import("./pages/statistiche/StatisticheProdotti"));
const StatisticheImport = lazy(() => import("./pages/statistiche/StatisticheImport"));
const StatisticheCoperti = lazy(() => import("./pages/statistiche/StatisticheCoperti"));

// Fallback per Suspense: TrgbLoader centrato nello spazio tra Header e il banner update
function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-97px)] bg-brand-cream">
      <TrgbLoader size={64} label="Caricamento modulo…" />
    </div>
  );
}

// Redirect legacy /vini/carta/sezione/:key → /vini/carta/:key
function RedirectLegacySezione() {
  const { key } = useParams();
  return <Navigate to={`/vini/carta/${key || "vini"}`} replace />;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

  // useAppHeight() disabilitato sessione 26+ — causava crash su Cantina/RicetteNuova.
  // Da reinvestigare prima di rimettere.

  const { updateAvailable, reload } = useUpdateChecker();

  // Sessione 58 (2026-04-25) — Pagina pubblica /carta accessibile via QR sul
  // tavolo, senza login. Gestita PRIMA del check token per non forzare il
  // redirect al login. Usa BrowserRouter dedicato cosi' non monta Header,
  // ToastProvider, useUpdateChecker (cose interne al gestionale).
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const isPublicCarta = path === "/carta" || path.startsWith("/carta?") || path.startsWith("/carta/");
  if (isPublicCarta) {
    return (
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Modulo G.1 (2026-04-27): carta del menu cucina pubblica via QR */}
            <Route path="/carta/menu" element={<CartaMenuPubblica />} />
            <Route path="/carta" element={<CartaClienti />} />
            <Route path="/carta/*" element={<CartaClienti />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

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
    <ToastProvider>
    <BrowserRouter>
      <Header onLogout={handleLogout} />
      <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* --- GESTIONE VINI --- */}
        <Route path="/vini" element={
          <ModuleRedirect module="vini" targets={[
            { sub: "dashboard", path: "/vini/dashboard" },
            { sub: "magazzino", path: "/vini/magazzino" },
            { sub: "carta",     path: "/vini/carta" },
            { sub: "vendite",   path: "/vini/vendite" },
            { sub: "settings",  path: "/vini/settings" },
          ]} />
        } />
        {/* Carta Bevande — shell unica con sidebar 8 sezioni */}
        <Route path="/vini/carta" element={<Navigate to="/vini/carta/vini" replace />} />
        <Route path="/vini/carta/anteprima" element={<ProtectedRoute module="vini" sub="carta"><CartaAnteprima /></ProtectedRoute>} />
        <Route path="/vini/carta-staff" element={<ProtectedRoute module="vini" sub="carta"><CartaStaff /></ProtectedRoute>} />
        {/* Redirect legacy: /vini/carta/sezione/:key → /vini/carta/:key */}
        <Route path="/vini/carta/sezione/:key" element={<RedirectLegacySezione />} />
        {/* Shell con :sezione (vini / aperitivi / birre / amari_casa / amari_liquori / distillati / tisane / te) */}
        <Route path="/vini/carta/:sezione" element={<ProtectedRoute module="vini" sub="carta"><CartaBevande /></ProtectedRoute>} />
        <Route path="/vini/vendite" element={<ProtectedRoute module="vini" sub="vendite"><ViniVendite /></ProtectedRoute>} />
        <Route path="/vini/settings" element={<ProtectedRoute module="vini" sub="settings"><ViniImpostazioni /></ProtectedRoute>} />
        <Route path="/vini/magazzino" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoVini /></ProtectedRoute>} />
        <Route path="/vini/magazzino/nuovo" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoViniNuovo /></ProtectedRoute>} />
        <Route path="/vini/magazzino/admin" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoAdmin /></ProtectedRoute>} />
        <Route path="/vini/magazzino/registro" element={<ProtectedRoute module="vini" sub="magazzino"><RegistroMovimenti /></ProtectedRoute>} />
        <Route path="/vini/magazzino/tools" element={<Navigate to="/vini/settings" replace />} />
        <Route path="/vini/magazzino/:id" element={<ProtectedRoute module="vini" sub="magazzino"><MagazzinoViniDettaglio /></ProtectedRoute>} />
        <Route path="/vini/dashboard" element={<ProtectedRoute module="vini" sub="dashboard"><DashboardVini /></ProtectedRoute>} />
        {/* /vini/ipratico ora è una sezione di ViniImpostazioni (sessione 39) — redirect per link legacy */}
        <Route path="/vini/ipratico" element={<Navigate to="/vini/settings" replace />} />

        {/* --- GESTIONE RICETTE & FOOD COST --- */}
        <Route path="/ricette" element={
          <ModuleRedirect module="ricette" targets={[
            { sub: "dashboard",   path: "/ricette/dashboard" },
            { sub: "archivio",    path: "/ricette/archivio" },
            { sub: "ingredienti", path: "/ricette/ingredienti" },
            { sub: "matching",    path: "/ricette/matching" },
            { sub: "settings",    path: "/ricette/settings" },
          ]} />
        } />
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

        {/* --- MENU CARTA (sotto Gestione Cucina, mig 098-100, sessione 57) --- */}
        <Route path="/menu-carta" element={<ProtectedRoute module="ricette" sub="archivio"><MenuCartaElenco /></ProtectedRoute>} />
        <Route path="/menu-carta/:id" element={<ProtectedRoute module="ricette" sub="archivio"><MenuCartaDettaglio /></ProtectedRoute>} />

        {/* --- MENU PRANZO DEL GIORNO (sotto Gestione Cucina, mig 102, sessione 58) --- */}
        <Route path="/pranzo" element={<ProtectedRoute module="ricette" sub="pranzo"><PranzoMenu /></ProtectedRoute>} />

        {/* --- DASHBOARD CUCINA chef (sotto Gestione Cucina, sessione 59 — Modulo H) --- */}
        <Route path="/cucina/dashboard" element={<ProtectedRoute module="ricette" sub="cucina_dashboard"><DashboardCucina /></ProtectedRoute>} />

        {/* --- AREA AMMINISTRAZIONE (redirect legacy) --- */}
        <Route path="/admin" element={<Navigate to="/impostazioni" replace />} />

        {/* --- GESTIONE VENDITE --- */}
        <Route path="/vendite" element={
          <ModuleRedirect module="vendite" targets={[
            { sub: "dashboard",    path: "/vendite/dashboard" },
            { sub: "fine-turno",   path: "/vendite/fine-turno" },
            { sub: "chiusure",     path: "/vendite/chiusure" },
            { sub: "riepilogo",    path: "/vendite/riepilogo" },
            { sub: "impostazioni", path: "/vendite/impostazioni" },
          ]} />
        } />
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
        <Route path="/flussi-cassa" element={
          <ModuleRedirect module="flussi-cassa" targets={[
            { sub: "dashboard",    path: "/flussi-cassa/dashboard" },
            { sub: "cc",           path: "/flussi-cassa/cc" },
            { sub: "carta",        path: "/flussi-cassa/carta" },
            { sub: "contanti",     path: "/flussi-cassa/contanti" },
            { sub: "mance",        path: "/flussi-cassa/mance" },
            { sub: "impostazioni", path: "/flussi-cassa/impostazioni" },
          ]} />
        } />
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
        <Route path="/controllo-gestione" element={
          <ModuleRedirect module="controllo-gestione" targets={[
            { path: "/controllo-gestione/dashboard" },
            { path: "/controllo-gestione/uscite" },
            { path: "/controllo-gestione/confronto" },
            { path: "/controllo-gestione/spese-fisse" },
          ]} />
        } />
        <Route path="/controllo-gestione/dashboard" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneDashboard /></ProtectedRoute>} />
        <Route path="/controllo-gestione/liquidita" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneLiquidita /></ProtectedRoute>} />
        <Route path="/controllo-gestione/confronto" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneConfronto /></ProtectedRoute>} />
        <Route path="/controllo-gestione/uscite" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneUscite /></ProtectedRoute>} />
        <Route path="/controllo-gestione/spese-fisse" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneSpeseFisse /></ProtectedRoute>} />
        <Route path="/controllo-gestione/riconciliazione" element={<ProtectedRoute module="controllo-gestione"><ControlloGestioneRiconciliazione /></ProtectedRoute>} />

        {/* --- STATISTICHE --- */}
        <Route path="/statistiche" element={
          <ModuleRedirect module="statistiche" targets={[
            { sub: "dashboard", path: "/statistiche/dashboard" },
            { sub: "coperti",   path: "/statistiche/coperti" },
            { path: "/statistiche/prodotti" },
            { path: "/statistiche/import" },
          ]} />
        } />
        <Route path="/statistiche/dashboard" element={<ProtectedRoute module="statistiche" sub="dashboard"><StatisticheDashboard /></ProtectedRoute>} />
        <Route path="/statistiche/prodotti" element={<ProtectedRoute module="statistiche"><StatisticheProdotti /></ProtectedRoute>} />
        <Route path="/statistiche/import" element={<ProtectedRoute module="statistiche"><StatisticheImport /></ProtectedRoute>} />
        <Route path="/statistiche/coperti" element={<ProtectedRoute module="statistiche" sub="coperti"><StatisticheCoperti /></ProtectedRoute>} />

        {/* --- DIPENDENTI (modulo top-level) --- */}
        <Route path="/dipendenti" element={
          <ModuleRedirect module="dipendenti" targets={[
            { path: "/dipendenti/dashboard" },
            { path: "/dipendenti/turni" },
            { path: "/dipendenti/anagrafica" },
            { path: "/dipendenti/buste-paga" },
            { path: "/dipendenti/scadenze" },
            { path: "/dipendenti/costi" },
            { path: "/dipendenti/impostazioni" },
          ]} />
        } />
        <Route path="/dipendenti/dashboard" element={<ProtectedRoute module="dipendenti"><DashboardDipendenti /></ProtectedRoute>} />
        <Route path="/dipendenti/anagrafica" element={<ProtectedRoute module="dipendenti"><DipendentiAnagrafica /></ProtectedRoute>} />
        <Route path="/dipendenti/turni" element={<ProtectedRoute module="dipendenti"><FoglioSettimana /></ProtectedRoute>} />
        <Route path="/dipendenti/turni/mese" element={<ProtectedRoute module="dipendenti"><VistaMensile /></ProtectedRoute>} />
        <Route path="/dipendenti/turni/dipendente" element={<ProtectedRoute module="dipendenti"><PerDipendente /></ProtectedRoute>} />
        <Route path="/dipendenti/turni-legacy" element={<ProtectedRoute module="dipendenti"><DipendentiTurni /></ProtectedRoute>} />
        <Route path="/dipendenti/impostazioni" element={<ProtectedRoute module="dipendenti"><DipendentiImpostazioni /></ProtectedRoute>} />
        <Route path="/dipendenti/reparti" element={<ProtectedRoute module="dipendenti"><GestioneReparti /></ProtectedRoute>} />
        <Route path="/dipendenti/costi" element={<ProtectedRoute module="dipendenti"><DipendentiCosti /></ProtectedRoute>} />
        <Route path="/dipendenti/buste-paga" element={<ProtectedRoute module="dipendenti"><DipendentiBustePaga /></ProtectedRoute>} />
        <Route path="/dipendenti/scadenze" element={<ProtectedRoute module="dipendenti"><DipendentiScadenze /></ProtectedRoute>} />

        {/* --- I MIEI TURNI (self-service, accessibile a tutti i ruoli autenticati) --- */}
        <Route path="/miei-turni" element={<MieiTurni />} />
        {/* Redirect vecchi path admin */}
        <Route path="/admin/dipendenti/*" element={<Navigate to="/dipendenti" replace />} />

        {/* --- GESTIONE CLIENTI CRM --- */}
        <Route path="/clienti" element={
          <ModuleRedirect module="clienti" targets={[
            { sub: "dashboard", path: "/clienti/dashboard" },
            { sub: "lista",     path: "/clienti/lista" },
            { path: "/clienti/prenotazioni" },
            { path: "/clienti/preventivi" },
            { sub: "import",    path: "/clienti/impostazioni" },
          ]} />
        } />
        <Route path="/clienti/lista" element={<ProtectedRoute module="clienti" sub="lista"><ClientiLista /></ProtectedRoute>} />
        <Route path="/clienti/prenotazioni" element={<ProtectedRoute module="clienti"><ClientiPrenotazioni /></ProtectedRoute>} />
        <Route path="/clienti/preventivi" element={<ProtectedRoute module="clienti"><ClientiPreventivi /></ProtectedRoute>} />
        <Route path="/clienti/preventivi/:id" element={<ProtectedRoute module="clienti"><ClientiPreventivoScheda /></ProtectedRoute>} />
        <Route path="/clienti/dashboard" element={<ProtectedRoute module="clienti" sub="dashboard"><ClientiDashboard /></ProtectedRoute>} />
        <Route path="/clienti/impostazioni" element={<ProtectedRoute module="clienti" sub="import"><ClientiImpostazioni /></ProtectedRoute>} />
        <Route path="/clienti/impostazioni/:section" element={<ProtectedRoute module="clienti" sub="import"><ClientiImpostazioni /></ProtectedRoute>} />
        <Route path="/clienti/:id" element={<ProtectedRoute module="clienti" sub="lista"><ClientiScheda /></ProtectedRoute>} />

        {/* --- PRENOTAZIONI --- */}
        <Route path="/prenotazioni" element={
          <ModuleRedirect module="prenotazioni" targets={[
            { path: `/prenotazioni/planning/${new Date().toISOString().slice(0,10)}` },
            { path: "/prenotazioni/mappa" },
            { path: `/prenotazioni/settimana/${new Date().toISOString().slice(0,10)}` },
            { path: "/prenotazioni/impostazioni" },
          ]} />
        } />
        <Route path="/prenotazioni/planning/:data" element={<ProtectedRoute module="prenotazioni"><PrenotazioniPlanning /></ProtectedRoute>} />
        <Route path="/prenotazioni/settimana/:data" element={<ProtectedRoute module="prenotazioni"><PrenotazioniSettimana /></ProtectedRoute>} />
        <Route path="/prenotazioni/impostazioni" element={<ProtectedRoute module="prenotazioni"><PrenotazioniImpostazioni /></ProtectedRoute>} />
        <Route path="/prenotazioni/tavoli" element={<ProtectedRoute module="prenotazioni"><TavoliEditor /></ProtectedRoute>} />
        <Route path="/prenotazioni/mappa" element={<ProtectedRoute module="prenotazioni"><TavoliMappa /></ProtectedRoute>} />
        <Route path="/prenotazioni/mappa/:data/:turno" element={<ProtectedRoute module="prenotazioni"><TavoliMappa /></ProtectedRoute>} />

        {/* --- SELEZIONI DEL GIORNO (modulo unico 4 zone: macellaio/pescato/salumi/formaggi) --- */}
        <Route path="/selezioni" element={<Navigate to="/selezioni/macellaio" replace />} />
        <Route path="/selezioni/:zona" element={<ProtectedRoute module="selezioni"><SelezioniDelGiorno /></ProtectedRoute>} />

        {/* Redirect legacy → nuova route /selezioni/:zona (bookmark utenti / deep link) */}
        <Route path="/macellaio" element={<Navigate to="/selezioni/macellaio" replace />} />
        <Route path="/salumi"    element={<Navigate to="/selezioni/salumi"    replace />} />
        <Route path="/formaggi"  element={<Navigate to="/selezioni/formaggi"  replace />} />
        <Route path="/pescato"   element={<Navigate to="/selezioni/pescato"   replace />} />

        {/* --- TASK MANAGER (ex-Cucina): checklist ricorrenti + task singoli --- */}
        <Route path="/tasks" element={<ProtectedRoute module="tasks"><TasksHome /></ProtectedRoute>} />
        <Route path="/tasks/agenda" element={<ProtectedRoute module="tasks" sub="agenda"><TasksAgendaGiornaliera /></ProtectedRoute>} />
        <Route path="/tasks/agenda/settimana" element={<ProtectedRoute module="tasks" sub="agenda"><TasksAgendaSettimana /></ProtectedRoute>} />
        <Route path="/tasks/instances/:id" element={<ProtectedRoute module="tasks" sub="agenda"><TasksInstanceDetail /></ProtectedRoute>} />
        <Route path="/tasks/templates" element={<ProtectedRoute module="tasks" sub="templates"><TasksTemplateList /></ProtectedRoute>} />
        <Route path="/tasks/templates/nuovo" element={<ProtectedRoute module="tasks" sub="templates"><TasksTemplateEditor /></ProtectedRoute>} />
        <Route path="/tasks/templates/:id" element={<ProtectedRoute module="tasks" sub="templates"><TasksTemplateEditor /></ProtectedRoute>} />
        <Route path="/tasks/tasks" element={<ProtectedRoute module="tasks" sub="tasks"><TasksTaskList /></ProtectedRoute>} />

        {/* Redirect legacy /cucina/* → /tasks/* (bookmark utenti) */}
        <Route path="/cucina"                  element={<Navigate to="/tasks"                  replace />} />
        <Route path="/cucina/agenda"           element={<Navigate to="/tasks/agenda"           replace />} />
        <Route path="/cucina/agenda/settimana" element={<Navigate to="/tasks/agenda/settimana" replace />} />
        <Route path="/cucina/tasks"            element={<Navigate to="/tasks/tasks"            replace />} />
        <Route path="/cucina/templates"        element={<Navigate to="/tasks/templates"        replace />} />
        <Route path="/cucina/templates/nuovo"  element={<Navigate to="/tasks/templates/nuovo"  replace />} />
        <Route path="/cucina/templates/:id"    element={<Navigate to="/tasks/templates/:id"    replace />} />
        <Route path="/cucina/instances/:id"    element={<Navigate to="/tasks/instances/:id"    replace />} />

        {/* --- COMUNICAZIONI (Bacheca Staff) — accessibile a tutti i loggati --- */}
        <Route path="/comunicazioni" element={<Comunicazioni />} />

        {/* --- CAMBIO PIN --- */}
        <Route path="/cambio-pin" element={<CambioPIN />} />

        {/* --- IMPOSTAZIONI SISTEMA (admin only) --- */}
        <Route path="/impostazioni" element={<ProtectedRoute module="impostazioni"><ImpostazioniSistema /></ProtectedRoute>} />
        <Route path="/admin/impostazioni" element={<Navigate to="/impostazioni" replace />} />

        {/* --- DEMO MATTONE M.E CALENDAR (admin only, NON linkata da menu) --- */}
        <Route path="/calendario-demo" element={<ProtectedRoute module="impostazioni"><CalendarDemo /></ProtectedRoute>} />

        {/* CATCH-ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>

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
    </ToastProvider>
  );
}
