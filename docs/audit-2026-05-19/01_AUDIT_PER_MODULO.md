# Audit per modulo

> Convenzioni:
> - **Audience manuale**: `end-user` (chi usa la app ogni giorno: sala/sommelier/chef), `manager` (Marco e admin: configurazione, report), `entrambi`, `nessuno` (capability di sola infrastruttura).
> - **Stato docs**: ✅ allineato · ⚠️ parziale · ❌ obsoleto · 👻 fantasma (docs cita feature inesistente) · 🆕 non documentato (feature reale, assente dai docs).
> - I riferimenti codice sono nella forma `path/file.ext:linea`. Per i router citiamo la riga della dichiarazione del decoratore.
> - Quando una capability è esposta via più endpoint (lista + dettaglio + edit), citiamo solo l'entry point significativo.

---

## Modulo: vini (Cantina Vini)
**Path:** `app/routers/vini_*.py`, `app/routers/ipratico_products_router.py`, `app/routers/bevande_router.py`, `app/services/carta_vini_service.py`, `app/services/carta_bevande_service.py`, `app/services/wine_pricing.py`, `frontend/src/pages/vini/`
**Priorità manuale:** Alta · **LOC stimate:** ~7.300 backend + ~6.000 frontend
**Stato post-cutover V.6+V.7+V.8 (mig 133, 2026-05-19):** anagrafiche refactorate in 6 tabelle relazionali (`vini_madre`, `vini_bottiglie`, `vini_produttori`, `vini_fornitori`, `vini_denominazioni`, `vini_vitigni`). UI v2 promossa a default.

### Capability rilevate (raggruppate)

#### Sottomodulo A — Cantina (giacenze e anagrafica bottiglie)

**C-V-001 — Visualizzare la cantina (lista bottiglie con filtri)**
- **Chi:** end-user (tutti i ruoli logati)
- **Trigger:** UI `CantinaV2.jsx` su `/vini/v2/cantina`, modalità Bottiglie · `GET /vini/v2/bottiglie/`
- **Effetto:** elenca bottiglie con JOIN su madre/produttore/denominazione, filtri (testo, tipologia, regione, stato vendita, fornitore, range giacenza)
- **Precondizioni:** utente autenticato
- **Codice:** `app/routers/vini_v2_router.py:80`
- **Audience:** end-user
- **Stato docs:** ✅ — `docs/modulo_vini.md` §3 e §"STATO POST-CUTOVER"

**C-V-002 — Vista madri raggruppate (etichette con annate nested)**
- **Trigger:** UI `CantinaV2.jsx`, modalità Madri · `GET /vini/v2/madri-raggruppate/`
- **Effetto:** lista vini-madre con array `annate` nested (1 madre → N bottiglie)
- **Codice:** `app/routers/vini_v2_router.py:234`
- **Audience:** end-user · **Docs:** ✅

**C-V-003 — Dashboard Cantina v2 (statistiche aggregate)**
- **Trigger:** UI `DashboardVini.jsx` su `/vini/dashboard` · `GET /vini/v2/dashboard/` + `GET /vini/magazzino/dashboard`
- **Effetto:** KPI stock, vendite, alert giacenza zero, top venduti, distribuzione tipologie
- **Codice:** `app/routers/vini_v2_router.py:327` + `app/routers/vini_magazzino_router.py:393`
- **Audience:** entrambi · **Docs:** ✅ §4 + `docs/modulo_vini_widget_dashboard.md`

**C-V-004 — Wizard "+ Nuovo Vino" (4 step Produttore → Madre → Annata → Giacenze)**
- **Trigger:** UI `NuovoVinoV2.jsx` su `/vini/v2/nuovo` · POST a `/vini/anagrafiche/produttori/`, `/madre/`, `/bottiglia/`, `/vini/cantina-tools/matrice/assegna`
- **Effetto:** crea anagrafica produttore (se nuova) → madre (se nuova, con vitigni strutturati) → bottiglia (annata) → assegna celle matrice
- **Precondizioni:** utente autenticato, ruolo admin/sommelier per scrittura anagrafica
- **Validazioni:** ANNATA ≤ anno corrente, almeno produttore + madre + formato
- **Codice:** `app/routers/vini_anagrafiche_router.py:842` (`POST /bottiglia/`)
- **Audience:** end-user (sommelier) · **Docs:** ✅ §"Wizard"

**C-V-005 — Scheda dettaglio bottiglia (anagrafica + giacenze + movimenti + note)**
- **Trigger:** UI `SchedaVino.jsx` su `/vini/v2/bottiglia/:id` · `GET /vini/v2/bottiglie/{bid}` + `GET /vini/magazzino/{vino_id}` + `/{vino_id}/movimenti|note`
- **Codice:** `app/routers/vini_v2_router.py:217` + `app/routers/vini_magazzino_router.py:699`
- **Audience:** end-user · **Docs:** ✅ §3.3

**C-V-006 — Modifica anagrafica vino**
- **Trigger:** `PATCH /vini/magazzino/{vino_id}` da SchedaVino "Modifica anagrafica"
- **Effetto:** aggiorna tutti i campi modificabili; se cambia QTA_TOTALE crea RETTIFICA automatica
- **Codice:** `app/routers/vini_magazzino_router.py:729`
- **Audience:** end-user (sommelier) · **Docs:** ✅ §3.3.1

**C-V-007 — Bulk-update vini (admin)**
- **Trigger:** UI tabellona admin · `PATCH /vini/magazzino/bulk-update`
- **Effetto:** modifica massiva su lista di vini selezionati
- **Precondizioni:** ruolo admin
- **Codice:** `app/routers/vini_magazzino_router.py:413`
- **Audience:** manager · **Docs:** ⚠️ parziale — citato come "tabellona modifica massiva" §3.1 ma manca elenco campi modificabili

**C-V-008 — Duplica vino (singolo / bulk)**
- **Trigger:** UI scheda · `POST /vini/magazzino/{vino_id}/duplica` + `POST /vini/magazzino/bulk-duplicate`
- **Effetto:** copia anagrafica, azzera giacenze su nuovo record
- **Codice:** `app/routers/vini_magazzino_router.py:439, 472`
- **Audience:** end-user · **Docs:** ✅

**C-V-009 — Elimina vino (admin, con cascade)**
- **Trigger:** `DELETE /vini/magazzino/delete-vino/{vino_id}` (ruolo admin)
- **Codice:** `app/routers/vini_magazzino_router.py:513` · **Docs:** ✅

**C-V-010 — Registra movimento cantina (CARICO/SCARICO/VENDITA/RETTIFICA/MODIFICA)**
- **Trigger:** UI SchedaVino → tab Movimenti · `POST /vini/magazzino/{vino_id}/movimenti`
- **Effetto:** crea movimento con snapshot `prezzo_unitario` (mig 129), ricalcola QTA_TOTALE
- **Codice:** `app/routers/vini_magazzino_router.py:832`
- **Audience:** end-user · **Docs:** ✅ §3.4

**C-V-011 — Storico movimenti globale**
- **Trigger:** UI `RegistroMovimenti.jsx` · `GET /vini/magazzino/movimenti-globali`
- **Codice:** `app/routers/vini_magazzino_router.py:537` · **Docs:** ✅

**C-V-012 — Elimina movimento (con ricalcolo)**
- **Trigger:** UI scheda movimenti · `DELETE /vini/magazzino/movimenti/{movimento_id}`
- **Codice:** `app/routers/vini_magazzino_router.py:878` · **Docs:** ✅

**C-V-013 — Note operative su vino**
- **Trigger:** `GET/POST/DELETE /vini/magazzino/{vino_id}/note`
- **Codice:** `app/routers/vini_magazzino_router.py:1022-1056` · **Docs:** ✅ §3.3.4

**C-V-014 — Ordini pending (riordini suggeriti)**
- **Trigger:** Widget dashboard riordini · `GET/POST/DELETE /vini/magazzino/ordini-pending|/{vino_id}/ordine-pending`
- **Effetto:** upsert ordine pending per vino, lista globale
- **Codice:** `app/routers/vini_magazzino_router.py:907-933`
- **Audience:** entrambi · **Docs:** ✅ §4 + `modulo_vini_widget_dashboard.md`

**C-V-015 — Storico prezzi listino con grafico**
- **Trigger:** `GET /vini/magazzino/{vino_id}/prezzi-storico` (via `POST` versione legacy `vini_magazzino_router.py:957, 989`)
- **Audience:** entrambi · **Docs:** ✅ §3.3.5

**C-V-016 — Statistiche vendite per vino**
- **Trigger:** `GET /vini/magazzino/{vino_id}/stats`
- **Codice:** `app/routers/vini_magazzino_router.py:710` · **Docs:** ✅ §4

#### Sottomodulo B — Anagrafiche (V.6+V.7+V.8)

CRUD admin-only per le 5 entità relazionali (produttori, fornitori, denominazioni, vitigni, madre) con merge duplicati.

**C-V-017 — Hub Anagrafiche (5 tab CRUD)**
- **Trigger:** UI `AnagraficheHub.jsx` su `/vini/anagrafiche` · `GET /vini/anagrafiche/stats/` + endpoint per ogni entità
- **Codice:** `app/routers/vini_anagrafiche_router.py:230` (stats), `:238` (produttori), `:336` (fornitori), `:420` (denominazioni), `:564` (vitigni), `:648` (madre)
- **Audience:** manager · **Docs:** ✅

**C-V-018 — Crea/modifica/elimina produttore/fornitore/denominazione/vitigno/madre (admin)**
- **Trigger:** UI 5 panel · `POST/PATCH/DELETE` su rispettivo endpoint
- **Codice:** `app/routers/vini_anagrafiche_router.py:298-321, 382-405, 448-549, 614-633, 668-763`
- **Precondizioni:** ruolo admin · **Audience:** manager · **Docs:** ✅

**C-V-019 — Merge duplicati anagrafica (5 entità)**
- **Trigger:** UI panel · `POST /vini/anagrafiche/{entity}/{source_id}/merge?target_id=N`
- **Effetto:** fonde 2 anagrafiche, sposta tutti i riferimenti su target, elimina source
- **Codice:** `app/routers/vini_anagrafiche_router.py:268, 361, 471, 589`
- **Precondizioni:** ruolo admin · **Audience:** manager · **Docs:** ✅

**C-V-020 — Promozione "madre legacy" a composto strutturato**
- **Trigger:** modal "Sistema il madre" nel wizard step 3 · `POST /vini/anagrafiche/madre/{mid}/promote-composto`
- **Codice:** `app/routers/vini_anagrafiche_router.py:706`
- **Audience:** manager · **Docs:** ✅ (concetto 3 §"STATO POST-CUTOVER")

**C-V-021 — Sync denominazioni da eAmbrosia + PDF MASAF (admin)**
- **Trigger:** UI Anagrafiche · `POST /vini/anagrafiche/denominazioni/sync`
- **Effetto:** scarica/aggiorna 1637 denominazioni DOC/DOCG/IGT/AOC
- **Codice:** `app/routers/vini_anagrafiche_router.py:527`, service `app/services/vini_denominazioni_sync.py`
- **Audience:** manager · **Docs:** ✅

**C-V-022 — Sync-all anagrafiche → bottiglie**
- **Trigger:** `POST /vini/anagrafiche/sync-all`
- **Effetto:** propaga modifiche anagrafica sui campi cache delle bottiglie
- **Codice:** `app/routers/vini_anagrafiche_router.py:882` · **Audience:** manager · **Docs:** ✅

**C-V-023 — Rollback distruttivo tabelle _v2 (admin, ora storico)**
- **Trigger:** `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES`
- **Effetto:** droppa tabelle `_v2` (post-cutover non esistono più → no-op safe)
- **Codice:** `app/routers/vini_anagrafiche_router.py:904`
- **Audience:** manager (admin) · **Docs:** ✅ — documentato come "storico" §"Endpoint backend principali"

