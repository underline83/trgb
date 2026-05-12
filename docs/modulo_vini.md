# Modulo Vini — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08
**Stato:** stabile, in evoluzione (sub-module Carta Bevande FE/BE pronto, manca popolamento dati Marco; sub-module iPratico stabile; widget dashboard a 14 fasi cumulative — vedi `docs/modulo_vini_widget_dashboard.md`)
**Versione modulo (`versions.jsx`):** vini 4.x · cantina (magazzino) v3.x · carta_bevande v1.0
**Roadmap:** sezione `V.` di `docs/roadmap.md` per priorità e voci aperte

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
- `app/models/vini_db.py` — vecchio schema DB pre-v3.0, non più importato (rimuovere in cleanup V-H.I)
- `app/models/vini_model.py` — V-H.J 2026-05-12: ridotto a stub deprecati con `NotImplementedError`. Costanti `TIPOLOGIA_VALIDE`/`FORMATO_VALIDI` spostate in `app/services/vini_xlsx_v2.py` (single source of truth)
- `frontend/src/pages/vini/CantinaTools.jsx`, `frontend/src/pages/vini/ViniDatabase.jsx` — non più routate in `App.jsx`, marcate `@version: DEPRECATO`. Cleanup V-H.I

---

# 3. Magazzino (cantina interna)

## 3.1 Pagine frontend

| Pagina | Route | Descrizione |
|--------|-------|-------------|
| `ViniMenu.jsx` | `/vini` | Hub modulo |
| `MagazzinoVini.jsx` | `/vini/magazzino` | Lista vini + pannello dettaglio rapido |
| `MagazzinoViniDettaglio.jsx` | `/vini/magazzino/:id` | Scheda completa (anagrafica, giacenze, movimenti, note) |
| `MagazzinoViniNuovo.jsx` | `/vini/magazzino/nuovo` | Form creazione nuovo vino |
| `MagazzinoAdmin.jsx` | `/vini/magazzino/admin` | Tabellona modifica massiva (admin only) |
| `DashboardVini.jsx` | `/vini/dashboard` | Dashboard operativa (vedi §4) |
| `RegistroMovimenti.jsx` | `/vini/movimenti` | Storico globale movimenti |
| `iPraticoSync.jsx` | `/vini/ipratico` | Sync e mapping iPratico |
| `ViniImpostazioni.jsx` | `/vini/impostazioni` | Settings Carta + locazioni |

Sub-menu: `MagazzinoSubMenu.jsx` (Magazzino, Dashboard, Import, Impostazioni).

## 3.2 Filtri MagazzinoVini (v4.x)

**Ricerca testuale:** ID DB, ID Excel (`id_excel`), descrizione, denominazione, produttore, codice, regione/nazione.

**Numerici:** giacenza totale (>, <, tra), solo positiva, prezzo carta.

**Combinati:** tipologia, nazione, regione, produttore. Le liste sono dipendenti (riducono dinamicamente con `useMemo` clientside).

**Filtro locazione unificato (v4.0):** sostituisce i 6 select gerarchici della v3.0. Due dropdown:
- **Locazione** — nomi unici da tutte le sezioni (Frigorifero, Locazione 1/2/3) deduplicati e ordinati
- **Spazio** — spazi disponibili per la locazione selezionata (inclusi spazi matrice `(col,riga)`)

Il filtro cerca contemporaneamente in tutte e 4 le colonne DB (`FRIGORIFERO`, `LOCAZIONE_1/2/3`). Senza spazio = tutti i vini in quel contenitore. Con spazio = match esatto su `"nome - spazio"`. Valori da `locazioni_config` via endpoint `/locazioni-config`.

## 3.3 Scheda dettaglio vino — `SchedaVino.jsx` v5.x

