# TRGB Gestionale — Analisi Completa del Sistema
**Data:** 2026-03-14
**Autore:** Claude (sessione 6)
**Versione sistema:** v4.3

---

# PARTE 1: Stato Attuale del Sistema

## 1.1 Dimensioni del progetto

Il gestionale TRGB e' cresciuto significativamente negli ultimi 4 mesi di sviluppo.

**Backend:** 22 router FastAPI, 70+ endpoint REST, 6 database SQLite, 17 migrazioni DB
**Frontend:** 80+ file React/JSX, 50+ route, 9 moduli funzionali
**Infrastruttura:** VPS Aruba con deploy automatico, HTTPS, Nginx reverse proxy

## 1.2 Moduli e maturita'

| Modulo | Versione | Maturita' | Utilizzo reale | Note |
|--------|----------|-----------|----------------|------|
| Cantina & Vini | v3.7 | Alta | Si | Modulo piu' maturo, in uso quotidiano |
| Gestione Acquisti | v2.0 | Alta | Si | Import XML funzionante, categorie |
| Ricette & Food Cost | v3.0 | Media | Parziale | Backend solido, adozione UI da verificare |
| Gestione Vendite | v2.0 | Media | In avvio | Chiusure turno appena create, da testare |
| Banca | v1.0 | Media | Da avviare | Funzionante ma non ancora in uso regolare |
| Finanza | v1.0 | Bassa | No | Struttura base, poco testato |
| Dipendenti | v1.0 | Media | Parziale | Anagrafica ok, turni poco usati |
| Login & Ruoli | v2.0 | Alta | Si | PIN funzionante, 4 utenti attivi |

## 1.3 Architettura — Punti di forza

**Separazione chiara dei domini**: ogni modulo ha il suo router, le sue pagine e (dove serve) il suo database. Questo rende il sistema manutenibile anche da un singolo sviluppatore.

**Deploy automatico**: il flusso `push.sh` → post-receive hook e' veloce e affidabile. Marco puo' deployare in 30 secondi dal Mac.

**Frontend coerente**: Tailwind + pattern comune (CardMenu, Nav persistente, apiFetch centralizzato) danno un look uniforme.

**Database per dominio**: la scelta di SQLite separati per funzione evita conflitti e semplifica i backup.

## 1.4 Architettura — Punti deboli

**Nessun test automatico**: non esistono test unitari ne' di integrazione. Ogni modifica richiede test manuali. Con 70+ endpoint, il rischio di regressioni cresce.

**Permessi dispersi**: i check ruolo sono sparsi in ogni router (`if role not in ("admin", "sommelier")`). Non esiste un punto centralizzato per sapere "chi puo' fare cosa".

**Migrazioni incomplete**: `dipendenti.sqlite3` non ha migrazioni, `fe_fatture/fe_righe` sono create a runtime, `admin_finance.sqlite3` usa auto-migrazione inline. Solo `foodcost.db` ha un sistema di migrazioni strutturato.

**Documentazione dei moduli non uniforme**: `Modulo_Acquisti.md` e' molto dettagliato, `modulo_dipendenti.md` e' scarno. Non tutti i moduli hanno una doc aggiornata.

**Nessun sistema di backup automatico**: i database sono su un singolo VPS senza backup schedulato.

---

# PARTE 2: Analisi per Modulo

## 2.1 Cantina & Vini (v3.7)

**Stato**: il modulo piu' completo e testato. I filtri gerarchici cascading sono un'ottima UX per la cantina. La dashboard offre KPI operativi utili.

**Cose che funzionano bene**: vendite con locazione obbligatoria, modifica massiva con ordinamento, generazione carta PDF/DOCX, sync bidirezionale Excel-Cantina.

**Opportunita'**: il flag DISCONTINUATO e' nel DB ma non ancora nell'UI. La carta vini web pubblica e' molto richiesta. L'integrazione automatica carichi da fatture XML risparmierebbe molto lavoro manuale.

## 2.2 Ricette & Food Cost (v3.0)

**Stato**: il backend e' solido (calcolo ricorsivo, sub-ricette, conversioni). Il matching Smart Create e' potente. La domanda e': lo staff lo usa effettivamente?

**Cose che funzionano bene**: matching fatture con fuzzy search, creazione ingredienti in blocco, esclusione automatica non-ingredienti, conversioni unita' custom.

**Opportunita'**: dashboard per reparto, export PDF ricette con costi per la cucina, storico variazione costi per monitorare l'inflazione.

## 2.3 Gestione Vendite (v2.0)

**Stato**: il nuovo modulo Chiusure Turno e' il cambiamento piu' significativo per lo staff. La logica cena cumulativa risolve un problema reale (lo staff non deve fare calcoli). Serve testing approfondito in produzione.

**Cose che funzionano bene**: la separazione pranzo/cena, i pre-conti dinamici, le spese categorizzate.