**C-V-024 — Migrate-from-legacy (re-clustering one-shot)**
- **Trigger:** `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true`
- **Codice:** `app/routers/vini_anagrafiche_router.py:500`
- **Audience:** nessuno (utility one-shot esaurita) · **Docs:** ✅ (marcato "storico")

#### Sottomodulo C — Carta Vini (cliente, staff, PDF, DOCX)

**C-V-025 — Preview HTML Carta Vini (cliente)**
- **Trigger:** UI `CartaBevande.jsx` su `/vini/carta` · `GET /vini/carta` + `GET /vini/carta/html`
- **Codice:** `app/routers/vini_router.py:68, 119`
- **Audience:** end-user (sala) · **Docs:** ✅ §5

**C-V-026 — Dati JSON Carta Vini per pagina cliente pubblica**
- **Trigger:** pagina pubblica cliente (no JWT) · `GET /vini/carta-cliente/data`
- **Codice:** `app/routers/vini_router.py:132` · **Audience:** end-user (cliente esterno) · **Docs:** ⚠️ parziale — citato ma non c'è dettaglio della pagina pubblica

**C-V-027 — Export PDF Carta Vini (cliente)**
- **Trigger:** `GET /vini/carta/pdf`
- **Effetto:** WeasyPrint PDF brandizzato (font Cormorant Garamond)
- **Codice:** `app/routers/vini_router.py:299` · **Audience:** end-user · **Docs:** ✅ §5

**C-V-028 — Export PDF Carta Vini per staff**
- **Trigger:** `GET /vini/carta/pdf-staff`
- **Effetto:** vista sommelier con prezzo costo + locazione
- **Codice:** `app/routers/vini_router.py:345` · **Audience:** end-user · **Docs:** ✅

**C-V-029 — Export DOCX Carta Vini**
- **Trigger:** `GET /vini/carta/docx`
- **Codice:** `app/routers/vini_router.py:396` · **Audience:** end-user · **Docs:** ✅

**C-V-030 — Vista sommelier in carta (locazione + status calice)**
- **Trigger:** UI `CartaStaff.jsx` su `/vini/carta-staff` · `GET /vini/magazzino/carta-staff/`
- **Codice:** `app/routers/vini_magazzino_router.py:569`
- **Audience:** end-user (sommelier) · **Docs:** ⚠️ parziale — docs nota "da rifare completamente (task V.22)"

**C-V-031 — Calici disponibili (bottiglie aperte in mescita)**
- **Trigger:** UI Cantina Bottiglie · `GET /vini/magazzino/calici-disponibili/`
- **Codice:** `app/routers/vini_magazzino_router.py:655` · **Audience:** end-user · **Docs:** ✅

#### Sottomodulo D — Carta Bevande (sub-module)

**C-V-032 — CRUD sezioni bevande (7 sezioni: Aperitivi, Birre, Distillati, Tisane, Tè, Amari fatti in casa, Amari & Liquori)**
- **Trigger:** UI panel bevande · `GET/PUT /bevande/sezioni|/sezioni/{key}` + `POST /sezioni/reorder`
- **Codice:** `app/routers/bevande_router.py:218-303` · **Audience:** manager · **Docs:** ✅ §6

**C-V-033 — CRUD voci bevande (CRUD singola voce)**
- **Trigger:** UI · `GET/POST/PUT/DELETE /bevande/voci/[/{voce_id}]` + `POST /voci/reorder`
- **Codice:** `app/routers/bevande_router.py:303-503` · **Audience:** manager · **Docs:** ✅

**C-V-034 — Bulk-import voci bevande da testo**
- **Trigger:** UI · `POST /bevande/voci/bulk-import`
- **Codice:** `app/routers/bevande_router.py:503` · **Audience:** manager · **Docs:** ✅

**C-V-035 — Preview / Export Carta Bevande unificata (HTML / PDF / PDF-staff / DOCX)**
- **Trigger:** `GET /bevande/carta`, `/bevande/carta/pdf`, `/bevande/carta/pdf-staff`, `/bevande/carta/docx`
- **Codice:** `app/routers/bevande_router.py:619, 628, 652, 676` · **Audience:** end-user · **Docs:** ✅ §6

**C-V-036 — Preview singola sezione bevande**
- **Trigger:** `GET /bevande/sezioni/{key}/preview` · **Codice:** `app/routers/bevande_router.py:694` · **Docs:** ✅

#### Sottomodulo E — Impostazioni Carta (filtri, tabellati)

**C-V-037 — Configurazione tipologie / nazioni / regioni / formati ordinabili**
- **Trigger:** UI `ViniImpostazioni.jsx` su `/vini/settings` · `GET/POST /settings/vini/tipologie|nazioni|regioni|formati`
- **Codice:** `app/routers/vini_settings_router.py:44-169`
- **Audience:** manager · **Docs:** ✅

**C-V-038 — Configurazione filtri carta (gerarchia visualizzazione)**
- **Trigger:** `GET/POST /settings/vini/filtri`
- **Codice:** `app/routers/vini_settings_router.py:214, 253` · **Audience:** manager · **Docs:** ✅

**C-V-039 — Reset settings carta**
- **Trigger:** `POST /settings/vini/reset`
- **Codice:** `app/routers/vini_settings_router.py:302` · **Audience:** manager · **Docs:** ⚠️ parziale — l'azione esiste ma docs non dettaglia cosa resetta

**C-V-040 — Widget settings Cantina (dashboard config)**
- **Trigger:** `GET/PUT /settings/vini/widget/` + `POST /widget/reset`
- **Codice:** `app/routers/vini_settings_router.py:337, 343, 365`
- **Audience:** manager · **Docs:** ✅ in `modulo_vini_widget_dashboard.md`

#### Sottomodulo F — Pricing (markup Listino → Carta → Calice)

**C-V-041 — Tabella markup breakpoints**
- **Trigger:** UI Impostazioni · `GET/POST /vini/pricing/breakpoints` + `POST /breakpoints/reset`
- **Codice:** `app/routers/vini_pricing_router.py:103-125`
- **Audience:** manager · **Docs:** ✅

**C-V-042 — Calcolo prezzo carta da costo listino**
- **Trigger:** wizard "Nuovo Vino" step 3 · `POST /vini/pricing/calcola`
- **Effetto:** applica curva markup → `prezzo_carta`
- **Codice:** `app/routers/vini_pricing_router.py:134` · **Audience:** end-user · **Docs:** ✅

**C-V-043 — Anteprima ricalcolo prezzi (senza salvare)**
- **Trigger:** `GET /vini/pricing/preview`
- **Codice:** `app/routers/vini_pricing_router.py:154` · **Audience:** manager · **Docs:** ✅

**C-V-044 — Ricalcolo PREZZO_CARTA su tutti i vini con EURO_LISTINO**
- **Trigger:** `POST /vini/pricing/ricalcola-tutti`
- **Codice:** `app/routers/vini_pricing_router.py:197` · **Audience:** manager · **Docs:** ✅

**C-V-045 — Ricalcolo PREZZO_CALICE su tutti i vini**
- **Trigger:** `POST /vini/pricing/ricalcola-calici`
- **Effetto:** `prezzo_calice = prezzo_carta / N step K` (configurabile via widget_settings)
- **Codice:** `app/routers/vini_pricing_router.py:293` · **Audience:** manager · **Docs:** ✅

#### Sottomodulo G — Import / Export Excel + Sync iPratico

**C-V-046 — Reset DB cantina (azzeramento totale, admin)**
- **Trigger:** `POST /vini/cantina-tools/reset-database` · **Codice:** `app/routers/vini_cantina_tools_router.py:153`
- **Audience:** manager (admin) · **Docs:** ⚠️ parziale (non dettaglia conferme richieste)

**C-V-047 — Download template Excel v2**
- **Trigger:** `GET /vini/cantina-tools/template-v2` · **Codice:** `app/routers/vini_cantina_tools_router.py:197` · **Docs:** ✅

**C-V-048 — Import vini da template Excel v2 (skip se id esiste)**
- **Trigger:** UI Settings Import · `POST /vini/cantina-tools/import-v2` · **Codice:** `:216` · **Docs:** ✅

**C-V-049 — Export vini in formato template Excel v2**
- **Trigger:** `GET /vini/cantina-tools/export-v2` · **Codice:** `:257` · **Docs:** ✅

**C-V-050 — Cleanup duplicati cantina**
- **Trigger:** `POST /vini/cantina-tools/cleanup-duplicates` · **Codice:** `:292` · **Audience:** manager · **Docs:** ⚠️ parziale (no dettaglio criteri match duplicati)

**C-V-051 — Upload listino prodotti iPratico (Excel)**
- **Trigger:** UI iPraticoSync · `POST /vini/ipratico/upload`
- **Effetto:** parsa file iPratico, popola tabella mapping
- **Codice:** `app/routers/ipratico_products_router.py:111` · **Audience:** manager · **Docs:** ✅ §7

**C-V-052 — Mappatura prodotti iPratico ↔ bottiglie TRGB**
- **Trigger:** UI iPraticoSync · `GET /vini/ipratico/mappings` + `PUT /mappings/{map_id}` + `PUT /ignore/{map_id}`
- **Codice:** `app/routers/ipratico_products_router.py:206-281` · **Audience:** manager · **Docs:** ✅

**C-V-053 — Export Excel verso iPratico (lista vini TRGB priority)**
- **Trigger:** `POST /vini/ipratico/export` · **Codice:** `app/routers/ipratico_products_router.py:328` · **Docs:** ✅

**C-V-054 — Lista vini mancanti in iPratico**
- **Trigger:** `GET /vini/ipratico/missing` · **Codice:** `:488` · **Docs:** ✅

**C-V-055 — Log sync iPratico + stats**
- **Trigger:** `GET /vini/ipratico/sync-log` + `/stats` · **Codice:** `:527, 536` · **Docs:** ✅

**C-V-056 — Default export iPratico (config)**
- **Trigger:** `GET/PUT /vini/ipratico/export-defaults` · **Codice:** `:587, 606` · **Docs:** ✅ §7

#### Sottomodulo H — Locazioni fisiche e Matrice scaffali

**C-V-057 — Config locazioni fisiche (Frigorifero, Locazione 1/2/3)**
- **Trigger:** UI Impostazioni · `GET /vini/cantina-tools/locazioni-config` + `POST /locazioni-config/{campo}` + `DELETE /{campo}/{item_id}`
- **Codice:** `:1369, 1387, 1443` · **Audience:** manager · **Docs:** ✅ §3.2 (filtro locazione v4)

**C-V-058 — Normalizzazione locazioni con mapping**
- **Trigger:** `POST /vini/cantina-tools/locazioni-normalizza` · **Codice:** `:1510`
- **Audience:** manager · **Docs:** ⚠️ parziale (citato ma manca esempio uso)

**C-V-059 — Vini per valore locazione + verifica giacenza pre-svuotamento**
- **Trigger:** `GET /vini/cantina-tools/locazioni-vini/{campo}` + `POST /locazioni-check-giacenze`
- **Codice:** `:1564, 1603` · **Docs:** ✅

**C-V-060 — Aggiorna locazione singolo vino**
- **Trigger:** `POST /vini/cantina-tools/locazioni-vino-update` · **Codice:** `:1652` · **Docs:** ✅

**C-V-061 — Matrice celle scaffali (UI MatricePicker)**
- **Trigger:** UI scheda vino → tab "Posizione scaffali" · `GET /matrice/stato|/celle/{vino_id}` + `POST /matrice/assegna|/rimuovi|/set-celle`
- **Codice:** `:1690-1751` · **Audience:** end-user · **Docs:** ✅ (concetto 5 §"STATO POST-CUTOVER")

