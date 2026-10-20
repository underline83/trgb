// @version: v1.5-area-personale — titolo «Area personale» per i ruoli non admin/contabile (2026-10-20)
// v1.4-self-service — tab «I miei turni» e «Le mie buste paga» per tutti (2026-10-19)
// v1.3-candidati — tab Candidati con badge dei nuovi (2026-10-16)
// v1.2-permessi — i tab si filtrano per ruolo (2026-09-01)
// Tab navigation persistente per la sezione Dipendenti (pattern ViniNav).
// Colore modulo: viola (amber = admin, viola = dipendenti). Si mostra in tutte
// le pagine del modulo: Dashboard, Anagrafica, Buste Paga, Turni, Scadenze, Costi, Impostazioni.
//
// PERMESSI: fino alla v1.1 questa nav mostrava tutti gli 8 tab a chiunque
// vedesse il modulo. Un sommelier entrava da "Turni" e si trovava "Buste Paga"
// li' da cliccare — non doveva nemmeno inventarsi l'URL. Ora ogni tab dichiara
// il sotto-modulo di modules.json da cui dipende e viene nascosto se il ruolo
// non ce l'ha. La nav e' il primo dei tre livelli: le route (App.jsx) e i
// router backend (dipendenti.py / turni_router.py) hanno i loro controlli.
import React, { useState, useEffect } from "react";
import { ModuleNav } from "../../components/ui";
import useModuleAccess from "../../hooks/useModuleAccess";
import { API_BASE, apiFetch } from "../../config/api";
import { menuTitle } from "../../config/modulesMenu";

const TABS = [
  // `sub` = chiave del sotto-modulo in modules.json che autorizza il tab.
  // Dashboard mostra il netto delle buste paga del mese e il conteggio
  // scadenze: stesso livello di riservatezza delle buste paga, non di Turni.
  { key: "dashboard", label: "Dashboard", path: "/dipendenti/dashboard", icon: "📊", sub: "buste-paga" },
  { key: "anagrafica", label: "Anagrafica", path: "/dipendenti/anagrafica", icon: "🗂️", sub: "anagrafica" },
  { key: "buste-paga", label: "Buste Paga", path: "/dipendenti/buste-paga", icon: "📋", sub: "buste-paga" },
  { key: "turni", label: "Turni", path: "/dipendenti/turni", icon: "📅", sub: "turni" },
  // Self-service (sub: null = ogni ruolo): il backend risolve l'utente loggato
  // sul SUO dipendente, quindi ognuno vede solo i propri dati.
  { key: "miei-turni", label: "I miei turni", path: "/miei-turni", icon: "🗓️", sub: null },
  { key: "mie-buste-paga", label: "Le mie buste paga", path: "/mie-buste-paga", icon: "📄", sub: null },
  // Intermittenti invia la comunicazione UNI al Ministero: admin.
  { key: "intermittenti", label: "Intermittenti", path: "/dipendenti/intermittenti", icon: "📨", sub: "impostazioni" },
  { key: "scadenze", label: "Scadenze", path: "/dipendenti/scadenze", icon: "🚨", sub: "scadenze" },
  // Candidati: CV di persone esterne → solo admin (sub «candidati», aggiunta al
  // runtime da modules_router.SUB_DA_AGGIUNGERE). Badge = quanti NUOVI.
  { key: "candidati", label: "Candidati", path: "/dipendenti/candidati", icon: "📝", sub: "candidati" },
  { key: "costi", label: "Costi", path: "/dipendenti/costi", icon: "💰", sub: "costi" },
  { key: "impostazioni", label: "Impostazioni", path: "/dipendenti/impostazioni", icon: "⚙️", sub: "impostazioni" },
];

// Il tab Candidati si mostra solo ad admin/superadmin anche se il runtime dei
// permessi non avesse ancora la sub (canAccessSub ricadrebbe sul modulo intero).
const isAdmin = (r) => r === "admin" || r === "superadmin";

export default function DipendentiNav({ current }) {
  const { canAccessSub, loading, role } = useModuleAccess();
  const [nuovi, setNuovi] = useState(0);
  const vedeCandidati = !loading && isAdmin(role) && canAccessSub("dipendenti", "candidati");

  useEffect(() => {
    if (!vedeCandidati) return;
    apiFetch(`${API_BASE}/dipendenti/candidati/contatori`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNuovi(d?.NUOVO || 0))
      .catch(() => {});
  }, [vedeCandidati, current]);

  // Durante il caricamento non mostriamo tab riservati: meglio una nav che si
  // popola in ritardo che una che lampeggia "Buste Paga" a chi non deve vederlo.
  const tabs = loading
    ? TABS.filter((t) => t.sub === "turni" || t.sub === null)
    : TABS.filter((t) => (t.key === "candidati" ? vedeCandidati : t.sub === null || canAccessSub("dipendenti", t.sub)))
        .map((t) => (t.key === "candidati" ? { ...t, badge: nuovi } : t));

  return (
    <ModuleNav
      title={`👥 ${menuTitle("dipendenti", role)}`}
      homePath="/dipendenti"
      color="purple"
      tabs={tabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