**Rischi**: la logica cumulativa potrebbe generare confusione se lo staff non capisce che a cena deve inserire totali giornalieri. Il banner esplicativo aiuta, ma serve formazione.

**Opportunita'**: la checklist fine turno (pulizia, chiusura gas, allarme) e' predisposta nel DB ma non ancora implementata. L'integrazione con i corrispettivi Excel (cross-check) aggiungerebbe un livello di controllo.

## 2.4 Gestione Acquisti (v2.0)

**Stato**: maturo e funzionante. L'import XML con anti-duplicazione e' robusto. La dashboard con drill-down e' utile per l'analisi acquisti.

**Opportunita'**: le Note di Credito XML non sono gestite. L'integrazione con il magazzino vini (carichi automatici) e' la prossima evoluzione naturale.

## 2.5 Banca (v1.0)

**Stato**: struttura solida ma probabilmente poco usato. Il cross-reference con le fatture e' l'idea piu' interessante.

**Opportunita'**: migliorare la riconciliazione automatica, aggiungere grafici Recharts (attualmente usa barre CSS), alert per pagamenti in scadenza.

## 2.6 Finanza (v1.0)

**Stato**: il modulo meno sviluppato. Ha la struttura base ma manca di contenuto significativo.

**Opportunita'**: lo scadenzario con notifiche sarebbe utile. L'integrazione con la banca per la riconciliazione e' il vero valore.

## 2.7 Dipendenti (v1.0)

**Stato**: funzionale per l'anagrafica base. I turni sono poco usati. La tabella allegati esiste ma non e' esposta.

**Opportunita'**: se i turni vengono usati davvero, serve una vista calendario mensile con drag-drop. Altrimenti il modulo puo' restare cosi'.

---

# PARTE 3: Lista Futuri Aggiornamenti e Ottimizzazioni

## Priorita' ALTA (impatto immediato sull'operativita')

### A1. Test e deploy Chiusure Turno
Testare il form in produzione con dati reali. Verificare la logica cena cumulativa, i pre-conti, le spese. Formare lo staff sull'uso.

