# Modulo Vini — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** parziale — verificato tutto vs codice 2026-07-25, tranne: redirect legacy in `App.jsx` e `app/repositories/vini_repository.py` (file non presenti nello snapshot verificato) · **Ultima verifica:** 2026-07-25 (vs codice)
> **Vedi anche:** [modulo_vini_widget_dashboard.md](modulo_vini_widget_dashboard.md) · `docs/roadmap.md` §V · `docs/refactor_anagrafiche_vini.md`

**Ultimo aggiornamento:** 2026-07-25 (verifica doc vs codice; in precedenza 2026-07-12: audit completo modulo + hardening — init S52-1 senza zombie, backup WAL-safe, rollback rimosso, auth pdf-staff/carta-cantina — vedi changelog 2026-07-12)
**Stato:** stabile post-cutover · Cantina "v2" promossa a Cantina unica · Cantina classica deprecata (file `*_legacy.jsx` archiviati nel repo, route redirect a v2)
**Versione modulo (`versions.jsx`):** **vini 3.72** · sistema **5.38** (verificati su `frontend/src/config/versions.jsx` il 2026-07-25; la 3.72 = CartaStaff v2.0 "banco di servizio", V.22)
**Roadmap:** sezione `V.` di `docs/roadmap.md` per priorità e voci aperte
**Refactor design:** `docs/refactor_anagrafiche_vini.md` per il design originale del refactor V.6+V.7+V.8

---

# 📌 STATO POST-CUTOVER (2026-05-19) — leggi prima di tutto il resto

Il modulo Vini ha completato il **refactor strutturale anagrafiche** (V.6+V.7+V.8) il 2026-05-18/19 con un cutover atomico (mig 133). Cosa è cambiato:

## Tabelle DB (vini_magazzino.sqlite3) — schema attuale

Le 6 tabelle "core" del modulo (post-rename dal `_v2`):

| Tabella | Cosa contiene | Righe (5/19) |
|---|---|---|
| `vini_bottiglie` | **Annate fisiche** in cantina (giacenze, prezzi annata-specifici, stati, formato, ID Excel) | 1287 |
| `vini_madre` | **Etichette stabili** (descrizione composta, denominazione_id FK, nome_etichetta cru, grado_alcolico_tipico, 5 slot vitigni "tipici") | 995 |
| `vini_produttori` | Cantine (nome, nazione, regione) | 350 |
| `vini_fornitori` | Distributori con rappresentante inline (nome, telefono, email) | 40 |
| `vini_denominazioni` | DOC/DOCG/IGT/AOC seed da eAmbrosia API + PDF MASAF | 1637 |
| `vini_vitigni` | Anagrafica canonica vitigni | 68 |
| `vini_magazzino_legacy_20260518` | Archivio safety net pre-cutover (read-only) | 1287 |

Tabelle satellite **NON rinominate** (restano col vecchio prefisso):
- `vini_magazzino_movimenti` — storico CARICO/SCARICO/VENDITA/RETTIFICA/MODIFICA con `prezzo_unitario` snapshot (mig 129)
- `vini_magazzino_note` — note operative interne
- `matrice_celle` — celle scaffali fisici (riga, colonna, vino_id)
- `vini_prezzi_storico`, `vini_ordini_pending`, `locazioni_config` — utility

## Relazioni chiave

```
vini_produttori (cantine)
    ↓ 1:N
vini_madre (etichette stabili) ──→ vini_denominazioni (FK opzionale)
    ↓ 1:N                ──→ vini_fornitori (FK opzionale, distributore)
vini_bottiglie (annate)  ──→ vini_vitigni (5 slot strutturati per annata)
    ↓ N:M
matrice_celle (posizione scaffale fisica)

vini_magazzino_movimenti.vino_id → vini_bottiglie.id (storico vendite/carichi)
vini_magazzino_note.vino_id      → vini_bottiglie.id
```

## Concetti semantici da non confondere

1. **Madre vs Bottiglia**: il "madre" è l'etichetta stabile (es. "Barolo DOCG Castiglione"). Le "bottiglie" sono le annate fisiche del madre (es. 2018, 2019, 2020). Una bottiglia ha SEMPRE `madre_id` (post-cutover), zero orfani.
2. **Descrizione composta automatica (M2.9)**: per i madri "composti" (`descrizione_auto=1`), il campo `descrizione` è ricalcolato come `"{denominazione_display} {nome_etichetta} ({vitigni}) {grado}%"`. Per i legacy (`descrizione_auto=0`) la descrizione è testo libero ereditato dall'import Excel originale.
3. **Madri "📜 OLD" (legacy)**: pre-cutover esistono 995 madri di cui ~963 con `descrizione_auto=0` (legacy). UI mostra badge 📜 OLD su questi: nel wizard "+ Nuovo" Step 3 c'è un bottone "Sistema il madre" che apre il modal di promozione (compili denominazione/nome_etichetta/vitigni/grado → `componi_descrizione` ricostruisce → `descrizione_auto=1`).
4. **Vitigni "tipici" (madre) vs "effettivi" (bottiglia)**: il madre ha 5 slot vitigno per il blend di riferimento. La bottiglia ha 5 slot per il blend effettivo di quella specifica annata. Possono divergere senza sync (intenzionale).
5. **Posizione scaffali (matrice)**: `matrice_celle` è una tabella M:N (1 vino può occupare N celle, 1 cella può ospitare 1 solo vino). `QTA_LOC3` sulla bottiglia è auto-ricalcolato come count delle celle assegnate (vedi `_recalc_qta_loc3_from_matrice`). Per questo nel wizard la LocCard "Locazione 3" NON esiste — c'è solo la matrice.
6. **Carico senza locazione** ("📦 DA POSIZIONARE"): convenzione operativa, NON schema speciale. È una voce nel settings di Locazione 1 che Marco aggiunge a mano. Quando una bottiglia ha `LOCAZIONE_1 = "📦 DA POSIZIONARE"`, vuol dire "caricata ma non ancora collocata fisicamente".

## UI post-cutover

| Tab in `ViniNav` | Path | Componente | Note |
|---|---|---|---|
| 📊 Dashboard | `/vini/dashboard` | `DashboardVini.jsx` | KPI stock + vendite + alert. Invariato. |
| 🍷 **Cantina** | `/vini/v2/cantina` | `CantinaV2.jsx` + `GestioneVino2.jsx` | **Era "Cantina 2", ora è LA Cantina.** 3 viste: Bottiglie / Madri / Per Produttore. |
| 📚 Anagrafiche | `/vini/anagrafiche` | `AnagraficheHub.jsx` (wrapper di `AnagraficheVini.jsx`) | 6 sotto-tab: Stats, Produttori, Distributori, Denominazioni, Vitigni, Madri (panel dedicati in `anagrafiche/` solo per Produttori/Distributori/Vitigni; Denominazioni e Madri inline in `AnagraficheVini.jsx`). CRUD admin/sommelier (`is_vini_manager`) + merge duplicati admin-only. |
| 📜 Carta | `/vini/carta` | `CartaBevande.jsx` | Carta cliente HTML/PDF (vedi §5). |
| 🥂 Sommelier | `/vini/carta-staff` | `CartaStaff.jsx` | **v2.0 "banco di servizio" (2026-07-20, V.22)**: due modalità — Preparazione (checklist pre-turno: ultima bt ancora in carta, calici aperti, frigo da rifornire, esauriti come promemoria riordino (a 0 bt la carta li nasconde già via min_qta_stampa)) e Servizio (ricerca + vendita one-tap con undo 10s + toggle mescita). Vendita da loc3/matrice esclusa (rimanda alla scheda). |
| 🛒 Vendite | `/vini/vendite` | `ViniVendite.jsx` | Registra vendite (bottiglia/calici) + storico + calici disponibili. |
| ⚙️ Impostazioni | `/vini/settings` | `ViniImpostazioni.jsx` | Locazioni, soglie, import/export, iPratico. |

**File `*_legacy.jsx`** ancora nel repo come archivio (mai importati):
`MagazzinoVini_legacy`, `MagazzinoViniNuovo_legacy`, `MagazzinoViniDettaglio_legacy`, `MagazzinoAdmin_legacy`, `RegistroMovimenti_legacy`, `CantinaTools_legacy`, `MovimentiCantina_legacy`, `MagazzinoSubMenu_legacy`, `ViniDatabase_legacy`. Da eliminare quando il cutover sarà stabile da settimane.

**Route legacy** ora redirect via `App.jsx`:
- `/vini/magazzino` → `/vini/v2/cantina`
- `/vini/magazzino/nuovo` → `/vini/v2/nuovo`
- `/vini/magazzino/:id` → `/vini/v2/bottiglia/:id`
- `/vini/magazzino/admin|registro|tools` → `/vini/v2/cantina` o `/vini/settings`

## Wizard "+ Nuovo Vino" (Cantina v2)

Route: `/vini/v2/nuovo`. Componente: `NuovoVinoV2.jsx` (~1500 righe). **Scrittura attiva** post S1 cutover (vini 3.44).

