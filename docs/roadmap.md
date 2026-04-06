# TRGB Gestionale — Roadmap & TO-DO
**Ultimo aggiornamento:** 2026-03-30

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

## 22. Dipendenti — allegati e buste paga
- [x] Tab Documenti unificata: allegati manuali + cedolini PDF — 2026-03-30
- [x] Endpoint documenti: GET/POST/DELETE per allegati + lista unificata — 2026-03-30
- [x] Import buste paga PDF 2-step con anteprima — 2026-03-30
- [x] Estrazione cedolini individuali con pikepdf — 2026-03-30
- [x] Auto-creazione dipendenti da LUL — 2026-03-30
- [x] Anagrafica layout riscritto: sidebar lista + area dettaglio con tab — 2026-03-30

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
- [x] Fix quadratura: mance statistiche, spese come giustificativo differenza — 2026-03-23
- [x] Saldo quadratura calcolato lato server (include dati pranzo per cena) — 2026-03-23
- [ ] Checklist fine turno configurabile (seed dati default pranzo/cena)
- [ ] **API REST Gestionali AdE**: studiare specifiche tecniche v4.0 per download automatico corrispettivi giornalieri dal portale Fatture e Corrispettivi (certificato digitale, endpoint GET, formato XML aggregati)
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

## 31. Riorganizzazione database — Fase 2
> Fase 1 completata (2026-03-28): rimossi DB morti (ingredients.sqlite3, vini.db) e model orfani.
> Fase 2 da valutare quando foodcost.db diventa un collo di bottiglia (performance, concorrenza write, o crescita moduli).

**Obiettivo:** spezzare `foodcost.db` (37+ tabelle, 5 domini) in database separati per modulo.

- [ ] **fatture.sqlite3** — fe_fatture, fe_righe, fe_categorie, fe_sottocategorie, fe_fornitore_categoria, fe_prodotto_categoria_map, matching_*, fic_config, fic_fatture, fic_sync_log
- [ ] **controllo-gestione.sqlite3** — cg_uscite, cg_spese_fisse, cg_uscite_log, banca_movimenti, banca_import_log, banca_categorie_map, banca_fatture_link
- [ ] **ipratico.sqlite3** — ipratico_imports, ipratico_categorie, ipratico_prodotti, ipratico_product_map, ipratico_sync_log, ipratico_export_defaults
- [ ] **foodcost.db** (ridotto) — ingredients, ingredient_categories, ingredient_prices, suppliers, ingredient_supplier_map, ingredient_unit_conversions, recipes, recipe_categories, recipe_items
- [ ] Script migrazione dati con backup automatico pre-split
- [ ] Aggiornare connection function per ogni modulo (get_fatture_conn, get_finanza_conn, etc.)
- [ ] Aggiornare migration_runner per gestire migrazioni multi-db
- [ ] Eliminare `vini.sqlite3` quando import Excel viene migrato a vini_magazzino direttamente

**Prerequisiti:** backup automatico funzionante, test coverage minima sui router interessati.

**Trigger per partire:** foodcost.db > 50 MB, oppure problemi di lock SQLite in concorrenza, oppure necessità di backup/restore granulare per modulo.

## 32. Modulo Prenotazioni (NUOVO — 2026-04-06)
> Specifica completa: `docs/modulo_prenotazioni.md`
> Checklist operativa: `docs/prenotazioni_todo.md`

**Obiettivo:** sostituire TheFork Manager, gestire prenotazioni dirette + widget pubblico.

