# Modulo Selezioni del Giorno — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03 (zona Formaggi: 2026-10-01)
> **Vedi anche:** [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) (modulo padre), [modulo_vendite.md](modulo_vendite.md) (non confondere — quello è il modulo Cassa)

**Creato:** 2026-05-19 (audit autonomo — gap CRIT-2); riempito da stub a pagina completa il 2026-08-03
**Versione (`versions.jsx`):** selezioni v1.2 (beta)
**Modulo tecnico:** sub-modulo di `ricette` per la doc canonica (ma vedi §7 "DA CHIEDERE A MARCO")
**Backend prefix:** `/macellaio/`, `/salumi/`, `/formaggi/`, `/pescato/`, `/piatti-giorno/` (registrati in `main.py:728-732`)
**Frontend route:** `/selezioni/:zona` (pagina shell unica)
**DB:** `foodcost.db` via `get_cucina_connection()` (`app/models/cucina_db.py` — alias Fase 0 dello split cucina: stesso file di foodcost, destinato a `cucina.sqlite3` in Fase 1)

---

## 0. Disambiguazione (NOMEN-1)

⚠️ Non confondere con il modulo **Vendite/Cassa** (`docs/modulo_vendite.md`). Quello tratta corrispettivi, chiusure cassa, chiusure turno. Questo tratta **proposte cucina del giorno**: macellaio, salumi, formaggi, pescato, piatti del giorno.

---

## 1. Cos'è

Sotto-modulo di Ricette/FoodCost che gestisce le "Selezioni del Giorno": **5 zone quasi-gemelle** di proposte che l'oste/cucina inserisce e la sala racconta al cliente. Ogni zona è: CRUD voci + categorie configurabili (nome/emoji/ordine/attivo) + config widget Home.

Le 5 zone sono strutturalmente identiche ma vivono in 5 router separati (5 set di tabelle) per chiarezza semantica; il frontend invece è UNA pagina generica guidata da configurazione (§4).

Esistono **due modelli di stato**, non uno:

| Modello | Zone | Semantica | Endpoint di toggle |
|---|---|---|---|
| **venduto** | macellaio, pescato | il pezzo fisico si esaurisce durante il servizio ("disponibile ↔ venduto"); default lista `?stato=tutti` | `PATCH /{id}/venduto` |
| **attivo** | salumi, formaggi, piatti-giorno | la voce è "in carta ↔ archiviata" (riattivabile nei giorni successivi); default lista `?stato=attivi` | `PATCH /{id}/attivo` (mig 093/107) |

Per salumi/formaggi il vecchio `PATCH /{id}/venduto` esiste ancora ma è **deprecated** e mappato su `attivo` (retrocompat; le colonne `venduto`/`venduto_at` restano nel DB). Le liste accettano gli alias legacy `disponibili→attivi`, `venduti→archiviati`.

---

## 2. Le 5 zone (verificato sul codice)

| Zona | Router | Mig | Tabelle (`foodcost.db`) | Stato | Campi extra oltre a nome/categoria/grammatura_g/prezzo_euro/note |
|---|---|---|---|---|---|
| **Macellaio** (carne) | `app/routers/scelta_macellaio_router.py` (v2.0) | 067 (tagli), 069 (categorie+config) | `macellaio_tagli`, `macellaio_categorie`, `macellaio_config` | venduto | — |
| **Salumi** | `app/routers/scelta_salumi_router.py` (v1.1) | 091, 093 (attivo) | `salumi_tagli`, `salumi_categorie`, `salumi_config` | attivo | `produttore`, `stagionatura`, `origine_animale`, `territorio`, `descrizione` |
| **Formaggi** | `app/routers/scelta_formaggi_router.py` (v1.2) | 092, 093 (attivo), 107 (paese), 177 (ordine/ruolo/ingrediente) | `formaggi_tagli`, `formaggi_categorie`, `formaggi_config` | attivo | `produttore` (caseificio), `stagionatura`, `latte`, `territorio`, `paese` (🇮🇹/🇫🇷/altro), `descrizione`, `posizione`, `ruolo` (base/alternativa), `alternativa_di_id`, `ingredient_id` — v. §5-bis |
| **Pescato** | `app/routers/scelta_pescato_router.py` (v1.0) | 094 | `pescato_tagli`, `pescato_categorie`, `pescato_config` | venduto | `zona_fao` (provenienza FAO) |
| **Piatti del Giorno** | `app/routers/piatti_giorno_router.py` (v1.0) | 107 | `piatti_giorno`, `piatti_giorno_categorie`, `piatti_giorno_config` | attivo | `descrizione` (racconto sala) |

