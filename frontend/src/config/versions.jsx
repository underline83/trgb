// Mappa versioni moduli TRGB Gestionale
// Aggiornare qui ad ogni rilascio significativo

const MODULE_VERSIONS = {
  vini: {
    version: "3.28",
    label: "Cantina & Vini",
    status: "stabile",     // stabile | beta | alpha | dev
    color: "green",
  },
  ricette: {
    version: "3.12",
    label: "Ricette & Food Cost",
    status: "beta",
    color: "blue",
  },
  cucinaDashboard: {
    version: "1.0",
    label: "Dashboard Cucina chef",
    status: "alpha",
    color: "orange",
  },
  listaSpesa: {
    version: "1.0",
    label: "Lista Spesa Cucina",
    status: "alpha",
    color: "orange",
  },
  pranzo: {
    version: "1.5",
    label: "Menu Pranzo del Giorno",
    status: "alpha",
    color: "orange",
  },
  menuCarta: {
    version: "1.1",
    label: "Menu Carta",
    status: "beta",
    color: "blue",
  },
  corrispettivi: {
    version: "4.5",
    label: "Gestione Vendite",
    status: "stabile",
    color: "green",
  },
  fatture: {
    version: "3.0",
    label: "Gestione Acquisti",
    status: "stabile",
    color: "green",
  },
  flussiCassa: {
    version: "1.13",
    label: "Flussi di Cassa",
    status: "beta",
    color: "blue",
  },
  dipendenti: {
    version: "2.28",
    label: "Dipendenti",
    status: "stabile",
    color: "green",
  },
  auth: {
    version: "2.1",
    label: "Login & Ruoli",
    status: "stabile",
    color: "green",
  },
  statistiche: {
    version: "1.1",
    label: "Statistiche",
    status: "beta",
    color: "blue",
  },
  controlloGestione: {
    version: "2.16",
    label: "Controllo Gestione",
    status: "beta",
    color: "blue",
  },
  clienti: {
    version: "3.0",
    label: "Gestione Clienti",
    status: "beta",
    color: "blue",
  },
  prenotazioni: {
    version: "2.2",
    label: "Prenotazioni",
    status: "beta",
    color: "blue",
  },
  selezioni: {
    version: "1.0",
    label: "Selezioni del Giorno",
    status: "beta",
    color: "blue",
  },
  tasks: {
    version: "1.4",
    label: "Task Manager",
    status: "beta",
    color: "blue",
  },
  haccp: {
    version: "1.0",
    label: "Report HACCP",
    status: "alpha",
    color: "orange",
  },
  home: {
    version: "3.6",
    label: "Home",
    status: "beta",
    color: "blue",
  },
  sistema: {
    // ⚠️ ALLINEAMENTO OBBLIGATORIO con file `VERSION` in root del repo.
    // Backend (`main.py`) legge da `VERSION` come single source of truth ed
    // espone in `/system/info` come `version`. Quando bumpi questa stringa
    // qui, aggiorna ANCHE `VERSION` in root con lo stesso valore.
    // Vedi CLAUDE.md sezione "Versioning prodotto".
    version: "5.11",
    label: "Sistema",
    status: "stabile",
    color: "green",
  },
};

export default MODULE_VERSIONS;

// Componente badge versione riutilizzabile
export function VersionBadge({ modulo, className = "" }) {
  const m = MODULE_VERSIONS[modulo];
  if (!m) return null;

  const statusColors = {
    stabile: "bg-green-100 text-green-700 border-green-300",
    beta: "bg-blue-100 text-blue-700 border-blue-300",
    alpha: "bg-yellow-100 text-yellow-700 border-yellow-300",
    dev: "bg-red-100 text-red-700 border-red-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono border rounded-full px-2 py-0.5 ${statusColors[m.status] || statusColors.dev} ${className}`}>
      v{m.version}
      {m.status !== "stabile" && (
        <span className="font-sans font-semibold uppercase tracking-wider" style={{ fontSize: "0.6rem" }}>
          {m.status}
        </span>
      )}
    </span>
  );
}