**C-V-062 — Tool migrazione matrice (preview + recalc + import old)**
- **Trigger:** `GET /matrice/recalc-preview|/old-values` + `POST /matrice/recalc-all|/import-old`
- **Codice:** `:1771-1842` · **Audience:** manager · **Docs:** ⚠️ parziale (toolset di migrazione storica, non dettagliato)

#### Sottomodulo I — Stampa inventario filtrato (PDF)

**C-V-063 — Inventario completo PDF**
- **Trigger:** `GET /vini/cantina-tools/inventario/pdf` · **Codice:** `:758` · **Docs:** ✅ §9

**C-V-064 — Inventario con giacenza PDF**
- **Trigger:** `GET /vini/cantina-tools/inventario/giacenza/pdf` · **Codice:** `:809` · **Docs:** ✅

**C-V-065 — Inventario per locazione PDF**
- **Trigger:** `GET /vini/cantina-tools/inventario/locazioni/pdf` · **Codice:** `:855` · **Docs:** ✅

**C-V-066 — Inventario filtrato componibile PDF**
- **Trigger:** `GET /vini/cantina-tools/inventario/filtrato/pdf` + `GET /filtri-options`
- **Codice:** `:1056, 1221` · **Audience:** entrambi · **Docs:** ✅

**C-V-067 — Inventario per selezione di ID (PDF)**
- **Trigger:** `POST /vini/cantina-tools/inventario/selezione/pdf` · **Codice:** `:1160` · **Docs:** ✅

#### Sottomodulo J — Backup cantina (tool-side)

**C-V-068 — Backup manuale DB cantina**
- **Trigger:** `POST /vini/cantina-tools/backup/create` · **Codice:** `:1873`
- **Audience:** manager (admin) · **Docs:** ⚠️ parziale — esiste ma docs non lo separa dal backup globale

**C-V-069 — Lista / restore / delete backup cantina**
- **Trigger:** `GET /backup/list`, `POST /backup/restore/{ts}`, `DELETE /backup/{ts}` · **Codice:** `:1895, 1929, 1966` · **Docs:** ⚠️ parziale

#### Sottomodulo K — Autocomplete e helper

**C-V-070 — Autocomplete ricerca vini**
- **Trigger:** vari · `GET /vini/magazzino/autocomplete` · **Codice:** `:553` · **Docs:** ✅

**C-V-071 — Movimenti aggregati per vino-madre + statistiche madre + storico prezzi**
- **Trigger:** vista madre · `GET /vini/v2/madre/{mid}/movimenti|stats|prezzi-storico`
- **Codice:** `app/routers/vini_v2_router.py:394, 447, 569` · **Docs:** ✅

### Feature morte / disabilitate

- `vini_v2_router.py` (modulo "Gestione Vino 2 — test parallelo") era nato per affiancare la cantina classica durante il refactor V.6+V.7+V.8. **Post-cutover (mig 133, 2026-05-18/19) è promosso a default** e la cantina classica è deprecata. I file `*_legacy.jsx` (`MagazzinoVini_legacy`, `MagazzinoViniDettaglio_legacy`, `CantinaTools_legacy`, `MovimentiCantina_legacy`, ecc.) restano nel repo ma non sono importati. Da rimuovere in cleanup V-H.I.
- Endpoint `POST /vini/anagrafiche/rollback` e `POST /migrate-from-legacy` sono utility one-shot esaurite post-cutover. Restano accessibili ma fanno no-op.
- `app/models/vini_db.py` deprecato (pre-v3.0), non più importato. Da rimuovere.
- `app/models/vini_model.py` ridotto a stub `NotImplementedError` post V-H.J.
- Campo `DISCONTINUATO` rimosso in V-H.E mig 124 (sostituito da `STATO_VENDITA=0`).
- Tabella `vini_magazzino_legacy_20260518` — safety net pre-cutover, read-only.

### Note tecniche per il refactoring docs