Schema tabelle voci (verificato via PRAGMA 2026-08-03): `id, nome, categoria (TEXT, denormalizzata per nome), grammatura_g, prezzo_euro, [campi extra], note, venduto, venduto_at, [attivo, archiviato_at], created_at, updated_at`. Categorie: `id, nome (UNIQUE), emoji, ordine, attivo, created_at, updated_at`. Config: chiave/valore (`chiave, valore, updated_at`).

> Le categorie NON sono enum hardcoded: sono righe configurabili da UI (es. per pescato: pesce/crostacei/molluschi sono semplici categorie di default in `pescato_categorie`, modificabili). Il rename di una categoria si propaga alle voci che la usano (UPDATE sulle righe con quel nome).

---

## 3. Endpoint (pattern comune, righe verificate)

**Auth:** dal 2026-09-01 (M.G) i router hanno a livello router `richiede_ruoli("admin", "chef", "sala", "sommelier")` (lettura + toggle stato) e su POST/PUT/DELETE `richiede_ruoli("admin", "chef")` — la cucina scrive, la sala consulta e segna lo stato. (Verificato su `scelta_formaggi_router.py` il 2026-10-01; v. `docs/audit_permessi_2026-09-01.md`.)

Pattern (righe per macellaio · salumi · formaggi · pescato · piatti-giorno):

- `GET /` — lista voci (:166 · :200 · :206 · :177 · :174). Query `?stato=`: `disponibili|venduti|tutti` per modello venduto (default `tutti`); `attivi|archiviati|tutti` per modello attivo (default `attivi`, alias legacy accettati). ⚠️ Non esiste un filtro per data: la "quotidianità" è gestita cancellando/archiviando le voci, non con un campo data
- `POST /` — crea voce (:188 · :229 · :234 · :199 · :202)
- `PUT /{id}` — modifica voce (:207 · :256 · :278 · :223 · :226)
- `PATCH /{id}/venduto` — toggle venduto (macellaio :230, pescato :250; salumi :311 e formaggi :349 **deprecated** → mappato su attivo). Non esiste per piatti-giorno
- `PATCH /{id}/attivo` — toggle in carta/archivio (salumi :286, formaggi :324, piatti-giorno :253). Non esiste per macellaio/pescato
- `DELETE /{id}` — elimina voce, 204 (:252 · :342 · :379 · :272 · :275)
- `GET /categorie/` — lista categorie ordinate (`?solo_attive=true` default) (:270 · :360 · :397 · :290 · :293)
- `POST /categorie/` — crea categoria, 409 su nome duplicato (:285 · :375 · :412 · :305 · :308)
- `PUT /categorie/{id}` — modifica + propaga rename alle voci (:308 · :398 · :435 · :328 · :331)
- `DELETE /categorie/{id}` — elimina solo se nessuna voce la usa, altrimenti 409 (:345 · :434 · :471 · :364 · :367)
- `GET /config/` / `PUT /config/` — config widget (:374/:388 · :463/:476 · :500/:513 · :393/:406 · :396/:407)

**Config reale (chiave/valore):** `widget_max_categorie` (default 4) per tutte le zone; macellaio/salumi/formaggi/pescato hanno anche `widget_preview_mode` (`categorie|tagli|tutto`, default `categorie`) e `widget_preview_max` (default 3) per la preview della card Home (sessione 2026-05-08). Piatti-giorno espone solo `widget_max_categorie`. ⚠️ La config NON contiene flag venduto/sort_order/visibilità delle voci (quelli stanno sulle voci/categorie).

Trailing slash: gli endpoint root e i sotto-path `categorie/`/`config/` sono definiti CON slash finale — le chiamate FE devono averlo (regola TRGB anti-307).

---

## 4. Frontend

**Pagina unica** `frontend/src/pages/selezioni/SelezioniDelGiorno.jsx` su route `/selezioni/:zona` (`App.jsx:493-501`; `/selezioni` → redirect a `/selezioni/macellaio`; redirect legacy `/macellaio`, `/salumi`, `/formaggi`, `/pescato` → `/selezioni/<zona>`). Layout: sidebar zone a sinistra + pannello a destra.