Layout `grid-cols-[260px_1fr]`: sidebar tinta dinamica per TIPOLOGIA + area main scrollabile.

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
| VENDITA | 🛒 | violet | Vendita commerciale (inserimento manuale — iPratico non esporta dati) |
| RETTIFICA | ✏️ | amber | Correzione giacenza (inventario, errori) |

**Note modello dati:**
- Le VENDITE sono inserite manualmente (iPratico non esporta dati dalle vendite in nessun formato)
- SCARICO ≠ VENDITA: scarico = uscita senza corrispettivo commerciale
- Ogni modifica giacenza da UI genera automaticamente una RETTIFICA

**Tabella `vini_magazzino_movimenti`:** `id`, `vino_id` (FK), `tipo`, `qta`, `note`, `utente`, `data_mov`. Indice consigliato: `(vino_id, tipo, data_mov)`.

## 3.5 Tabella `vini_magazzino` — campi

Aggiornato 2026-05-12 (audit post-sessione 2026-05-11).

**Anagrafica**
- `id` INTEGER PK — immutabile
- `id_excel` INTEGER UNIQUE — id di origine se importato da Excel
- `TIPOLOGIA` TEXT NOT NULL — lista controllata in `vini_model.TIPOLOGIA_VALIDE`
- `NAZIONE` TEXT NOT NULL
- `REGIONE` TEXT
- `CODICE` TEXT — campo legacy attualmente non utilizzato (rivedere)
- `DESCRIZIONE` TEXT NOT NULL
- `DENOMINAZIONE` TEXT
- `ANNATA` TEXT — stringa "YYYY", validata FE
- `VITIGNI` TEXT — testo libero (V.8 prevede normalizzazione)
- `GRADO_ALCOLICO` REAL
- `FORMATO` TEXT — lista controllata in `vini_model.FORMATO_VALIDI`
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

**Stati codificati (lettera/numero — eredità Excel, V.F roadmap futura)**
- `STATO_VENDITA` TEXT: N/T/V/F/S/C
- `STATO_RIORDINO` TEXT: D/0/A/X (mig 122 — 'O' rimosso)
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
| POST | `/vini/magazzino/import` | Import Excel (SAFE / FORCE) |
| POST | `/vini/magazzino/check-duplicati` | Verifica duplicati pre-import |
| POST | `/vini/magazzino/{id}/duplica` | Duplica con nuova annata (Fase 2 widget) |
| GET | `/vini/magazzino/ordini-pending/` | Lista ordini pending (Fase 3 widget) |
| POST | `/vini/magazzino/{id}/ordine-pending` | Upsert ordine (Fase 4 widget) |
| DELETE | `/vini/magazzino/{id}/ordine-pending` | Cancella ordine pending |
| POST | `/vini/magazzino/{id}/ordine-pending/conferma-arrivo` | Converte ordine → CARICO (Fase 5 widget) |
| GET | `/vini/magazzino/{id}/prezzi-storico/` | Storico prezzi vino (Fase 6 widget) |

⚠ **Nota router:** `GET /dashboard` deve essere dichiarato PRIMA di `GET /{vino_id}` per evitare che FastAPI interpreti "dashboard" come `vino_id` intero (genera 422).

## 3.7 Modifica massiva — `MagazzinoAdmin.jsx` v2.0

Tabellona editabile per admin con tutte le colonne principali:
- Click sugli header per ordinamento ASC/DESC (▲/▼/⇅)
- Colonne FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2 con dropdown valori configurati (tipo `loc_select`)
- Valori non configurati mostrati con suffisso "(non config.)"
- Salvataggio riga singola o batch

---

# 4. Dashboard Vini — `DashboardVini.jsx` v4.x

## 4.1 KPI Stock (4 tile)

| Tile | Dato | Drill-down |
|------|------|------------|
| 🍾 Bottiglie in cantina | `total_bottiglie` su `n` referenze | — |
| 📋 Vini in carta | `vini_in_carta` con % su catalogo | — |
| ⚠️ Senza prezzo listino | `vini_senza_listino` | ✅ tabella inline + link a scheda |
| 💤 Vini fermi (30gg) | giacenza > 0 e nessun movimento in 30gg (include mai movimentati) | ✅ lista espandibile |

