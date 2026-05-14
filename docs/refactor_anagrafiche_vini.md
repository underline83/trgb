# Refactor anagrafiche vini (V.6 + V.7 + V.8)

**Stato (aggiornato 2026-05-14):** Fasi 1-7 chiuse. Schema + 6 tabelle `_v2` create, 1287 vini migrati con clustering, UI beta pubblicata, sync runtime operativo, endpoint rollback online. Da fare: Fase 8 (workflow inserimento nuovo vino 3-step), Fase 9 (testing utente esteso, ~2-3 settimane), Fase 10 (cutover atomico).

**Obiettivo:** introdurre il concetto di "vino madre" (etichetta stabile) separato dal "vino bottiglia" (annata specifica), normalizzare anagrafiche produttori/fornitori/denominazioni/vitigni, sostituire i campi TEXT free-form con FK a tabelle dedicate.

**Approccio:** strategia blue-green con tabelle parallele `_v2` dentro lo stesso file `vini_magazzino.sqlite3`. Produzione resta intatta fino allo swap atomico finale (ALTER TABLE RENAME in transazione).

---

## 1. Strategia blue-green rinforzata

```
┌─ OGGI ────────────┐    ┌─ SVILUPPO ─────────────┐    ┌─ POST SWAP ──────────┐
│ vini_magazzino    │    │ vini_magazzino  [LIVE] │    │ vini_magazzino_legacy│
│  [LIVE]           │ →  │ + vini_*_v2  [STAGING] │ →  │ + tabelle nuove [LIVE]│
│                   │    │                        │    │   (rename atomico)   │
│ UI vecchia: live  │    │ UI vecchia: live       │    │ tutta UI: live       │
│                   │    │ UI nuova: test (beta)  │    │                      │
└───────────────────┘    └────────────────────────┘    └──────────────────────┘
```

**Decisione finale (Marco 2026-05-12)**: si va con blue-green, NON con modulo duplicato. Motivazione: il modulo duplicato introdurrebbe complessità nuova (sync delta movimenti al cutover) senza ridurre la complessità vera del refactor (clustering, sync anagrafiche, parser vitigni). La blue-green è già abbastanza sicura, con 3 rinforzi aggiuntivi:

1. **Snapshot DB esplicito** prima di ogni fase critica:
   - `vini_magazzino.sqlite3.pre-mig-125-<ts>` (prima del setup tabelle nuove)
   - `vini_magazzino.sqlite3.pre-migrazione-dati-<ts>` (prima del clustering)
   - `vini_magazzino.sqlite3.pre-swap-<ts>` (prima dello swap atomico)
2. **Endpoint admin di rollback rapido**: `POST /vini/anagrafiche/rollback` che cancella le tabelle `_v2` in 1 click, riportando il sistema esattamente allo stato di partenza. Disponibile fino a 24h dopo lo swap.
3. **UI nuova etichettata "beta"**: la sezione "🧪 Anagrafiche Vini (beta)" è visibilmente in test finché non si conferma il funzionamento. Le pagine vecchie restano IL primo accesso al modulo Vini, le nuove sono "sotto" come prova.

Vantaggi della blue-green:
- Marco continua a usare il gestionale durante tutto lo sviluppo (nessun downtime).
- Rollback fino al pre-swap: basta cancellare le tabelle `_v2`, la produzione non è toccata.
- Lo swap finale è secondi: `ALTER TABLE vini_magazzino RENAME TO vini_magazzino_legacy_YYYYMMDD; ALTER TABLE vini_v2 RENAME TO vini_bottiglie;` ecc., in transazione.
- Backup automatico tramite push.sh + backup espliciti aggiuntivi sopra.
- Niente sync delta dei movimenti (i nuovi movimenti vivono sulla stessa tabella che diventerà `vini_bottiglie` dopo il rename).

### Cosa NON è stata scelta (alternativa scartata)