### A2. Checklist fine turno
Implementare la configurazione checklist (i dati sono gia' predisposti nel DB). Seed di default: pulizia cucina, chiusura gas, allarme, chiusura frigo, conteggio cassa. Checkbox con note opzionali.

### A3. Carta Vini pagina web pubblica
Generare una pagina HTML statica sempre aggiornata dal DB cantina. Endpoint pubblico (no JWT) che serve l'HTML. Possibilmente un dominio tipo `carta.tregobbi.it`. Aggiornamento automatico quando cambia il DB.

### A4. Flag DISCONTINUATO nell'UI
La colonna esiste nel DB. Serve: toggle nella scheda dettaglio vino, filtro "nascondi discontinuati" in cantina e dashboard, badge visivo, esclusione dalla carta.

### A5. Backup automatico database
Cron job sul VPS che copia i 6 file SQLite su una directory di backup (con rotazione 7 giorni). Critico per evitare perdite dati.

---

## Priorita' MEDIA (miglioramenti significativi)

### B1. Sistema permessi centralizzato (task #25)
Il piu' grande refactor tecnico in sospeso. Creare `permissions.py` con matrice ruolo→azioni, dependency FastAPI `require_permission()`, hook React `usePermissions()`. Eliminerebbe decine di check sparsi.

### B2. Test automatici
Aggiungere almeno test di integrazione per gli endpoint critici (auth, chiusure turno, movimenti vini). Usare `pytest` + `httpx.AsyncClient` per testare FastAPI. Anche solo 20-30 test catturerebbero l'80% delle regressioni.

### B3. Riconciliazione banca migliorata
Il cross-ref attuale usa match ±5% importo ±10 giorni. Serve: match piu' intelligente (pattern ricorrenti), collegamento automatico per pagamenti noti, dashboard riconciliazione con "non collegati".

### B4. Export PDF riepilogo vendite
Report giornaliero/settimanale delle chiusure turno in PDF. Utile per il commercialista e per l'archivio.

### B5. Integrazione carichi vini da fatture XML
Quando una fattura di un fornitore vini viene importata, suggerire automaticamente il carico in magazzino. Risparmio di tempo enorme per la cantina.

### B6. Dashboard food cost per reparto
Separare cucina, pasticceria, bevande. Mostrare FC% per categoria di ricetta, trend prezzi ingredienti chiave, alert su variazioni significative.

---

## Priorita' BASSA (evoluzione a lungo termine)

### C1. Conto economico semplificato
Integrare vendite (corrispettivi) con acquisti (fatture XML) per calcolare un margine operativo mensile. Non deve sostituire la contabilita', ma dare una visione rapida.

### C2. Previsioni e budget
Media mobile su vendite storiche per prevedere il mese successivo. Budget configurabile vs actual. Richiede almeno 6 mesi di dati chiusure turno.

### C3. Analisi pranzo vs cena
Con le chiusure turno, si avranno dati separati. Creare dashboard comparativa: incassi, coperti, scontrino medio, composizione pagamenti.

### C4. Vista calendario turni dipendenti
Se il modulo dipendenti viene usato: griglia mensile con drag-drop, export PDF/Excel, vista settimanale, costi previsionali.

### C5. QR code carta vini
Generare QR code per ogni vino che linka alla scheda sul sito. Stampabile sulle etichette.

### C6. App mobile per lo staff
PWA (Progressive Web App) con le funzioni critiche: chiusura turno, vendita vini, consultazione cantina. L'attuale frontend React e' gia' responsive, basterebbe ottimizzare e aggiungere il manifest.

### C7. Notifiche e alert
Sistema di notifiche per: scadenze pagamenti, vini sotto soglia minima, ingredienti con variazione prezzo anomala, turni da compilare.

### C8. Storico versioni carta vini
Ogni volta che viene generata una carta, salvare il PDF con data. Archivio consultabile per confrontare carte nel tempo.

---

# PARTE 4: Debito Tecnico e Ottimizzazioni

## D1. Performance frontend
Con 80+ pagine React, il bundle size potrebbe essere importante. Valutare: lazy loading delle route (`React.lazy`), code splitting per modulo, compressione gzip su Nginx.

## D2. Performance database
Alcune query non hanno indici (es. movimenti per data, fatture per fornitore). Aggiungere indici sulle colonne usate nei filtri. Per dataset grandi (1000+ vini), spostare i filtri lato server.

## D3. Validazione dati
Il backend ha poca validazione Pydantic. Aggiungere modelli rigorosi per tutti gli endpoint che ricevono dati (es. chiusure turno: importi >= 0, turno in ["pranzo", "cena"], ecc.).

## D4. Error handling frontend
Le pagine gestiscono gli errori in modo inconsistente. Creare un componente `ErrorBoundary` e un pattern standard per mostrare errori API.

## D5. Logging strutturato
Il backend non ha logging oltre a quello di FastAPI. Aggiungere log strutturati (JSON) per: login/logout, modifiche dati critici, errori. Utile per debugging e audit.

## D6. Consistenza naming
I file usano mix di convenzioni: `admin_finance.py` vs `chiusure_turno.py`, `CorrispettiviMenu.jsx` vs `ChiusuraTurno.jsx`, `foodcost.db` vs `admin_finance.sqlite3`. Non critico, ma crea confusione.

## D7. Pulizia codice legacy
- `CorrispettiviGestione.jsx` su `/vendite/chiusure-old` — da rimuovere dopo conferma che le nuove chiusure turno funzionano
- `push.sh` duplica logica di `scripts/deploy.sh` — consolidare
- `vini_magazzino_router.py` ha il commento "per ora nessun controllo di ruolo" su FORCE import

---

# PARTE 5: Suggerimenti Architetturali

## E1. Separare i moduli in package Python
Oggi tutti i router sono in `app/routers/`. Con 22 file, diventa difficile orientarsi. Struttura suggerita:
```
app/
  modules/
    vini/
      router.py, service.py, models.py
    foodcost/
      router.py, service.py, models.py
    vendite/
      router.py, service.py, models.py
```

## E2. Ambiente di staging
Oggi si sviluppa in locale e si deploya direttamente in produzione. Un ambiente di staging (anche solo una seconda porta sul VPS) permetterebbe di testare prima del deploy.

## E3. Database migrations unificato
Estendere il `migration_runner` a tutti i database (non solo foodcost.db). Ogni DB avrebbe la sua cartella migrazioni e il tracking in una tabella `schema_migrations`.

## E4. API versioning
Non urgente con un singolo client, ma se in futuro si aggiungesse un'app mobile o un'integrazione esterna, avere `/api/v1/` come prefix sarebbe utile.

---

# Conclusione

Il sistema TRGB Gestionale ha raggiunto una buona maturita' per un progetto gestito da una singola persona. I moduli core (Vini, Acquisti, Vendite) sono solidi e usati quotidianamente. L'architettura e' semplice e manutenibile.

Le priorita' immediate sono:
1. **Testare le Chiusure Turno** in produzione (impatto sullo staff)
2. **Backup automatico** (protezione dati)
3. **Carta vini web pubblica** (valore per il ristorante)
4. **Checklist fine turno** (completare il modulo appena creato)

Le priorita' a medio termine (1-3 mesi) sono:
1. **Permessi centralizzati** (ridurre debito tecnico)
2. **Test automatici** (prevenire regressioni)
3. **Integrazione carichi vini da fatture** (automazione)
4. **Dashboard food cost per reparto** (valore operativo)

Il sistema e' ben posizionato per crescere in modo incrementale senza richiedere rifacimenti strutturali.