- `zonaConfig.js` — config delle 5 zone (`ZONA_ORDER = macellaio, pescato, salumi, formaggi, piatti-giorno`): endpoint, modello stato, campi extra, accent color, raggruppamento (formaggi raggruppati per `paese` come categoria madre)
- `ZonaPanel.jsx` — pannello CRUD generico guidato da `ZONA_CONFIG`: lista filtrata per stato, form inline con campi extra, toggle venduto/attivo, gestione via `apiFetch` con trailing slash
- Permessi: `ProtectedRoute module="selezioni"` — modulo dedicato in `app/data/modules.json` (key `selezioni`, label "Selezioni del Giorno")
- Widget Home: `components/widgets/SelezioniCard.jsx` (usato in `Home.jsx` e `DashboardSala.jsx`), pilotato dalle config widget di zona (§3)
- Accesso da menu: nessuna tile Home dedicata (decisione sessione 2026-04-20) — sotto-voci del dropdown "Gestione Cucina" (`config/modulesMenu.js`: Selezioni · Macellaio/Pescato/Salumi/Formaggi; piatti-giorno non ha voce nel dropdown, si raggiunge dalla sidebar della pagina)
- Impostazioni: sezioni "Scelta Macellaio/Pescato/Salumi/Formaggi" + "Widget Home" nella sidebar di `RicetteSettings.jsx` (categorie + config widget)

> (storico, superato) I file `pages/tasks/SceltaMacellaio.jsx`, `SceltaSalumi.jsx`, `SceltaFormaggi.jsx` erano le pagine v1 per-zona: in `App.jsx:115-120` restano solo come import lazy **orfani** (nessuna route li usa più). Candidati a pulizia.

---

## 5. Concetti chiave