"Modulo Vini duplicato completo" (`/vini-test/...` con UI e backend completamente separati). Scartata perché:
- Avrebbe richiesto duplicazione di ~15 pagine frontend (Dashboard, Magazzino, Admin, Scheda, Vendite, Carta, Impostazioni, ecc.) → manutenzione doppia per le 2-3 settimane di test.
- Avrebbe introdotto la necessità di sync delta movimenti al cutover: durante il test Marco continua a vendere/comprare nel modulo vecchio, e quei movimenti recenti devono essere migrati nel modulo nuovo al cutover. Un altro pezzo di codice nuovo che può sbagliare.
- L'isolamento UI/UI che otteneva è già garantito dalla blue-green grazie a URL separati (`/vini/anagrafiche/...` non interferiscono con `/vini/magazzino`).

---

## 2. Schema completo — 6 tabelle nuove

### 2.1 `vini_produttori`

Le cantine che fanno il vino. Riusata da N vini madre.

| campo | tipo | significato | obbligatorio |
|---|---|---|---|
| `id` | INTEGER PK | display "P0001" | auto |
| `nome` | TEXT | ragione sociale (es. "Marchesi di Barolo") | **SI** |
| `nazione` | TEXT | lookup canonica (Italia/Francia/Germania/Austria — già esistente in `vini_settings`) | **SI** |
| `regione` | TEXT | lookup canonica (56 regioni in `vini_settings.regioni_order`) | opz. |
| `provincia` | TEXT(2) | sigla provincia (seed iniziale: 110 sigle ITA + alcune estere) | opz. |
| `citta` | TEXT | comune (TEXT free-form — autocomplete su città già inserite) | opz. |
| `note` | TEXT | telefono/email/riferimenti vari | opz. |
| `created_at`, `updated_at` | TEXT ISO | timestamp | auto |

Note: città lasciata TEXT free-form (importare ISTAT comuni 7900 righe è eccessivo per ~1287 vini).

### 2.2 `vini_fornitori`

Le aziende che commercializzano il vino. Rappresentante (persona fisica) come campi inline nella stessa riga: 1 distributore = 1 rappresentante di riferimento.

| campo | tipo | significato | obbligatorio |
|---|---|---|---|
| `id` | INTEGER PK | display "F0001" | auto |
| `nome` | TEXT | nome distributore (azienda) | **SI** |
| `nazione`, `regione`, `provincia`, `citta` | TEXT (validati come produttori) | indirizzo distributore | opz. |
| `rappresentante_nome` | TEXT | persona di riferimento commerciale | opz. |
| `rappresentante_telefono` | TEXT | cellulare/fisso | opz. |
| `rappresentante_email` | TEXT | email | opz. |
| `note` | TEXT | testo libero | opz. |
| `created_at`, `updated_at` | TEXT ISO | timestamp | auto |

### 2.3 `vini_denominazioni`

DOC/DOCG/IGT italiane + AOC/AOP francesi + altre denominazioni UE. Popolata via sync da API eAmbrosia + enrichment dai PDF MASAF.

| campo | tipo | significato | obbligatorio |
|---|---|---|---|
| `id` | INTEGER PK | display "D001" | auto |
| `codice_eambrosia` | TEXT UNIQUE | chiave europea univoca (es. "PDO-IT-A0277") | opz. (NULL per create manuali) |
| `nome` | TEXT | parte nome (es. "Aglianico del Taburno") | **SI** |
| `tipo` | TEXT | menzione tradizionale umana (DOC/DOCG/IGT/AOC/AOP/…) | **SI** |
| `tipo_ue` | TEXT | categoria UE (PDO/PGI) | opz. |
| `nazione` | TEXT | "Italia" / "Francia" / … | **SI** |
| `regione` | TEXT | regione di riferimento | opz. |
| `link_disciplinare` | TEXT | URL ufficiale al disciplinare | opz. |
| `attiva` | INTEGER 0/1 DEFAULT 1 | disattivabile senza eliminare | auto |
| `source` | TEXT | "eambrosia_api" / "masaf_pdf" / "user_manual" | auto |
| `last_synced_at` | TEXT ISO | ultima sync dall'API | auto |
| `created_at`, `updated_at` | TEXT ISO | timestamp | auto |

**Display canonico:** concatenazione `"{nome} {tipo}"` → "Aglianico del Taburno DOCG", "Chianti Classico DOCG", "Champagne AOC".

#### Fonti dati

