# TRGB Gestionale — Roadmap & TO-DO
**Ultimo aggiornamento:** 2026-03-21

Roadmap ufficiale per lo sviluppo progressivo del gestionale.

---

# CRITICI — Sicurezza & Bug bloccanti

## 1. Auth reale (sostituire mock)
> CHIUSO (2026-03-09) — sha256_crypt hash + python-dotenv + SECRET_KEY da .env

## 2. HTTPS in produzione
- [x] Aggiornato `.env.production` a `https://trgb.tregobbi.it` — 2026-03-09
- [x] Nginx reverse proxy funzionante
- [x] Login e chiamate API in HTTPS
> CHIUSO

## 3. Endpoint senza autenticazione
> CHIUSO (2026-03-08) — tutti i router protetti con `Depends(get_current_user)`

---

# FUNZIONALI — Bug visibili

## 5–8. Bug corrispettivi, route annual, token 401, console.log
> TUTTI CHIUSI (2026-03-08)

---

# PULIZIA CODICE

## 9–12. Slugify duplicata, duplicate-check, prezzo=0, DELETE movimento senza check
> TUTTI CHIUSI (2026-03-08/09)

---

# DOCUMENTAZIONE

## 13–15. version.json, changelog, sistema-vini.md
> TUTTI CHIUSI (2026-03-08)

---

# NUOVE FUNZIONALITA' (Roadmap attiva)

## 16. Matching FE XML → Ingredienti (Fase 2)
- [x] Collegamento riga FE → ingrediente con fuzzy SequenceMatcher — 2026-03-10
- [x] UI conferma match con suggerimenti — 2026-03-10
- [x] Aggiornamento prezzo ingrediente automatico — 2026-03-10
- [x] Auto-match batch con mappings esistenti — 2026-03-10
- [x] Smart Create: creazione ingredienti in blocco da righe fattura — 2026-03-13
- [x] Esclusione fornitori e descrizioni non-ingrediente — 2026-03-13
- [ ] Gestione Note di Credito XML

## 17. Modulo Magazzino Vini
- [x] Movimenti Cantina, Edit vino, Note, Giacenze editabili, Dashboard v2.1 — 2026-03-09
- [x] Filtri locazione gerarchici cascading — 2026-03-14
- [x] Modifica massiva ordinabile + dropdown locazioni configurate — 2026-03-14
- [x] Dashboard KPI valore acquisto/carta + liste espandibili — 2026-03-14
- [x] Filtro locazione unificato (2 dropdown, ricerca cross-colonna) — 2026-03-16
- [x] Stampa selezionati diretta PDF (POST con IDs) — 2026-03-16
- [x] SchedaVino layout sidebar+main con colori dinamici per TIPOLOGIA — 2026-03-16
- [ ] Flag `DISCONTINUATO` — colonna DB aggiunta, UI edit + filtro da fare
- [ ] Filtri lato server per dataset molto grandi
- [ ] Import Excel con diff interattivo
- [ ] Integrazione carichi automatici da Fatture XML
- [ ] Integrazione FoodCost → consumo ingredienti da ricetta

## 18. Calcolo food cost nelle ricette
- [x] Calcolo costo porzione ricorsivo con sub-ricette — 2026-03-10
- [x] Conversioni unita' personalizzate per ingrediente — 2026-03-13
- [ ] Esportazione PDF ricette con costi
- [ ] Dashboard food cost per reparto (cucina/pasticceria/cocktail)
- [ ] Storico variazione costi ricette

## 19. Migrazioni DB mancanti
- [ ] Creare sistema migrazioni per `dipendenti.sqlite3`
- [ ] Migrare creazione tabelle `fe_fatture`/`fe_righe` da runtime a migrazione dedicata

## 20. Carta Vini — miglioramenti
- [x] Ordinamento tipologie/nazioni/regioni da UI — 2026-03-10
- [x] Filtri carta configurabili — 2026-03-10
- [ ] **Pagina web pubblica** — carta vini sempre aggiornata accessibile da internet
- [ ] PDF con indici cliccabili (TOC con link interni)
- [ ] Versioning della carta (storico PDF)
- [ ] Template multipli (eventi, degustazioni)

## 21. FoodCost — UI e dashboard avanzate
- [x] RicetteDashboard con 5 KPI + tabelle — 2026-03-13
- [x] RicetteSettings con export/import JSON — 2026-03-13
- [ ] Dashboard per reparto (cucina / pasticceria / cocktail)
- [ ] Storico variazione costi ricette
- [ ] Collegamento consumi → magazzino

## 22. Dipendenti — allegati
- [ ] Tabella `dipendenti_allegati` esiste ma senza endpoint ne' frontend
- [ ] Decidere se implementare o rimuovere

## 25. Sistema permessi centralizzato
- [ ] `app/core/permissions.py` con matrice permessi
- [ ] Dependency `require_role(*roles)` e `require_permission(action)`
- [ ] Azioni granulari: `vini.vendita`, `admin.utenti`, etc.
- [ ] Endpoint `GET /auth/permissions` + hook `usePermissions()`
- [ ] Pagina admin per gestire matrice permessi