4 step + PreviewModal:
1. **Step 1 — Produttore**: autocomplete su `vini_produttori` con "+ Nuovo produttore" inline (nome + nazione + regione).
2. **Step 2 — Vino madre**: lista madri del produttore (con badge 📜 OLD sui legacy) + "+ Nuovo madre" inline. Il form madre nuovo include autocomplete denominazione, nome_etichetta, lista vitigni con %, grado.
3. **Step 3 — Annata**: campi annata-specifici (ANNATA con max=current year, FORMATO, VITIGNI override, GRADO, prezzi con auto-calc Listino→Carta→Calice via `/vini/pricing/calcola`, flag CARTA/IPRATICO/BIOLOGICO/CALICE/FORZA_PREZZO, STATO_VENDITA/CONSERVAZIONE, note). Se il madre selezionato è legacy, banner "🔧 Sistema il madre" apre il modal di promozione.
4. **Step 4 — Giacenze**: 3 LocCard (Frigo, Loc1, Loc2) + 🗄️ Posizione scaffali via `MatricePicker` in modalità draft (vinoId=null + pendingCells controllato). Loc3 NON esiste — gestita dalla matrice come da SchedaVino.

Submit (`submitWizard`): POST produttore (se `_new`) → POST madre (se `_new`, con vitigni strutturati) → POST bottiglia → loop POST `/matrice/assegna` per ogni cella selezionata. Schermata successo con ID generati + "+ Nuovo vino" reset.

## Endpoint backend principali (post-cutover)

### `/vini/anagrafiche/*` (CRUD anagrafiche, admin/sommelier su scrittura — merge/migrate/sync admin-only)
- `GET /produttori|fornitori|denominazioni|vitigni|madre/[?search&filtri]` — lista
- `GET /produttori/{id}|...|madre/{id}` — dettaglio (madre include `vitigni_list` + `denominazione_label` decorati via JOIN)
- `POST` / `PATCH` / `DELETE` per ogni entità
- `POST /madre/{mid}/promote-composto` — promozione legacy a composto (mig 130/131)
- `POST /bottiglia/` — creazione bottiglia (usato dal wizard)
- `POST /produttori/{src}/merge?target_id=N` — fonde 2 produttori (idem fornitori, denominazioni, vitigni)
- `POST /sync-all` — risincronizza campi anagrafici cache su tutte le bottiglie
- `POST /rollback` — **(rimosso)** risponde `410 Gone` (`vini_anagrafiche_router.py:927`); l'emergency drop non esiste più post-cutover
- `POST /migrate-from-legacy?dry_run=true` — ri-clustering one-shot (usato in Fase 5, ora storico)
- `POST /denominazioni/sync` — sync denominazioni da eAmbrosia + PDF MASAF (admin, `vini_anagrafiche_router.py:543`)
- `GET /stats/` — conteggi anagrafiche per la dashboard del pannello (`vini_anagrafiche_router.py:246`)

### `/vini/v2/*` (read-only Cantina, vista per UI)
- `GET /bottiglie/?limit=&filtri` — lista bottiglie con JOIN su madre/produttore/fornitore/denominazione
- `GET /bottiglie/{bid}` — dettaglio
- `GET /madri-raggruppate/` — vista "Madri" con `annate` array nested
- `GET /madre/{mid}/movimenti|stats|prezzi-storico` — vista madre aggregata
- `GET /dashboard/` — statistiche aggregate

### `/vini/magazzino/*` (router classico, ancora attivo per CRUD bottiglia + dashboard + movimenti)
Tutti gli endpoint puntano ora a `vini_bottiglie` (post sed F11). Usato da SchedaVino (parametrizzata con `apiBaseDettaglio="/vini/v2/bottiglie"` in modalità v2 ma altri endpoint storici sono qui):
- `GET /dashboard` — KPI stock + vendite (alimenta `DashboardVini.jsx` e `ViniVendite.jsx`)
- `GET /movimenti-globali?tipo=VENDITA` — storico vendite
- `POST /{vino_id}/movimenti|note` — aggiungi movimento o nota
- `PATCH /{vino_id}` — modifica vino
- `DELETE /delete-vino/{vino_id}` — elimina vino + cascade movimenti/note/celle
- `POST /{vino_id}/duplica` — duplica vino con giacenze a zero

### `/vini/ordini/*` (ordini ai fornitori — O3/O4/O5, 2026-08-02)

| Metodo | Path | Cosa fa |
|--------|------|---------|
| `GET` | `/vini/ordini/` | elenco ordini con totali (filtri: `stato`, `solo_aperti`, `fornitore_nome`) |
| `GET` | `/vini/ordini/riepilogo/` | numeri per il semaforo in dashboard |
| `GET` | `/vini/ordini/fornitori/` | fornitori con da-ordinare e ordini aperti (colonna sinistra) |
| `GET` | `/vini/ordini/da-ordinare/` | vini da riordinare di un fornitore, con qta suggerita e ritmo |
| `GET` | `/vini/ordini/{id}` | dettaglio con righe, totali e contatto rappresentante |
| `POST` | `/vini/ordini/riga/` | mette un vino nella bozza del suo fornitore (upsert: sostituisce la qta) |
| `DELETE` | `/vini/ordini/riga/{id}` | toglie una riga; se la bozza resta vuota viene eliminata |
| `POST` | `/vini/ordini/{id}/invia` | bozza → inviato, marca data e canale |
| `POST` | `/vini/ordini/{id}/ricevi` | arrivo anche parziale, in transazione atomica con CARICO |
| `POST` | `/vini/ordini/{id}/annulla` | annulla; l'ordine resta a storico |

Lettura: qualsiasi utente loggato. Scrittura: `is_vini_manager` (admin/sommelier).
Dettagli e scelte di schema in [modulo_vini_ordini.md](modulo_vini_ordini.md).

### `/vini/cantina-tools/*` (utility)
- `GET /matrice/stato|celle/{vid}` + `POST /matrice/assegna|rimuovi` — gestione celle scaffali
- `GET /template-v2|export-v2` · `POST /import-v2` — import/export Excel (template ancora "piatto" legacy-style, vedi V.20 per refactor a 3 fogli)
- `GET /inventario/pdf|giacenza/pdf|locazioni/pdf` — stampe inventario filtrate
- `GET /locazioni-config` + `POST /locazioni-config/{campo}` — config locazioni + matrice