- **Quotidianità**: a differenza delle ricette stabili (modulo padre), le Selezioni hanno ciclo di vita breve — inserite la mattina, marcate venduto (carne/pesce) o archiviate/riattivate (salumi/formaggi/piatti) durante il servizio. Nessun campo "data del giorno": lo stato È il ciclo di vita.
- **No foodcost calcolato**: le Selezioni non passano dal motore foodcost (nessun legame con `recipes`; `prezzo_euro` è il prezzo di vendita raccontato in sala, la grammatura un'indicazione). **Eccezione dal 2026-10-01:** i formaggi possono collegarsi a un `ingredients.id` per leggerne il costo corrente (sola lettura, §5-bis).
- **Due semantiche di stato** (venduto vs attivo) — vedi §1. È la differenza operativa principale tra le zone.
- **Formaggi è la zona più ricca**: raggruppamento per `paese` (mig 107), ordine di servizio, base/alternative e link all'ingrediente Food cost (mig 177, §5-bis). Il router scrive solo le colonne presenti (`_colonne()`), per robustezza pre-migrazione.
- **Piatti del Giorno** (mig 107) è la 5ª zona: piatti finiti fuori carta (es. "tagliolini al ragù di cinghiale"), non materia prima. Stesse categorie configurabili delle altre zone (default: Antipasto/Primo/Secondo/Contorno/Dolce/Speciale) — ha anch'essa le tabelle categorie, contrariamente a quanto ipotizzato nell'audit 2026-05-19.

---

## 5-bis. Formaggi: ordine di servizio, alternative, ingrediente, taglieri (2026-10-01, mig 177)

**Colonne** (tutte nullable, `ruolo` backfill `base`):
- `posizione` — ordine di servizio dal più delicato al più intenso, per paese. `GET /formaggi/` ordina per `posizione`, poi base prima delle alternative, poi nome.
- `ruolo` — `base` (nel tagliere standard) | `alternativa` (sostituisce il formaggio di quel posto). Le alternative stanno di norma in archivio, pronte da riattivare.
- `alternativa_di_id` — il base sostituito. Validazioni: obbligatorio per le alternative, deve puntare a un `base`, non a se stesso; un base con alternative non si elimina (409) e non diventa alternativa (422).
- `ingredient_id` — link a `ingredients` (modulo ricette). Il costo arriva da `services/prezzi_ingredienti.prezzo_corrente` (mediana nella finestra Food cost, servizio platform — niente import dal router ricette). `costo_corrente` è nella risposta **solo per admin/chef** (`ha_ruoli`); sala/sommelier vedono `null`.
- `PUT` aggiorna i campi della mig 177 solo se il client li manda (`model_fields_set`): un form che non li conosce non li azzera.

**Prezzi e fornitore**: non si salvano sul formaggio. Restano in `note` (listino Real Group set. 2026) finché non arriva la prima fattura: l'ingrediente nasce dal flusso fatture/matching, poi si collega dal form (IngredientPicker di Ricette, riusato). Il costo a porzione si ricava da €/kg × grammi, non si salva.

**UI** (`zonaConfig.formaggi`: `ordineServizio`, `linkIngrediente`): in `ZonaPanel` posizione/ruolo/«Sostituisce» (filtrata per paese; se la posizione è vuota eredita quella del base) e ingrediente con Scollega. In tabella: numero di posizione, alternative rientrate «↳ alternativa a …», «🔗 ingrediente · € x/kg» per chi scrive.

**Dati Tre Gobbi** (`[locale:tregobbi]`): `tools/import_formaggi_set2026.py` + `locali/tregobbi/seeds/formaggi_set_2026.json`, via API, idempotente, prova di default e `--vai` per applicare. Categorie aggiunte: Crosta fiorita, Crosta lavata, Semistagionati. I 4 formaggi di prova precedenti (Bagoss, Fontina, Formagella, Pecorino di Pienza) vengono eliminati dallo script (elenco esplicito `DA_TOGLIERE`).

**Taglieri (solo nota — il modulo non ha composizioni):**
- **Francese da 3** (40 g a formaggio). A: Saint-Maure, Comté 30 mesi, Roquefort. B: Brillat-Savarin, Tomme de Brebis, Époisses.
- **Francese da 5** (30 g a formaggio). A: Saint-Maure, Brillat-Savarin, Époisses, Comté 30 mesi, Roquefort. B: Saint-Maure, Brillat-Savarin, Tomme de Brebis, Mimolette, Roquefort.
- **Orobico da 4** (35 g a formaggio): Agrì (alt. Stracchino all'antica), Taleggio, Formai de Mut (alt. Branzi), Gorgonzola piccante (alt. Strachitunt o Blu di capra).
- **Orobico da 6** (25 g a formaggio): Agrì (alt. Stracchino all'antica), Caprino orobico (alt. Scimudin), Taleggio, Formai de Mut (alt. Branzi), Storico Ribelle (alt. Bitto DOP), Gorgonzola piccante (alt. Strachitunt o Blu di capra).
- Per i francesi `posizione` è l'ordine generale; dentro ogni tagliere vale l'ordine indicato qui.

---

## 6. Capability audit (riferimento storico)

> (storico — fotografia dell'audit 2026-05-19, codici C-R-039…C-R-062 in `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`. L'inventario endpoint aggiornato e verificato è il §3 di questa pagina.)

- **C-R-039 … C-R-043** — Macellaio · **C-R-044 … C-R-048** — Salumi · **C-R-049 … C-R-053** — Formaggi · **C-R-054 … C-R-058** — Pescato · **C-R-059 … C-R-062** — Piatti del Giorno

Correzioni emerse nella verifica 2026-08-03 rispetto allo stub: piatti-giorno HA categorie configurabili (l'audit lo dava "pattern semplificato, no categorie"); il pescato non ha enum sotto-categorie nel router (categorie da DB); nessuna lista "filtrabile per data"; la config è widget-only.

---

## 7. Roadmap e punti aperti

- Pattern testa+tab per la pagina dettaglio (vedi `docs/controllo_design.md` §1)
- Eventuale generalizzazione DRY dei 5 router quasi-gemelli (S, low priority — il FE è già stato unificato con `ZonaPanel`)
- Pulizia import lazy orfani `pages/tasks/Scelta*.jsx` in `App.jsx` (§4)
- Formaggi: taglieri/composizioni come funzione vera (oggi solo nota §5-bis) — da decidere con Marco
- Formaggi: collegare gli ingredienti dei francesi all'arrivo della prima fattura Real Group (fornitore non ancora in anagrafica); orobici: prezzo e fornitore da Marco
- Deprecati da rimuovere a regime: `PATCH /{id}/venduto` su salumi/formaggi + colonne `venduto`/`venduto_at` sulle zone a modello attivo

**DA CHIEDERE A MARCO (classificazione R8):** `piatti_giorno_router.py` dichiara in testa `# Modulo: cucina (selezioni)` e le tabelle vivono nel cluster CUCINA (`cucina_db.py` le elenca tra le sue), mentre la mappa docs di `CLAUDE.md` assegna i 5 router scelta_* al modulo `ricette` (questa pagina). A R8 (module.json/feature flags) le Selezioni del Giorno andranno nel modulo vendibile `ricette` o `cucina`?

---

## 8. Riferimenti

- Audit capability storico: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (modulo Ricette)
- Modulo padre: [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md)
- Gap report origine: `docs/audit-2026-05-19/02_GAP_REPORT.md` CRIT-2
- Decisione PO Marco: 2026-05-19 (sessione "audit + riallineamento"); niente tile Home: sessione 2026-04-20
