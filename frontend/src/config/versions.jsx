// Mappa versioni moduli TRGB Gestionale
// Aggiornare qui ad ogni rilascio significativo

const MODULE_VERSIONS = {
  vini: {
    // 3.73 (2026-08-02): Carta Bevande — flag `analcolica` sulle voci (mig 157):
    //   badge "0.0" brand-blue accanto al nome + legenda, su HTML web, HTML
    //   preview e DOCX/PDF. Gemello del flag gluten_free (mig 106).
    // 3.72 (2026-07-20): CartaStaff v2.0 "banco di servizio" (V.22) — vista
    //   sommelier operativa: Preparazione + Servizio, vendita one-tap con
    //   undo, toggle mescita. Endpoint carta-staff: locazioni con `slot`.
    version: "3.73",
    label: "Cantina & Vini",
    status: "stabile",     // stabile | beta | alpha | dev
    color: "green",
  },
  ricette: {
    version: "3.33",
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
    version: "1.7",
    label: "Menu Pranzo del Giorno",
    status: "beta",
    color: "blue",
  },
  menuCarta: {
    // 1.2 (2026-07-19): sezione 'dolci' [core] (router+FE+PDF+MEP) +
    //   edizione Estate 2026 in carta via mig 154 [locale:tregobbi].
    //   Nel push b8c96816 il bump era stato sovrascritto da una sessione
    //   parallela — riapplicato.
    version: "1.2",
    label: "Menu Carta",
    status: "beta",
    color: "blue",
  },
  corrispettivi: {
    // 4.8 (2026-07-17, V.1): fix semantica "giorno chiuso" in
    //   `_is_effectively_closed()`. Prima: giorno con corr=0 era "aperto
    //   con €0" se non in config giorni_chiusi/giorno_chiusura_settimanale.
    //   Ora: nessun dato → chiuso di fatto. Fixa YoY sgonfio: Q2 2025 va da
    //   78gg "aperti" a 62-64gg reali, media €/gg passa da €1.325 a €1.667,
    //   YoY €/gg da +51% gonfiato a +17% reale. Config resta per altri
    //   consumer (CalendarView shading). Nessuna migrazione DB.
    version: "4.8",
    label: "Gestione Vendite",
    status: "stabile",
    color: "green",
  },
  fatture: {
    version: "3.1",
    label: "Gestione Acquisti",
    status: "stabile",
    color: "green",
  },
  flussiCassa: {
    version: "1.20",
    label: "Flussi di Cassa",
    status: "beta",
    color: "blue",
  },
  dipendenti: {
    // 2.30 (2026-07-30): sotto-area Intermittenti — comunicazione preventiva
    //   UNI-Intermittenti generata dai turni, invio email, registro con prova,
    //   annullamento, checker M.F a 48h. Migrazione 156.
    version: "2.30",
    label: "Dipendenti",
    status: "stabile",
    color: "green",
  },
  auth: {
    // 2.2 (2026-07-10): lockout brute-force login (A1-04, backoff progressivo,
    // soglie in auth_settings.json) + PIN minimo 6 cifre per admin/contabile.
    version: "2.2.2",
    label: "Login & Ruoli",
    status: "stabile",
    color: "green",
  },
  statistiche: {
    // 1.2 (2026-07-02): modulo potenziato — tab Storico (YoY 2021→oggi da
    //   daily_closures+shift_closures con cutover dinamico, media per giorno
    //   settimana con split pranzo/cena), "Cosa consuma un coperto" in
    //   Coperti & Incassi (€/coperto per categoria iPratico), movimenti
    //   prodotti in Dashboard (crescita/calo vs mese precedente), trend
    //   mensile per prodotto cliccabile in Prodotti. Endpoint 8-11 nel router.
    // 1.2.1 (2026-07-02): fix semantica cumulativa shift_closures — la riga
    //   cena contiene la Z DI GIORNATA (include il pranzo): fatturato giorno
    //   = cena.preconto + fatture, non pranzo+cena (raddoppiava). Esclusi
    //   shift_preconti per omogeneità con daily-era. Marzo 104k→71.6k
    //   (iPratico 71.5k). + fallback pre-cutover in Coperti & Incassi
    //   (gen/feb da registro corrispettivi, endpoint 12 /storico/giorni).
    version: "1.2.1",
    label: "Statistiche",
    status: "beta",
    color: "blue",
  },
  controlloGestione: {
    // 2.21 (2026-07-17, U3+U4): pagina Analisi Utenze (upload bollette A2A,
    //   KPI, grafici fasce/gas/potenza) + 2 checker M.F (rinegoziazione
    //   condizioni, autolettura gas). Spec docs/spec_utenze.md.
    // 2.18 (2026-06-30, BP.1-4): nuova pagina "Batch pagamenti".
    // 2.19 (2026-06-30, RC.1+RC.3): auto-close rateizzazioni completate.
    //   Endpoint POST /rateizzazioni/{sf_id}/auto-close + POST /auto-close-all
    //   che chiude spese fisse RATEIZZAZIONE con tutte rate pagate, aggiorna
    //   uscita origine + fe_fatture (via set_stato force=True) applicando la
    //   Regola A (Marco): forza minima delle rate → PAGATO se tutte le rate
    //   riconciliate banca, PAGATO_MANUALE se almeno una manuale.
    //   UI: bottone "✓ Auto-chiudi rateizzazioni completate" in header
    //   ControlloGestioneSpeseFisse. Sul VPS Tre Gobbi: 7 rateizzazioni
    //   completate al 100% da chiudere (4 Ristoteam + Ambrogio + Philarmonica
    //   + Marenzi). RC.2 (hook post-pagamento strutturale) rimandato.
    // 2.20 (2026-07-02, RC.1.fix): fix SELECT su cg_uscite — non esiste
    //   la colonna `numero_rata` (è di cg_piano_rate). Rimosso dalla query
    //   raccogli-date-rate; usiamo solo periodo_riferimento come identificatore.
    version: "2.21",
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
    version: "1.1",
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
    // 3.7 (2026-07-27): widget Bacheca sostituito da "La Lavagna" — briefing
    // di servizio auto-composto (coperti, tavoli da segnalare, selezioni,
    // turni, task) + nota del turno a frizione zero + strato eventi che
    // assorbe la vecchia card Alert. Stesso widget anche in DashboardSala,
    // dove il ruolo sala lo vede in sola lettura.
    version: "3.7",
    label: "Home",
    status: "beta",
    color: "blue",
  },
  cartaCredito: {
    // Sub-modulo banca — sub-modulo COMPLETO end-to-end con CC.5.b
    // (2026-06-02 notte): vista riepilogo mensile spese carta per categoria.
    // Endpoint GET /banca/carta/riepilogo con mappa MCC→categoria hardcoded
    // (ALIMENTARI/TRASPORTI/SOFTWARE/ALBERGHI/RISTORANTI/FINANZIARI/SERVIZI/VARIE).
    // Nuova pagina CartaRiepilogoPage.jsx con filtri carta+range, 4 stat
    // card, bar chart stacked per categoria (recharts), tabella mesi×cat
    // con riga totali. Bottone "📊 Riepilogo mensile" in CartaCreditoPage.
    //
    // CC.6 (2026-06-13): fix coerenza carta vs CC bancario. 4 endpoint
    // banca escludono pseudo-mov carta dal saldo (filtro EXCLUDE_CARTA_SQL).
    // /banca/cross-ref include is_carta + match_uscita_id (LEFT JOIN
    // cg_uscite). BancaCrossRef: toggle "💳 Mostra movimenti carta", badge
    // "💳 carta" sulle righe carta, chip "🔗 Già su CG #N" se matchato A.
    //
    // CC.6.fix (2026-06-13 notte): hotfix LEFT JOIN duplicava i movimenti
    // multi-link (es. mov #1416 con 6 uscite CG appariva 6 volte). Sostituito
    // con subquery scalari LIMIT 1 + GROUP_CONCAT/COUNT per portare aggregato.
    // Aggiunto badge "CC *XXXX" (multi-conto ready) accanto al badge carta.
    // Chip "Già su CG" mostra "+M altre" se count > 1.
    //
    // CC.7 (2026-06-13 notte): "Chiudi senza fattura" — bottone nei tab
    // "senza"/"parcheggiati" che crea cg_uscite (tipo_uscita='SPESA_NON_FATTURATA',
    // stato='PAGATO') + marca riconciliazione_chiusa. Reversibile via riapri.
    // 2 endpoint POST/DELETE /cross-ref/chiudi-senza-fattura/{id}.
    version: "1.8",
    label: "Carta di Credito",
    status: "beta",
    color: "blue",
  },
  sistema: {
    // ⚠️ ALLINEAMENTO OBBLIGATORIO con file `VERSION` in root del repo.
    // Backend (`main.py`) legge da `VERSION` come single source of truth ed
    // espone in `/system/info` come `version`. Quando bumpi questa stringa
    // qui, aggiorna ANCHE `VERSION` in root con lo stesso valore.
    // Vedi CLAUDE.md sezione "Versioning prodotto".
    version: "5.38",
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