## 4.2 KPI Vendite (4 tile)
- 🛒 Bottiglie vendute ultimi 7gg
- 📈 Bottiglie vendute ultimi 30gg
- 💰 Valore acquisto totale (QTA × listino)
- 💎 Valore carta totale (QTA × prezzo carta)

## 4.3 Alert e widget (vedi `modulo_vini_widget_dashboard.md` per il dettaglio delle 14 fasi)

- 🚨 **Vini in carta senza giacenza** (banner alert collassabile, 6 fasi A-F implementate): pill `+ ordina · N` inline con qta suggerita storico 60gg ÷ 2; badge ritmo vendita (top/medio/poco/mai); pill stato riordino (📝 Da ordinare / 📦 Ordinato / 🗓️ Annata esaurita / ⛔ Non ricomprare — 4 stati dopo rimozione 'O' 2026-05-11); chip filtro tipologia (Tutti/Rossi/Bianchi/Bollicine/Rosati/Altri); toggle raggruppa per distributore (persistito in `localStorage`); bottone `✅ Arrivato` inline.
- 💤 **Vini fermi** — lista espandibile, "mai movimentato" evidenziato
- **Vendite recenti** (col sx) + **Movimenti operativi** (col dx)
- **Top venduti 30gg** (larghezza piena) — ranking a barre, click → scheda vino
- **Distribuzione tipologie** — barre proporzionali con contatore
- **📦 Riordini per fornitore** (sezione gestionale completa, 8 fasi 1-8 implementate): tabella raggruppata per distributore con sort produttore, pulsante info dedicato, duplica con nuova annata, colonna riordino + modale qty, bottone arrivato + carico, listino inline editabile con storico, sort multi-colonna.

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

> Endpoint legacy mantenuti per retro-compat anche dopo l'introduzione della Carta Bevande (vedi §6).

## 5.2 Flusso dati

1. `load_vini_ordinati()` legge da `vini_magazzino.sqlite3` (WHERE `CARTA='SI'`)
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

- Ordine tipologie (lista riordinabile con frecce)
- Ordine nazioni (riordinabile)
- Ordine regioni per nazione
- Filtri carta: quantità minima, mostra negativi, mostra senza prezzo

## 5.5 Voci roadmap aperte (vedi `roadmap.md` §V)
- PDF con indici cliccabili (TOC con link interni)
- Versioning della carta (storico PDF)
- Template multipli (eventi, degustazioni)

---

# 6. Carta Bevande (sub-module)

> Versione 1.0 — Backend (Fase 1) e Frontend editor (Fase 2) e Export unificato (Fase 3) **completati 2026-04-19**. Manca **Fase 4 popolamento dati Marco**.

## 6.1 Posizionamento UI

Tab **"Carta"** nel sub-menu Vini (nome invariato). La pagina diventa hub con 8 card (Vini come hero span 2 col).

| Ordine | Sezione | Emoji | Key |
|--------|---------|-------|-----|
| 1 | Vini | 🍷 | `vini` (hero, dati da `vini_magazzino`) |
| 2 | Aperitivi | 🍸 | `aperitivi` |
| 3 | Birre | 🍺 | `birre` |
| 4 | Amari fatti in casa | 🌿 | `amari_casa` |
| 5 | Amari & Liquori | 🥃 | `amari_liquori` |
| 6 | Distillati | 🥂 | `distillati` (Grappa/Rum/Whisky via tag tipologia) |
| 7 | Tisane | 🍵 | `tisane` |
| 8 | Tè | 🫖 | `te` |

## 6.2 Rotte