- **API eAmbrosia** (primaria, sempre aggiornata): `GET https://webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications` ritorna ~3995 voci EU in un singolo JSON. Filtri lato client su `productType="WINE"` e `countries=["IT"]`/`["FR"]`/ecc.
  - Per ogni voce: `giIdentifier`, `protectedNames`, `fileNumber` (chiave: es. "PDO-IT-A0277"), `countries`, `giType` (PDO/PGI), `productType`, `status`, `euProtectionDate`, link disciplinare.
- **PDF MASAF** (enrichment, fermi a marzo 2026): `Elenco_alfabetico_Vini_DOP_italiani_*.pdf` e `Elenco_alfabetico_Vini_IGP_italiani_*.pdf` forniscono la **menzione tradizionale** italiana (DOC vs DOCG vs IGT) che l'API non espone (solo PDO/PGI). Match via `fileNumber`.

#### Sync periodica

Endpoint admin: `POST /vini/anagrafiche/denominazioni/sync` → scarica eAmbrosia, fa upsert su `codice_eambrosia`, marca `source="eambrosia_api"`, aggiorna `last_synced_at`. Schedulabile mensile o on-demand.

### 2.4 `vini_vitigni`

Anagrafica canonica dei vitigni — single source of truth. Ogni vitigno esiste una volta sola.

| campo | tipo | significato | obbligatorio |
|---|---|---|---|
| `id` | INTEGER PK | display "V001" | auto |
| `nome` | TEXT UNIQUE | nome canonico (es. "Nebbiolo", "Sangiovese") | **SI** |
| `nazione_origine` | TEXT | nazione d'origine del vitigno | opz. |
| `note` | TEXT | sinonimi, caratteristiche | opz. |

Seed iniziale: ~50 vitigni più comuni (Nebbiolo, Sangiovese, Merlot, Chardonnay, Glera, Pinot Nero, Cabernet Sauvignon, Trebbiano, ecc.).

### 2.5 `vini_madre`

L'etichetta stabile del vino — tutto quello che NON cambia con l'annata. Una riga per ogni vino prodotto, indipendente da quante annate sono in cantina.