### `/vini/carta/*` (Carta cliente)
- `GET /vini/carta/pdf|html` — generazione carta vini cliente
- `GET /vini/magazzino/carta-staff/` — **endpoint** vista sommelier (la route FE è `/vini/carta-staff` → `CartaStaff.jsx` v2.0; l'endpoint vive su `vini_magazzino_router.py:593`). Dal 3.72 ogni voce di `locazioni[]` include anche `slot` (frigo|loc1|loc2|loc3) per la vendita one-tap; la pagina riusa `POST /{id}/movimenti` (VENDITA), `DELETE /movimenti/{id}` (undo) e `PATCH /{id}/bottiglia-aperta` (mescita)
- Vedi §5 per dettaglio sub-module Carta + §6 per Carta Bevande

### `/vini/pricing/*`
- `POST /calcola` — `{euro_listino}` → `{prezzo_carta}`, usato in `MagazzinoViniNuovo_legacy` e `NuovoVinoV2` wizard (`vini_pricing_router.py:134`)
- 🆕 `GET|POST /breakpoints` + `POST /breakpoints/reset` — tabella markup personalizzata (`vini_pricing_router.py:103-125`)
- 🆕 `GET /preview` · `POST /ricalcola-tutti` — anteprima e ricalcolo massivo `PREZZO_CARTA` (`vini_pricing_router.py:154,197`)
- 🆕 `POST /ricalcola-calici` — ricalcolo massivo `PREZZO_CALICE` (auto = `PREZZO_CARTA / N`, configurabile via widget_settings) (`vini_pricing_router.py:293`)

### `/vini/ipratico/*`
- `POST /upload|export` · `GET /mappings|missing|stats|sync-log` — sync codici 4 cifre nel Name iPratico con `vini_bottiglie.id` (prefisso reale `/vini/ipratico`, router `ipratico_products_router.py:34`; dettaglio in §7)

---

---

# 0. Indice

1. Panoramica modulo
2. Architettura backend
3. Magazzino (cantina interna) — FE/BE
4. Dashboard Vini (KPI + alert + analytics)
5. Carta Vini (export HTML/PDF/DOCX)
6. Carta Bevande (sub-module: 7 sezioni extra-vini)
7. Sincronizzazione iPratico
8. Cantina Tools (import/export Excel + locazioni)
9. Stampa inventario filtrato
10. Movimenti cantina + storico prezzi
11. Permessi e ruoli
12. Bug noti / debt tecnico
13. Storico bugfix

> **Storia widget dashboard (14 fasi):** spostata in `docs/modulo_vini_widget_dashboard.md`. Qui sotto solo lo stato corrente.

---

# 1. Panoramica modulo

Il modulo **Vini** copre l'intera filiera della cantina dell'osteria:

- **Magazzino** — anagrafica vini, giacenze per locazione (frigo + 3 magazzini), movimenti cantina (CARICO/SCARICO/VENDITA/RETTIFICA), note operative, prezzi listino e carta.
- **Dashboard operativa** — KPI stock + vendite, alert giacenza zero su vini in carta, vini fermi 30gg, top venduti, distribuzione tipologie, widget riordini per fornitore.
- **Carta Vini** — generatore della carta cliente (HTML preview + PDF cliente + PDF staff + DOCX), ordinata gerarchicamente.
- **Carta Bevande** (sub-module) — gestione editoriale delle 7 sezioni extra-vini (Aperitivi, Birre, Amari fatti in casa, Amari & Liquori, Distillati, Tisane, Tè) con export unificato.
- **iPratico sync** — match diretto sui codici 4 cifre nel campo Name iPratico, export Excel con TRGB priority, lista vini mancanti.
- **Import/export** — formato unificato v2 (template Excel + import + export speculari) via `cantina-tools/template-v2|import-v2|export-v2`, bulk-import voci bevande da testo. **Vecchio formato Excel (foglio "VINI" con header storico) eliminato in V-H.J 2026-05-12.**

DB principale: `vini_magazzino.sqlite3` (unico, vecchio `vini.sqlite3` eliminato in v3.0). DB separato: `bevande.sqlite3` per le 7 sezioni extra-vini (le voci della Carta Vini restano in `vini_magazzino`).

---

# 2. Architettura backend

## File principali

| File | Ruolo |
|------|-------|
| `app/models/vini_magazzino_db.py` | Tutte le query SQLite (CRUD vini, movimenti, note, dashboard, ordini pending, storico prezzi) |
| `app/models/bevande_db.py` | Schema + helper `bevande.sqlite3` (sezioni + voci editoriali) |
| `app/models/vini_settings.py` | Settings Carta Vini + `_TIPOLOGIA_MAP` (normalizzazione runtime) |
| `app/repositories/vini_repository.py` | Ordering, filtri, query `load_vini_ordinati()` da magazzino |
| `app/routers/vini_magazzino_router.py` | Endpoint magazzino (CRUD, dashboard, movimenti, ordini pending, prezzi storico) |
| `app/routers/vini_router.py` | Endpoint Carta Vini (HTML/PDF/DOCX, movimenti) |
| `app/routers/vini_cantina_tools_router.py` | Import/export Excel diretto, locazioni-config, stampa inventario |
| `app/routers/ipratico_products_router.py` | Sync iPratico (mapping, export, sync-log) |
| `app/routers/vini_settings_router.py` | Settings Carta (ordine tipologie/nazioni/regioni, filtri) |
| `app/routers/bevande_router.py` | Carta Bevande: CRUD sezioni/voci + export unificato |
| `app/services/carta_vini_service.py` | Builder HTML/PDF/DOCX Carta Vini (WeasyPrint, python-docx, font Cormorant Garamond) |
| `app/services/carta_bevande_service.py` | Orchestratore master (vini + 7 sezioni bevande) + 3 pattern render |
| `app/utils/vini_metrics.py` | Helper riusabili: `calcola_ritmo_vendita()`, `giorni_dalla_ultima_vendita()` |
| `static/css/carta_pdf.css` + `carta_html.css` | Stile preview e PDF (allineati) |

## File deprecated (ancora presenti)
- `app/models/vini_db.py` — **(rimosso)** non è più presente in `app/models/` (cleanup completato)
- `app/models/vini_model.py` — V-H.J 2026-05-12: ridotto a stub deprecati con `NotImplementedError`. Costanti `TIPOLOGIA_VALIDE`/`FORMATO_VALIDI` spostate in `app/services/vini_xlsx_v2.py` (single source of truth)
- `frontend/src/pages/vini/CantinaTools_legacy.jsx`, `frontend/src/pages/vini/ViniDatabase_legacy.jsx` — rinominate con suffisso `_legacy` (S2 cutover), non più routate. Cleanup V-H.I

---

# 3. Magazzino (cantina interna)

## 3.1 Pagine frontend

> ⚠️ **Tabella storica (pre-cutover 2026-05-18).** Le pagine della Cantina classica sono state archiviate con suffisso `_legacy.jsx` e non sono più routate (route redirect a v2 — vedi "UI post-cutover" in cima al doc, che è la tabella di riferimento attuale). `ViniMenu.jsx` non esiste più nel repo.

| Pagina | Route | Descrizione |
|--------|-------|-------------|
| `ViniMenu.jsx` | `/vini` | Hub modulo **(rimosso — file non più presente)** |
| `MagazzinoVini_legacy.jsx` | `/vini/magazzino` | Lista vini + pannello dettaglio rapido (archiviata, redirect a `/vini/v2/cantina`) |
| `MagazzinoViniDettaglio_legacy.jsx` | `/vini/magazzino/:id` | Scheda completa (archiviata, redirect a `/vini/v2/bottiglia/:id`) |
| `MagazzinoViniNuovo_legacy.jsx` | `/vini/magazzino/nuovo` | Form creazione nuovo vino (archiviata, redirect a `/vini/v2/nuovo`) |
| `MagazzinoAdmin_legacy.jsx` | `/vini/magazzino/admin` | Tabellona modifica massiva (archiviata) |
| `DashboardVini.jsx` | `/vini/dashboard` | Dashboard operativa (vedi §4) — **viva** |
| `RegistroMovimenti_legacy.jsx` | `/vini/movimenti` | Storico globale movimenti (archiviata) |
| `iPraticoSync.jsx` | `/vini/ipratico` | Sync e mapping iPratico — **viva** |
| `ViniImpostazioni.jsx` | `/vini/settings` | Settings Carta + locazioni + widget/soglie — **viva** (route attuale `/vini/settings`, non più `/vini/impostazioni`) |

Sub-menu: il componente vivo è `frontend/src/components/vini/MagazzinoSubMenu.jsx` (v2.0: Lista Vini · Nuovo vino · Admin); `pages/vini/MagazzinoSubMenu_legacy.jsx` è l'archivio della versione a 4 voci.

## 3.2 Filtri MagazzinoVini (v4.x)

> ⚠️ **Sezione storica:** descrive i filtri della pagina archiviata `MagazzinoVini_legacy.jsx`. La lista viva è `CantinaV2.jsx` (filtri in `components/vini/CantinaFiltri.jsx`). I valori locazione da `locazioni_config` via `/vini/cantina-tools/locazioni-config` restano validi.

**Ricerca testuale:** ID DB, ID Excel (`id_excel`), descrizione, denominazione, produttore, codice, regione/nazione.

**Numerici:** giacenza totale (>, <, tra), solo positiva, prezzo carta.

**Combinati:** tipologia, nazione, regione, produttore. Le liste sono dipendenti (riducono dinamicamente con `useMemo` clientside).

**Filtro locazione unificato (v4.0):** sostituisce i 6 select gerarchici della v3.0. Due dropdown:
- **Locazione** — nomi unici da tutte le sezioni (Frigorifero, Locazione 1/2/3) deduplicati e ordinati
- **Spazio** — spazi disponibili per la locazione selezionata (inclusi spazi matrice `(col,riga)`)

Il filtro cerca contemporaneamente in tutte e 4 le colonne DB (`FRIGORIFERO`, `LOCAZIONE_1/2/3`). Senza spazio = tutti i vini in quel contenitore. Con spazio = match esatto su `"nome - spazio"`. Valori da `locazioni_config` via endpoint `/locazioni-config`.

## 3.3 Scheda dettaglio vino — `SchedaVino.jsx` v2.0-tabs

> Redesign sessione 55 (2026-04-24, `@version: v2.0-tabs` — la numerazione versione del file è ripartita): testa fissa (identità + 4 KPI) + **tab bar a 6 tab** (Anagrafica / Giacenze / Movimenti / Prezzi / Statistiche / Note, `SchedaVino.jsx:79-85`). Il componente resta riusabile ed è parametrizzato con `apiBaseDettaglio="/vini/v2/bottiglie"` in modalità v2.

Layout: sidebar tinta dinamica per TIPOLOGIA + area main scrollabile.

**Sidebar (260px, gradiente per tipologia):**
- ROSSI → red-700→red-900 · BIANCHI → amber-600→amber-800 · BOLLICINE → yellow · ROSATI → pink · PASSITI → orange · GRANDI FORMATI → purple · ANALCOLICI → teal · fallback → grigio
- Nome + badge `#id`
- Stat box (4): Bottiglie, Prezzo, Listino, Formato
- Lista info: Tipologia, Annata, Denominazione, Produttore, Regione, Nazione, Stato vendita, Conservazione
- Pulsanti: Modifica anagrafica, Modifica giacenze, Duplica vino, Chiudi

**Main:**
- §3.3.1 Anagrafica: visualizzazione + edit inline (PATCH `/vini/magazzino/{id}`). Edit attivato dal pulsante sidebar
- §3.3.2 Giacenze per locazione: edit separato per frigo/loc1/loc2/loc3. Salvataggio genera RETTIFICA se `QTA_TOTALE` cambia
- §3.3.3 Movimenti cantina: storico + form aggiunta + delete (admin/sommelier only)
- §3.3.4 Note operative: lista + add + delete con conferma
- §3.3.5 Storico prezzi (Fase 8 widget riordini, vedi `modulo_vini_widget_dashboard.md`): lista cronologica EURO_LISTINO con Δ colorato, filtro campo, mini-grafico Recharts

## 3.4 Movimenti cantina

| Tipo | Emoji | Colore | Significato |
|------|-------|--------|-------------|
| CARICO | ⬆️ | emerald | Ricezione merce (acquisto/fornitore) |
| SCARICO | ⬇️ | red | Uscita non commerciale (rottura, consumo interno, degustazione) |
| VENDITA | 🛒 | blue | Vendita commerciale (inserimento manuale — iPratico non esporta dati) |
| RETTIFICA | ✏️ | amber | Correzione giacenza (inventario, errori) |
| MODIFICA | 📝 | blue | Audit trail (es. transizioni `STATO_RIORDINO`, vini 3.61) — **non tocca le giacenze**. Nel CHECK della tabella da mig dedicata (`vini_magazzino_db.py:334`) |

**Note modello dati:**
- Le VENDITE sono inserite manualmente (iPratico non esporta dati dalle vendite in nessun formato)
- SCARICO ≠ VENDITA: scarico = uscita senza corrispettivo commerciale
- Ogni modifica giacenza da UI genera automaticamente una RETTIFICA

**Tabella `vini_magazzino_movimenti`:** `id`, `vino_id` (FK → `vini_bottiglie.id`), `data_mov`, `tipo`, `qta`, `locazione`, `note`, `origine`, `utente`, `created_at` (+ `prezzo_unitario` snapshot, mig 129). Indice presente: `idx_vmm_vino_data (vino_id, data_mov)` (`vini_magazzino_db.py:347`); la variante con `tipo` non esiste (vedi §12).

## 3.5 Tabella `vini_magazzino` — campi

Aggiornato 2026-05-12 (audit post-sessione 2026-05-11).

> ⚠️ **Post-cutover (mig 133) la tabella live si chiama `vini_bottiglie`** — `vini_magazzino` è la zombie legacy che NON viene più ricreata (`vini_magazzino_db.py:136-158`). I campi elencati sotto restano validi su `vini_bottiglie`.

**Anagrafica**
- `id` INTEGER PK — immutabile
- `id_excel` INTEGER UNIQUE — id di origine se importato da Excel
- `TIPOLOGIA` TEXT NOT NULL — lista controllata in `vini_xlsx_v2.TIPOLOGIA_VALIDE` (spostata da `vini_model` in V-H.J)
- `NAZIONE` TEXT NOT NULL
- `REGIONE` TEXT
- `CODICE` TEXT — campo legacy attualmente non utilizzato (rivedere)
- `DESCRIZIONE` TEXT NOT NULL
- `DENOMINAZIONE` TEXT
- `ANNATA` TEXT — stringa "YYYY", validata FE
- `VITIGNI` TEXT — testo libero (V.8 prevede normalizzazione)
- `GRADO_ALCOLICO` REAL
- `FORMATO` TEXT — lista controllata in `vini_xlsx_v2.FORMATO_VALIDI` (spostata da `vini_model` in V-H.J)
- `PRODUTTORE`, `DISTRIBUTORE`, `RAPPRESENTANTE` TEXT

**Prezzi e listino**
- `PREZZO_CARTA` REAL — prezzo bottiglia in carta
- `EURO_LISTINO` REAL — prezzo cassa/fornitore
- `SCONTO` REAL — sconto fornitore (storicizzato)
- `NOTE_PREZZO` TEXT
- `PREZZO_CALICE` REAL — prezzo singolo calice
- `PREZZO_CALICE_MANUALE` INTEGER 0/1 DEFAULT 0 — flag override sommelier (sessione 2026-05-11)

**Flag operativi** (tutti INTEGER 0/1 dopo V-H.E 2026-05-12, mig 124)
- `CARTA` INTEGER 0/1 — pubblicato in carta cliente
- `IPRATICO` INTEGER 0/1 — esportato verso iPratico
- `BIOLOGICO` INTEGER 0/1 DEFAULT 0
- `VENDITA_CALICE` INTEGER 0/1 DEFAULT 0 — abilitato per vendita al calice
- `FORZA_PREZZO` INTEGER 0/1 DEFAULT 0 — bypassa markup automatico
- `BOTTIGLIA_APERTA` INTEGER 0/1 DEFAULT 0 — bottiglia in mescita (sessione 58)
- `DATA_APERTURA` TEXT ISO — data apertura calice (sessione 2026-05-11, mig 121)
- `ABBINAMENTI` TEXT — abbinamenti consigliati per carta cliente calici
<!-- DISCONTINUATO rimosso 2026-05-12 (V-H.E, mig 124): ridondante con
     STATO_RIORDINO='X' (Non ricomprare). I dati storici DISCONTINUATO='SI'
     sono stati consolidati nel nuovo stato. -->
- `PREZZO_CALICE_MANUALE` INTEGER 0/1 DEFAULT 0 (già citato sopra in "Prezzi")
- `ORIGINE` TEXT 'EXCEL'/'MANUALE'

**Stati codificati**
- `STATO_VENDITA` INTEGER 0..3 (post V-H.F mig 128, 2026-05-15)
  - `0` = NON_VENDERE (bloccato in carta)
  - `1` = CONTROLLARE (verifica annata/conservazione prima di proporlo)
  - `2` = VENDERE (default nuovi vini, normale in carta)
  - `3` = SPINGERE (promuovere attivamente in sala)
  - Pre-mig: TEXT con codici N/T/V/F/S/C. Mapping rebuild: V→2, C→1, F→3, S→3, T→1, N→0, NULL→2 (default).
- `STATO_RIORDINO` TEXT: D/0/A/X (mig 122 — 'O' rimosso). **Auto-reset (vini 3.61, 2026-05-30):** `'0'` (Ordinato) si azzera a `NULL` automaticamente quando arriva nuovo stock — sia su `CARICO` (sempre) sia su `RETTIFICA` con `delta > 0`, sia dentro `conferma_arrivo_ordine_pending`. Ogni transizione (auto-reset, set manuale via PATCH, settaggio iniziale al duplica) genera un movimento `MODIFICA` nello storico del vino con `origine` parlante (`AUTO-CARICO` / `AUTO-RETTIFICA` / `ORDINE_ARRIVO` / `DUPLICATE-NUOVA-ANNATA` / `GESTIONALE-EDIT` / `MIG-139-CLEANUP`) e l'`utente`. Questo perché il widget "vini senza giacenza" della Dashboard esclude per design i vini con `STATO_RIORDINO='0'` ("ordine già piazzato, non urgente"): senza l'auto-reset, una volta marcato Ordinato il vino restava invisibile all'alert anche dopo l'arrivo e la rivendita. Migration 139 ha fatto il cleanup one-shot degli stati orfani pre-3.61.
- `STATO_CONSERVAZIONE` TEXT: 1/2/3
- `NOTE_STATO` TEXT

**Locazioni e quantità**
- `FRIGORIFERO`/`QTA_FRIGO`, `LOCAZIONE_1..3`/`QTA_LOC1..3` (LOC3 può contenere coordinate matrice se vino in `matrice_celle`)
- `QTA_TOTALE` INTEGER DEFAULT 0 — somma delle 4 locazioni, ricalcolato da `_recalc_qta_totale`. Read-only via PATCH (sessione 2026-05-12, vedi task D).

**Metadati**
- `NOTE` TEXT — note operative interne
- `CREATED_AT`, `UPDATED_AT` TEXT ISO

## 3.6 Endpoint magazzino principali

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/vini/magazzino/` | Lista vini con filtri |
| GET | `/vini/magazzino/dashboard` | Statistiche aggregate (vedi §4) |
| GET | `/vini/magazzino/{id}` | Dettaglio vino |
| POST | `/vini/magazzino/` | Crea vino |
| PATCH | `/vini/magazzino/{id}` | Aggiorna anagrafica (hook: se `EURO_LISTINO` cambia, insert in `vini_prezzi_storico`) |
| POST | `/vini/magazzino/{id}/movimenti` | Registra movimento |
| DELETE | `/vini/magazzino/movimenti/{id}` | Elimina movimento (admin/sommelier) |
| GET | `/vini/magazzino/{id}/note` | Lista note vino |
| POST | `/vini/magazzino/{id}/note` | Aggiunge nota |
| DELETE | `/vini/magazzino/{id}/note/{nota_id}` | Elimina nota |
| POST | `/vini/magazzino/import` | **(rimosso)** endpoint mai esistito su questo router — l'import vive su `/vini/cantina-tools/import-v2` (vedi §8; V-BUG1 era un falso positivo) |
| POST | `/vini/magazzino/check-duplicati` | Verifica duplicati pre-inserimento |
| POST | `/vini/magazzino/{id}/duplica` | Duplica con nuova annata (Fase 2 widget) |
| GET | `/vini/magazzino/ordini-pending/` | Lista ordini pending (Fase 3 widget) |
| POST | `/vini/magazzino/{id}/ordine-pending` | Upsert ordine (Fase 4 widget) |
| DELETE | `/vini/magazzino/{id}/ordine-pending` | Cancella ordine pending |
| POST | `/vini/magazzino/{id}/ordine-pending/conferma-arrivo` | Converte ordine → CARICO (Fase 5 widget) |
| GET | `/vini/magazzino/{id}/prezzi-storico/` | Storico prezzi vino (Fase 6 widget) |
| 🆕 PATCH | `/vini/magazzino/bulk-update` | Aggiornamento massivo (solo admin) — `vini_magazzino_router.py:424` |
| 🆕 POST | `/vini/magazzino/bulk-duplicate` | Duplica multipla, giacenze a zero (solo admin) — `vini_magazzino_router.py:495` |
| 🆕 DELETE | `/vini/magazzino/delete-vino/{id}` | Elimina vino + cascade (admin/sommelier) — `vini_magazzino_router.py:537` |
| 🆕 GET | `/vini/magazzino/movimenti-globali` | Storico movimenti globale con filtri/paginazione — `vini_magazzino_router.py:561` |
| 🆕 GET | `/vini/magazzino/autocomplete` | Ricerca vini per autocompletamento — `vini_magazzino_router.py:577` |
| 🆕 GET | `/vini/magazzino/carta-staff/` | Vini in carta, vista sommelier (dal 3.72 con `slot` nelle locazioni) — `vini_magazzino_router.py:593` |
| 🆕 GET | `/vini/magazzino/calici-disponibili/` | Vini con bottiglia aperta in mescita — `vini_magazzino_router.py:684` |
| 🆕 GET | `/vini/magazzino/{id}/stats` | Statistiche di vendita del vino — `vini_magazzino_router.py:739` |
| 🆕 PATCH | `/vini/magazzino/{id}/bottiglia-aperta` | Toggle mescita/servizio al calice (anche `sala`; vedi §11) — `vini_magazzino_router.py:887` |
| 🆕 GET | `/vini/magazzino/{id}/giacenza-storica` | Andamento giacenza giorno-per-giorno (vedi §11) — `vini_magazzino_router.py:965` |
| 🆕 PATCH | `/vini/magazzino/movimenti/{id}/data` | Modifica data/ora movimento (admin-only) — `vini_magazzino_router.py:1099` |

⚠ **Nota router:** `GET /dashboard` deve essere dichiarato PRIMA di `GET /{vino_id}` per evitare che FastAPI interpreti "dashboard" come `vino_id` intero (genera 422).

## 3.7 Modifica massiva — `MagazzinoAdmin_legacy.jsx` v2.0

> ⚠️ File archiviato (`_legacy`), route redirect post-cutover. Gli endpoint BE `bulk-update`/`bulk-duplicate` restano attivi (vedi §3.6).

Tabellona editabile per admin con tutte le colonne principali:
- Click sugli header per ordinamento ASC/DESC (▲/▼/⇅)
- Colonne FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2 con dropdown valori configurati (tipo `loc_select`)
- Valori non configurati mostrati con suffisso "(non config.)"
- Salvataggio riga singola o batch

---

# 4. Dashboard Vini — `DashboardVini.jsx` v4.x (attuale: v4.15-ritmo-vendita-esteso)

## 4.1 KPI Stock (4 tile)

| Tile | Dato | Drill-down |
|------|------|------------|
| 🍾 Bottiglie in cantina | `total_bottiglie` su `n` referenze | — |
| 📋 Vini in carta | `vini_in_carta` con % su catalogo | — |
| ⚠️ Senza prezzo listino | `vini_senza_listino` | ✅ tabella inline + link a scheda |
| 💤 Vini fermi (30gg) | giacenza > 0 e nessun movimento in Ngg (include mai movimentati; N = widget setting `vini_fermi_giorni`, default 30 — `vini_magazzino_db.py:2126`) | ✅ lista espandibile |

## 4.2 KPI Vendite (4 tile)
- 🛒 Bottiglie vendute ultimi 7gg
- 📈 Bottiglie vendute ultimi 30gg
- 💰 Valore acquisto totale (QTA × listino)
- 💎 Valore carta totale (QTA × prezzo carta)

## 4.3 Alert e widget (vedi `modulo_vini_widget_dashboard.md` per il dettaglio delle 14 fasi)

- 🚨 **Vini in carta senza giacenza** (banner alert collassabile, 6 fasi A-F implementate): pill `+ ordina · N` inline con qta suggerita storico Ngg ÷ K (default 60÷2, configurabile via widget settings `qta_suggerita_*`); badge ritmo vendita (top/medio/poco/mai); pill stato riordino (📝 Da ordinare / 📦 Ordinato / 🗓️ Annata esaurita / ⛔ Non ricomprare — 4 stati dopo rimozione 'O' 2026-05-11); chip filtro tipologia (Tutti/Rossi/Bianchi/Bollicine/Rosati/Altri); toggle raggruppa per distributore (persistito in `localStorage`); bottone `✅ Arrivato` inline.
- 💤 **Vini fermi** — lista espandibile, "mai movimentato" evidenziato
- **Vendite recenti** (col sx) + **Movimenti operativi** (col dx)
- **Top venduti 30gg** (larghezza piena) — ranking a barre, click → scheda vino
- **Distribuzione tipologie** — barre proporzionali con contatore
- **📦 Riordini per fornitore** (sezione gestionale completa, 8 fasi 1-8 implementate): tabella raggruppata per distributore con sort produttore, pulsante info dedicato, duplica con nuova annata, colonna riordino + modale qty, bottone arrivato + carico, listino inline editabile con storico, sort multi-colonna. 🆕 v4.15: colonna "Ritmo" sortabile (ritmo vendita) anche qui e badge ritmo inline nel widget Vini fermi (`DashboardVini.jsx:2`).

---

# 5. Carta Vini

## 5.1 Endpoint

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/vini/carta` | Anteprima web HTML |
| GET | `/vini/carta/html` | Alias compatibilità |
| GET | `/vini/carta/pdf` | PDF cliente |
| GET | `/vini/carta/pdf-staff` | PDF staff |
| GET | `/vini/carta/docx` | Documento Word |
| 🆕 GET | `/vini/carta-cliente/data` | JSON carta vini strutturata per la pagina cliente **pubblica** (no auth) — consumata da `pages/public/CartaClienti.jsx` (route `/carta`) — `vini_router.py:151` |
| 🆕 GET/POST | `/vini/{vino_id}/movimenti` | Lista/registra movimenti (endpoint storico su questo router, JWT) — `vini_router.py:454,473` |
| 🆕 GET | `/vini/carta/pubblicazione/` | Stato FTP + data ultima pubblicazione riuscita della carta sul sito (mattone M.J, 2026-08-03) |
| 🆕 POST | `/vini/carta/pubblica/` | Rigenera la carta **cliente** e la carica sull'FTP del sito, nome remoto fisso (admin/sommelier) |

> Endpoint legacy mantenuti per retro-compat anche dopo l'introduzione della Carta Bevande (vedi §6).

> **Pubblicazione sul sito (M.J, 2026-08-03).** Bottone "Pubblica la carta sul sito" in `ViniImpostazioni.jsx` → tab Carta. Si pubblica **solo la versione cliente**: `pdf-staff` è interna e non deve mai finire su un server pubblico. La generazione del PDF cliente è stata estratta in `_render_carta_pdf_cliente()` così che download e pubblicazione usino lo stesso identico codice. Config FTP e comportamento: `docs/architettura_mattoni.md` §M.J.

## 5.2 Flusso dati

1. `load_vini_ordinati()` legge da `vini_magazzino.sqlite3` (WHERE `CARTA=1` — flag intero post V-H.E mig 124)
2. Applica filtri quantità/prezzo da `vini_settings.sqlite3`
3. Normalizza tipologie (vecchie → nuove) con `_TIPOLOGIA_MAP`
4. Ordina per tipologia → nazione → regione → produttore → descrizione → annata
5. Genera carta (HTML/PDF/DOCX) tramite `carta_vini_service.py`

## 5.3 Gerarchia carta

```
Tipologia (GRANDI FORMATI, BOLLICINE, BIANCHI, ROSATI, ROSSI, PASSITI, ANALCOLICI)
  └── Nazione (Italia, Francia, Germania, Austria, Spagna...)  [filetti decorativi]
       └── Regione (Lombardia, Piemonte, Champagne...)
            └── Produttore (bold)
                 └── Vino: descrizione | annata | prezzo
```

## 5.4 Settings Carta — `vini_settings_router.py`

Prefisso API reale: **`/settings/vini/*`** (`vini_settings_router.py:32`).

- Ordine tipologie (lista riordinabile con frecce) — `GET|POST /tipologie`
- Ordine nazioni (riordinabile) — `GET|POST /nazioni`
- Ordine regioni per nazione — `GET|POST /regioni/{nazione}`
- Filtri carta: quantità minima, mostra negativi, mostra senza prezzo — `GET|POST /filtri`
- 🆕 Formati e valori tabellati — `GET|POST /formati`, `GET /valori-tabellati` (`vini_settings_router.py:160-195`)
- 🆕 Widget settings operativi (soglie calici, `vini_fermi_giorni`, step calice, ecc.) — `GET|PUT /settings/vini/widget/` + `POST /widget/reset` (`vini_settings_router.py:337-365`, tabella `vini_widget_settings`, service `vini_widget_settings_service.py`), UI in `ViniImpostazioni.jsx` sezione "Widget e soglie"
- 🆕 Reset settings — `POST /settings/vini/reset` (`vini_settings_router.py:302`)

## 5.5 Voci roadmap aperte (vedi `roadmap.md` §V)
- PDF con indici cliccabili (TOC con link interni)
- Versioning della carta (storico PDF)
- Template multipli (eventi, degustazioni)

---

# 6. Carta Bevande (sub-module)

> Versione 1.0 — Backend (Fase 1) e Frontend editor (Fase 2) e Export unificato (Fase 3) **completati 2026-04-19**. UI ridisegnata in **v3.1-no-preview** (sessione 58, 2026-04-25): niente più hub a card né anteprima inline — sidebar sezioni + editor a destra (`CartaBevande.jsx:1-8`).

## 6.1 Posizionamento UI

Tab **"Carta"** nel sub-menu Vini (nome invariato). Dal v3.1 la pagina è un "centro carta": sidebar con le sezioni + editor a destra, header con 4 azioni globali sulla carta intera (PDF cliente · PDF staff · Word · Vedi come cliente).

Ordine seed reale (`bevande_db.py::_SEED_SEZIONI`, campo `ordine` — Vini è in 3ª posizione, non più hero):

| Ordine | Sezione | Emoji | Key |
|--------|---------|-------|-----|
| 10 | Aperitivi | 🍸 | `aperitivi` |
| 20 | Birre | 🍺 | `birre` |
| 30 | Vini | 🍷 | `vini` (layout `vini_dinamico`: il renderer chiama `carta_vini_service`, dati da `vini_magazzino`) |
| 40 | Amari fatti in casa | 🌿 | `amari_casa` |
| 50 | Amari & Liquori | 🥃 | `amari_liquori` |
| 60 | Distillati | 🥃 | `distillati` (Grappa/Rum/Whisky/Gin/Vodka via tag tipologia) |
| 70 | Tisane | 🌼 | `tisane` |
| 80 | Tè | 🍵 | `te` |

(L'ordine è editabile dall'UI: il seed non fa UPDATE sulle sezioni esistenti.)

## 6.2 Rotte

```
/vini/carta                       → redirect a /vini/carta/vini (CartaBevande.jsx)
/vini/carta/vini                  → Preview + export Carta Vini (CartaVini.jsx, dentro CartaBevande)
/vini/carta/:sezione              → Editor sezione (CartaSezioneEditor.jsx, dentro CartaBevande)
```

**(rimosse)** `/vini/carta/sezione/:key` (ora `/vini/carta/:sezione`) e `/vini/carta/anteprima` — `CartaAnteprima.jsx` non è più referenziata da nessun file (decisione UX "no anteprima inline", sessione 58 iter 7).

## 6.3 Modello dati — `bevande.sqlite3`

DB isolato (coerente con `notifiche.sqlite3`, `cg.sqlite3`) per backup/restore semplificati.

**Tabella `bevande_sezioni`:** `id` PK, `key` UNIQUE, `nome`, `intro_html`, `ordine`, `attivo`, `layout` (`tabella_4col`/`scheda_estesa`/`nome_badge_desc`), `schema_form` JSON (per editor dinamico), `created_at`, `updated_at`. Seed iniziale: 8 sezioni con `layout` di default.

**Tabella `bevande_voci`:** tutte le voci di tutte le sezioni in tabella piatta. Campi: `id`, `sezione_key`, `nome`, `sottotitolo`, `descrizione`, `produttore`, `regione`, `formato`, `gradazione`, `ibu`, `tipologia`, `paese_origine`, `prezzo_eur`, `prezzo_label` (override testuale), `tags` JSON, `extra` JSON catch-all, `ordine`, `attivo`, `note_interne` (visibili solo PDF-staff), `abbinamenti` (mig 106), `gluten_free` 0/1 (mig 106), `analcolica` 0/1 (mig 157), `created_at`, `updated_at`. Indici: `idx_bevande_voci_sezione (sezione_key, ordine)`, `idx_bevande_voci_attivo`.

## 6.4 Pattern di render (3 layout)

- **Pattern A — `tabella_4col`** (Distillati, Amari & Liquori): `[REGIONE/PAESE] [PRODUTTORE] [NOME + annata] [€]`. Compatto.
- **Pattern B — `scheda_estesa`** (Birre, Aperitivi, Amari fatti in casa): nome + sottotitolo + meta line (produttore · stile · formato · grad · IBU) + descrizione + prezzo. Due badge opzionali accanto al nome: **GF** verde se `gluten_free=1` (mig 106) e **0.0** blu se `analcolica=1` (mig 157); in coda alla sezione compare la legenda con le sole voci effettivamente usate. La riga meta salta la gradazione quando vale 0 → per una analcolica non compare "0,0%", l'informazione la porta il badge.
- **Pattern C — `nome_badge_desc`** (Tisane, Tè): nome + badge tipologia colorato + descrizione/ingredienti + paese origine (solo tè).
- **Pattern speciale — `vini_dinamico`** (sezione Vini): non legge da `bevande_voci`, delega il render a `carta_vini_service` (`bevande_db.py:230,246`).

Aggiungere un nuovo pattern = aggiungere una funzione Python in `carta_bevande_service.py` + un valore enum. Zero migration.

## 6.5 Endpoint Carta Bevande

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/bevande/sezioni/` | Lista sezioni + conteggi voci totali/attive (per card hub) |
| GET | `/bevande/sezioni/{key}` | Dettaglio + schema_form parsato |
| PUT | `/bevande/sezioni/{key}` | Aggiorna nome/intro_html/ordine/attivo/layout/schema_form |
| POST | `/bevande/sezioni/reorder` | Riordino batch |
| 🆕 PUT | `/bevande/sezioni/{key}/tipologie` | Gestione sotto-categorie (options del select `tipologia` nello schema_form) con rename propagato alle voci; da Impostazioni → Ordinamento Carta — `bevande_router.py:318` |
| GET | `/bevande/voci/?sezione=&attivo=&q=` | Lista filtrata + ricerca su nome/produttore/descrizione |
| GET | `/bevande/voci/{id}` | Dettaglio |
| POST | `/bevande/voci/` | Crea voce (blocca sezione `vini` dinamica) |
| PUT | `/bevande/voci/{id}` | Aggiorna (PATCH-like) |
| DELETE | `/bevande/voci/{id}` | Soft-delete; `?hard=1` solo admin/superadmin |
| POST | `/bevande/voci/reorder` | Riordino batch |
| POST | `/bevande/voci/bulk-import` | Import accodato (parser TAB/2+spazi) |
| GET | `/bevande/carta` | HTML preview master (Vini + sezioni attive) |
| GET | `/bevande/carta/pdf` | PDF cliente (WeasyPrint) |
| GET | `/bevande/carta/pdf-staff` | PDF staff con `note_interne` |
| GET | `/bevande/carta/docx` | DOCX master |
| GET | `/bevande/sezioni/{key}/preview` | HTML singola sezione (per editor) |

**Permessi:** `_require_editor` (admin/superadmin/sommelier) per scrittura, `_require_reader` (tutti tranne viewer) per lettura. NESSUN endpoint pubblico — JWT obbligatorio ovunque.

**Retro-compat:** `/vini/carta*` invariati (carta vini standalone), `/bevande/carta*` per la carta master.

## 6.6 Versioning automatico

Footer PDF cliente: `Carta delle Bevande — v{YYYY}.{MM}.{DD}` calcolato da `MAX(updated_at)` su `bevande_sezioni` + `bevande_voci`. Permette di riconoscere a colpo d'occhio se il PDF in sala è aggiornato.

## 6.7 Decisioni chiuse (2026-04-19)

1. **Multi-lingua:** NO in MVP. Solo italiano. Da rivalutare in futuro.
2. **URL pubblico `/carta-bevande`:** NO. Solo staff con JWT. *(Superata in parte: oggi esiste la pagina cliente pubblica `/carta` — `pages/public/CartaClienti.jsx` — alimentata da `GET /vini/carta-cliente/data` senza auth, `vini_router.py:151`.)*
3. **Versioning automatico:** SÌ (vedi §6.6).
4. **Mattone M.B PDF brand:** non aspettiamo. Pipeline attuale `carta_vini_service` estesa in `carta_bevande_service`. Quando M.B arriverà, migreremo.

## 6.8 Da fare (Fase 4)

*(Nota verifica 2026-07-25: lo stato del popolamento vive nel DB `bevande.sqlite3`, non verificabile dal codice — stime originali lasciate come storico.)*

Marco deve popolare le 7 sezioni dall'editor. Tempi stimati:
- Aperitivi (~10 min, 5-10 voci)
- Birre (~15 min, ~10 voci)
- Amari fatti in casa (~10 min, 5-10 voci)
- Amari & Liquori (~30 min, 20-30 voci)
- Distillati (~60 min, ~60 voci: Grappe + Rum + Whisky)
- Tisane (~10 min, ~7 voci)
- Tè (~20 min, 10-15 voci)

**Totale stimato: ~2.5 ore** (o meno con bulk-import da testo).

---

# 7. Sincronizzazione iPratico — `ipratico_products_router.py` v2.0

## 7.1 Logica chiave

- Il codice 4 cifre nel campo Name iPratico = `vini_magazzino.id` (match diretto, ~99.7%)
- TRGB ha priorità: se un vino cambia su TRGB, l'export aggiorna nome/giacenza/prezzo su iPratico
- L'export aggiunge automaticamente vini TRGB mancanti con campi default configurabili (Family, reparti, listini, prezzi)

## 7.2 Endpoint

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/vini/ipratico/upload` | Import export Excel iPratico, match Bottiglie per ID diretto |
| GET | `/vini/ipratico/mappings` | Lista mapping iPratico ↔ TRGB con dati arricchiti |
| PUT | `/vini/ipratico/mappings/{id}` | Assegna/rimuovi collegamento manuale |
| PUT | `/vini/ipratico/ignore/{id}` | Toggle stato ignorato |
| POST | `/vini/ipratico/export` | Genera Excel aggiornato (QTA, nomi TRGB priority, prezzi, vini mancanti) |
| GET | `/vini/ipratico/missing` | Vini TRGB non presenti su iPratico |
| GET | `/vini/ipratico/export-defaults` | Valori default per nuovi vini nell'export |
| PUT | `/vini/ipratico/export-defaults/{id}` | Modifica valore default |
| GET | `/vini/ipratico/sync-log` | Storico sincronizzazioni |
| GET | `/vini/ipratico/stats` | Riepilogo veloce (matched, unmatched, ignored, missing) |
| 🆕 GET | `/vini/ipratico/trgb-wines` | Lista vini TRGB per il picker di collegamento manuale — `ipratico_products_router.py:309` |

> ⚠️ **Nota dati vendite:** iPratico NON esporta dati di vendita in nessun formato. Le VENDITE in TRGB vanno inserite manualmente (vedi §3.4).

---

# 8. Cantina Tools — `vini_cantina_tools_router.py` v3.x

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/vini/cantina-tools/template-v2` | Download template `.xlsx` ufficiale (4 fogli: Vini esempio, Locazioni, Riferimento valori, Istruzioni) |
| POST | `/vini/cantina-tools/import-v2` | Import dal nuovo formato (skip se ID esistente, INSERT solo nuovi) |
| GET | `/vini/cantina-tools/export-v2` | Download `.xlsx` con tutti i vini (round-trip identico al template) |
| GET | `/vini/cantina-tools/locazioni-config` | Locazioni configurate (drop-down filtro) |
| 🆕 POST | `/vini/cantina-tools/locazioni-config/{campo}` · DELETE `/locazioni-config/{campo}/{item_id}` | Salva/elimina config locazione — `vini_cantina_tools_router.py:1423,1479` |
| 🆕 GET/POST | `/vini/cantina-tools/locazioni-valori/{campo}` · `/locazioni-normalizza` · `/locazioni-vini/{campo}` · `/locazioni-check-giacenze` · `/locazioni-vino-update` | Utility bonifica/normalizzazione locazioni — `vini_cantina_tools_router.py:1503-1688` |
| 🆕 GET | `/vini/cantina-tools/inventario/pdf` · `/inventario/giacenza/pdf` · `/inventario/locazioni/pdf` · `/inventario/filtrato/pdf` · `/inventario/filtri-options` | Stampe inventario (vedi §9) — `vini_cantina_tools_router.py:794-1257` |
| 🆕 POST | `/vini/cantina-tools/inventario/selezione/pdf` | PDF per selezione di ID (vedi §9.1) — `vini_cantina_tools_router.py:1196` |
| 🆕 GET/POST | `/vini/cantina-tools/matrice/*` (`stato`, `celle/{vid}`, `assegna`, `rimuovi`, `set-celle`, `recalc-preview`, `recalc-all`, `old-values`, `import-old`) | Gestione celle scaffali matrice — `vini_cantina_tools_router.py:1726-1878` |
| 🆕 POST/GET/DELETE | `/vini/cantina-tools/backup/create` · `/backup/list` · `/backup/restore/{timestamp}` · `/backup/{timestamp}` | Backup/restore DB (WAL-safe, hardening 2026-07-12) — `vini_cantina_tools_router.py:1931-2047` |
| 🆕 POST | `/vini/cantina-tools/reset-database` | Azzera completamente il DB cantina — `vini_cantina_tools_router.py:173` |
| 🆕 POST | `/vini/cantina-tools/cleanup-duplicates` | Rimozione vini duplicati — `vini_cantina_tools_router.py:322` |
| 🆕 GET | `/vini/cantina-tools/carta-cantina` | Carta vini HTML generata dal DB cantina — `vini_cantina_tools_router.py:403` |

> **Rimossi in v3.0:** `/vini/upload` (import vecchio), `/vini/cantina-tools/sync-from-excel` (sync vecchio DB).
> **Rimossi in V-H.J 2026-05-12:** `POST /vini/cantina-tools/import-excel`, `GET /vini/cantina-tools/export-excel` (vecchio formato Excel con header storico). Sostituiti dai 3 endpoint `v2` sopra.

## 8.1 Import Excel — modalità

**(sezione superata — V-H.J 2026-05-12)** Le modalità **SAFE/FORCE** appartenevano al vecchio import Excel, rimosso. L'import attuale è solo `POST /vini/cantina-tools/import-v2`: **insert-only** — skip se l'ID esiste già, INSERT solo dei nuovi (`vini_cantina_tools_router.py:246`); non modifica né ricostruisce il magazzino esistente.

> ✅ **V-BUG1 chiuso come FALSO POSITIVO (2026-05-12, vedi roadmap.md §V riga 145):** l'endpoint `POST /vini/magazzino/import` citato dal bug non esiste; tutti gli endpoint massivi reali (`/reset-database`, `/bulk-update`, `/bulk-duplicate`, `/delete-vino/{id}`) hanno già i loro guard di ruolo.

---

# 9. Stampa inventario filtrato

## 9.1 Stampa selezionati (v4.0)

Dalla toolbar `MagazzinoVini`, pulsante "Stampa selezionati" genera direttamente un PDF con i vini selezionati (multi-select sempre attivo):
- FE: `handlePrintSelection()` invia POST con `{ ids: selectedIds }` al backend
- BE: `POST /vini/cantina-tools/inventario/selezione/pdf` — accetta lista ID via Body, genera PDF con WeasyPrint, restituisce `Response(media_type="application/pdf")`
- PDF si apre in nuovo tab via `URL.createObjectURL(blob)`
- Auth via Bearer token (non query token)

## 9.2 Stampa con filtri (modale `StampaFiltrata`)

Pannello modale con filtri componibili per generare PDF inventario:
- Ricerca libera, tipologia, nazione, regione, produttore, annata, formato
- Stato vendita, stato riordino, discontinuato, in carta
- Range quantità e prezzo
- Filtri locazione gerarchici: 3 gruppi cascading (Frigo/Loc1/Loc2 → nome → spazio) — `StampaFiltrata` mantiene filtri separati per-locazione (server-side)
- Solo con giacenza positiva
- Genera PDF via `/inventario/filtrato/pdf` con tutti i filtri come query params

---

# 10. Movimenti cantina + storico prezzi

## 10.1 Tabella `vini_ordini_pending` (Fase 3 widget)

```sql
CREATE TABLE vini_ordini_pending (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vino_id      INTEGER NOT NULL UNIQUE,
  qta          INTEGER NOT NULL CHECK (qta > 0),
  data_ordine  TEXT NOT NULL,
  note         TEXT,
  utente       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id) ON DELETE CASCADE
);
CREATE INDEX idx_vop_vino ON vini_ordini_pending (vino_id);
```

Regola: un solo ordine aperto per vino (UNIQUE). Upsert con `INSERT OR REPLACE` o pattern `UPDATE if exists else INSERT`. Quando arriva la merce → `CARICO` registrato + ordine pending cancellato (in transazione).

## 10.2 Tabella `vini_prezzi_storico` (Fase 6 widget)

```sql
CREATE TABLE vini_prezzi_storico (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vino_id      INTEGER NOT NULL,
  campo        TEXT NOT NULL CHECK (campo IN ('EURO_LISTINO','PREZZO_CARTA','PREZZO_CALICE')),
  valore_old   REAL,
  valore_new   REAL,
  data         TEXT NOT NULL,
  utente       TEXT,
  origine      TEXT,  -- 'GESTIONALE-EDIT' / 'IMPORT-CSV' / 'SCANNER-OCR'
  FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id) ON DELETE CASCADE
);
CREATE INDEX idx_vps_vino_data ON vini_prezzi_storico (vino_id, data DESC);
CREATE INDEX idx_vps_campo ON vini_prezzi_storico (campo);
```

Hook PATCH `/vini/magazzino/{id}` registra solo `EURO_LISTINO` per ora; estendibile a `PREZZO_CARTA` e `PREZZO_CALICE` senza modifiche schema.

---

# 11. Permessi e ruoli

> **Modello "gestione catalogo" (Marco 2026-05-21, vini 3.60).** Il catalogo vini
> (anagrafiche + schede bottiglia + creazione/duplica/elimina vino) è gestito da
> **admin, superadmin e sommelier**. `sala` e `viewer` hanno **sola lettura** sul
> modulo Vini. Helper backend: `is_vini_manager(role)` in `auth_service.py`
> (`admin | superadmin | sommelier`). Le operazioni distruttive di massa
> (merge anagrafiche, migrate-from-legacy, sync, sync-all, rollback) restano
> riservate ai soli admin via `is_admin()`. Eccezione operativa: i **movimenti**
> (registra/elimina carico-scarico-vendita) restano accessibili anche a `sala`,
> perché sono azioni di servizio, non gestione catalogo.

| Azione | Ruoli ammessi | Enforcement |
|--------|---------------|-------------|
| Lettura magazzino + dashboard | tutti tranne viewer | — |
| CRUD anagrafica vino (produttori, fornitori, denominazioni, vitigni, madre) | admin, superadmin, sommelier | `_require_vini_manager` in `vini_anagrafiche_router.py` |
| Crea / modifica / duplica / elimina vino-bottiglia | admin, superadmin, sommelier | `is_vini_manager` in `vini_magazzino_router.py` (`create`, `PATCH /{id}`, `duplica`, `delete-vino`) |
| Modifica giacenze (scheda bottiglia) | admin, superadmin, sommelier | `PATCH /vini/magazzino/{id}` → `is_vini_manager` |
| Toggle "bottiglia in mescita" / servizio al calice | admin, superadmin, sommelier, **sala** | `PATCH /vini/magazzino/{id}/bottiglia-aperta` (endpoint dedicato — azione operativa, vedi sotto) |
| Movimenti (add) | admin, superadmin, sommelier, sala | nessun check ruolo su `POST /{id}/movimenti` (azione operativa) |
| Movimenti (delete) | admin, superadmin, sommelier, sala | check inline in `delete_movimento` |
| Movimenti (modifica data/ora) | admin only | check inline in `update_movimento_data` |
| Merge anagrafiche / migrate / sync / sync-all / rollback | admin only | `_require_admin` |
| Bulk-update / bulk-duplicate vini | admin only | `is_admin` inline |
| Import Excel (`import-v2`, insert-only) | admin, superadmin, sommelier | — |
| ~~Import Excel FORCE~~ | **(rimosso — modalità inesistente, V-BUG1 chiuso come falso positivo, vedi §8.1)** | — |
| iPratico mapping/sync | admin, superadmin, sommelier | — |
| Settings Carta | admin, superadmin, sommelier | — |
| Carta Bevande — editing | admin, superadmin, sommelier | `_require_editor` |
| Carta Bevande — lettura/export | tutti tranne viewer | `_require_reader` |

Pattern: `Depends(get_current_user)` + check ruolo nel router. Frontend: la
`SchedaVino` calcola `roReadOnly` da `is_vini_manager` e nasconde i bottoni
Modifica/Duplica/Elimina ai ruoli non-manager; `MagazzinoSubMenu` e
`DashboardVini` nascondono la voce "Nuovo vino" a `sala`/`viewer`.

**Andamento giacenza giorno-per-giorno (vini 3.60, rivisto in 3.62).** La tab
Giacenze della scheda vino ha un box "📈 Andamento giacenza — dal primo
movimento" con grafico a linea step-after. Dietro c'è
`GET /vini/magazzino/{id}/giacenza-storica?days=30` che chiama
`giacenza_storica_vino()` in `vini_magazzino_db.py`: replay forward di
`vini_magazzino_movimenti` dal primo storico (`CARICO +`, `SCARICO/VENDITA −`,
`RETTIFICA :=` assoluto, `MODIFICA` no-op), end-of-day per ogni giornata con
movimenti, forward-fill nei giorni vuoti.

**Finestra adattiva (3.62):** `days=30` è un MINIMO. Se il primo movimento è
più vecchio, la finestra si estende all'indietro fino a quella data — così
ogni vino mostra TUTTA la sua storia di magazzino.

**Calibrazione (3.62):** se il replay forward non torna su `QTA_TOTALE`
attuale (drift ≠ 0 — tipico per vini esistenti prima del primo movimento
registrato), la serie viene shiftata di `−drift` così che l'ultimo punto
coincida con la giacenza di oggi. Senza calibrazione si vedrebbero valori
negativi (era il caso #1205 in produzione 2026-06-07).

Risposta: `series` (un punto per giorno della finestra adattiva),
`qta_attuale`, `drift`, `offset` (= `−drift`, lo shift applicato),
`ricalibrata` (bool), `parziale`, `min`/`max`/`primo_movimento`. UI: badge
"🔧 ricalibrata ±N" con tooltip che spiega la natura dello shift quando
applicabile. La curva aggregata sul vino madre (somma annate) è prevista come
follow-up.

**Toggle mescita al calice — endpoint dedicato (vini 3.60).** Aprire/chiudere
una bottiglia "in mescita" è un'azione **operativa di servizio**, non gestione
catalogo: la deve poter fare anche `sala`. Vive su un endpoint dedicato
`PATCH /vini/magazzino/{id}/bottiglia-aperta` (gate inline: `is_vini_manager`
OR `sala`) che accetta SOLO i campi del servizio al calice (`BOTTIGLIA_APERTA`,
`VENDITA_CALICE`, `PREZZO_CALICE`, `PREZZO_CALICE_MANUALE`, `NOTE`). La modifica
di catalogo/anagrafica/giacenze resta su `PATCH /vini/magazzino/{id}` gatato
`is_vini_manager`. Lo usano: widget `CaliciDisponibiliCard`, `CartaVini`,
`ViniVendite` (`patchAttivaCalice`), `SchedaVino` (`toggleBottigliaAperta`).
Storia: l'endpoint nasce per correggere una regressione introdotta gatando
`PATCH /{id}` — il toggle ci passava dentro e `sala` non poteva più spegnere
le bottiglie aperte dal widget Calici.

**Modifica vino madre — punti d'accesso (vini 3.60).** Il vino madre si può
modificare da tre punti, tutti con lo stesso modale `MadreEditModal`
(`frontend/src/components/vini/MadreEditModal.jsx` — estratto da
`AnagraficheVini.jsx` per il riuso): (1) modulo **Anagrafiche** → tab Madri;
(2) **wizard Nuovo Vino** (in creazione); (3) **Cantina** → vista raggruppata
per madre → `SchedaMadreV2` → bottone "✎ Modifica" (gated `is_vini_manager`;
per gli altri ruoli la scheda madre resta 🔒 read-only). `MadreEditModal` fa
self-fetch del madre completo via `GET /madre/{id}`, quindi funziona anche
ricevendo un `madre` parziale (es. da `groupByMadre`).

---

# 12. Bug noti / debt tecnico

- **V-BUG1**: **chiuso — FALSO POSITIVO** (2026-05-12): l'endpoint FORCE import non esiste, guard già presenti sugli endpoint massivi reali → vedi §8.1 e roadmap.md §V
- **Modelli deprecated** (V-H.J 2026-05-12): `vini_db.py` **rimosso** (non più in `app/models/`); `vini_model.py` ridotto a stub deprecati con `NotImplementedError`. Cleanup definitivo in V-H.I.
- **`/dashboard` PRIMA di `/{id}`**: regola applicata, ma da non rompere se si rifattora il router
- **Filtri server-side per dataset grandi**: oggi tutti clientside con `useMemo`, da spostare a server quando il magazzino crescerà oltre ~5000 vini
- **Indice `(vino_id, tipo, data_mov)` su `vini_magazzino_movimenti`**: verificato 2026-07-25 — **non presente**; esiste solo `idx_vmm_vino_data (vino_id, data_mov)` (`vini_magazzino_db.py:347`). La variante con `tipo` resta da valutare

---

# 13. Storico bugfix significativi

- **Dicembre 2025:** eliminati duplicati importazioni precedenti, ripristinati 1186 record reali, consolidata protezione ID
- **Marzo 2026:** fix smart quotes (U+201C/U+201D) nel router che causavano `SyntaxError` al boot; fix mode bit `deploy.sh`; deploy senza password configurato via sudoers
- **2026-03-15:** consolidamento DB — eliminato `vini.sqlite3`, tutto su `vini_magazzino.sqlite3`. Allineamento CSS HTML ↔ PDF. DOCX con tabelle allineate. Unificazione loader carta. Fix cancellazione movimenti (delta inverso).
- **2026-03-16:** filtro locazione unificato (2 dropdown), stampa selezionati diretta PDF, SchedaVino layout sidebar+main con colori dinamici per TIPOLOGIA.
- **2026-04-19:** Carta Vini embeddata come sezione della Carta Bevande (Fase 1-3 sub-module). Sezione `vini_dinamico` delega a `carta_vini_service` esistente, nessuna modifica al motore vini.
- **2026-04-20 (sessione 51):** widget riordini per fornitore — refactor 8 fasi (vedi `modulo_vini_widget_dashboard.md`).
- **2026-04-24:** widget alert "Vini in carta senza giacenza" — refactor 6 fasi A-F (vedi `modulo_vini_widget_dashboard.md`).