```
/vini/carta                       → Hub (CartaBevande.jsx)
/vini/carta/vini                  → Preview + export Carta Vini (CartaVini.jsx)
/vini/carta/sezione/:key          → Editor sezione (CartaSezioneEditor.jsx)
/vini/carta/anteprima             → Preview completa master (CartaAnteprima.jsx)
```

## 6.3 Modello dati — `bevande.sqlite3`

DB isolato (coerente con `notifiche.sqlite3`, `cg.sqlite3`) per backup/restore semplificati.

**Tabella `bevande_sezioni`:** `id` PK, `key` UNIQUE, `nome`, `intro_html`, `ordine`, `attivo`, `layout` (`tabella_4col`/`scheda_estesa`/`nome_badge_desc`), `schema_form` JSON (per editor dinamico), `created_at`, `updated_at`. Seed iniziale: 8 sezioni con `layout` di default.

**Tabella `bevande_voci`:** tutte le voci di tutte le sezioni in tabella piatta. Campi: `id`, `sezione_key`, `nome`, `sottotitolo`, `descrizione`, `produttore`, `regione`, `formato`, `gradazione`, `ibu`, `tipologia`, `paese_origine`, `prezzo_eur`, `prezzo_label` (override testuale), `tags` JSON, `extra` JSON catch-all, `ordine`, `attivo`, `note_interne` (visibili solo PDF-staff), `created_at`, `updated_at`. Indici: `idx_bevande_voci_sezione (sezione_key, ordine)`, `idx_bevande_voci_attivo`.

## 6.4 Pattern di render (3 layout)

- **Pattern A — `tabella_4col`** (Distillati, Amari & Liquori): `[REGIONE/PAESE] [PRODUTTORE] [NOME + annata] [€]`. Compatto.
- **Pattern B — `scheda_estesa`** (Birre, Aperitivi, Amari fatti in casa): nome + sottotitolo + meta line (produttore · stile · formato · grad · IBU) + descrizione + prezzo.
- **Pattern C — `nome_badge_desc`** (Tisane, Tè): nome + badge tipologia colorato + descrizione/ingredienti + paese origine (solo tè).

Aggiungere un nuovo pattern = aggiungere una funzione Python in `carta_bevande_service.py` + un valore enum. Zero migration.

## 6.5 Endpoint Carta Bevande

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/bevande/sezioni/` | Lista sezioni + conteggi voci totali/attive (per card hub) |
| GET | `/bevande/sezioni/{key}` | Dettaglio + schema_form parsato |
| PUT | `/bevande/sezioni/{key}` | Aggiorna nome/intro_html/ordine/attivo/layout/schema_form |
| POST | `/bevande/sezioni/reorder` | Riordino batch |
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
2. **URL pubblico `/carta-bevande`:** NO. Solo staff con JWT.
3. **Versioning automatico:** SÌ (vedi §6.6).
4. **Mattone M.B PDF brand:** non aspettiamo. Pipeline attuale `carta_vini_service` estesa in `carta_bevande_service`. Quando M.B arriverà, migreremo.

## 6.8 Da fare (Fase 4)

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

> ⚠️ **Nota dati vendite:** iPratico NON esporta dati di vendita in nessun formato. Le VENDITE in TRGB vanno inserite manualmente (vedi §3.4).

---

# 8. Cantina Tools — `vini_cantina_tools_router.py` v3.x

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/vini/cantina-tools/template-v2` | Download template `.xlsx` ufficiale (4 fogli: Vini esempio, Locazioni, Riferimento valori, Istruzioni) |
| POST | `/vini/cantina-tools/import-v2` | Import dal nuovo formato (skip se ID esistente, INSERT solo nuovi) |
| GET | `/vini/cantina-tools/export-v2` | Download `.xlsx` con tutti i vini (round-trip identico al template) |
| GET | `/vini/cantina-tools/locazioni-config` | Locazioni configurate (drop-down filtro) |

