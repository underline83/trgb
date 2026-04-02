// Mappa versioni moduli TRGB Gestionale
// Aggiornare qui ad ogni rilascio significativo

const MODULE_VERSIONS = {
  vini: {
    version: "3.8",
    label: "Cantina & Vini",
    status: "stabile",     // stabile | beta | alpha | dev
    color: "green",
  },
  ricette: {
    version: "3.0",
    label: "Ricette & Food Cost",
    status: "beta",
    color: "blue",
  },
  corrispettivi: {
    version: "4.0",
    label: "Gestione Vendite",
    status: "stabile",
    color: "green",
  },
  fatture: {
    version: "2.0",
    label: "Gestione Acquisti",
    status: "stabile",
    color: "green",
  },
  flussiCassa: {
    version: "1.4",
    label: "Flussi di Cassa",
    status: "beta",
    color: "blue",
  },
  dipendenti: {
    version: "2.1",
    label: "Dipendenti",
    status: "stabile",
    color: "green",
  },
  auth: {
    version: "2.0",
    label: "Login & Ruoli",
    status: "stabile",
    color: "green",
  },
  statistiche: {
    version: "1.0",
    label: "Statistiche",
    status: "beta",
    color: "blue",
  },
  controlloGestione: {
    version: "1.4",
    label: "Controllo Gestione",
    status: "beta",
    color: "blue",
  },
  sistema: {
    version: "5.1",
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