## 26. Chiusure Turno — evoluzione (NUOVO)
- [x] Form chiusura fine servizio pranzo/cena — 2026-03-14
- [x] Logica cena cumulativa (totali giornalieri - pranzo = parziale cena) — 2026-03-14
- [x] Pre-conti dinamici (tavoli non battuti) — 2026-03-14
- [x] Spese dinamiche (scontrino/fattura/personale/altro) — 2026-03-14
- [x] Fondo cassa inizio/fine servizio — 2026-03-14
- [x] Lista chiusure admin con dettaglio espandibile — 2026-03-14
- [ ] Checklist fine turno configurabile (seed dati default pranzo/cena)
- [ ] Integrazione con import corrispettivi (cross-check chiusura turno vs daily_closures)
- [ ] Export PDF riepilogo giornaliero/settimanale

## 27. Cambio PIN (NUOVO)
- [x] Pagina CambioPIN self-service — 2026-03-14
- [x] Icona nel Header per accesso rapido — 2026-03-14
- [x] Admin: reset PIN qualsiasi utente a 0000 — 2026-03-14

## 30. Sincronizzazione iPratico — prodotti (NUOVO)
- [x] Import export Excel iPratico, parsing Bottiglie — 2026-03-21
- [x] Match diretto per ID 4 cifre → vini_magazzino.id (99.7%) — 2026-03-21
- [x] Mapping manuale per non-abbinati + Ignora/Ripristina — 2026-03-21
- [x] Export aggiornato: giacenze TRGB → Warehouse_quantity — 2026-03-21
- [x] Export aggiornato: nomi ricostruiti da TRGB (priorita' TRGB) — 2026-03-21
- [x] Export aggiornato: prezzi TRGB → Price_table_1 — 2026-03-21
- [x] Aggiunta vini mancanti come nuove righe nell'export — 2026-03-21
- [x] Campi default configurabili da frontend (Family, reparti, listini, prezzi) — 2026-03-21
- [x] Tile nella home Vini + tab nella nav — 2026-03-21
- [x] Download automatico DB dal VPS in push.sh — 2026-03-21
- [ ] Test completo end-to-end (import → verifica → export → reimport iPratico)
- [ ] Gestione prezzi differenziati per listino (Asporto vs Ristorante vs WebApp)
- [ ] Sync Description/Internal_name da TRGB (oltre al Name)

## 28. Modulo Banca — evoluzione
- [ ] Riconciliazione banca: match automatico movimenti → fatture (migliorare cross-ref)
- [ ] Eliminare scadenza mista BPM
- [ ] Migliorare categorizzazione scadenze
- [ ] Dashboard con grafici Recharts (sostituire barre CSS)

## 29. Modulo Finanza — evoluzione
- [ ] Scadenzario con notifiche/alert
- [ ] Integrazione con banca per riconciliazione
- [ ] Dashboard P&L semplificato

---

# Rilasci

| Versione | Contenuto | Stato |
|---------|-----------|--------|
| **2025.12** | FE XML import + Magazzino base | Completato |
| **2026.03.09** | Fix sicurezza + Auth reale + Dashboard Vini | Completato |
| **2026.03.10** | Ricette v2 + Acquisti v2 + Vendite v2 | Completato |
| **2026.03.13** | Banca v1.0 + Smart Create + Conversioni unita' | Completato |
| **2026.03.14** | Cantina v3.7 + Chiusure Turno + Cambio PIN | Completato |
| **2026.03.15** | Statistiche v1.0 + unificazione loader carta + fix delete movimenti | Completato |
| **2026.03.16** | Cantina v4.0: filtro unificato + stampa selezionati + SchedaVino sidebar | Completato |
| **2026.03.21** | iPratico Sync v2.0: import/export prodotti, match diretto, TRGB priority, default configurabili | Completato |
| **Prossimo** | Test e2e iPratico, checklist turno, carta vini pubblica, permessi centralizzati | Pianificato |

---

# Completati (storico recente)

| # | Task | Data |
|---|------|------|
| 30 | iPratico Sync v2.0: import/export, match diretto, TRGB priority, default config | 2026-03-21 |
| 17 | Cantina v4.0: filtro unificato, stampa selezionati, SchedaVino sidebar | 2026-03-16 |
| — | Statistiche v1.0 + unificazione loader + fix delete movimenti | 2026-03-15 |
| 27 | Cambio PIN self-service + reset admin | 2026-03-14 |
| 26 | Chiusure Turno complete (form + lista + cena cumulativa) | 2026-03-14 |
| 17 | Filtri locazione gerarchici + Dashboard KPI valore | 2026-03-14 |
| — | Modulo Banca v1.0 + Conversioni unita' + Smart Create UX | 2026-03-13 |
| 16 | Matching FE XML → Ingredienti (Fase 2 completa) | 2026-03-13 |
| 18 | Calcolo food cost ricorsivo + conversioni | 2026-03-10/13 |
| — | Ricette & Food Cost v2 rebuild completo | 2026-03-10 |
| — | Gestione Vendite promosso a top-level | 2026-03-10 |
| — | Gestione Acquisti promosso a top-level | 2026-03-10 |
| 1–15 | Fix sicurezza, bug, pulizia codice, docs | 2026-03-08/09 |

---

# Note operative

- Aggiornare **roadmap.md** a ogni milestone
- Inserire i completamenti nel **changelog.md**
- Per ogni commit fare riferimento al numero del task
- Aggiornare `versions.jsx` come fonte di verita' per le versioni