> **Rimossi in v3.0:** `/vini/upload` (import vecchio), `/vini/cantina-tools/sync-from-excel` (sync vecchio DB).
> **Rimossi in V-H.J 2026-05-12:** `POST /vini/cantina-tools/import-excel`, `GET /vini/cantina-tools/export-excel` (vecchio formato Excel con header storico). Sostituiti dai 3 endpoint `v2` sopra.

## 8.1 Import Excel — modalità

**SAFE (default):** ID DB preservati, aggiorna solo i campi consentiti, magazzino esistente preservato.

**FORCE (solo admin):** riallineamento completo database, modifiche massicce e ricostruzione tabella.

> ⚠️ **Bug aperto V-BUG1 (vedi roadmap.md §V):** controllo ruolo per FORCE non ancora implementato in `vini_magazzino_router.py`. Attualmente chiunque può eseguire FORCE anche senza ruolo admin. Da fixare.

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

| Azione | Ruoli ammessi |
|--------|---------------|
| Lettura magazzino + dashboard | tutti tranne viewer |
| CRUD anagrafica vino | admin, superadmin, sommelier |
| Modifica giacenze | admin, superadmin, sommelier |
| Movimenti (add) | admin, superadmin, sommelier, sala (limitato VENDITA?) |
| Movimenti (delete) | admin, superadmin, sommelier |
| Import Excel SAFE | admin, superadmin, sommelier |
| Import Excel FORCE | admin only **(non ancora controllato — V-BUG1)** |
| iPratico mapping/sync | admin, superadmin, sommelier |
| Settings Carta | admin, superadmin, sommelier |
| Carta Bevande — editing | admin, superadmin, sommelier |
| Carta Bevande — lettura/export | tutti tranne viewer |

Pattern: `Depends(get_current_user)` + check ruolo nel router.

---

# 12. Bug noti / debt tecnico

- **V-BUG1**: FORCE import senza ruolo check → vedi §8.1 e roadmap.md §V
- **Modelli deprecated** (V-H.J 2026-05-12): `vini_db.py` non importato; `vini_model.py` ridotto a stub deprecati con `NotImplementedError`. Cleanup definitivo in V-H.I.
- **`/dashboard` PRIMA di `/{id}`**: regola applicata, ma da non rompere se si rifattora il router
- **Filtri server-side per dataset grandi**: oggi tutti clientside con `useMemo`, da spostare a server quando il magazzino crescerà oltre ~5000 vini
- **Indice `(vino_id, tipo, data_mov)` su `vini_magazzino_movimenti`**: verificare se presente, altrimenti aggiungere

---

# 13. Storico bugfix significativi

- **Dicembre 2025:** eliminati duplicati importazioni precedenti, ripristinati 1186 record reali, consolidata protezione ID
- **Marzo 2026:** fix smart quotes (U+201C/U+201D) nel router che causavano `SyntaxError` al boot; fix mode bit `deploy.sh`; deploy senza password configurato via sudoers
- **2026-03-15:** consolidamento DB — eliminato `vini.sqlite3`, tutto su `vini_magazzino.sqlite3`. Allineamento CSS HTML ↔ PDF. DOCX con tabelle allineate. Unificazione loader carta. Fix cancellazione movimenti (delta inverso).
- **2026-03-16:** filtro locazione unificato (2 dropdown), stampa selezionati diretta PDF, SchedaVino layout sidebar+main con colori dinamici per TIPOLOGIA.
- **2026-04-19:** Carta Vini embeddata come sezione della Carta Bevande (Fase 1-3 sub-module). Sezione `vini_dinamico` delega a `carta_vini_service` esistente, nessuna modifica al motore vini.
- **2026-04-20 (sessione 51):** widget riordini per fornitore — refactor 8 fasi (vedi `modulo_vini_widget_dashboard.md`).
- **2026-04-24:** widget alert "Vini in carta senza giacenza" — refactor 6 fasi A-F (vedi `modulo_vini_widget_dashboard.md`).