- [ ] **Fase 1 — Agenda Prenotazioni** (2 sessioni): planning giornaliero, form prenotazione con autocomplete CRM, gestione stati, mini-calendario, vista settimanale
- [ ] **Fase 2 — Mappa Tavoli** (2 sessioni): editor piantina drag & drop, layout salvabili, assegnazione visuale, combinazioni tavoli, responsive tablet
- [ ] **Fase 3 — Widget Pubblico** (1-2 sessioni): pagina `tregobbi.it/prenota`, calcolo disponibilita', CAPTCHA, prenotazione online, conferma email
- [ ] **Fase 4 — Conferme e Notifiche** (1 sessione): email transazionali (conferma/reminder/cancellazione), link WhatsApp precompilati, template configurabili
- [ ] **Fase 5 — Distacco TheFork Manager** (1 sessione): import automatico TF, periodo parallelo, sostituzione widget TF con widget TRGB

**Decisioni chiave (2026-04-06):**
- DB: tutto in `clienti.sqlite3`, stessa tabella `clienti_prenotazioni`
- 14 tavoli interni + 20 esterni, ~20 combinazioni, layout cambia spesso
- Widget: slot precisi cena, fascia generica pranzo
- Conferme: email + link WA manuale (poi eventuale WA Business API)
- Colore tema: indigo

## 28. Modulo Flussi di Cassa (ex Banca) — evoluzione
- [x] Rename Banca → Flussi di Cassa (routes, nav, modules.json) — 2026-03-30
- [x] Contanti + Mance spostati da Vendite a Flussi di Cassa — 2026-03-30
- [x] Movimenti Contanti: pagamento spese in contanti (sub-tab) — 2026-03-30
- [x] Carta di Credito: scheletro UI pronto — 2026-03-30
- [ ] Riconciliazione banca: match automatico movimenti → fatture (migliorare cross-ref)
- [ ] Eliminare scadenza mista BPM
- [ ] Migliorare categorizzazione scadenze
- [ ] Dashboard con grafici Recharts (sostituire barre CSS)
- [ ] Multi-conto corrente (struttura predisposta, UI da implementare)
- [ ] Carta di Credito: import estratto conto, riconciliazione con CG uscite
- [ ] Movimenti Contanti: annullamento pagamento, filtri avanzati

---

# Rilasci

| Versione | Contenuto | Stato |
|---------|-----------|--------|
| **2025.12** | FE XML import + Magazzino base | Completato |
| **2026.03.09** | Fix sicurezza + Auth reale + Dashboard Vini | Completato |
| **2026.03.10** | Ricette v2 + Acquisti v2 + Vendite v2 | Completato |
| **2026.03.13** | Banca v1.0 (ora Flussi di Cassa) + Smart Create + Conversioni unita' | Completato |
| **2026.03.14** | Cantina v3.7 + Chiusure Turno + Cambio PIN | Completato |
| **2026.03.15** | Statistiche v1.0 + unificazione loader carta + fix delete movimenti | Completato |
| **2026.03.16** | Cantina v4.0: filtro unificato + stampa selezionati + SchedaVino sidebar | Completato |
| **2026.03.21** | iPratico Sync v2.0: import/export prodotti, match diretto, TRGB priority, default configurabili | Completato |
| **2026.03.30** | Sessione 18: Dipendenti v2.1, CG v1.2, Flussi di Cassa v1.1, Sistema v5.0 (flyout header) | Completato |
| **2026.04.06** | Sessione 22: Clienti CRM v2.0 (coppie, duplicati, segmenti, impostazioni, pulizia dati) | Completato |
| **Prossimo** | Modulo Prenotazioni v1.0 (Agenda), poi Tavoli, Widget, Notifiche | Pianificato |

---

# Completati (storico recente)

| # | Task | Data |
|---|------|------|
| — | Sistema v5.0: Header flyout, Impostazioni standalone, modulesMenu.js | 2026-03-30 |
| — | Flussi di Cassa v1.1: rename Banca, Contanti+Mance, Movimenti Contanti | 2026-03-30 |
| — | CG v1.2: sync import, stato contanti PAGATA, cleanFatt, fix ricerca | 2026-03-30 |
| 22 | Dipendenti v2.1: Buste Paga import PDF, Anagrafica v2.0, Tab Documenti | 2026-03-30 |
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
