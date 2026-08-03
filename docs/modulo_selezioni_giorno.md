# Modulo Selezioni del Giorno — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) (modulo padre), [modulo_vendite.md](modulo_vendite.md) (non confondere — quello è il modulo Cassa)

**Creato:** 2026-05-19 (audit autonomo — gap CRIT-2); riempito da stub a pagina completa il 2026-08-03
**Versione (`versions.jsx`):** selezioni v1.1 (beta)
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
| **Formaggi** | `app/routers/scelta_formaggi_router.py` (v1.1) | 092, 093 (attivo), 107 (paese) | `formaggi_tagli`, `formaggi_categorie`, `formaggi_config` | attivo | `produttore` (caseificio), `stagionatura`, `latte`, `territorio`, `paese` (🇮🇹/🇫🇷/altro, con detect runtime `_has_paese_column`), `descrizione` |
| **Pescato** | `app/routers/scelta_pescato_router.py` (v1.0) | 094 | `pescato_tagli`, `pescato_categorie`, `pescato_config` | venduto | `zona_fao` (provenienza FAO) |
| **Piatti del Giorno** | `app/routers/piatti_giorno_router.py` (v1.0) | 107 | `piatti_giorno`, `piatti_giorno_categorie`, `piatti_giorno_config` | attivo | `descrizione` (racconto sala) |

Schema tabelle voci (verificato via PRAGMA 2026-08-03): `id, nome, categoria (TEXT, denormalizzata per nome), grammatura_g, prezzo_euro, [campi extra], note, venduto, venduto_at, [attivo, archiviato_at], created_at, updated_at`. Categorie: `id, nome (UNIQUE), emoji, ordine, attivo, created_at, updated_at`. Config: chiave/valore (`chiave, valore, updated_at`).

> Le categorie NON sono enum hardcoded: sono righe configurabili da UI (es. per pescato: pesce/crostacei/molluschi sono semplici categorie di default in `pescato_categorie`, modificabili). Il rename di una categoria si propaga alle voci che la usano (UPDATE sulle righe con quel nome).

---

## 3. Endpoint (pattern comune, righe verificate)

**Auth:** tutti e 5 i router hanno `dependencies=[Depends(get_current_user)]` a livello router — serve solo il JWT, **nessun check ruolo lato backend**. La restrizione chef-scrive/sala-legge è oggi solo a livello di permessi FE (modulo `selezioni` in `app/data/modules.json` + `ProtectedRoute`).

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
- **No foodcost calcolato**: le Selezioni non passano dal motore foodcost (nessun legame con `recipes`/`ingredients`; `prezzo_euro` è il prezzo di vendita raccontato in sala, la grammatura un'indicazione).
- **Due semantiche di stato** (venduto vs attivo) — vedi §1. È la differenza operativa principale tra le zone.
- **Formaggi è la zona più ricca**: raggruppamento per `paese` (mig 107) sopra le categorie latte; il router ha detect runtime della colonna per robustezza pre-migrazione.
- **Piatti del Giorno** (mig 107) è la 5ª zona: piatti finiti fuori carta (es. "tagliolini al ragù di cinghiale"), non materia prima. Stesse categorie configurabili delle altre zone (default: Antipasto/Primo/Secondo/Contorno/Dolce/Speciale) — ha anch'essa le tabelle categorie, contrariamente a quanto ipotizzato nell'audit 2026-05-19.

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
- Deprecati da rimuovere a regime: `PATCH /{id}/venduto` su salumi/formaggi + colonne `venduto`/`venduto_at` sulle zone a modello attivo

**DA CHIEDERE A MARCO (classificazione R8):** `piatti_giorno_router.py` dichiara in testa `# Modulo: cucina (selezioni)` e le tabelle vivono nel cluster CUCINA (`cucina_db.py` le elenca tra le sue), mentre la mappa docs di `CLAUDE.md` assegna i 5 router scelta_* al modulo `ricette` (questa pagina). A R8 (module.json/feature flags) le Selezioni del Giorno andranno nel modulo vendibile `ricette` o `cucina`?

---

## 8. Riferimenti

- Audit capability storico: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (modulo Ricette)
- Modulo padre: [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md)
- Gap report origine: `docs/audit-2026-05-19/02_GAP_REPORT.md` CRIT-2
- Decisione PO Marco: 2026-05-19 (sessione "audit + riallineamento"); niente tile Home: sessione 2026-04-20