| campo | tipo | significato | obbligatorio |
|---|---|---|---|
| `id` | INTEGER PK | display "M0001" | auto |
| `produttore_id` | INTEGER FK → `vini_produttori` | chi fa il vino | **SI** |
| `fornitore_id` | INTEGER FK → `vini_fornitori` | distributore | opz. |
| `denominazione_id` | INTEGER FK → `vini_denominazioni` | denominazione (DOC/DOCG/IGT…) | opz. |
| `descrizione` | TEXT | nome vino (es. "Barolo Cannubi", "Tignanello") | **SI** |
| `tipologia` | TEXT | BOLLICINE / BIANCHI / ROSSI / ROSATI / GRANDI FORMATI / PASSITI / VINI ANALCOLICI | **SI** |
| `nazione` | TEXT | default dal produttore, override per casi multi-nazione | opz. |
| `regione` | TEXT | default dal produttore, override per vigneti fuori regione produttore | opz. |
| `grado_alcolico_tipico` | REAL | gradi % tipici (l'annata sulla bottiglia può divergere) | opz. |
| `abbinamenti` | TEXT | abbinamenti consigliati (mostrato in carta cliente per calici) | opz. |
| `note_madre` | TEXT | note libere sull'etichetta | opz. |
| `created_at`, `updated_at` | TEXT ISO | timestamp | auto |

**Decisione fornitore sul madre (non sulla bottiglia):** Marco 2026-05-12 → un vino = un distributore (anche se cambia tra annate, è raro; complessità storica non vale la pena).

### 2.6 `vini_bottiglie`

= ex `vini_magazzino` rinominata, con 2 aggiunte: `madre_id` FK e 5 slot vitigno con %. Tutti i campi attuali sono preservati per retrocompat (campi anagrafici sincronizzati dal madre, vedi §3).

| categoria | campi | note |
|---|---|---|
| Identificativo | `id`, `id_excel` | invariati |
| **Link madre** | **`madre_id`** INTEGER FK → `vini_madre` | NUOVO — opz. (NULL = vino orfano sopravvissuto) |
| Annata-specifici | `ANNATA`, `FORMATO`, `PREZZO_CARTA`, `EURO_LISTINO`, `SCONTO`, `PREZZO_CALICE`, `PREZZO_CALICE_MANUALE`, `NOTE_PREZZO`, `GRADO_ALCOLICO`, `NOTE`, `NOTE_STATO` | invariati. `GRADO_ALCOLICO` può divergere da `madre.grado_alcolico_tipico` |
| Stati operativi | `STATO_VENDITA`, `STATO_RIORDINO`, `STATO_CONSERVAZIONE`, `CARTA`, `IPRATICO`, `BIOLOGICO`, `VENDITA_CALICE`, `FORZA_PREZZO`, `BOTTIGLIA_APERTA`, `DATA_APERTURA` | invariati (INTEGER 0/1 post V-H.E mig 124) |
| Locazioni e qta | `FRIGORIFERO`/`QTA_FRIGO`, `LOCAZIONE_1..3`/`QTA_LOC1..3`, `QTA_TOTALE` | invariati |
| **Vitigni (5 slot)** | `vitigno_1_id` + `vitigno_1_pct` … `vitigno_5_id` + `vitigno_5_pct` | NUOVO — 10 colonne. FK a `vini_vitigni`. NULL = slot vuoto. % nullable. |
| Metadati | `ORIGINE`, `CREATED_AT`, `UPDATED_AT` | invariati |
| Campi anagrafici (sincronizzati) | `TIPOLOGIA`, `NAZIONE`, `REGIONE`, `PRODUTTORE`, `DESCRIZIONE`, `DENOMINAZIONE`, `VITIGNI`, `DISTRIBUTORE`, `RAPPRESENTANTE`, `ABBINAMENTI` | restano. Sincronizzati dal madre via service Python (vedi §3). Funzione fallback per vini orfani senza `madre_id`. |

Decisione vitigni: 5 slot massimi (10 colonne extra). UI mostra solo gli slot popolati + "+ Aggiungi vitigno" finché non saturi.

---

## 3. Strategia di sincronizzazione

I campi anagrafici (`PRODUTTORE`, `DESCRIZIONE`, `DENOMINAZIONE`, `TIPOLOGIA`, `NAZIONE`, `REGIONE`, `DISTRIBUTORE`, `RAPPRESENTANTE`, `ABBINAMENTI`) sono **duplicati** tra madre/anagrafiche e bottiglie. Marco 2026-05-12: "la fonte di verità resta madre, ma teniamo allineato anche le bottiglie per avere ridondanza".

### Implementazione: service Python, non trigger SQLite

- Service `app/services/vini_anagrafiche_sync.py` con funzione `sync_bottiglie_from_madre(madre_id)`.
- Chiamato automaticamente in:
  - `PATCH /vini/anagrafiche/madre/{id}` (modifica madre)
  - `PATCH /vini/anagrafiche/produttori/{id}` (modifica produttore → cascade a tutti i madre con quel produttore_id → cascade a tutte le bottiglie)
  - `PATCH /vini/anagrafiche/fornitori/{id}` (idem)
  - `PATCH /vini/anagrafiche/denominazioni/{id}` (idem)
- Bottone admin "Risincronizza tutto" in Impostazioni Vini come safety net per drift.

Niente trigger SQLite (difficili da debuggare, opachi). Tutto applicativo, esplicito, testabile.

### Campi sincronizzati (vivono su madre/anagrafiche + bottiglie)

| campo bottiglia | sorgente |
|---|---|
| `PRODUTTORE` | `vini_produttori.nome` via `madre.produttore_id` |
| `DESCRIZIONE` | `vini_madre.descrizione` |
| `DENOMINAZIONE` | `"{denominazione.nome} {denominazione.tipo}"` via `madre.denominazione_id` |
| `TIPOLOGIA` | `vini_madre.tipologia` |
| `NAZIONE` | `vini_madre.nazione` |
| `REGIONE` | `vini_madre.regione` |
| `DISTRIBUTORE` | `vini_fornitori.nome` via `madre.fornitore_id` |
| `RAPPRESENTANTE` | `vini_fornitori.rappresentante_nome` |
| `ABBINAMENTI` | `vini_madre.abbinamenti` |

### Campi NON sincronizzati (vivono solo sulla bottiglia)

- `ANNATA`, `FORMATO`, `PREZZO_*`, `EURO_LISTINO`, `SCONTO`, `GRADO_ALCOLICO`, `NOTE`, `NOTE_STATO`, `NOTE_PREZZO`
- Tutti gli stati operativi
- Locazioni e quantità
- I 5 slot vitigno con %

---

## 4. Migrazione dati esistenti (mig 125 + script)

**1287 vini esistenti** in `vini_magazzino` (al 2026-05-12), tutti con campi anagrafici TEXT free-form. La migrazione li collega alle nuove anagrafiche.

### Step migrazione

1. **Setup tabelle `_v2`** (mig 125): CREATE TABLE delle 6 nuove + copia `vini_magazzino` → `vini_bottiglie_v2`.
2. **Popolamento `vini_produttori_v2`**: PRODUTTORE distinct `UPPER(TRIM(...))` → 1 riga per produttore unico.
3. **Popolamento `vini_fornitori_v2`**: DISTRIBUTORE distinct → 1 riga per distributore (con RAPPRESENTANTE inline se valorizzato).
4. **Sync `vini_denominazioni_v2`**: chiamata API eAmbrosia + parsing PDF MASAF → popolamento iniziale.
5. **Clustering `vini_madre_v2`**: chiave naturale `(PRODUTTORE_norm, DESCRIZIONE_norm)` → 1 riga per cluster (= un vino madre). Eredita campi anagrafici dalla prima annata trovata.
6. **Link `vini_bottiglie_v2.madre_id`**: aggiornamento per ogni record.
7. **Parsing VITIGNI TEXT → 5 slot**: parser euristico per virgola, slash, "e", ";". Match contro `vini_vitigni_v2`. Estrazione % se presente (es. "Nebbiolo 80%, Merlot 20%"). Vitigni non riconosciuti → restano in `VITIGNI` TEXT come fallback.
8. **Report**: N produttori, N fornitori, N vini madre, N denominazioni linkate, N vini orfani (senza match), N cluster ambigui da bonificare a mano.

Endpoint admin: `POST /vini/anagrafiche/migrate-from-legacy` con flag `dry_run=true` per validare prima del commit.

---

## 5. Swap atomico (cutover)

Dopo verifica dati e validazione UI, swap finale:

```sql
BEGIN;
-- Backup pre-swap (rinomina tabelle vecchie con suffisso data)
ALTER TABLE vini_magazzino RENAME TO vini_magazzino_legacy_YYYYMMDD;

-- Rimozione suffisso _v2 dalle nuove tabelle
ALTER TABLE vini_bottiglie_v2 RENAME TO vini_bottiglie;
ALTER TABLE vini_produttori_v2 RENAME TO vini_produttori;
ALTER TABLE vini_fornitori_v2 RENAME TO vini_fornitori;
ALTER TABLE vini_denominazioni_v2 RENAME TO vini_denominazioni;
ALTER TABLE vini_madre_v2 RENAME TO vini_madre;
ALTER TABLE vini_vitigni_v2 RENAME TO vini_vitigni;
COMMIT;
```

Prima dello swap: backup esplicito `vini_magazzino.sqlite3.pre-swap-<timestamp>`.

Le tabelle `vini_magazzino_legacy_YYYYMMDD` restano per 7 giorni come safety net. Cleanup DROP in migrazione successiva una volta verificata la stabilità in produzione.

---

## 6. Workflow operativo nuovo

### Crea nuovo vino

1. **Step 1**: scegli il produttore (autocomplete su `vini_produttori`). Se non esiste → "+ Nuovo produttore" (modale con nome + nazione + regione).
2. **Step 2**: scegli un vino madre del produttore (lista delle etichette esistenti). Se è un vino mai inserito → "+ Nuovo vino madre" (form completo madre con denominazione, tipologia, vitigni tipici).
3. **Step 3**: compila i dati specifici dell'annata (ANNATA, PREZZO_CARTA, FORMATO, locazioni iniziali, ecc.). I campi anagrafici sono read-only (ereditati dal madre).

### Modifica vino esistente

- Se ha `madre_id`: i campi anagrafici sono read-only con link "Modifica vino madre" che apre la scheda del madre. I campi annata-specifici sono modificabili.
- Se non ha `madre_id` (orfano sopravvissuto): tutto modificabile (retrocompat).

### Vista "Vini per produttore"

Nuova pagina che mostra: per ogni produttore → lista vini madre → sotto ogni madre, le annate disponibili in cantina con giacenza e stato.

---

## 7. Decisioni prese (riassunto)

| Punto | Decisione | Data |
|---|---|---|
| Strategia generale | Blue-green con tabelle `_v2` parallele | 2026-05-12 |
| Granularità anagrafica | `vini_produttori` (cantine) + `vini_fornitori` (distributori+rappresentante inline) | 2026-05-12 |
| Rappresentante | Colonne inline nella riga del fornitore (1 distributore = 1 rappresentante di riferimento) | 2026-05-12 |
| Fornitore dove sta | Sul `vini_madre` (non sulla bottiglia) — 1 vino = 1 distributore, complessità storica non vale la pena | 2026-05-12 |
| Vitigni | Anagrafica canonica `vini_vitigni` + 5 slot colonne in `vini_bottiglie` (no tabella di link) | 2026-05-12 |
| Denominazione | Tabella separata `vini_denominazioni`, FK opzionale dal madre. Display `"{nome} {tipo}"` | 2026-05-12 |
| Sorgente denominazioni | API eAmbrosia (primaria) + PDF MASAF (enrichment DOC/DOCG/IGT) | 2026-05-12 |
| Campi indirizzo produttori | Lookup canonica per nazione/regione/provincia (no TEXT free-form). Città resta TEXT (no ISTAT 7900 comuni). | 2026-05-12 |
| Sync campi ridondanti | Service Python esplicito (no trigger SQLite). Tenuti allineati con il madre come ridondanza voluta | 2026-05-12 |
| Campi anagrafici legacy su `vini_bottiglie` | Mantenuti (retrocompat + ridondanza). Non eliminati in questo refactor — eventualmente in cleanup successivo. | 2026-05-12 |

---

## 8. Cosa NON è ancora deciso

- Ordine esatto delle fasi di sviluppo (mig 125 + tabelle vuote → migrazione dati → endpoint CRUD → UI → swap).
- Algoritmo esatto di clustering per la migrazione (dedup conservativo vs aggressivo, con o senza Marco-in-the-loop per validazione).
- Disegno UI esatto della nuova sezione "Anagrafiche Vini" (sotto-menu in Impostazioni Vini? sezione separata?).
- Modalità seed `vini_vitigni` (50 default scritti a mano, o estratti da parsing dei VITIGNI esistenti?).
- Modalità di triggering della sync `vini_anagrafiche_sync` (real-time su PATCH vs job batch).
- Timeline cutover (sessione singola intensiva di Marco, o spalmato su 2 sessioni con osteria chiusa).

---

## 9. Riferimenti

- File caricati da Marco (2026-05-12):
  - `Elenco_alfabetico_Vini_DOP_italiani_agg_18.03.2026.pdf` (525+ DOP italiani con menzione DOC/DOCG)
  - `Elenco_alfabetico_Vini_IGP_italiani_25.03.2026.pdf` (IGP italiani)
  - 4 archivi `Disciplinari_*.7z` (testi disciplinari completi, non necessari per il refactor base)
- API eAmbrosia:
  - Root: `https://webgate.ec.europa.eu/eambrosia-api/`
  - OpenAPI spec: `https://webgate.ec.europa.eu/eambrosia-api/v3/api-docs`
  - Endpoint primario: `GET /api/v1/geographical-indications` (3995 voci EU totali)
  - Endpoint singolo: `GET /api/v1/geographical-indications/{giIdentifier}`
- File del codice esistente da modificare/leggere:
  - `app/models/vini_magazzino_db.py` (schema attuale, query, helpers)
  - `app/models/vini_settings.py` (lista canonica nazioni/regioni)
  - `app/routers/vini_magazzino_router.py` (CRUD principale)
  - `app/routers/vini_cantina_tools_router.py` (import/export Excel — già rifatto in V-H.J)
  - `frontend/src/pages/vini/*.jsx` (UI da estendere)
- Voci roadmap (`docs/roadmap.md`): V.5 (più distributori — implicitamente coperto da fornitore_id sul madre), V.6 (anagrafiche normalizzate), V.7 (vino madre), V.8 (vitigni con %).