- `docs/modulo_vini.md` è **molto allineato** al codice (aggiornato 2026-05-19, stessa data del cutover). Eccellente esempio di docs per-modulo.
- `docs/modulo_vini_widget_dashboard.md` documenta la storia (14 fasi) dei widget dashboard — utile come ADR storico, da archiviare a refactor completato.
- Mancano **due cose** dai docs:
  1. Riferimento esplicito alla pagina pubblica cliente `/vini/carta-cliente/data` (chi la consuma? c'è una pagina FE specifica?). Verificare in `frontend/src/pages/public/`.
  2. Specifica completa di `bulk-update`: quali campi modificabili, vincoli, ruolo.
- I file `*_legacy.jsx` archiviati dovrebbero essere rimossi formalmente dopo n settimane di stabilità del cutover (V-H.I task pendente).

---

## Modulo: ricette (Ricette / Foodcost / Selezioni del Giorno)
**Path:** `app/routers/foodcost_*.py`, `app/routers/scelta_*_router.py`, `app/routers/piatti_giorno_router.py`, `app/services/allergeni_service.py`, `app/services/foodcost_history_service.py`, `frontend/src/pages/ricette/`, `frontend/src/pages/selezioni/`
**Priorità manuale:** Alta
**LOC stimate:** ~6.000 backend + ~5.000 frontend

### Capability rilevate

#### Sottomodulo A — Ingredienti
- **C-R-001** — Lista ingredienti con prezzo corrente · `GET /foodcost/ingredients/` · `foodcost_ingredients_router.py:300` · Audience: end-user · Docs: ✅
- **C-R-002** — Creazione ingrediente (con allergeni, supplier map, conversioni) · `POST /foodcost/ingredients/` · `:364` · Docs: ✅
- **C-R-003** — Modifica ingrediente · `PUT /foodcost/ingredients/{id}` · `:467` · Docs: ✅
- **C-R-004** — Categorie ingredienti · `GET/POST /foodcost/ingredients/categories` · `:242, 259` · Docs: ✅
- **C-R-005** — Lista unità di misura disponibili · `GET /foodcost/ingredients/units` · `:226` · Docs: ✅
- **C-R-006** — Lista fornitori dell'ingrediente · `GET /foodcost/ingredients/suppliers` · `:517` · Docs: ✅
- **C-R-007** — Storico prezzi per ingrediente · `GET /foodcost/ingredients/{id}/prezzi` · `:558` · Docs: ✅
- **C-R-008** — Aggiungi/elimina prezzo manuale · `POST/DELETE /foodcost/ingredients/{id}/prezzi[/prezzi/{pid}]` · `:577, 623` · Docs: ✅
- **C-R-009** — Conversioni unità per ingrediente (es. 1 kg = 12 pz) · `GET/POST/DELETE /foodcost/ingredients/{id}/conversions` · `:663, 680, 736` · Audience: manager · Docs: ✅ §7

#### Sottomodulo B — Ricette (anagrafica + foodcost)
- **C-R-010** — Lista ricette con foodcost calcolato real-time · `GET /foodcost/ricette` · `foodcost_recipes_router.py:835` · Docs: ✅
- **C-R-011** — Dettaglio ricetta · `GET /foodcost/ricette/{id}` · `:943` · Docs: ✅
- **C-R-012** — Crea ricetta · `POST /foodcost/ricette` + `POST /ricette/quick` · `:956, 1222` · Docs: ✅
- **C-R-013** — Modifica ricetta (replace items) · `PUT /foodcost/ricette/{id}` · `:1088` · Docs: ✅
- **C-R-014** — Clone ricetta · `POST /foodcost/ricette/{id}/clone` · `:1555` · Docs: ⚠️ parziale (non menzionato)
- **C-R-015** — Soft delete ricetta · `DELETE /foodcost/ricette/{id}` · `:1531` · Docs: ✅
- **C-R-016** — Categorie ricette · `GET/POST /foodcost/ricette/categorie` · `:632, 642` · Docs: ✅
- **C-R-017** — Lista ricette base (sub-ricette) · `GET /foodcost/ricette/basi` · `:815` · Docs: ✅ §2.1
- **C-R-018** — Servizi (Service Types) — CRUD · `GET/POST/PUT/DELETE /foodcost/service-types[/{id}]` · `:1406, 1429, 1470, 1508` · Audience: manager · Docs: ⚠️ parziale (concetto Service Types non sviscerato)
- **C-R-019** — Associa ricetta a servizi · `PUT /foodcost/ricette/{id}/servizi` · `:1302` · Docs: ⚠️ parziale
- **C-R-020** — Ricalcolo allergeni singola ricetta · `POST /foodcost/ricette/{id}/ricalcola-allergeni` · `:1345` · Docs: ⚠️ parziale (allergeni non dettagliati)
- **C-R-021** — Ricalcolo allergeni di tutte le ricette · `POST /foodcost/ricette/ricalcola-allergeni-tutti` · `:1366` · Docs: ⚠️ parziale
- **C-R-022** — Storico foodcost ricetta · `GET /foodcost/ricette/{id}/storico-fc` · `:1383` · Docs: ⚠️ parziale
- **C-R-023** — Export JSON ricette (backup) · `GET /foodcost/ricette/export/json` · `:745` · Audience: manager · Docs: ⚠️ parziale
- **C-R-024** — PDF ricetta · `GET /foodcost/ricette/{id}/pdf` · `:1668` · Audience: end-user (chef) · Docs: ⚠️ parziale (PDF ricetta non menzionato esplicitamente)
- **C-R-025** — Dashboard stats ricette · `GET /foodcost/ricette/stats/dashboard` · `:675` · Docs: ✅

#### Sottomodulo C — Matching fatture → ingredienti
- **C-R-026** — Lista righe fattura non associate · `GET /foodcost/matching/pending` · `foodcost_matching_router.py:212` · Audience: manager · Docs: ✅ §6
- **C-R-027** — Suggerimenti fuzzy per riga · `GET /foodcost/matching/suggest?riga_id=X` · `:271` · Docs: ✅
- **C-R-028** — Suggerimenti Smart Create (con grouping) · `GET /foodcost/matching/smart-suggest` · `:979` · Docs: ✅
- **C-R-029** — Conferma match (salva mapping + prezzo) · `POST /foodcost/matching/confirm` · `:363` · Docs: ✅
- **C-R-030** — Auto-match batch · `POST /foodcost/matching/auto` · `:463` · Docs: ✅
- **C-R-031** — Bulk-create ingredienti da righe non matchate · `POST /foodcost/matching/bulk-create` · `:1135` · Docs: ✅
- **C-R-032** — Lista mapping attivi · `GET /foodcost/matching/mappings` · `:559` · Docs: ✅
- **C-R-033** — Elimina mapping · `DELETE /foodcost/matching/mappings/{id}` · `:591` · Docs: ✅
- **C-R-034** — Fornitori matching info · `GET /foodcost/matching/suppliers` · `:623` · Docs: ✅
- **C-R-035** — Escludi/includi fornitore dal matching · `POST /foodcost/matching/suppliers/toggle-exclusion` · `:678` · Audience: manager · Docs: ✅ §9 (campo `escluso` solo modulo Ricette — CLAUDE.md regola critica)
- **C-R-036** — Ignora descrizione non-ingrediente · `POST /foodcost/matching/ignore-description` · `:738` · Docs: ✅
- **C-R-037** — Lista descrizioni ignorate · `GET /foodcost/matching/ignored-descriptions` · `:789` · Docs: ✅
- **C-R-038** — Elimina esclusione descrizione · `DELETE /foodcost/matching/ignored-descriptions/{id}` · `:809` · Docs: ✅

#### Sottomodulo D — Selezioni del Giorno (Scelta del Macellaio/Salumi/Formaggi/Pescato + Piatti del Giorno)
Sub-modulo con 5 router gemelli: stessa struttura (lista, CRUD taglio, CRUD categoria, config).

- **C-R-039 … C-R-043** — Scelta del Macellaio (tagli carne) · `scelta_macellaio_router.py:166-388` · Endpoints CRUD `/macellaio/` + categorie + config + flag venduto · Audience: end-user (chef, sala) · Docs: 🆕 non documentato esplicitamente (esiste `docs/modulo_selezioni.md` ma riguarda /vendite, non queste selezioni del giorno) — **gap docs**
- **C-R-044 … C-R-048** — Scelta dei Salumi · `scelta_salumi_router.py:200-476` (+ flag `attivo`/`venduto`) · Docs: 🆕
- **C-R-049 … C-R-053** — Scelta dei Formaggi · `scelta_formaggi_router.py:206-513` · Docs: 🆕
- **C-R-054 … C-R-058** — Scelta del Pescato (pesce/crostacei/molluschi) · `scelta_pescato_router.py:177-406` · Docs: 🆕
- **C-R-059 … C-R-062** — Piatti del Giorno (5a zona "Selezioni del Giorno", mig 107) · `piatti_giorno_router.py:174-407` · Docs: 🆕

### Feature morte / disabilitate
- Endpoint `PATCH /salumi|formaggi/{id}/venduto` marcati `deprecated=True` (`:311, 349`). Sostituiti dal flag `attivo`.

### Note tecniche per refactoring docs
- `docs/modulo_ricette_foodcost.md` ben allineato sui sottomoduli A/B/C, ma manca trattazione completa di: **clone**, **service-types**, **allergeni**, **storico-fc**, **PDF ricetta**, **export JSON**.
- **GAP NOMENCLATURA CRITICO:** `docs/modulo_selezioni.md` non riguarda le "Selezioni del Giorno" (sub-modulo ricette) ma il modulo Vendite/Cassa. Marco chiama "selezioni" entrambe le cose semanticamente diverse. Da chiarire nel manuale + rinominare uno dei due docs file. Vedi `02_GAP_REPORT.md` punto NOMEN-1.
- I 5 router "scelta_*" + "piatti_giorno" hanno struttura quasi identica: candidato a factory/generic router in refactor R8 (4-5 router → 1 router parametrico).

---

## Modulo: acquisti (Fatture / FE / FIC)
**Path:** `app/routers/fe_import.py`, `app/routers/fe_categorie_router.py`, `app/routers/fe_proforme_router.py`, `app/routers/fattureincloud_router.py`, `app/services/fatture_stato_service.py`, `frontend/src/pages/admin/Fatture*`
**Priorità manuale:** Alta
**LOC stimate:** ~5.500 backend

### Capability

#### Sottomodulo A — Import fatture XML e proforme
- **C-A-001** — Import fatture XML SDI (batch upload) · `POST /contabilita/fe/import` · `fe_import.py:669` · Audience: manager · Docs: ✅ `docs/modulo_fatture_xml.md`
- **C-A-002** — Upload XML aggiuntivo per fattura esistente · `POST` `:734` · Docs: ✅
- **C-A-003** — Elimina fattura · `DELETE` `:845` · Docs: ✅
- **C-A-004** — Lista fatture filtrate · `GET` `:864` · Audience: entrambi · Docs: ✅ `docs/modulo_acquisti.md`
- **C-A-005** — Dettaglio fattura + righe · `GET` `:1214` · Docs: ✅
- **C-A-006** — Modifica metadata fattura (`PUT`) · `:1061` · Docs: ✅
- **C-A-007** — Modifica righe fattura (categoria, importo) · `PUT` `:2388, 2475` · Docs: ✅
- **C-A-008** — Export Excel fatture · `GET` `:1419` · Docs: ⚠️ parziale (export menzionato ma senza dettaglio filtri)
- **C-A-009** — Stats fatture (drill/KPI/per-categoria/top-fornitori/confronto/anomalie) · `GET /stats/drill|/kpi|/per-categoria|/top-fornitori|/confronto-annuale|/anomalie` · `fe_import.py:1899-2282` · Audience: manager · Docs: ✅
- **C-A-010** — Recovery: import manuale by file · `POST` `:977` · Docs: ⚠️ parziale
- **C-A-011** — Refetch righe da XML per fattura FIC senza dettaglio · `POST /fic/refetch-righe-xml/{db_id}` + bulk · `fattureincloud_router.py:1328, 1355` · Docs: ⚠️ parziale (recovery operation)

#### Sottomodulo B — Categorie fornitori + sotto-categorie
- **C-A-012** — Albero categorie/sottocategorie · `GET/POST/PUT/DELETE /contabilita/fe/categorie[/{id}]` · `fe_categorie_router.py:129-198` · Audience: manager · Docs: ✅
- **C-A-013** — CRUD sotto-categoria + sposta · `:211-273` · Docs: ✅
- **C-A-014** — Lista fornitori con categoria + assegnazione · `GET /fornitori` + `POST /fornitori/assegna` · `:328, 368` · Docs: ✅
- **C-A-015** — Escludi/includi fornitore (acquisti) · `POST /fornitori/escludi-acquisti` · `:494` · **NB:** campo `escluso_acquisti`, separato da `escluso` (modulo ricette) — vedi CLAUDE.md regola critica
- **C-A-016** — Escludi fornitore (legacy ricette) · `POST /fornitori/escludi` · `:433` · Docs: ✅ (regola critica)
- **C-A-017** — Prodotti del fornitore + stats · `GET /fornitori/{piva}/prodotti|/stats` · `:565, 695` · Docs: ✅
- **C-A-018** — Assegna categoria a prodotto fornitore · `POST /fornitori/prodotti/assegna` · `:640` · Docs: ✅
- **C-A-019** — Stats per categoria · `GET /categorie/stats` · `:724` · Docs: ✅

#### Sottomodulo C — Proforme (fatture in attesa di emissione)
- **C-A-020** — Lista proforme · `GET /contabilita/fe/proforme` · `fe_proforme_router.py:144` · Docs: ⚠️ parziale (proforme citate in `docs/modulo_acquisti.md` ma flusso non dettagliato)
- **C-A-021** — Dettaglio + CRUD proforma · `GET/POST/PUT/DELETE /proforme/[/{id}]` · `:214, 245, 349, 434` · Docs: ⚠️
- **C-A-022** — Riconcilia proforma con fattura definitiva · `POST /proforme/{id}/riconcilia` + `dissocia` · `:484, 555` · Audience: manager · Docs: ⚠️
- **C-A-023** — Candidati fatture per riconciliazione · `GET /proforme/{id}/candidates` · `:624` · Docs: ⚠️
- **C-A-024** — Ricerca fornitori per autocompletamento · `GET /proforme/fornitori/search` · `:92` · Docs: ✅

#### Sottomodulo D — Fatture in Cloud (sync API)
- **C-A-025** — Stato connessione FIC · `GET /fic/status` · `fattureincloud_router.py:137` · Audience: manager · Docs: 🆕 non documentato (no doc dedicato per FIC integration)
- **C-A-026** — Connetti FIC (salva token) · `POST /fic/connect` · `:180` · Docs: 🆕
- **C-A-027** — Disconnetti FIC · `POST /fic/disconnect` · `:226` · Docs: 🆕
- **C-A-028** — Sync fatture FIC → `fe_fatture` · `POST /fic/sync` + count/progress · `:501, 467, 495` · Docs: 🆕
- **C-A-029** — Lista fatture FIC sincronizzate · `GET /fic/fatture` · `:868` · Docs: 🆕
- **C-A-030** — Storico sync + warnings + dettaglio + marca visto/unvisto · `GET /fic/sync-log`, `/warnings`, `/warnings/count`, `/warnings/{id}`, `POST /warnings/{id}/visto|/unvisto` · `:924-1069` · Docs: 🆕 (referenziato in `problemi.md` A1 ma non in modulo)
- **C-A-031** — Lista fornitori FIC live · `GET /fic/fornitori` · `:1095` · Docs: 🆕
- **C-A-032** — Debug raw FIC · `GET /fic/debug-detail/{fic_id}` · `:1133` · Audience: manager (admin) · Docs: 🆕

### Feature morte / disabilitate
Nessuna evidente in questo modulo.

### Note tecniche per refactoring docs
- L'integrazione **Fatture in Cloud** è completa lato codice (12 endpoint) ma non ha un proprio file docs. Il modulo `acquisti` ha 2 docs (`modulo_acquisti.md` + `modulo_fatture_xml.md`) che parlano principalmente di SDI/XML, lasciando FIC scoperto. Da aprire `modulo_fatture_in_cloud.md` o sezione dedicata.
- Le **proforme** hanno flusso completo (riconcilia/dissocia/candidates) ma docs sono parziali.

---

## Modulo: controllo_gestione
**Path:** `app/routers/controllo_gestione_router.py`, `app/services/stati_pagamento.py`, `app/services/conto_economico.py`, `app/services/liquidita_service.py`, `frontend/src/pages/controllo-gestione/`
**Priorità manuale:** Alta · **LOC backend:** ~4.300

### Capability

#### Sottomodulo A — Dashboard e analisi
- **C-CG-001** — Dashboard CG (KPI + grafici) · `GET /controllo-gestione/dashboard` · `controllo_gestione_router.py:74` · Audience: manager · Docs: ✅ `docs/modulo_controllo_gestione.md`
- **C-CG-002** — Conto Economico aggregato · `GET /controllo-gestione/conto-economico` · `:334` · Docs: ✅

#### Sottomodulo B — Uscite (fatture passive + spese varie)
- **C-CG-003** — Lista uscite con filtri · `GET /controllo-gestione/uscite` · `:840` · Audience: manager · Docs: ✅
- **C-CG-004** — Import uscite (CSV/Excel) · `POST /controllo-gestione/uscite/import` · `:454` · Docs: ✅
- **C-CG-005** — Scadenzario unificato · `GET /controllo-gestione/scadenze` · `:1120` · Docs: ✅

#### Sottomodulo C — Stato pagamento (3 dimensioni — CLAUDE.md regola critica)
- **C-CG-006** — Modifica stato pagamento uscita (D1+D2) · `PUT /controllo-gestione/uscita/{id}/stato-pagamento` · `:3570` · Audience: manager · Docs: ✅ `docs/stato_pagamento_unificato.md`
- **C-CG-007** — Sposta scadenza (D3 — non cambia D1) · `PUT /uscite/{id}/scadenza` · `:2909` · Docs: ✅
- **C-CG-008** — Ripristina data scadenza originale · `PUT /uscite/{id}/ripristina-data` · `:3039` · Docs: ✅
- **C-CG-009** — Cambia IBAN uscita · `PUT /uscite/{id}/iban` · `:3136` · Docs: ⚠️ parziale
- **C-CG-010** — Cambia modalità pagamento uscita · `PUT /uscite/{id}/modalita-pagamento` · `:3202` · Docs: ⚠️ parziale
- **C-CG-011** — Segna come pagata manualmente (uscita) · `POST /uscite/segna-pagate-bulk` · `:3265` · Docs: ✅
- **C-CG-012** — Segna fattura come pagata manualmente · `POST /fattura/{fattura_id}/segna-pagata-manuale` · `:3687` · Docs: ✅

#### Sottomodulo D — Pagamenti batch
- **C-CG-013** — Batch pagamento (crea/lista/dettaglio/edit/delete) · `POST /uscite/batch-pagamento` + `GET/PUT/DELETE /pagamenti-batch[/{id}]` · `:3317-3535` · Audience: manager · Docs: ✅

#### Sottomodulo E — Riconciliazione banca ↔ uscite
- **C-CG-014** — Candidati banca per uscita · `GET /uscite/{id}/candidati-banca` · `:2669` · Docs: ✅ `docs/spec_riconciliazione.md`
- **C-CG-015** — Uscite da riconciliare · `GET /uscite/da-riconciliare` · `:2741` · Docs: ✅
- **C-CG-016** — Ricerca movimenti banca per uscita · `GET /uscite/{id}/ricerca-banca` · `:2830` · Docs: ✅
- **C-CG-017** — Riconcilia uscita ↔ banca · `POST /uscite/{id}/riconcilia` + `DELETE` rollback · `:3762, 3835` · Docs: ✅

#### Sottomodulo F — Contanti
- **C-CG-018** — Paga uscita in contanti · `POST /uscite/{id}/paga-contanti` · `:3880` · Docs: ✅
- **C-CG-019** — Cambia canale pagamento uscita · `POST /uscite/{id}/cambia-canale` · `:3950` · Docs: ✅
- **C-CG-020** — Paga uscita con carta · `POST /uscite/{id}/paga-carta` · `:4021` · Docs: ⚠️ parziale
- **C-CG-021** — Movimenti contanti · `GET /movimenti-contanti` · `:4095` · Docs: ✅
- **C-CG-022** — Uscite da pagare (filtro stato) · `GET /uscite-da-pagare` · `:4140` · Docs: ✅

#### Sottomodulo G — Spese fisse + piano rate + adeguamenti
- **C-CG-023** — Lista spese fisse · `GET /spese-fisse` · `:1496` · Audience: manager · Docs: ✅
- **C-CG-024** — Template CSV import spese fisse · `GET /spese-fisse/template-csv` · `:1588` · Docs: ✅
- **C-CG-025** — Dettaglio/CRUD spesa fissa · `GET/POST/PUT/DELETE /spese-fisse[/{id}]` · `:1632, 1643, 1792, 1883` · Docs: ✅
- **C-CG-026** — Piano rate (CRUD) · `GET/POST/DELETE /spese-fisse/{id}/piano-rate[/{rid}]` · `:1954, 2121, 2219` · Docs: ✅
- **C-CG-027** — Import CSV spese fisse · `POST /spese-fisse/import-csv` · `:2278` · Docs: ✅
- **C-CG-028** — Storico spesa fissa · `GET /spese-fisse/{id}/storico` · `:2573` · Docs: ✅
- **C-CG-029** — Adeguamento spesa fissa (modifica importo dataforte) · `POST /spese-fisse/{id}/adeguamento` + `GET /adeguamenti` · `:4187, 4270` · Docs: ⚠️ parziale

#### Sottomodulo H — Fornitori — condizioni pagamento
- **C-CG-030** — Condizioni pagamento fornitore · `GET/PUT /fornitore/{piva}/pagamento` · `:1256, 1355` · Audience: manager · Docs: ✅
- **C-CG-031** — Preset condizioni pagamento (CRUD) · `GET/POST/PUT/DELETE /condizioni-pagamento/preset[/{id}]` · `:1414, 1431, 1451, 1475` · Docs: ✅

### Feature morte / disabilitate
- Nessuna evidente.

### Note tecniche per refactoring docs
- Il modulo è il più grande per LOC ed endpoint (~50 endpoint in un singolo router). `docs/modulo_controllo_gestione.md` copre il "core", ma alcuni endpoint operativi (cambia-canale, paga-carta, iban, modalita-pagamento, adeguamenti) sono parziali.
- `docs/stato_pagamento_unificato.md` e `docs/spec_riconciliazione.md` sono già docs spec-level allineate al codice — buon esempio.

---

## Modulo: banca
**Path:** `app/routers/banca_router.py`, `frontend/src/pages/banca/`
**Priorità manuale:** Alta · **LOC backend:** ~2.100

### Capability

#### Sottomodulo A — Import / Movimenti
- **C-B-001** — Import movimenti banca (CSV/Excel) · `POST /banca/import` · `banca_router.py:237` · Audience: manager · Docs: ✅ `docs/modulo_banca.md`
- **C-B-002** — Lista movimenti banca · `GET /banca/movimenti` · `:399` · Docs: ✅
- **C-B-003** — Cambia categoria movimento · `PATCH /banca/movimenti/{id}/categoria` · `:460` · Docs: ✅
- **C-B-004** — Dashboard banca · `GET /banca/dashboard` · `:482` · Docs: ✅
- **C-B-005** — Andamento conto · `GET /banca/andamento` · `:2060` · Docs: ✅
- **C-B-006** — Storico import + log · `GET /banca/import-log` · `:2041` · Docs: ✅

#### Sottomodulo B — Categorizzazione (mapping → categorie)
- **C-B-007** — Lista categorie movimenti · `GET /banca/categorie` · `:568` · Docs: ✅
- **C-B-008** — Mapping descrizione → categoria · `POST /banca/categorie/map` + `DELETE /map/{id}` · `:597, 622` · Docs: ✅

#### Sottomodulo C — Cross-ref (riconciliazione con CG/fatture/spese)
- **C-B-009** — Vista cross-ref · `GET /banca/cross-ref` · `:717` · Docs: ✅
- **C-B-010** — Crea/elimina link movimento ↔ uscita · `POST /cross-ref/link` + `DELETE /link/{id}` · `:1083, 1166` · Docs: ✅
- **C-B-011** — Chiudi/riapri movimento (parcheggio) · `POST /cross-ref/chiudi/{id}` + `/riapri/{id}` · `:1247, 1292` · Docs: ✅
- **C-B-012** — Parcheggia bulk + disparcheggia · `POST /cross-ref/parcheggia-bulk|/disparcheggia/{id}` · `:1325, 1350` · Docs: ✅
- **C-B-013** — Search cross-ref · `GET /cross-ref/search` · `:1369` · Docs: ✅
- **C-B-014** — Lista categorie cross-ref · `GET /cross-ref/categorie` · `:1523` · Docs: ✅

#### Sottomodulo D — Registrazione manuale (per movimenti senza fattura corrispondente)
- **C-B-015** — Categorie di registrazione (CRUD + toggle) · `GET/POST/PUT/PATCH /categorie-registrazione[/{id}/toggle]` · `:1542, 1553, 1571, 1585` · Audience: manager · Docs: ✅
- **C-B-016** — Auto-suggerisci categoria per movimento · `GET /cross-ref/auto-categoria/{id}` · `:1601` · Docs: ✅
- **C-B-017** — Registra movimento (singolo / bulk) + delete · `POST /cross-ref/registra[/bulk]` + `DELETE /registra/{id}` · `:1621, 1697, 1755` · Docs: ✅

#### Sottomodulo E — Pulizia / Duplicati
- **C-B-018** — Lista duplicati · `GET /banca/duplicati` · `:1876` · Audience: manager · Docs: ✅ (mig 041-042)
- **C-B-019** — Elimina duplicato (mantieni keep_id) · `DELETE /banca/duplicati/{keep_id}` · `:1970` · Docs: ✅

### Feature morte / disabilitate
- Nessuna evidente.

### Note
- `docs/modulo_banca.md` ben allineato.

---

## Modulo: cassa (Selezioni / Vendite)
**Path:** `app/routers/admin_finance.py`, `app/routers/chiusure_turno.py`, `app/routers/closures_config_router.py`, `app/services/admin_finance_*.py`, `app/services/corrispettivi_*.py`, `frontend/src/pages/admin/` (cartella mista con altri admin tools)
**Priorità manuale:** Alta · **LOC backend:** ~5.000

### Capability

#### Sottomodulo A — Corrispettivi (import storico + export)
- **C-C-001** — Import corrispettivi (Excel/file) · `POST /admin/finance/import-corrispettivi-file` · `admin_finance.py:198` · Audience: manager · Docs: ✅ `docs/modulo_selezioni.md` (NB: il file ha nome misleading — vedi NOMEN-1)
- **C-C-002** — Export corrispettivi · `GET /admin/finance/export-corrispettivi` · `:264` · Docs: ✅
- **C-C-003** — Template corrispettivi · `GET /admin/finance/template-corrispettivi` · `:297` · Docs: ✅

#### Sottomodulo B — Chiusure giornaliere
- **C-C-004** — Dettaglio chiusura giornaliera · `GET /admin/finance/daily-closures/{date}` · `:319` · Docs: ✅
- **C-C-005** — Crea/aggiorna chiusura giornaliera · `POST /admin/finance/daily-closures` · `:395` · Docs: ✅
- **C-C-006** — Segna chiusura come "chiusa" · `POST /admin/finance/daily-closures/{date}/set-closed` · `:592` · Docs: ✅
- **C-C-007** — Stats mensili / annuali / confronto · `GET /admin/finance/stats/monthly|/annual|/annual-compare` · `:992, 1315, 1330` · Audience: manager · Docs: ✅
- **C-C-008** — Top giorni (best/worst) · `GET /admin/finance/stats/top-days` · `:1371` · Docs: ✅

#### Sottomodulo C — Cash flow giornaliero / opening balance
- **C-C-009** — Cash daily (giornaliero contanti) · `GET /admin/finance/cash/daily` · `:1537` · Docs: ✅
- **C-C-010** — Cash flow (visualizzazione + baseline) · `GET /admin/finance/cash/flow` + `/baseline` · `:1975, 1849, 1859` · Docs: ✅
- **C-C-011** — Opening balance annuale · `GET/PUT /admin/finance/cash/opening-balance[/{year}]` · `:2598, 2621` · Docs: ✅
- **C-C-012** — Spese baseline (per categoria) · `GET/PUT /admin/finance/cash/spese/baseline` · `:1930, 1940` · Docs: ⚠️ parziale

#### Sottomodulo D — Cash deposits (versamenti) + match banca
- **C-C-013** — Crea/lista/elimina deposito contanti · `POST /admin/finance/cash/deposit` + `GET /cash/deposits` + `DELETE /cash/deposit/{id}` · `:2248, 2290, 2271` · Audience: manager · Docs: ✅
- **C-C-014** — Match candidati banca per deposito · `GET /admin/finance/cash/deposit/bank-matches` · `:2175` · Docs: ✅

#### Sottomodulo E — Cash expenses (uscite cassa contanti)
- **C-C-015** — CRUD uscita cassa contanti · `POST/DELETE /admin/finance/cash/expense[/{id}]` · `:2368, 2393` · Docs: ⚠️ parziale
- **C-C-016** — Lista uscite cassa · `GET /admin/finance/cash/expenses` · `:2414` · Docs: ⚠️ parziale
- **C-C-017** — Categorie uscite cassa (CRUD) · `GET/POST/PUT/DELETE /admin/finance/cash/expense-categor[ies/y][/{id}]` · `:2468-2550` · Docs: ⚠️ parziale

#### Sottomodulo F — Chiusure turno (pre-conti, spese fine turno)
- **C-C-018** — Storico pre-conti (superadmin) · `GET /admin/finance/shift-closures/preconti` · `chiusure_turno.py:261` · Docs: ⚠️ parziale (referenziato in roadmap)
- **C-C-019** — Storico spese fine turno · `GET /admin/finance/shift-closures/spese` · `:321` · Docs: ⚠️ parziale
- **C-C-020** — Stats giornalieri coperti+incassi · `GET /admin/finance/shift-closures/stats/daily` · `:394` · Docs: ⚠️ parziale
- **C-C-021** — Checklist config (CRUD) · `GET/POST/PATCH/DELETE /admin/finance/shift-closures/config[/{id}]` · `:529, 573, 635, 703` · Docs: ⚠️ parziale
- **C-C-022** — Lista chiusure turno · `GET /admin/finance/shift-closures/` · `:740` · Docs: ⚠️ parziale
- **C-C-023** — Dettaglio chiusura turno · `GET /admin/finance/shift-closures/{date}/{turno}` · `:924` · Docs: ⚠️ parziale
- **C-C-024** — Crea chiusura turno · `POST /admin/finance/shift-closures/` · `:1088` · Docs: ⚠️ parziale
- **C-C-025** — Elimina chiusura turno · `DELETE /admin/finance/shift-closures/{id}` · `:1438` · Docs: ⚠️ parziale

#### Sottomodulo G — Config chiusure (giorno settimanale + ferie)
- **C-C-026** — Get/Put config chiusure locale · `GET/PUT /settings/closures-config/` · `closures_config_router.py:58, 63` · Audience: manager · Docs: 🆕 (non documentato in modulo_selezioni.md)

### Feature morte / disabilitate
Nessuna evidente.

### Note tecniche per refactoring docs
- `docs/modulo_selezioni.md` (nome misleading: copre /vendite NON le selezioni del giorno) ha solo Fase 1 documentata, fasi 2-5 in roadmap.
- Le **chiusure turno** (pre-conti + spese fine turno + checklist) sono un sotto-sistema completo (~12 endpoint) ma è documentato in modo molto parziale. Aprire `modulo_chiusure_turno.md` o estendere modulo_selezioni.md.
- Confusione semantica "selezioni": Marco le chiama allo stesso modo per (a) sub-modulo ricette = scelta giorno e (b) modulo cassa = corrispettivi venduti. **Da decidere nel manuale come distinguerle.**

---

## Modulo: dipendenti (Anagrafiche + Turni + Buste Paga)
**Path:** `app/routers/dipendenti.py`, `app/routers/reparti.py`, `app/routers/turni_router.py`, `app/services/turni_service.py`, `app/services/elab_parser.py` (cedolini LUL), `app/services/f24_parser.py`, `frontend/src/pages/dipendenti/`
**Priorità manuale:** Alta · **LOC backend:** ~7.000

### Capability

#### Sottomodulo A — Anagrafica dipendenti
- **C-D-001** — Lista dipendenti · `GET /dipendenti/` · `dipendenti.py:242` · Audience: manager · Docs: ✅ `docs/modulo_dipendenti.md`
- **C-D-002** — Crea/modifica/elimina dipendente · `POST/PUT/DELETE /dipendenti/[/{id}]` · `:298, 388, 496` · Docs: ✅
- **C-D-003** — Settings modulo dipendenti · `GET/PUT /dipendenti/settings/[/{key}]` · `:65, 82` · Docs: ✅
- **C-D-004** — Documenti dipendente (lista, upload, delete, download) · `GET/POST/DELETE /dipendenti/{id}/documenti[/{doc_id}]` + `GET /documenti/{id}/download` · `:2313, 2360, 2409, 2434` · Audience: manager · Docs: ⚠️ parziale (documenti citati ma flusso upload non dettagliato)

#### Sottomodulo B — Reparti
- **C-D-005** — CRUD reparti · `GET/POST/PUT/DELETE /reparti/[/{id}]` · `reparti.py:82-224` · Audience: manager · Docs: ✅

#### Sottomodulo C — Turni (vecchio router `/dipendenti/turni/*`)
- **C-D-006** — Tipi turno (CRUD) · `GET/POST/PUT/DELETE /dipendenti/turni/tipi[/{id}]` · `dipendenti.py:530, 572, 638, 720` · Docs: ✅ `docs/modulo_dipendenti_turni.md`
- **C-D-007** — Calendario turni (vecchio) · `GET/POST/PUT/DELETE /dipendenti/turni/calendario[/{id}]` · `:749, 824, 928, 1066` · Docs: ✅

#### Sottomodulo D — Turni v2 (`/turni/*`)
- **C-D-008** — Foglio turni (vista settimanale) · `GET /turni/foglio` · `turni_router.py:157` · Audience: end-user (capireparto) + manager · Docs: ✅
- **C-D-009** — Assegna turno (drag&drop) · `POST /turni/foglio/assegna` · `:177` · Docs: ✅
- **C-D-010** — Modifica/cancella turno · `PUT/DELETE /turni/foglio/{id}` · `:307, 410` · Docs: ✅
- **C-D-011** — Ore nette per dipendente · `GET /turni/ore-nette` · `:430` · Docs: ✅
- **C-D-012** — Copia settimana · `POST /turni/copia-settimana` · `:444` · Docs: ✅
- **C-D-013** — Mese / dipendente / "miei turni" · `GET /turni/chiusure|/mese|/dipendente|/miei-turni` · `:464, 476, 502, 533` · Docs: ✅
- **C-D-014** — Conflitti turno · `GET /turni/conflitti` · `:569` · Docs: ✅
- **C-D-015** — Assenze (tipi + CRUD) · `GET /turni/assenze/tipi|/` + `POST/DELETE /assenze/[/{id}]` · `:595, 603, 620, 639` · Docs: ✅
- **C-D-016** — PDF foglio turni · `GET /turni/foglio/pdf` · `:693` · Audience: entrambi · Docs: ✅
- **C-D-017** — Template turno (CRUD + applica) · `GET/POST/PUT/DELETE /turni/template[/{id}]` + `POST /template/{id}/applica` · `:861-932` · Docs: ✅
- **C-D-018** — Pubblica settimana turni · `POST /turni/pubblica` · `:958` · Docs: ✅
- **C-D-019** — Riepilogo per dipendente · `GET /turni/riepilogo-dipendenti` · `:977` · Docs: ✅

#### Sottomodulo E — Scadenze documenti
- **C-D-020** — CRUD scadenze documenti dipendente · `GET/POST/PUT/DELETE /dipendenti/scadenze[/{id}]` · `dipendenti.py:1127, 1193, 1231, 1262` · Audience: manager · Docs: ✅

#### Sottomodulo F — Buste paga / cedolini LUL
- **C-D-021** — Lista buste paga · `GET /dipendenti/buste-paga` · `:1285` · Audience: manager · Docs: ✅
- **C-D-022** — Crea busta paga manuale · `POST /dipendenti/buste-paga` · `:1362` · Docs: ✅
- **C-D-023** — Scadenze mancanti · `GET /dipendenti/buste-paga/scadenze-mancanti` · `:1539` · Docs: ✅
- **C-D-024** — Rigenera scadenza · `POST /dipendenti/buste-paga/{id}/rigenera-scadenza` · `:1614` · Docs: ⚠️ parziale
- **C-D-025** — Elimina busta paga · `DELETE /dipendenti/buste-paga/{id}` · `:1664` · Docs: ✅
- **C-D-026** — Test PDF + anteprima PDF (per debug template) · `POST /buste-paga/test-pdf|/anteprima-pdf` · `:1677, 1888` · Audience: manager (admin) · Docs: 🆕 (utility test non documentata)
- **C-D-027** — Conferma import (post-anteprima) · `POST /buste-paga/conferma-import` · `:2008` · Docs: ✅
- **C-D-028** — Scarica PDF busta paga · `GET /buste-paga/{id}/pdf` · `:2270` · Audience: end-user (dipendente vede solo le sue, manager tutte) · Docs: ✅
- **C-D-029** — Import PDF cedolini (LUL/Paghe) · `POST /buste-paga/import-paghe-pdf` · `:2778` · Audience: manager · Docs: ✅ (parser in `app/services/elab_parser.py`)
- **C-D-030** — Costi mensili dipendenti (aggregato) · `GET /dipendenti/costi-mensili` · `:2905` · Docs: ✅
- **C-D-031** — Stato import mensile · `GET /buste-paga/stato-import-mensile` · `:3092` · Docs: ✅
- **C-D-032** — Auto-create buste paga mancanti · `POST /buste-paga/auto-create-mancanti` · `:3181` · Docs: ⚠️ parziale
- **C-D-033** — Rematch consuntivo buste paga · `POST /buste-paga/rematch-consuntivo` · `:3293` · Docs: ⚠️ parziale

### Feature morte / disabilitate
- Endpoint `/dipendenti/turni/calendario/*` (vecchio router) coesiste con `/turni/foglio/*` (nuovo). Verificare se vecchio è ancora usato dal FE o se è in deprecation.

### Note tecniche per refactoring docs
- 2 file docs (`modulo_dipendenti.md` + `modulo_dipendenti_turni.md`) coprono il modulo, ma c'è sovrapposizione su "turni".
- Diversi endpoint admin-only utility (`test-pdf`, `anteprima-pdf`, `rematch-consuntivo`, `auto-create-mancanti`) non sono documentati o lo sono parzialmente.
- Mancano docs su flusso documenti dipendente (upload allegati).

---

## Modulo: prenotazioni (+ Preventivi + Menu Templates)
**Path:** `app/routers/prenotazioni_router.py`, `app/routers/preventivi_router.py`, `app/routers/menu_templates_router.py`, `app/services/preventivi_service.py`, `app/services/menu_templates_service.py`, `frontend/src/pages/prenotazioni/`, `frontend/src/pages/admin/Preventivi*`
**Priorità manuale:** Alta · **LOC backend:** ~3.500

### Capability

#### Sottomodulo A — Prenotazioni
- **C-P-001** — Planning giornaliero · `GET /prenotazioni/planning/{data}` · `prenotazioni_router.py:172` · Audience: end-user (sala) · Docs: ✅ `docs/modulo_prenotazioni.md`
- **C-P-002** — Settimana · `GET /prenotazioni/settimana/{data}` · `:273` · Docs: ✅
- **C-P-003** — Calendario mensile · `GET /prenotazioni/calendario/{anno}/{mese}` · `:337` · Docs: ✅
- **C-P-004** — Crea prenotazione · `POST /prenotazioni/` · `:379` · Docs: ✅
- **C-P-005** — Modifica prenotazione · `PUT /prenotazioni/{id}` · `:1055` · Docs: ✅
- **C-P-006** — Cambia stato prenotazione (confermata/annullata/no-show…) · `PATCH /prenotazioni/{id}/stato` · `:1124` · Docs: ✅
- **C-P-007** — Cancella prenotazione · `DELETE /prenotazioni/{id}` · `:1171` · Docs: ✅
- **C-P-008** — Config prenotazioni · `GET/PUT /prenotazioni/config` · `:454, 467` · Audience: manager · Docs: ✅
- **C-P-009** — Search clienti (autocomplete) · `GET /prenotazioni/clienti/search` · `:491` · Docs: ✅
- **C-P-010** — Link WA conferma prenotazione · `GET /prenotazioni/{id}/wa-link` · `:1200` · Audience: end-user · Docs: ✅ (mattone M.C)

#### Sottomodulo B — Tavoli e layout sala
- **C-P-011** — Lista tavoli · `GET /prenotazioni/tavoli` · `:529` · Docs: ✅
- **C-P-012** — Disponibili per data+turno · `GET /tavoli/disponibili/{data}/{turno}` · `:559` · Docs: ✅
- **C-P-013** — CRUD tavoli · `POST/PUT/DELETE /tavoli[/{id}]` · `:659, 687, 752` · Docs: ✅
- **C-P-014** — Batch posizioni tavoli (drag&drop layout) · `PUT /tavoli/batch/posizioni` · `:721` · Docs: ✅
- **C-P-015** — Layout sala (CRUD + attiva) · `GET/POST/PUT/DELETE /tavoli/layout[/{id}]` + `/attiva` · `:771, 784, 806, 826, 871` · Audience: manager · Docs: ✅
- **C-P-016** — Combinazioni tavoli (per gruppi grandi) · `GET/POST/DELETE /tavoli/combinazioni[/{id}]` · `:890, 903, 921` · Docs: ✅
- **C-P-017** — Mappa tavoli per data+turno · `GET /tavoli/mappa/{data}/{turno}` · `:940` · Docs: ✅
- **C-P-018** — Assegna tavolo a prenotazione · `PUT /tavoli/assegna/{pren_id}` · `:1029` · Docs: ✅

#### Sottomodulo C — Preventivi eventi
- **C-P-019** — Lista preventivi + stats · `GET /preventivi` + `/stats` · `preventivi_router.py:201, 222` · Audience: manager · Docs: ✅ `docs/modulo_preventivi.md`
- **C-P-020** — Config luoghi · `GET/PUT /preventivi/config/luoghi` · `:232, 237` · Docs: ✅
- **C-P-021** — Template preventivo (CRUD) · `GET /template/lista` + `POST/PUT/DELETE /template[/{id}]` · `:247, 252, 258, 268` · Docs: ✅
- **C-P-022** — CRUD preventivo · `GET/POST/PUT/DELETE /preventivi[/{id}]` · `:281, 289, 298, 310` · Docs: ✅
- **C-P-023** — Cambia stato preventivo · `POST /preventivi/{id}/stato` · `:319` · Docs: ✅
- **C-P-024** — Duplica preventivo · `POST /preventivi/{id}/duplica` · `:331` · Docs: ✅
- **C-P-025** — Menu righe (CRUD + ordine) · `GET/POST/PUT/DELETE /preventivi/{id}/menu-righe[/{rid}]` + `PUT /menu-righe` (replace all) + `PUT /menu-sconto` · `:344-390` · Docs: ✅
- **C-P-026** — Menu multi (più menu per preventivo) (CRUD + duplica + ordine) · `:408-466` · Audience: end-user (sala) · Docs: ✅
- **C-P-027** — Righe menu per menu specifico · `GET/POST /preventivi/{id}/menu/{mid}/righe` + `PUT /righe-ordine` · `:466, 474, 492` · Docs: ✅
- **C-P-028** — PDF preventivo · `GET /preventivi/{id}/pdf` · `:504` · Audience: entrambi · Docs: ✅ (M.B PDF brand)

#### Sottomodulo D — Menu templates (riusabili per preventivi)
- **C-P-029** — CRUD menu template · `GET/POST/PUT/DELETE /menu-templates[/{id}]` · `menu_templates_router.py:92-134` · Audience: manager · Docs: ✅
- **C-P-030** — Duplica template · `POST /menu-templates/{id}/duplica` · `:142` · Docs: ✅
- **C-P-031** — Righe template (CRUD + ordine) · `POST/DELETE /menu-templates/{id}/righe[/{rid}]` + `PUT /righe-ordine` · `:159, 172, 185` · Docs: ✅

### Feature morte / disabilitate
Nessuna evidente.

### Note
- Modulo molto attivo, ben documentato in 2 file (`modulo_prenotazioni.md` + `modulo_preventivi.md`).

---

## Modulo: clienti (CRM)
**Path:** `app/routers/clienti_router.py`, `app/services/mailchimp_service.py`, `frontend/src/pages/clienti/`
**Priorità manuale:** Media · **LOC backend:** ~2.300

### Capability

#### Sottomodulo A — Anagrafica clienti
- **C-CL-001** — Lista clienti con filtri + paginazione · `GET /clienti/` · `clienti_router.py:1821` · Audience: manager (sala in read-only) · Docs: ✅ `docs/modulo_clienti_crm.md`
- **C-CL-002** — Dettaglio cliente · `GET /clienti/{id}` · `:2025` · Docs: ✅
- **C-CL-003** — Crea/modifica/elimina cliente · `POST/PUT/DELETE /clienti[/{id}]` · `:2096, 2136, 2188` · Docs: ✅
- **C-CL-004** — Dashboard stats clienti · `GET /clienti/dashboard/stats` · `:103` · Docs: ✅

#### Sottomodulo B — Tag
- **C-CL-005** — Lista tag · `GET /clienti/tag/lista` · `:175` · Docs: ✅
- **C-CL-006** — Crea/elimina tag · `POST /tag` + `DELETE /tag/{id}` · `:185, 202` · Docs: ✅
- **C-CL-007** — Assegna/rimuovi tag a cliente · `POST/DELETE /clienti/{id}/tag/{tid}` · `:2208, 2231` · Docs: ✅

#### Sottomodulo C — Note
- **C-CL-008** — Aggiungi/elimina nota cliente · `POST/DELETE /clienti/{id}/note[/{nota_id}]` · `:2252, 2275` · Docs: ✅

#### Sottomodulo D — Import esterno + Mailchimp
- **C-CL-009** — Export Google CSV · `GET /clienti/export/google-csv` · `:217` · Audience: manager · Docs: ✅
- **C-CL-010** — Import TheFork · `POST /clienti/import/thefork` · `:324` · Docs: ✅
- **C-CL-011** — Import da prenotazioni · `POST /clienti/import/prenotazioni` · `:563` · Docs: ✅
- **C-CL-012** — Diff import + count + risolvi · `GET /import/diff[/count]` + `POST /diff/risolvi` · `:1271, 1325, 1345` · Docs: ✅
- **C-CL-013** — Mailchimp status + sync · `GET /clienti/mailchimp/status` + `POST /sync` · `:2296, 2308` · Audience: manager · Docs: ⚠️ parziale

#### Sottomodulo E — Merge / Duplicati
- **C-CL-014** — Merge manuale · `POST /clienti/merge` · `:789` · Docs: ✅
- **C-CL-015** — Auto-preview + auto-merge · `GET /merge/auto-preview` + `POST /merge/auto` · `:1012, 1046` · Docs: ✅
- **C-CL-016** — Suggerimenti duplicati · `GET /clienti/duplicati/suggerimenti` + `POST /duplicati/escludi` · `:1121, 1240` · Docs: ✅

#### Sottomodulo F — Storico prenotazioni cliente
- **C-CL-017** — Lista prenotazioni cliente · `GET /clienti/prenotazioni/lista` · `:1414` · Docs: ✅
- **C-CL-018** — Stats prenotazioni cliente · `GET /clienti/prenotazioni/stats` · `:1496` · Docs: ✅

#### Sottomodulo G — Pulizia massiva
- **C-CL-019** — Pulizia telefoni placeholder · `POST /pulizia/telefoni-placeholder` · `:1594` · Audience: manager (admin) · Docs: ⚠️ parziale
- **C-CL-020** — Normalizza testi · `POST /pulizia/normalizza-testi` · `:1645` · Docs: ⚠️ parziale

#### Sottomodulo H — Impostazioni + Segmenti
- **C-CL-021** — Impostazioni clienti · `GET/PUT /clienti/impostazioni` · `:1703, 1717` · Docs: ✅
- **C-CL-022** — Conteggi segmenti (per email marketing) · `GET /clienti/segmenti/conteggi` · `:1744` · Docs: ⚠️ parziale

### Feature morte / disabilitate
Nessuna evidente.

### Note
- `docs/modulo_clienti_crm.md` copre la maggior parte. Da estendere: integrazione Mailchimp, pulizia massiva, segmenti.

---

## Modulo: menu_carta (+ Pranzo + Menu)
**Path:** `app/routers/menu_carta_router.py`, `app/routers/pranzo_router.py`, `app/routers/menu_router.py`, `app/services/menu_carta_image_service.py`, `app/services/pranzo_pdf_service.py`, `frontend/src/pages/pranzo/`, `frontend/src/pages/public/`
**Priorità manuale:** Alta · **LOC backend:** ~3.000

### Capability

#### Sottomodulo A — Edizioni Menu Carta (cena)
- **C-MC-001** — Lista edizioni menu · `GET /menu-carta/editions/` · `menu_carta_router.py:210` · Audience: manager · Docs: ✅ `docs/modulo_menu_carta.md`
- **C-MC-002** — Dettaglio edizione · `GET /menu-carta/editions/{id}` · `:230` · Docs: ✅
- **C-MC-003** — Crea/modifica/clona/archivia/elimina edizione · `POST/PUT /editions[/{id}]` + `/clone|/archive` + `DELETE` · `:326, 350, 394, 480, 494` · Docs: ✅
- **C-MC-004** — Pubblica edizione · `POST /editions/{id}/publish` · `:371` · Docs: ✅

#### Sottomodulo B — Publications (piatti dell'edizione)
- **C-MC-005** — Lista/CRUD pubblicazioni piatti · `GET/POST/PUT/DELETE /publications[/{id}]` · `:515, 533, 563, 590` · Docs: ✅
- **C-MC-006** — Upload/delete foto piatto · `POST/DELETE /publications/{id}/foto` · `:619, 667` · Audience: manager · Docs: ✅

#### Sottomodulo C — Tasting paths (percorsi degustazione)
- **C-MC-007** — CRUD tasting paths · `GET/POST/PUT/DELETE /tasting-paths[/{id}]` · `:702, 739, 763, 793` · Docs: ✅

#### Sottomodulo D — MEP (Mise en Place) — preview e generazione
- **C-MC-008** — Preview MEP per edizione · `GET /editions/{id}/mep-preview` · `:837` · Audience: end-user (chef) · Docs: ✅
- **C-MC-009** — Generate MEP · `POST /editions/{id}/generate-mep` · `:888` · Docs: ✅
- **C-MC-010** — PDF edizione · `GET /editions/{id}/pdf` · `:1090` · Audience: entrambi · Docs: ✅

#### Sottomodulo E — Pagina pubblica clienti
- **C-MC-011** — Today menu pubblico (no auth) · `GET /menu-carta/public/today` · `:1184` · Audience: end-user (cliente esterno) · Docs: ✅
- **C-MC-012** — Menu root info · `GET /menu/` · `menu_router.py:13` · Docs: ⚠️ parziale (endpoint minimo)

#### Sottomodulo F — Pranzo del Giorno
- **C-MC-013** — Smoke + health (no auth) · `public_router` `pranzo_router.py:53, 65` · Audience: monitoring · Docs: ⚠️ parziale
- **C-MC-014** — Piatti disponibili · `GET /pranzo/piatti-disponibili/` · `:140` · Audience: end-user (chef) · Docs: ✅ `docs/modulo_pranzo.md`
- **C-MC-015** — Lista menu pranzo · `GET /pranzo/menu/` · `:153` · Docs: ✅
- **C-MC-016** — Menu corrente + oggi · `GET /pranzo/menu/corrente/|/oggi/` · `:166, 174` · Docs: ✅
- **C-MC-017** — Menu by-week + per settimana · `GET /pranzo/menu/by-week/|/{settimana}/` · `:218, 243` · Docs: ✅
- **C-MC-018** — Crea/elimina menu pranzo · `POST /pranzo/menu/` + `DELETE /menu/{settimana}/` · `:267, 305` · Audience: manager · Docs: ✅
- **C-MC-019** — PDF menu pranzo settimanale · `GET /pranzo/menu/{settimana}/pdf/` · `:316` · Docs: ✅
- **C-MC-020** — Margine pranzo (foodcost vs prezzo) · `GET /pranzo/menu/{settimana}/margine` · `:346` · Docs: ✅
- **C-MC-021** — Programmazione · `GET /pranzo/programmazione/` · `:376` · Docs: ✅
- **C-MC-022** — Settings pranzo · `GET/PUT /pranzo/settings/` · `:390, 395` · Docs: ✅

### Feature morte / disabilitate
- `menu_router.py` è un router minimale (1 endpoint) — potrebbe essere consolidato in menu_carta_router o eliminato. Da chiarire scopo storico.

### Note
- Modulo ben documentato.

---

## Modulo: cucina (Lista Spesa)
**Path:** `app/routers/lista_spesa_router.py`, `frontend/src/pages/cucina/`
**Priorità manuale:** Media · **LOC backend:** ~250

### Capability
- **C-CK-001** — Lista items lista spesa (filtri stato/data) · `GET /lista-spesa/items/` · `lista_spesa_router.py:61` · Audience: end-user (chef + acquisti) · Docs: ✅ `docs/modulo_cucina.md`
- **C-CK-002** — Crea item lista spesa · `POST /lista-spesa/items/` · `:123` · Docs: ✅
- **C-CK-003** — Modifica item · `PUT /lista-spesa/items/{id}` · `:151` · Docs: ✅
- **C-CK-004** — Elimina item singolo + bulk · `DELETE /lista-spesa/items/{id}` + `DELETE /lista-spesa/items/` · `:203, 215` · Docs: ✅

### Feature morte / disabilitate
- Modulo "Cucina" di nome ma in realtà ha solo la sotto-feature Lista Spesa. `docs/modulo_cucina.md` parla anche di dashboard cucina + HACCP, ma quelli stanno in altri router (dashboard_router + haccp_router). Il `module.json` riconosce questo: "Dashboard cucina e HACCP vivono in platform/task_manager."

### Note
- Modulo MVP fase 1 (richieste cuoco → acquisti). Estensibile.

---

## Modulo: task_manager (+ HACCP)
**Path:** `app/routers/tasks_router.py`, `app/routers/haccp_router.py`, `app/services/tasks_scheduler.py`, `app/services/haccp_report_service.py`, `frontend/src/pages/tasks/`
**Priorità manuale:** Media · **LOC backend:** ~1.700

### Capability

#### Sottomodulo A — Template checklist
- **C-T-001** — Lista template · `GET /tasks/templates/` · `tasks_router.py:226` · Audience: manager · Docs: ⚠️ parziale (file `docs/modulo_cucina.md` cita ma in modo generico)
- **C-T-002** — Dettaglio template · `GET /tasks/templates/{id}` · `:278` · Docs: ⚠️
- **C-T-003** — Crea/modifica/elimina/duplica template · `POST/PUT/DELETE/POST .../duplica` · `:306, 348, 409, 429` · Docs: ⚠️

#### Sottomodulo B — Agenda istanze checklist
- **C-T-004** — Agenda giornaliera · `GET /tasks/agenda/` · `:602` · Audience: end-user (chef, sala, ecc.) · Docs: ⚠️
- **C-T-005** — Agenda settimana · `GET /tasks/agenda/settimana` · `:704` · Docs: ⚠️
- **C-T-006** — Genera agenda (instances dalle template) · `POST /tasks/agenda/genera` · `:773` · Docs: ⚠️

#### Sottomodulo C — Istanze (esecuzione)
- **C-T-007** — Dettaglio istanza · `GET /tasks/instances/{id}` · `:799` · Docs: ⚠️
- **C-T-008** — Assegna istanza · `POST /tasks/instances/{id}/assegna` · `:821` · Docs: ⚠️
- **C-T-009** — Completa istanza · `POST /tasks/instances/{id}/completa` · `:847` · Docs: ⚠️
- **C-T-010** — Salta istanza · `POST /tasks/instances/{id}/salta` · `:874` · Docs: ⚠️
- **C-T-011** — Check singolo item dell'istanza (tap-to-complete) · `POST /tasks/execution/item/{item_id}/check` · `:905` · Docs: ⚠️

#### Sottomodulo D — Scheduler
- **C-T-012** — Genera giornaliere (cron-style) · `POST /tasks/scheduler/genera-giornaliere` · `:980` · Audience: nessuno (job) · Docs: ⚠️
- **C-T-013** — Check scadute (alert) · `POST /tasks/scheduler/check-scadute` · `:996` · Docs: ⚠️

#### Sottomodulo E — Task singoli (no template)
- **C-T-014** — Lista task singoli · `GET /tasks/tasks/` · `:1061` · Audience: end-user · Docs: ⚠️
- **C-T-015** — Crea task singolo · `POST /tasks/tasks/` · `:1134` · Docs: ⚠️
- **C-T-016** — Modifica task · `PUT /tasks/tasks/{id}` · `:1183` · Docs: ⚠️
- **C-T-017** — Completa task singolo · `POST /tasks/tasks/{id}/completa` · `:1251` · Docs: ⚠️
- **C-T-018** — Elimina task singolo · `DELETE /tasks/tasks/{id}` · `:1294` · Docs: ⚠️

#### Sottomodulo F — HACCP report
- **C-T-019** — Eventi recenti HACCP · `GET /haccp/report/recent-events` · `haccp_router.py:32` · Audience: manager · Docs: 🆕 non documentato esplicitamente
- **C-T-020** — Report HACCP mensile · `GET /haccp/report/{anno}/{mese}` · `:45` · Audience: manager · Docs: 🆕

### Feature morte / disabilitate
Nessuna.

### Note tecniche per refactoring docs
- Manca **file docs dedicato** per task_manager + HACCP. Aprire `modulo_task_manager.md`.

---

## Modulo: statistiche
**Path:** `app/routers/statistiche_router.py`, `app/services/vendite_aggregator.py`, `app/services/ipratico_parser.py`, `frontend/src/pages/statistiche/`
**Priorità manuale:** Media · **LOC backend:** ~600

### Capability
- **C-S-001** — Import mensile iPratico · `POST /statistiche/import-ipratico` · `statistiche_router.py:61` · Audience: manager · Docs: ✅ `docs/modulo_statistiche.md`
- **C-S-002** — Lista mesi importati · `GET /statistiche/mesi` · `:143` · Docs: ✅
- **C-S-003** — Riepilogo categorie (mese / totale) · `GET /statistiche/categorie` · `:159` · Docs: ✅
- **C-S-004** — Dettaglio prodotti con filtri · `GET /statistiche/prodotti` · `:209` · Docs: ✅
- **C-S-005** — Top N prodotti per fatturato · `GET /statistiche/top-prodotti` · `:270` · Docs: ✅
- **C-S-006** — Trend mensile per categoria o prodotto · `GET /statistiche/trend` · `:321` · Docs: ✅
- **C-S-007** — Elimina dati di un mese · `DELETE /statistiche/mese/{anno}/{mese}` · `:387` · Audience: manager (admin) · Docs: ✅

### Note
- Modulo cross-aggregatore read-only. Ben documentato in `docs/modulo_statistiche.md`.

---

## Modulo: platform (infrastruttura)
**Path:** vari router (auth_router, users_router, modules_router, dashboard_router, notifiche_router, alerts_router, home_actions_router, backup_router) + `main.py` per `/system/*` e `/locale/*`

### Capability

#### Sottomodulo A — Autenticazione e utenti
- **C-PL-001** — Lista tile login (pubblico) · `GET /auth/tiles` · `auth_router.py:11` · Audience: end-user (login page) · Docs: ✅ `docs/modulo_dipendenti.md` o ad-hoc
- **C-PL-002** — Login JWT · `POST /auth/login` · `:17` · Docs: ✅
- **C-PL-003** — Refresh token · `POST /auth/refresh` · `:22` · Docs: ✅
- **C-PL-004** — Lista utenti · `GET /auth/users/` · `users_router.py:50` · Audience: manager · Docs: ⚠️ parziale (`controllo_design.md` o frammenti)
- **C-PL-005** — Crea/elimina utente · `POST /auth/users/` + `DELETE /{username}` · `:60, 70` · Docs: ⚠️
- **C-PL-006** — Cambia password utente · `PUT /auth/users/{username}/password` · `:84` · Docs: ⚠️ (`CambioPIN.jsx` pagina FE)
- **C-PL-007** — Cambia ruolo utente · `PUT /auth/users/{username}/role` · `:107` · Audience: manager (admin) · Docs: ⚠️
- **C-PL-008** — Associa utente ↔ dipendente · `PUT /auth/users/{username}/dipendente` · `:121` · Docs: ⚠️

#### Sottomodulo B — Modules registry
- **C-PL-009** — Lista moduli attivi · `GET /settings/modules/` · `modules_router.py:281` · Audience: manager (admin) · Docs: ✅ `docs/refactor_monorepo.md` §3 R8
- **C-PL-010** — Reset-to-seed moduli · `POST /settings/modules/reset-to-seed` · `:286` · Docs: ✅
- **C-PL-011** — Aggiorna stato moduli · `PUT /settings/modules/` · `:313` · Docs: ✅

#### Sottomodulo C — Dashboard Home
- **C-PL-012** — Home aggregata (widget) · `GET /dashboard/home` · `dashboard_router.py:1474` · Audience: end-user · Docs: ✅ `docs/spec_home_per_ruolo.md`
- **C-PL-013** — Dashboard cucina · `GET /dashboard/cucina` · `:1539` · Docs: ⚠️ parziale (citato in `modulo_cucina.md` ma endpoint non dettagliato)

#### Sottomodulo D — Notifiche (M.A)
- **C-PL-014** — Le mie notifiche · `GET /notifiche/mie` · `notifiche_router.py:86` · Audience: end-user · Docs: ✅ `docs/architettura_mattoni.md`
- **C-PL-015** — Contatore notifiche non lette · `GET /notifiche/contatore` · `:101` · Docs: ✅
- **C-PL-016** — Segna letta singola / tutte · `POST /notifiche/{id}/letta` + `/tutte-lette` · `:118, 128` · Docs: ✅
- **C-PL-017** — Elimina notifica · `DELETE /notifiche/{id}` · `:135` · Docs: ✅
- **C-PL-018** — Comunicazioni broadcast (CRUD) · `GET/POST/PUT/DELETE /comunicazioni[/{id}]` + `GET /tutte` + `POST /letta` · `:154-222` · Audience: manager · Docs: ✅

#### Sottomodulo E — Alert engine (M.F)
- **C-PL-019** — Lista checker registrati · `GET /alerts/checkers/` · `alerts_router.py:37` · Audience: manager · Docs: ✅
- **C-PL-020** — Dry-run check (no notifiche) · `GET /alerts/check/[/{name}]` · `:43, 53` · Docs: ✅
- **C-PL-021** — Run check (con notifiche) · `POST /alerts/run/[/{name}]` · `:60, 72` · Docs: ✅
- **C-PL-022** — Config checker (CRUD soglie) · `GET /alerts/config/` + `PUT /config/{name}/` · `:95, 137` · Docs: ✅

#### Sottomodulo F — Home actions (pulsanti rapidi per ruolo)
- **C-PL-023** — Get actions per ruolo · `GET /settings/home-actions/` · `home_actions_router.py:124` · Audience: end-user · Docs: ✅ `docs/spec_home_per_ruolo.md`
- **C-PL-024** — Get all (admin) · `GET /settings/home-actions/all/` · `:154` · Docs: ✅
- **C-PL-025** — CRUD action · `POST/PUT/DELETE /settings/home-actions[/{id}]` · `:177, 225, 269` · Audience: manager · Docs: ✅
- **C-PL-026** — Reorder · `POST /reorder/` · `:285` · Docs: ✅
- **C-PL-027** — Reset to defaults · `POST /reset/` · `:317` · Docs: ✅

#### Sottomodulo G — Backup
- **C-PL-028** — Download backup completo · `GET /backup/download` · `backup_router.py:136` · Audience: manager (admin) · Docs: ✅ `docs/sicurezza_backup.md`
- **C-PL-029** — Lista backup giornalieri · `GET /backup/list` · `:183` · Docs: ✅
- **C-PL-030** — Download backup specifico · `GET /backup/download/{filename}` · `:203` · Docs: ✅
- **C-PL-031** — Info backup + DB status · `GET /backup/info` · `:238` · Docs: ✅
- **C-PL-032** — Stato salute backup (admin) · `GET /system/backup-health` · `main.py:252` · Audience: manager (admin) · Docs: ✅

#### Sottomodulo H — System / Locale
- **C-PL-033** — Info sistema · `GET /system/info` (pubblico) · `main.py:217` · Audience: monitoring + manager · Docs: ✅
- **C-PL-034** — Info moduli attivi · `GET /system/modules` (pubblico) · `main.py:234` · Docs: ✅
- **C-PL-035** — Branding tenant · `GET /locale/branding.json` (pubblico) · `main.py:455` · Audience: frontend boot · Docs: ✅ `docs/refactor_monorepo.md` §3 R2
- **C-PL-036** — Strings tenant · `GET /locale/strings.json` (pubblico) · `main.py:475` · Docs: ✅ §3 R5

### Note
- Mattoni M.D (email) e M.G (permessi) sono **DA FARE** secondo `architettura_mattoni.md` e `core/moduli/platform/module.json`.
- M.H (import engine) e M.G (permessi advanced) sono pendenti.

---
