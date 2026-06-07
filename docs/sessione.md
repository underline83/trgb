# TRGB — Briefing sessione

**Ultimo aggiornamento:** 2026-06-07 — **Pranzo 1.6: restyle PDF sistema menu A5 + flusso "Entrambi"** (`[mixed]`). Sistema 5.24. Ripresa modulo Pranzo dopo audit (fermo da fine aprile: 4 menu totali, ultimi 2 vuoti, pool di 6 ricette). Cause individuate con Marco: PDF esteticamente incoerente col brand + inserimento piatti troppo rigido. PDF v3.0 "Proposta A — Pagina di sezione" allineato al MENU A5 stagionale (Sabon LT Pro + Courier Prime, verificati dai BaseFont del PDF di studio; fallback Cormorant finché i font non sono in `static/fonts/`). Nuovo `POST /pranzo/promuovi-ricetta/` + bottone "+ pool" sulle righe ad-hoc. Mig 144 default testata ("PRANZO" / "la cucina del mercato"). `docs/modulo_pranzo.md` riscritto da zero (era fermo al v1.0 giornaliero).

## SESSIONE 2026-06-07 — Pranzo 1.6: restyle PDF + flusso piatti

### Audit di apertura (richiesto da Marco)
- Codice solido ma modulo NON usato: 4 menu (ultimo 18/5), i 2 più recenti con 0 righe. Pool fermo a 6 ricette "Pranzo di lavoro".
- Debito schema D2 invariato: colonne legacy v1.0 su `pranzo_menu` (`data` NOT NULL UNIQUE ecc.), `pranzo_piatti` viva, riga sporca `settimana_inizio=2026-04-26` (domenica). **Mig 103 recreate-table resta DEFERITA** — backup pre-DDL quando si farà.
- "Clona settimana" della roadmap era già fatto (bottone "Copia prec.").

### Decisioni di Marco
1. Riferimento estetico = **menu A5 primavera 2026** (file di studio, font embedded: SabonLTPro Roman/Bold, CourierPrime Regular/Bold, Milliard-Light), NON carta vini.
2. Proposta **A "Pagina di sezione"** scelta fra 3 mockup. Formato **A4 verticale**.
3. Flusso piatti: **"Entrambi"** — scrittura libera + promozione riga a ricetta del pool.

### Backend
- `pranzo_repository.promuovi_riga_a_ricetta(nome, categoria)`: dedup case-insensitive su `name`/`menu_name` di ricette attive; se nuova → INSERT recipes scheletro (kind dish, 1 porzione, category_id da mappa inversa antipasto→Antipasto…) + `INSERT OR IGNORE recipe_service_types`. Test su copia DB: nuovo/dedup/esistente-non-taggata/pool/nome-vuoto/integrità → tutti OK.
- `pranzo_router`: `POST /promuovi-ricetta/` con `_check_admin`, 400 su ValueError.
- Mig 144: nuovi default `pranzo_settings` SOLO se ancora uguali ai vecchi (mai personalizzati). Idempotente, testata su copia (run 1 aggiorna, run 2 no-op).
- Default allineati anche in `_ensure_schema` (CREATE TABLE + backfill) per installazioni fresche.

### PDF v3.0 (`[locale:tregobbi]`)
- `menu_pranzo_pdf.css` v2.0: @font-face Sabon/Courier con fallback a catena (`static/fonts/` → `/usr/local/share/fonts/tre_gobbi/` → Cormorant → Times). Titolo 30pt spacing 0.18em, etichette categoria 10.5pt spacing 0.28em, piatti Courier Bold 13pt, business 118mm centrato, footer corsivo. Pagina singola A4 flex (eredita anti-overflow v1.1).
- `pranzo_pdf_service.py` v3.0: `_build_piatti_html` raggruppa per categoria con etichette plurali (LABEL_CATEGORIA, "altro"→"Dal mercato"); `_format_settimana` minuscolo con elisione articolo (dell'8, dell'11); `_format_prezzo` nudo senza € ("15", "14,50"); sottotitolo unico "sottotitolo · settimana…". HTML builder testato (assert su categorie presenti, niente asterischi/OGGI).
- ⚠ **AZIONE MARCO**: caricare in `static/fonts/` → `SabonLTPro-Roman.ttf/woff2`, `SabonLTPro-Bold`, `SabonLTPro-Italic`, `CourierPrime-Regular`, `CourierPrime-Bold` (idealmente anche sul VPS in `/usr/local/share/fonts/tre_gobbi/`). Senza, il PDF esce in Cormorant (leggibile ma non fedele).

### Frontend
- `PranzoMenu.jsx` v3.6: handler `promuoviRiga(i)` (apiFetchSafe POST, aggiorna recipe_id in riga, ricarica pool, toast con esito creata/collegata) + bottone "+ pool" sulle righe ad-hoc con nome non vuoto (hover arancione, title esplicativo).
- Form "⚡ Nuova ricetta veloce" in `PoolPiatti` (richiesta Marco a fine sessione): input nome (submit con Enter) + select categoria + Btn Crea con loading → `creaPlaceholder` nel root (stesso endpoint promuovi-ricetta, ricarica pool, toast "creato nel pool / esisteva già"). Mostrato in fondo alla card pool E nel ramo pool vuoto (dove serve di più). Il form si svuota solo a successo.
- Eliminazione dal pool (v3.7, richiesta Marco): ✕ accanto a ogni chip → confirm → `DELETE /pranzo/pool/{id}/`. Backend `rimuovi_ricetta_dal_pool`: untag SEMPRE; disattiva la ricetta SOLO se placeholder vuoto (0 recipe_items + 0 altri service_types + mai sub_recipe_id + mai in menu_dish_publications). Decisione Marco: opzione "intelligente". NB: le 6 ricette pranzo esistenti (id 43-48) hanno 0 ingredienti → se tolte dal pool verrebbero disattivate; il toast lo dice esplicitamente. Test su copia DB: ricetta con items → solo untag; placeholder → untag+disattiva; id inesistente → 404; doppia rimozione → no-op.

### Versioni e docs
- `VERSION` + `versions.jsx sistema` 5.23 → 5.24; pranzo 1.5 → 1.6 (alpha → beta).
- `docs/modulo_pranzo.md` riscritto v3.0 (schema reale + legacy D2 + capability C-P-001..007).
- `docs/changelog.md` entry 2026-06-07.

### File toccati in questo push
- `static/css/menu_pranzo_pdf.css` (riscritto)
- `app/services/pranzo_pdf_service.py` (riscritto)
- `app/migrations/144_pranzo_settings_restyle.py` (nuovo)
- `app/repositories/pranzo_repository.py` (promuovi_riga_a_ricetta + default settings)
- `app/routers/pranzo_router.py` (endpoint promuovi-ricetta)
- `frontend/src/pages/pranzo/PranzoMenu.jsx` (v3.5)
- `VERSION`, `frontend/src/config/versions.jsx`
- `docs/modulo_pranzo.md` (riscritto), `docs/changelog.md`, `docs/sessione.md`

### Aggiunta fine sessione — Elimina definitiva in Gestione Ricette (ricette 3.31, `[core]`)
Marco: "manca la possibilità di eliminare una ricetta" (in Ricette esisteva solo Disattiva = soft delete via `DELETE /ricette/{id}`).
- Nuovo `DELETE /foodcost/ricette/{id}/hard` in `foodcost_recipes_router.py`: 409 se sub-ricetta altrove (elenca fino a 5 ricette che la usano) o pubblicata su menu carta; altrimenti transazione con DELETE espliciti (recipe_items, recipe_service_types) + scollega `pranzo_menu_righe.recipe_id`/`pranzo_piatti.recipe_id` a NULL (snapshot storico intatto, FK CASCADE non affidabili senza PRAGMA foreign_keys) + DELETE recipes. Rollback su errore.
- FE: `RicetteDettaglio.jsx` bottone "🗑 Elimina" (confirm forte, alert col detail su 409, navigate ad archivio) + `RicetteArchivio.jsx` `batchElimina` nella barra batch (conta eliminate/protette, alert con i primi 3 motivi di blocco).
- Test su copia DB: 409 sub-ricetta ("Fondo al Valcalepio rosso" usata da 5 ricette), 409 pubblicata, delete amatriciana → recipes/items/tags spariti, riga menu pranzo scollegata ma snapshot nome intatto, 404 su id inesistente.
- Correlato: ✕ "intelligente" nel pool pranzo (untag + disattiva se placeholder vuoto) — vedi sopra. I due livelli convivono: pool = togli dal pranzo; Ricette = elimina dal sistema.

### Aggiunta fine sessione 2 — logo PDF + date picker settimana
- **Logo nel PDF** (pdf service v3.1 + css v2.1): Marco non vedeva il logo (Proposta A ne era priva by design, ma lo voleva). Creato `static/img/logo_tregobbi_trim.png` con PIL (bbox crop del 5000×5000 originale → 4719×2154 + 4% padding, NUOVO FILE da committare). `.menu-logo` 56mm centrato, margine 9mm sotto. Fallback al PNG originale se il trim manca.
- **Date picker settimana** (PranzoMenu v3.8): `<input type="date">` dentro il box del label settimana in toolbar; `setSettimana` normalizza già al lunedì ISO. PDF/salva/elimina seguono la settimana selezionata (apriPdf default = state settimana, era già corretto — mancava solo un modo rapido di saltare a settimane future senza cliccare ▶ N volte).

### Prossimi passi modulo Pranzo
1. Font in `static/fonts/` + push + stampa di prova del PDF reale.
2. Mig 103 cleanup schema (sessione dedicata, backup pre-DDL).
3. C.P2 allergeni su PDF, QR pubblico, notifica M.A (roadmap).

---

## SESSIONE 2026-06-02 (notte) — CC.5.b: riepilogo mensile + chiusura sub-modulo carta

### Backend (`/banca/carta/riepilogo`)
- Aggregazione Python (la query SQL ritorna mese/MCC/imp grezzi, l'aggregazione per categoria sta in `_mcc_to_categoria()`).
- Filtri: `carta_id` (join via `rapporto = codice_posizione`), `from`/`to` su `data_contabile`.
- Risposta: `{mesi: [...], categorie: [...]}` con categorie ordinate per totale globale desc (così le colonne più importanti sono a sinistra in tabella).

### Frontend (`CartaRiepilogoPage.jsx`)
- Layout: FlussiCassaNav + filtri card + 4 stat card + bar chart stacked + tabella + legenda chip.
- Bar chart: `<BarChart>` recharts con 1 `<Bar>` per categoria, `stackId="totale"` per stacking, colori coordinati con palette TRGB-02 (emerald alimentari, blue trasporti, violet software, ecc.).
- Tabella: prima colonna sticky (mese), riga finale "Totale" sticky-bottom logico (no CSS sticky perché dentro overflow-x-auto). Ultima colonna "Mov." con conteggi.
- Date default: ultimi 12 mesi dalla data odierna (calcolata client-side al mount).

### File toccati in questo push
- `app/routers/banca_carta_router.py` — sezione CC.5.b: mappa MCC + endpoint
- `frontend/src/pages/banca/CartaRiepilogoPage.jsx` (nuovo)
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — import navigate + bottone "📊 Riepilogo mensile"
- `frontend/src/App.jsx` — lazy import + route `/flussi-cassa/carta/riepilogo`
- `VERSION` 5.22 → 5.23
- `frontend/src/config/versions.jsx` — cartaCredito 1.4 → 1.5, sistema 5.22 → 5.23
- `docs/modulo_banca.md` — CC.5.b → ✅, sub-modulo chiuso
- `docs/sessione.md` (questa entry)

### Sub-modulo carta — riepilogo end-to-end
Tutta la riga CC.* è verde: parser PDF (CC.1) + schema/endpoint (CC.2) + UI base (CC.3) + match A manuale (CC.4 D1) + auto-match bulk (CC.4 D2) + UI soglie (CC.4.e) + match B (CC.5.a) + riepilogo (CC.5.b) + hotfix mig 143. Roadmap futura: tabella categorie MCC editabile (rinviata), affinamento score fornitore (tokenizer), spese amministratore non-fatturate (flag/categoria).

---

**Aggiornamento precedente (2026-06-02 notte, post-CC.5.a):** **Hotfix mig 143: safety net per ALTER ADD COLUMN NOT NULL DEFAULT in SQLite** (`[core]`). Post-deploy CC.5.a, il guardiano L1 ha segnalato `CORRUPT foodcost.db` perché `PRAGMA integrity_check` ha trovato NULL nelle 2 colonne `tolerance_cc_*` aggiunte da mig 142 — in SQLite l'`ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT X` su una tabella con righe preesistenti NON popola il default sulle righe vecchie, lascia NULL e viola il vincolo. Fix manuale sul VPS via `UPDATE ... COALESCE(...)` (idempotente). Mig 143 aggiunta come backfill safety net per qualunque deploy futuro (clienti nuovi, staging). Memoria persistente salvata. Nessun bump versione (hotfix infrastrutturale, niente cambia lato UI). DB integrity ripristinata, sanity check tornerà verde al prossimo health check.

## SESSIONE 2026-06-02 (notte, post-CC.5.a) — Hotfix mig 143

### Cosa è successo
Push CC.5.a → deploy OK → restart backend → mig 142 applicata → `PRAGMA integrity_check` → `NULL value in carta_match_settings.tolerance_cc_importo_eur`. Backend non crashava (il service ha fallback ai DEFAULTS in codice), ma il sanity check di push.sh ha segnalato corruzione.

### Causa esatta
SQLite, su `ALTER TABLE x ADD COLUMN y REAL NOT NULL DEFAULT 0.10` quando la tabella ha già righe, NON popola le righe esistenti col default. Le lascia NULL, violando il NOT NULL. Quirk noto ma facile da dimenticare.

### Fix
1. **Sul VPS (manuale, immediato):** `UPDATE carta_match_settings SET tolerance_cc_importo_eur = COALESCE(...), tolerance_cc_data_days = COALESCE(...) WHERE id = 1`. Restituisce subito `integrity_check = ok`.
2. **Nel codice (safety net):** mig 143 idempotente con COALESCE — no-op sul VPS già fixato, ma copre qualunque altro deploy.
3. **Memoria persistente:** [feedback_sqlite_alter_add_column_not_null.md](feedback_sqlite_alter_add_column_not_null.md).

### Lezione per le prossime migrazioni
Mai più `ALTER TABLE ADD COLUMN NOT NULL DEFAULT` su tabella con righe esistenti. Sempre: ADD nullable + UPDATE backfill esplicito.

### File toccati in questo push
- `app/migrations/143_carta_match_settings_backfill.py` (nuovo)
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 notte):** **CC.5.a: match livello B (estratto ↔ addebito CC bancario)** (`[core]`). Carta v1.4 beta, sistema 5.22. Mig 142 estende `carta_match_settings` con `tolerance_cc_importo_eur` (default 0.10€) e `tolerance_cc_data_days` (default 3). Service ampliato con `find_candidati_cc` (filtri banca NOT LIKE 'CARTA_%', importo opposto entro tolleranza, data ±tol; score 70% importo + 30% data), `apply_link_cc` (UPDATE `carta_estratti.banca_movimento_id`), `remove_link_cc`. 3 nuovi endpoint `/estratti/{id}/candidati-cc`, POST/DELETE `/estratti/{id}/link-cc`. Frontend: `CercaAddebitoCcModal.jsx`, chip Match B nella riga estratto ora cliccabile per aprire la modale. UI soglie estesa con 2 campi extra (tolleranze CC). Test backend OK su DB sintetico (match esatto, blocchi su mov già usati o su movimenti CARTA). Resta solo **CC.5.b** (riepilogo mensile per categoria/MCC) per chiudere il sub-modulo carta.

## SESSIONE 2026-06-02 (notte) — CC.5.a: match livello B

### Concetto
Ogni estratto carta dichiara `addebito_totale_cc` e `data_valuta_addebito`. Sul CC bancario (banca BPM `000000012200`) c'è UN movimento di uscita che è il bonifico/addebito automatico mensile. Riconciliazione **1:1 esatta**, tolleranze molto strette.

### Decisioni
- Tolleranze CC: **importo 0.10€** (solo arrotondamenti), **data ±3gg** (banca può slittare 1-2 gg di valuta).
- **No auto-match all'upload**: il match B è sempre esplicito (click utente). Più sicuro, evita riconciliazioni silenziose sbagliate.
- Categorizzazione spese: hardcoded in CC.5.b. Tabella editabile in roadmap futura.
- Score: 70% importo + 30% data (no fornitore_score perché la descrizione "ADDEBITO CARTE BPM" non aggiunge segnale).

### File nuovi
- `app/migrations/142_carta_match_settings_cc.py` — ALTER carta_match_settings + 2 colonne
- `frontend/src/components/carta/CercaAddebitoCcModal.jsx` — modale con info estratto sorgente, lista candidate CC, link/unlink

### File modificati
- `app/services/carta_match_service.py` — `DEFAULTS` esteso, 3 nuove funzioni `_fetch_estratto`, `find_candidati_cc`, `apply_link_cc`, `remove_link_cc`
- `app/routers/banca_carta_router.py` — 3 nuovi endpoint match B + 2 nuove valid_keys per PUT /match-settings
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — stato `matchBEstratto`, render `CercaAddebitoCcModal`, chip Match B in riga estratto ora cliccabile (stopPropagation per non espandere) con messaggio diverso linkato/non-linkato
- `frontend/src/pages/banca/BancaImpostazioni.jsx` — sezione "Match livello B" nel tab Soglie con 2 campi (tolerance_cc_importo_eur / _data_days), body PUT esteso, reset defaults esteso
- `VERSION` 5.21 → 5.22
- `frontend/src/config/versions.jsx` — cartaCredito 1.3 → 1.4, sistema 5.21 → 5.22
- `docs/modulo_banca.md` — CC.5.a → ✅
- `docs/sessione.md` (questa entry)

### Test backend (DB sintetico)
- 1 estratto €2958.67 valuta 22/01
- 4 movimenti CC: 1 candidato perfetto (BPM −2958.67 il 22/01), 1 distrattore stesso giorno ma importo lontano (−500), 1 stesso importo ma data lontana (feb), 1 movimento CARTA (escluso da filtro)
- `find_candidati_cc` ritorna SOLO il candidato perfetto con score 1.000 ✓
- `apply_link_cc` salva `banca_movimento_id` ✓
- Tentativo di linkare mov già usato → ValueError bloccante ✓
- Tentativo di linkare un movimento CARTA → ValueError bloccante ("non è un addebito sul CC") ✓
- `remove_link_cc` azzera il link ✓

### Comportamento UI
1. Click sulla chip "🔍 Cerca" nella colonna "Match B (CC)" di un estratto → modale apre
2. Backend cerca candidate, mostra info estratto sorgente + tabella
3. Click "Linka" su una candidata → POST link-cc → chip diventa "✓ CC #N" + toast info
4. Click sulla chip "✓ CC #N" di un estratto già matchato → modale apre in stato "già linkato" con bottone "🔓 Stacca link"
5. Stacca → torna chip "🔍 Cerca"

### Cosa resta per chiudere Carta
**Solo CC.5.b**: riepilogo mensile delle spese carta per categoria (mappa MCC → categoria hardcoded). Backend GET /banca/carta/riepilogo + nuova vista frontend. ~1h di lavoro.

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 chiuso: D2 auto-match bulk + .e UI soglie** (`[core]`). Carta v1.3 beta, sistema 5.21. D2: endpoint `POST /banca/carta/estratti/{id}/automatch?dry_run=true|false` + nuova `<AutomatchModal>` con anteprima checkbox (default ≥85%) + bottone "🔗 Auto-match CG (N)" nell'header dettaglio estratto. .e: endpoint `PUT /banca/carta/match-settings` con validazione somma pesi=1.0 + nuovo tab "Soglie match carta" in `BancaImpostazioni` (sidebar) con form 6 campi (tolleranze importo €/giorni, 3 pesi, soglia auto-apply), reset defaults, indicatore live somma pesi. Match A ora **completo end-to-end + configurabile**. Resta solo CC.5 (livello B + riepilogo).

## SESSIONE 2026-06-02 (sera) — CC.4 chiuso: D2 + .e

### D2 — Auto-match bulk
- Backend già pronto da D1 (`automatch_dry_run`, `automatch_apply` nel service). Wrapper endpoint `POST /banca/carta/estratti/{id}/automatch`:
  - `?dry_run=true` (default): ritorna `{preview: [{movimento_id, mov_data, mov_descrizione, mov_importo, uscita_id, uscita_fornitore, uscita_totale, uscita_data_pagamento, score, imp_score, data_score, forn_score, auto_select}, ...]}`
  - `?dry_run=false` + body `{mov_ids: [int]}`: applica solo i match selezionati (re-validation server-side al momento dell'apply per evitare race condition)
- Frontend: `AutomatchModal.jsx` con 4 fasi (loading/preview/applying/done). Default checkbox = `auto_select` (server marca true se score ≥ soglia da settings). Azioni rapide "Tutti / Nessuno / Solo ≥85%". `skipped` non blocca (es. uscita linkata da altrove nel frattempo).
- Bottone "🔗 Auto-match CG (N)" appare nel header `EstrattoDetail` solo se `nNonMatchati > 0`.

### .e — UI soglie matching
- Endpoint `PUT /banca/carta/match-settings` con validazione:
  - `tolerance_importo_eur > 0`
  - `0 <= tolerance_data_days <= 60`
  - `0 <= weight_* <= 1`
  - **Somma `weight_importo + weight_data + weight_fornitore` ≈ 1.0** (tolleranza 0.01). Merge sui valori correnti per validare anche update parziali.
  - `0 <= auto_apply_threshold <= 1`
  - Salva `updated_at` e `updated_by` automaticamente.
- Frontend: nuova sezione `TabCartaMatch` in `BancaImpostazioni` (voce sidebar "💳 Soglie match carta"). Layout:
  - Card "Tolleranze pre-filtro" (importo €, giorni)
  - Card "Pesi del punteggio" con indicatore live somma + chip ✓/⚠
  - Card "Soglia auto-apply"
  - Bottoni: Salva (disabled se !dirty o !pesiOk), Annulla modifiche, Ripristina default
  - Mostra ultima modifica (timestamp + user)

### File nuovi
- `frontend/src/components/carta/AutomatchModal.jsx`

### File modificati
- `app/routers/banca_carta_router.py` — POST `/automatch` + PUT `/match-settings`
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — bottone "🔗 Auto-match CG (N)" + render `AutomatchModal`
- `frontend/src/pages/banca/BancaImpostazioni.jsx` — nuova voce menu "carta-match" + componente `TabCartaMatch` + helper `SettingField`
- `VERSION` 5.19 → 5.21 (skip 5.20 perché D2+e combinato in un push)
- `frontend/src/config/versions.jsx` — cartaCredito 1.1 → 1.3, sistema 5.19 → 5.21
- `docs/modulo_banca.md` — CC.4 D2 + .e → ✅
- `docs/sessione.md` (questa entry)

### Cosa resta
Solo **CC.5** (riconciliazione livello B + riepilogo mensile). Probabilmente 2 sotto-push (match B + riepilogo). Conclude la riga "carta_credito" sulla roadmap.

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 D1: match manuale livello A** (`[core]`). Carta v1.1 beta. Mig 141 (`carta_match_settings` singleton con tolleranze 0,50€/10gg + pesi 50/30/20 + soglia auto 0.85). Nuovo service `app/services/carta_match_service.py` con algoritmo scoring (importo+data+fornitore). 4 nuovi endpoint backend (`/movimenti/{id}/candidati`, POST/DELETE `/link`, GET `/match-settings`). Frontend: nuova `<CercaUscitaModal>` + colonna "Match CG" nella sub-tabella dell'estratto espanso con bottone "🔍 Cerca" e bottone "stacca" sui matchati.

## SESSIONE 2026-06-02 (sera) — CC.4 D2: auto-match bulk

### Sintesi
Backend già pronto da D1 (service aveva `automatch_dry_run` e `automatch_apply`). Push D2 ha:
- Aggiunto wrapper endpoint `POST /banca/carta/estratti/{id}/automatch` con flag `dry_run` (default true) + body opzionale `{mov_ids: [int]}` per l'apply selettivo
- Creato nuovo componente frontend `AutomatchModal.jsx` con 4 fasi (loading / preview / applying / done)
- Inserito bottone "🔗 Auto-match CG (N)" nell'header del dettaglio estratto, visibile solo se ci sono movimenti non matchati. Il counter N mostra quanti

### Comportamento UI
1. Click su "🔗 Auto-match CG (N)" → modale apre con `dry_run=true`
2. Backend ritorna lista best-match per ogni movimento non linkato, con score breakdown
3. Modale mostra tabella: checkbox / score chip + breakdown / movimento sorgente / → / uscita CG candidata
4. Default: checkbox spuntate per score ≥ 0.85 (`auto_apply_threshold` di settings)
5. Utente può cambiare selezione (Tutti / Nessuno / Solo ≥85% / manuale)
6. Click "Applica N match" → POST `dry_run=false` con `mov_ids` selezionati
7. Backend richiama `apply_link` per ognuno (re-validation), accumula `applied`/`skipped`
8. Modale phase "done" con riepilogo + dettagli applicati
9. onClose → refresh detail estratto (per aggiornare chip Match CG)

### Decisioni di design
- **Re-validation in apply**: l'`automatch_apply` ricalcola il best candidate corrente al momento dell'apply (non si fida del dry_run server-side). Protegge da race condition se nel frattempo qualcosa è cambiato in CG.
- **Skipped non bloccante**: se un movimento ha ora 0 candidati (es. uscita già linkata da altra azione), viene saltato silenziosamente con motivo, non blocca l'intera operazione.
- **Selezione manuale possibile sotto soglia**: l'utente può sempre spuntare match a basso score se vuole revisionarli e applicarli.
- **Bottone visibile solo se serve**: il chip "🔗 Auto-match" appare solo se `nNonMatchati > 0`. Se l'estratto è completamente riconciliato, il bottone non c'è.

### File nuovi
- `frontend/src/components/carta/AutomatchModal.jsx` (modale anteprima + apply)

### File modificati
- `app/routers/banca_carta_router.py` — nuovo endpoint POST /automatch
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — import + stato `automatchEstrattoId` + render modale + prop `onAutomatch` su EstrattoRow/Detail + bottone in header detail
- `VERSION` 5.19 → 5.20
- `frontend/src/config/versions.jsx` — cartaCredito 1.1 → 1.2, sistema 5.19 → 5.20
- `docs/modulo_banca.md` — CC.4 D2 → ✅
- `docs/sessione.md` (questa entry)

### Cosa manca per chiudere Carta
- **CC.4.e** UI soglie (15 min, form 6 campi in Impostazioni)
- **CC.5** match livello B (estratto ↔ addebito mensile su CC) + riepilogo mensile per categoria/MCC

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 D1: match manuale livello A** (`[core]`). Carta v1.1 beta. Mig 141 (`carta_match_settings` singleton con tolleranze 0,50€/10gg + pesi 50/30/20 + soglia auto 0.85). Nuovo service `app/services/carta_match_service.py` con algoritmo scoring (importo+data+fornitore). 4 nuovi endpoint backend (`/movimenti/{id}/candidati`, POST/DELETE `/link`, GET `/match-settings`). Frontend: nuova `<CercaUscitaModal>` + colonna "Match CG" nella sub-tabella dell'estratto espanso con bottone "🔍 Cerca" e bottone "stacca" sui matchati.

## SESSIONE 2026-06-02 (sera) — CC.4 D1: match manuale livello A

### Ricognizione iniziale
45 uscite CG già presenti con `metodo_pagamento='CARTA' AND banca_movimento_id IS NULL AND stato='PAGATO_MANUALE'` — sono quelle dove Marco ha già cliccato "Paga con carta" su Fatture. Match temporale corretto: `mov.data_contabile ↔ uscita.data_pagamento` (non `data_scadenza`). Esempi: ARUBA, Coffee Lab, Il Post, Unieuro.

### Decisioni di design
- **Soglie non hardcoded**: tabella `carta_match_settings` singleton (mig 141) con default in codice + UI in CC.4.e (push successivo). Difesa contro la regola Marco "vietato hardcodare soglie operative".
- **Score**: 50% importo + 30% data + 20% fornitore (substring case-insensitive).
- **Pre-filtri**: |importo| < 0,50€, |giorni| < 10 (più ampi = più rumore; più stretti = match persi).
- **Transizione stato**: link riuscito → `PAGATO_MANUALE → PAGATO`; unlink → torna `PAGATO_MANUALE`.
- **Soglia auto-apply**: 0.85 (sotto si vede ma checkbox non spuntata — sarà rilevante in CC.4 D2).

### File nuovi
- `app/migrations/141_carta_match_settings.py` — singleton (id=1 forced via CHECK).
- `app/services/carta_match_service.py` — `get_match_settings`, `find_candidati`, `apply_link`, `remove_link`, `automatch_dry_run`, `automatch_apply` (già pronto per CC.4 D2).
- `frontend/src/components/carta/CercaUscitaModal.jsx` — modale con info movimento sorgente, ricerca libera per fornitore, lista candidate ordinate per score, chip score color-coded + breakdown imp/data/forn, bottone "Linka" per ciascun candidato.

### File modificati
- `app/routers/banca_carta_router.py`:
  - GET `/banca/carta/movimenti/{id}/candidati?search=&limit=` — wrap su `find_candidati`
  - POST `/banca/carta/movimenti/{id}/link` body `{uscita_id}` — wrap su `apply_link`, 409 su collisioni
  - DELETE `/banca/carta/movimenti/{id}/link` — wrap su `remove_link`, idempotente
  - GET `/banca/carta/match-settings` — espone le settings correnti
  - GET `/banca/carta/estratti/{id}` esteso con LEFT JOIN su `cg_uscite` per esporre `match_uscita_id`/`match_uscita_fornitore`/`match_uscita_totale`
  - DELETE `/banca/carta/estratti/{id}` con check anche su `cg_uscite.banca_movimento_id` (oltre a `banca_fatture_link`)
- `frontend/src/pages/banca/CartaCreditoPage.jsx`:
  - Stato `cercaUscita: {movimento, estrattoId} | null`
  - Funzioni `refreshAfterMatch(estrattoId)` e `unlinkMovimento(movId, estrattoId)`
  - `EstrattoDetail` esteso con colonna "Match CG (livello A)": chip verde `✓ #N {fornitore}` + bottone "stacca" sui matchati; bottone `🔍 Cerca` sui non matchati
  - `loadDetail` accetta `force=true` per invalidare la cache dopo match/unlink

### Test (DB sintetico)
- Mig 140 + 141 idempotenti ✓
- 3 candidati ESSELUNGA/ARUBA/IL POST trovati con score 1.0/0.97/1.0 ✓
- `apply_link` cambia stato a PAGATO, setta `banca_movimento_id`, `importo_pagato`, popola `data_pagamento` se NULL ✓
- `remove_link` torna a PAGATO_MANUALE, azzera `banca_movimento_id` ✓
- `automatch_dry_run` esclude FORNITORE INESISTENTE (score 0) ✓
- `automatch_apply` linka 3/3, nessuno skipped ✓

### Bump versioni
- `VERSION` 5.18 → 5.19
- `cartaCredito` 1.0 beta → 1.1 beta
- `sistema` 5.18 → 5.19

### File toccati in questo push
- `app/migrations/141_carta_match_settings.py` (nuovo)
- `app/services/carta_match_service.py` (nuovo)
- `app/routers/banca_carta_router.py`
- `frontend/src/components/carta/CercaUscitaModal.jsx` (nuovo)
- `frontend/src/pages/banca/CartaCreditoPage.jsx`
- `frontend/src/config/versions.jsx`
- `VERSION`
- `docs/modulo_banca.md`
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 pomeriggio):** **CC.3: UI Carta di Credito vera** (`[core]`). `CartaCreditoPage.jsx` da scheletro v0.1 a v1.0: anagrafica carta (multi-carta ready via dropdown), drop-zone upload PDF con feedback specifico per 422/409, lista estratti con riga espandibile, sub-tabella movimenti dentro l'estratto espanso con badge USD per i movimenti esteri, delete estratto. Promosso a `cartaCredito v1.0 beta`. Sistema 5.17→5.18. Manca solo la riconciliazione (CC.4 livello A, CC.5 livello B + riepilogo mensile).

## SESSIONE 2026-06-02 — CC.3: UI Carta di Credito vera

### Sintesi
Mockup HTML statico costruito e validato con Marco (`claude/cc3_mockup_carta_credito.html`). Layout approvato: anagrafica in alto, drop-zone sotto, lista estratti con riga espandibile che mostra dettaglio movimenti inline. Nessuna tab separata. Nessuna logica di riconciliazione in CC.3 (rinviata a CC.4/CC.5) — la UI mostra solo READ-ONLY lo stato match A/B di ogni movimento/estratto.

### File modificati
- **`frontend/src/pages/banca/CartaCreditoPage.jsx`** (riscritto, ~450 righe). Componenti interni: `DropZone`, `Stat`, `LegendItem`, `EstrattoRow`, `EstrattoDetail`. Stati: `carte`, `cartaCorrenteId`, `estratti`, `expandedId`, `details` (cache lazy per estratto), `uploading`, `dragOver`, `error`, `info`. Endpoint chiamati: GET `/banca/carta/carte`, GET `/banca/carta/estratti?carta_id=`, GET `/banca/carta/estratti/{id}`, POST `/banca/carta/upload`, DELETE `/banca/carta/estratti/{id}`.
- **Feedback errori specifici:**
  - 409 (dup PDF) → "Questo PDF è già stato importato (estratto #N). Per ri-importare, elimina prima l'estratto esistente."
  - 422 (non quadra) → mostra delta_quadratura + delta_addebito + warnings parser.
  - Default → `json.detail` o `Errore HTTP {status}`.
- **Drag&drop nativo**: `onDragOver` / `onDragLeave` / `onDrop`. Visual feedback con bordo blu + bg blu quando `dragOver`. Alternativa "Scegli file" via input nascosto + ref.
- **Multi-carta**: se >1 carta, la riga anagrafica diventa `<select>` con la lista; se =1 mostra il nickname statico. PK funzionale `codice_posizione`.
- **Match A/B**: in CC.3 sono **read-only**. Match A non viene mostrato sui singoli movimenti (richiede una JOIN su cg_uscite cross-DB che non c'è nell'endpoint attuale → arriverà in CC.4 con worklist dedicata). Match B mostrato sulla riga estratto come chip success/warning.
- **Lazy load movimenti**: i movimenti vengono caricati solo all'espansione (`GET /estratti/{id}`), cached in `details[id]` per evitare re-fetch a click successivi.

### Bump versioni
- `VERSION` 5.17 → 5.18
- `cartaCredito` 0.2 alpha → **1.0 beta** (UI completa, manca solo riconciliazione)
- `sistema` 5.17 → 5.18

### Cose volutamente NON in CC.3
- Auto-match livello A (movimento carta ↔ uscita CG con `metodo='CARTA' AND banca_movimento_id IS NULL`) → **CC.4**.
- UI di matching manuale singolo movimento ("Cerca uscita") → **CC.4**.
- Match B (estratto ↔ addebito CC mensile) automatico/manuale → **CC.5**.
- Riepilogo mensile per categoria + confronto budget → **CC.5**.
- Filtri / ricerca movimenti / paginazione (se servirà con >100 mov/estratto) → da valutare.

### File toccati in questo push
- `frontend/src/pages/banca/CartaCreditoPage.jsx`
- `frontend/src/config/versions.jsx`
- `VERSION`
- `docs/modulo_banca.md` (CC.3 → ✅ FATTO)
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 mattina):** **CC.1+CC.2: backend Carta di Credito in produzione** (`[core]`). Parser PDF Banco BPM (`app/services/carta_pdf_parser.py`), migration 140 (carte_credito, carta_estratti, +8 colonne carta su banca_movimenti), router `app/routers/banca_carta_router.py` con upload PDF + lista carte/estratti/movimenti. Validato sui 5 estratti gen→mag 2026 (127 movimenti, quadratura ai centesimi). Sistema 5.16→5.17, nuovo modulo `cartaCredito v0.2 alpha`. Anche fixato `backup_router.py` (entrato dentro commit ricette di sessione parallela). UI ancora scheletro v0.1 — CC.3 ne farà uno vero.

## SESSIONE 2026-06-02 — CC.1+CC.2: backend Carta di Credito

### Contesto
Marco vuole riconciliare l'estratto carta di credito Banco BPM (carta corporate Tre Gobbi *623, codice posizione 9000856980) con le uscite del Controllo di Gestione. Decisioni architetturali concordate prima di scrivere codice:

1. **Storage riuso vs nuovo:** riuso `banca_movimenti` con `banca='CARTA_<EMITT>_<ULT3>'` (es. `CARTA_BPM_623`) ed esclusione dal saldo CC via `WHERE banca NOT LIKE 'CARTA_%'`. Scartata nuova tabella `carta_movimenti` per non duplicare parser/dedup/categorizzazione/UI.
2. **Multi-carta day-1:** anagrafica `carte_credito` con PK funzionale `codice_posizione`. Oggi 1 sola carta, predisposto per N.
3. **Doppio livello di riconciliazione:**
   - **Livello A** — movimento singolo carta ↔ uscita CG con `metodo_pagamento='CARTA' AND banca_movimento_id IS NULL`. CC.4.
   - **Livello B** — estratto mensile ↔ addebito unico sul CC bancario (`carta_estratti.banca_movimento_id`). CC.5.

### CC.1 — Parser PDF (`app/services/carta_pdf_parser.py`, 492 righe)
Banco BPM produce PDF testuale 4 pagine. Estrazione via `pdftotext -layout` + regex. Header layout colonnare a 3 colonne con barcode/junk frapposto → helper `_find_value_after_label(label, value_re, max_chars, same_line=False)`. Default `same_line=False` salta la riga della label e cerca dalla riga successiva (necessario perché la colonna del valore della label X coincide con la riga della label Y+1).

Regex chiave:
- **Riga normale:** `^\s*(\d{23})\s+(\d{8})\s+(GG/MM/AAAA)\s+(GG/MM/AAAA)\s+(.+?)\s+(IMPORTO)\s*$`
- **Riga estera:** stessa + `(IMP_ESTERO)\s+([A-Z]{3})\s+(CAMBIO 5 decimali)\s+(IMP_EUR)`
- **Riga MAGG:** `MAGG\.\s+CIRCUITO\s+€\s+(X,XX)\s+MAGG\.\s+CAMBIO\s+€\s+(Y,YY)` (riga successiva all'estera)

Validazione: 2 equazioni di chiusura (somma_movimenti == totale_movimenti; addebito_cc == totale_mov + bollo + spese + residuo_prec − addebitato_prec).

**Sanity 5 PDF (gen→mag 2026):** 35+19+20+31+22 = 127 movimenti, **tutti i delta a 0.00**. Codici riferimento 23-cifre: 127 unici (dedup naturale perfetto).

### CC.2 — Schema + endpoint (mig 140 + `banca_carta_router.py`, 442 righe)

**Mig 140** crea:
- `carte_credito` (id, nickname, emittente, `codice_posizione UNIQUE`, carta_numero_mask, ultime_visibili, intestatario, titolare, codice_titolare, cc_addebito, abi, cab, piva, limite_utilizzo, `banca_tag UNIQUE`, attiva, ...)
- `carta_estratti` (id, carta_id FK, data_chiusura, data_valuta_addebito, debito_residuo_precedente, totale_addebitato_precedente, totale_movimenti, imposta_bollo, spese_invio, addebito_totale_cc, banca_movimento_id FK NULL (match B), pdf_filename, `pdf_sha256 UNIQUE` (dedup re-upload), n_movimenti, quadra, warnings JSON, imported_at)
- ALTER `banca_movimenti` ADD: `carta_codice_riferimento` (+ UNIQUE INDEX WHERE NOT NULL), `carta_mcc`, `carta_estratto_id`, `valuta_estera`, `importo_estero`, `cambio_valuta`, `magg_circuito`, `magg_cambio`. Tutte idempotenti via PRAGMA table_info.

**Endpoint `/banca/carta/*`:**
- `POST /upload` — riceve PDF, parse, find_or_create_carta, insert estratto + movimenti (dedup su codice_riferimento). Rifiuta con 422 se non quadra (delta > 0.02€). Rifiuta con 409 se `pdf_sha256` già visto. Movimenti inseriti con `importo` NEGATIVO (è uscita), `banca=banca_tag` della carta, `rapporto=codice_posizione`, `hashtag=mcc[:4]`.
- `GET /carte` — lista carte con conteggio estratti/movimenti per carta.
- `GET /carte/{id}` — dettaglio.
- `GET /estratti?carta_id=` — lista estratti.
- `GET /estratti/{id}` — dettaglio + movimenti.
- `DELETE /estratti/{id}` — rollback (bloccato se ci sono `banca_fatture_link` attivi).

Registrato in `main.py` come `banca_carta_router` accanto a `banca_router`.

### Anomalia tracciabilità (memo per il futuro)
Commit `cd9f49ba` ha messaggio "fix backup_router.py" ma il payload reale è CC.2 backend (4 file nuovi). Causa: il working tree era già dirty con CC.2 quando Marco ha lanciato push.sh col messaggio del fix backup → `git add -A` ha incluso tutto. Il fix backup vero (1 file) è invece entrato dentro `26d4fb10` (commit ricette di sessione parallela). Nessun problema funzionale, solo tracciabilità: `git blame` sui file CC.2 punterà al commit sbagliato. Lezione: prima di dare il messaggio di un push spezzato, verificare che il working tree contenga SOLO i file di quell'argomento.

### Push successivi previsti
- Questo (Push B): bump versioni + docs CC.2 (chiude pulito il commit precedente).
- Push C: CC.3 UI vera (`CartaCreditoPage.jsx` da scheletro v0.1 a v1.0).
- Push D: CC.4 riconciliazione livello A.
- Push E: CC.5 riconciliazione livello B + riepilogo mensile.

### File toccati in questo push
- `VERSION` 5.16 → 5.17
- `frontend/src/config/versions.jsx` — nuovo `cartaCredito v0.2 alpha`, `sistema` 5.16 → 5.17
- `docs/modulo_banca.md` — nuova sezione "11.1 Sub-modulo Carta di Credito"
- `docs/sessione.md` — questa entry

---

**Penultimo aggiornamento:** 2026-05-30 — **Vini 3.61: STATO_RIORDINO si azzera in automatico all'arrivo dello stock** (`[core]`). Auto-reset di `STATO_RIORDINO='0'` (Ordinato) in `registra_movimento` (CARICO sempre + RETTIFICA delta>0) e in `conferma_arrivo_ordine_pending`. Ogni transizione è loggata come MODIFICA con utente/origine. `duplicate_vino` accetta ora `utente` e logga lo stato iniziale. Migration 139 cleanup one-shot dei vini orfani (`STATO_RIORDINO='0'` senza pending). Da pushare.

## SESSIONE 2026-05-30 — Vini 3.61: STATO_RIORDINO auto-reset all'arrivo stock

### Sintesi
Marco ha segnalato che il widget "vini senza giacenza" della Dashboard Vini non mostrava il vino ID 1239 (Pinot Nero Alto Adige Sogegross, giacenza 0). Diagnosi: il widget esclude per design `STATO_RIORDINO='0'` (Ordinato), ma né i CARICO né la conferma arrivo ordine pending azzeravano mai questo stato — quindi i vini ordinati→arrivati→rivenduti restavano marcati Ordinato per sempre. Marco ha chiesto di gestirlo per bene + di tracciare in archivio chi/quando/perché.

### Implementazione
- **`registra_movimento`**: aggiunto `STATO_RIORDINO` alla SELECT iniziale; dopo le UPDATE delle qta, se `sr='0'` AND (`tipo='CARICO'` OR (`tipo='RETTIFICA'` AND `delta>0`)) → UPDATE STATO_RIORDINO=NULL + INSERT movimento `MODIFICA` con `origine='AUTO-CARICO' | 'AUTO-RETTIFICA'` e `utente` corrente.
- **`conferma_arrivo_ordine_pending`**: stesso reset dentro la transazione atomica (tra l'INSERT CARICO e il DELETE pending), `origine='ORDINE_ARRIVO'`.
- **`duplicate_vino`**: accetta ora `utente` (default `"system"`). Dopo l'INSERT, se la copia ha `STATO_RIORDINO` valorizzato, log `MODIFICA` con `origine='DUPLICATE-NUOVA-ANNATA'`. `duplicate_vino_endpoint` e `bulk_duplicate_vini` aggiornati per passarlo.
- **Migration 139** `139_reset_stato_riordino_orfani.py`: cleanup one-shot opzione B confermata da Marco — reset `'0' → NULL` per i vini SENZA riga in `vini_ordini_pending`. Ogni reset loggato come `MODIFICA` con `origine='MIG-139-CLEANUP'`. Backup file `.pre-mig139-<ts>`. Idempotente. Sandbox: 14 candidati locale.

### Verifica
`PY_OK` su `vini_magazzino_db.py`, `vini_magazzino_router.py`, `139_reset_stato_riordino_orfani.py`. esbuild OK su `versions.jsx`. Dry-run mig 139 conferma 14 candidati in locale, query funzionante. Versione vini 3.60 → **3.61**.

### Commit suggerito
`./push.sh "[core] vini 3.61 — STATO_RIORDINO auto-reset su CARICO/RETTIFICA+ e su conferma arrivo ordine; log MODIFICA per ogni transizione (utente/origine); duplicate_vino con utente; mig 139 cleanup orfani"`

---

## SESSIONE 2026-05-24 — Ricette 3.30: scheda ingrediente ridisegnata a tab

### Sintesi
Marco vuole iniziare a usare davvero il modulo Ricette/Food Cost. Dopo aver migliorato matching e lista ingredienti nelle sessioni precedenti, la pagina di **dettaglio ingrediente** era ancora una pagina a scorrimento unico, fuori dallo stile del sistema. Dopo un giro di mockup approvati da Marco, la pagina è stata ricomposta in stile TRGB sul modello della scheda vino.

### Implementazione
- **Backend** — `foodcost_recipes_router.py`: nuovo endpoint `GET /foodcost/ricette/per-ingrediente/{ingredient_id}` → elenca le ricette che usano un ingrediente con qty impiegata, costo riga e incidenza % sul food cost (riusa `_calc_item_cost`/`_calc_recipe_cost`). Modello `RicettaPerIngredienteOut`. Registrato prima di `/ricette/{recipe_id}` (comunque path a 2 segmenti, nessun conflitto).
- **Frontend** — `RicetteIngredientiPrezzi.jsx` riscritto (v4.0): testa con badge categoria/stato + nome + 4 KPI, tab bar a 5 linguette (`border-b-2 border-brand-red` sull'attiva, come la scheda vino).
  - **Prezzi**: grafico Recharts andamento prezzo (media mensile per fornitore), storico, form "aggiungi prezzo" a comparsa.
  - **Collegamenti**: collegamenti fattura raggruppati per fornitore; sospetti in ambra con "Correggi" inline; ricerca/collega righe.
  - **Conversioni**: come prima, ora in tab dedicata.
  - **Ricette**: nuova — incidenza % colorata per soglia, riga → scheda ricetta.
  - **Anagrafica**: vista dati + form di modifica completo; per i placeholder "Completa ingrediente".
- `versions.jsx`: ricette `3.29 → 3.30`.

### Anche — fix flag conversione sospetta + lista ingredienti (stesso push)
- Marco ha segnalato che dopo «Correggi» la conversione "non cambia": il collegamento restava giallo. Diagnosi: `collegamentoSospetto` (e il flag `conversione_da_verificare` nella lista) guardavano solo la famiglia dell'unità (PZ vs g), mai il fattore. Risultato: una riga PZ→g restava "sospetta" anche dopo aver impostato un fattore corretto. Il ricalcolo del prezzo in `correggi-conversione` era invece corretto (formula `original_price / fattore`, coerente con `_compute_unit_price`). Fix: il flag ora è sospetto solo se famiglia diversa **e** fattore assente/=1; appena si corregge (fattore ≠ 1) torna verde. Toccati `collegamentoSospetto` (FE) e `list_ingredients` (BE). Messaggio post-correzione arricchito col nuovo prezzo.
- **Lista ingredienti** `RicetteIngredienti.jsx` riscritta v4.0 sul modello Cantina vini (Marco: "la lavorerei più simile alla cantina, filtri a sinistra e sopra"): chip categorie in cima con conteggi, sidebar filtri a sinistra (ricerca, unità base, "da sistemare", disattivati), tabella ordinabile via hook condiviso `useSortableTable`.

### Note / aperto
- Resta da capire se, con tutti i collegamenti PZ corretti, i KPI «prezzo attuale / medio» dell'ingrediente Capperi tornano sensati. Il ricalcolo è corretto: il medio era sballato perché inquinato da più collegamenti PZ non ancora corretti (correggerne uno non basta).

## SESSIONE 2026-05-21 — Vini 3.60: permessi catalogo aperti al sommelier

### Sintesi
Marco, testando il modulo Vini come **sommelier**, ha segnalato che non gli era permesso modificare un vino madre. Diagnosi: l'endpoint `PATCH /vini/anagrafiche/madre/{id}` (e tutta la scrittura del catalogo) era gatato a `_require_admin` (solo admin/superadmin). Emersa anche un'incoerenza: `PATCH /vini/magazzino/{id}` (scheda bottiglia) **non aveva alcun check** → anche `viewer` poteva scrivere. La doc `modulo_vini.md §11` prevedeva già il sommelier per il CRUD: era un drift doc/codice.

Decisione di Marco: **opzione 3** — l'intero catalogo vini è gestito da sommelier + admin; `sala` solo lettura, niente modifica.

### Implementazione
- **`auth_service.py`** — nuovo helper `is_vini_manager(role)` → `admin | superadmin | sommelier`.
- **`vini_anagrafiche_router.py`** — nuovo `_require_vini_manager`. 17 endpoint catalogo (CRUD produttori/fornitori/denominazioni/vitigni/madre/bottiglia + promote-composto) → `_require_vini_manager`. Restano `_require_admin` le 8 operazioni distruttive di massa: merge ×3, migrate-from-legacy, denominazioni/sync, sync-all, rollback.
- **`vini_magazzino_router.py`** — `update_vino_magazzino`, `create_vino_magazzino`, `duplica` → check `is_vini_manager`. `delete-vino` da admin-only a `is_vini_manager`. Bulk-update/bulk-duplicate restano admin-only.
- **Frontend** — `SchedaVino.jsx`: `roReadOnly` derivato dal ruolo, nasconde Modifica anagrafica/giacenze, toggle mescita, Duplica, Elimina ai non-manager. `MagazzinoSubMenu.jsx` + `DashboardVini.jsx`: voce "Nuovo vino" nascosta a `sala`/`viewer`.

### Note
- I **movimenti** (registra/elimina carico-scarico-vendita) restano accessibili a `sala`: azioni operative di servizio, non gestione catalogo. Invariati di proposito.

### Anche — creazione madre senza denominazione (stesso push)
Marco ha segnalato che il wizard "Nuovo Vino" obbligava a scegliere una denominazione, ma ci sono vini che non ne hanno (vino da tavola, IGT generici). Corretta la validazione `confirmNewMadre` in `NuovoVinoV2.jsx`: ora serve **denominazione _oppure_ nome etichetta** (anchor per la descrizione composta), non più la denominazione obbligatoria. Campo rietichettato "Denominazione (opzionale)". Backend già OK (`MadreBase.denominazione_id` Optional). Allineato anche il messaggio d'errore del box "promuovi madre legacy".

### Anche — bottiglia senza annata (stesso push)
Marco: "nel figlio potrebbe non esserci annata". Discusso il modello: un vino senza annata = **1 madre + 1 bottiglia con annata vuota** (modello A, confermato da Marco). La giacenza resta sulla bottiglia, nessuna modifica al modello dati — il vincolo era solo una validazione artificiale. Annata resa opzionale su 3 livelli: `canAdvance` step 3 in `NuovoVinoV2.jsx` (blocca solo su anno invalido futuro/<1900), `BottigliaCreate.ANNATA` da `Field(..., min_length=1)` a `Optional[str]`, `create_bottiglia()` (rimosso `raise ValueError`). La colonna `vini_bottiglie.ANNATA` era già nullable (7 bottiglie senza annata già esistenti nel DB). FieldLabel "Annata (opzionale)", preview mostra "senza annata".

### Anche — modifica del vino madre dalla Cantina (stesso push)
Marco: "ho bisogno di modificare la madre anche dalla cantina, ora si può solo dalla creazione del vino". La scheda madre in Cantina (`SchedaMadreV2`, vista raggruppata) era read-only. Aggiunto bottone **✎ Modifica** gated `is_vini_manager`. Per riuso senza import circolare, `MadreEditModal` + helper `Field` **estratti** da `AnagraficheVini.jsx` nel nuovo file `frontend/src/components/vini/MadreEditModal.jsx` (importato da Anagrafiche e da SchedaMadreV2). Il modale ora fa self-fetch del madre completo via `GET /madre/{id}` (necessario perché da `groupByMadre` il madre arriva senza FK). Al salvataggio `CantinaV2` rifà `fetchData()`.

### Anche — controllo annata duplicata nel wizard (stesso push)
Marco: "se scelgo un madre e creo un figlio con la stessa annata di uno esistente deve dirmelo (idem se lascio vuoto)". `submitWizard` ora, se il madre è esistente, fa `GET /madre/{id}/bottiglie` e se trova un'annata già presente (vuota inclusa) mostra un `confirm` con i dati della bottiglia esistente. Stesso anno + formato diverso è legittimo → avviso, non blocco. Check non bloccante su errore di rete.

### Anche — andamento giacenza giorno-per-giorno nella scheda vino (stesso push)
Marco: "riesci a ricostruire le giacenze di un determinato vino giorno per giorno? e mettere nella sua anagrafica?". Risposta: sì, replay forward di `vini_magazzino_movimenti` (`CARICO +`, `SCARICO/VENDITA −`, `RETTIFICA :=` assoluto, `MODIFICA` no-op). Backend: nuova `giacenza_storica_vino(vino_id, days=30)` in `vini_magazzino_db.py` + endpoint `GET /vini/magazzino/{id}/giacenza-storica?days=30`. Frontend: box "📈 Andamento giacenza — ultimi 30 giorni" nella tab **Giacenze** della scheda vino (dove ha chiesto Marco — non una nuova tab). Grafico recharts line `stepAfter` brand-blue + KPI Min/Max/Oggi + data primo movimento. Badge "dati parziali" se la finestra precede il primo movimento, badge "⚠ drift N" se la giacenza ricostruita diverge da `QTA_TOTALE` (= modifica diretta che ha bypassato i movimenti). Refresh automatico al salvataggio di movimenti/giacenze/modifica-data. Sulla SchedaMadreV2 (sommatoria annate) Marco ha detto "sarebbe bello" — rimandato a un secondo push.

### Fix regressione — toggle mescita calici tornato accessibile a sala (stesso push)
Marco: "il widget dei calici non permette a quelli di sala di cancellare le bottiglie aperte". Causa: gatando `PATCH /vini/magazzino/{id}` a `is_vini_manager` ho gatato anche il toggle "bottiglia in mescita" che passava da lì. Marco ha chiesto la **mappa completa dei permessi del modulo** (vedi `modulo_vini.md` §11, ora dettagliata con colonna enforcement) e ha confermato **opzione 1**: endpoint dedicato. Creato `PATCH /vini/magazzino/{id}/bottiglia-aperta` (gate `is_vini_manager OR sala`), accetta solo i campi del servizio al calice (`BOTTIGLIA_APERTA`, `VENDITA_CALICE`, `PREZZO_CALICE`, `PREZZO_CALICE_MANUALE`, `NOTE`). `PATCH /{id}` resta `is_vini_manager`. Migrati i 4 call site (`CaliciDisponibiliCard`, `CartaVini`, `ViniVendite.patchAttivaCalice`, `SchedaVino.toggleBottigliaAperta` con nuovo `canCalici`).
**Rimaste aperte 2 domande a Marco** (gruppo E permessi): se gatare gli endpoint vini oggi senza alcun controllo ruolo (settings, `matrice/assegna|rimuovi`, ordine-pending, note — chiunque loggato può usarli, viewer compreso) e se limitare `POST /{id}/movimenti`. Da decidere.

### Verifica
`PY_OK` sui file backend. Per il frontend la verifica vite locale ora fallisce per node_modules con sole binarie macOS (nessun `@rollup/rollup-linux-arm64-gnu` / `@esbuild/linux-arm64` in node_modules — Marco ha reinstallato sul Mac, le ottimizzazioni opzionali platform-specific non sono presenti per Linux). Sostituito con **@babel/parser → OK** sul file modificato (`SchedaVino.jsx`), la build reale girerà su push.sh sulla macchina di Marco. Versione vini 3.59 → 3.60.

### Commit suggerito
`./push.sh "[core] vini 3.60 — permessi catalogo al sommelier + denominazione/annata opzionali + modifica madre dalla Cantina + controllo annata duplicata + endpoint dedicato toggle calici + andamento giacenza 30gg nella scheda vino"`

---

## SESSIONE 2026-05-21 — Export PDF corrispettivi per il commercialista

### Sintesi
Marco aveva bisogno di un PDF da consegnare al commercialista per il controllo dei corrispettivi. Deciso insieme: periodo mensile, solo prospetto fiscale (niente metodi di pagamento), funzione nel modulo Vendite.

### Implementazione
- **`app/services/corrispettivi_export.py`** — nuova `build_corrispettivi_pdf(year, month)`: legge la fonte unita (`_merge_shift_and_daily`), costruisce tabella giornaliera (Data, Giorno, Corrispettivo lordo, Imponibile, IVA, Fatture, Totale) con scorporo IVA (`_scorpora_imponibile`, half-up) + riga totali mese + summary box + **riepilogo IVA per aliquota**. Genera PDF col mattone M.B. Helper `_fmt_euro_it` per i numeri in formato italiano.
- **`app/routers/admin_finance.py`** — endpoint `GET /admin/finance/export-corrispettivi-pdf?year=&month=` (404 se il mese è vuoto, 500 su errore di rendering).
- **`frontend/src/pages/admin/CorrispettiviDashboard.jsx`** — bottone "📄 PDF commercialista" nella barra navigazione, solo in modalità mensile; usa `openAuthedInNewTab` (download JWT-protetto).

### Note tecniche
- Sorgente = fonte unita shift+daily (`_merge_shift_and_daily`, stesso pattern di dashboard ed export Excel). I giorni dalle chiusure turno non hanno lo split IVA → trattati come 100% IVA 10% (somministrazione pura, decisione Marco).
- Il PDF dà la sostanza fiscale (lordo + scorporo imponibile/imposta per aliquota), NON riproduce il tracciato XML 7.0 dei corrispettivi telematici (è un formato di trasmissione del RT).
- Classificazione `[core]`: ogni ristorante ha un commercialista; il branding PDF arriva già dalle stringhe locale.
- Verificato in sandbox: PDF di Gennaio/Marzo/Aprile 2026 generati correttamente. Aprile passa da € 0 (bug: leggeva solo `daily_closures`) a € 49.057 lordo / € 44.597,28 imponibile / € 4.459,72 IVA via merge.

### Refactor pianificato (sessione dedicata, deciso 2026-05-21)
Marco ha segnalato che `daily_closures` (import Excel) e `shift_closures` (chiusure turno) sono **due sistemi che si incrociano male**. Direzione concordata: l'import Excel deve scrivere in `shift_closures`, `daily_closures` viene **migrata interamente** (tutti i 6 anni, ~1.400 giornate con dati) e poi dismessa — `roadmap.md` §K.12. In aggiunta (§K.13): import dei file XML dei corrispettivi telematici dal portale AdE come fonte dati in più. Da fare in sessione "refactor" separata, non mescolata al commit del PDF.

### Fix Dashboard Vendite (stessa sessione, segnalati da Marco)
Due bug della Dashboard Vendite corretti insieme al PDF (tutto `[core]`, modulo Vendite):
- **Giorni migliori/peggiori**: `GET /admin/finance/stats/top-days` ordinava per `totale_incassi` (deprecato, spesso 0) e includeva i giorni a zero → liste senza senso. Ora ordina per `corrispettivi_tot` ed esclude i giorni a zero; il frontend usa direttamente `top_best`/`top_worst`.
- **Click sul calendario**: la cella rimandava a `/vendite/chiusure?date=X` ma `ChiusureTurnoLista.jsx` ignorava `?date=`. Ora legge il parametro, si posiziona sul mese giusto, espande il giorno e ci fa scroll.

### Commit suggerito
`./push.sh "[core] PDF corrispettivi commercialista + fix Dashboard Vendite (top-days, click calendario)"`

---

## SESSIONE 2026-05-19 (cont. notte) — riferimento storico

**Audit autonomo Claude Code + riallineamento decisioni PO**. Sessione di sola docs: l'audit autonomo del pomeriggio (committato in `90f1b73` insieme a vini 3.54) ha prodotto 8 file in `docs/audit-2026-05-19/` con verdetto adversarial **87/100**. Marco ha risposto alle 5 decisioni PO. Commit `[mixed]` di docs hardening: rinomina `modulo_selezioni.md` → `modulo_vendite.md`, nuovi stub `modulo_selezioni_giorno.md` (CRIT-2) e `modulo_fatture_in_cloud.md` (CRIT-1, 17 endpoint), disciplina docs in `CLAUDE.md`.

## SESSIONE 2026-05-19 (cont. notte) — Audit autonomo + decisioni PO + docs hardening

### Sintesi
Marco ha caricato in sessione i deliverable di un audit autonomo che ha fatto fare a Claude Code nel pomeriggio (8 file, 2.655 righe, durata dichiarata ~1.5h). L'audit ha prodotto: inventario stack, audit 416 capability su 14 moduli, gap report (5 CRIT + 20 MED + 10 MIN + 5 anomalie strutturali), refactoring plan docs, manuale utente di ~6.000 parole, executive summary. Una sessione adversarial separata (Claude Code) ha dato verdetto **87/100** (≥85 = "audit affidabile, usabile come deliverable"), con riserva su CRIT-3 e CRIT-4 sovrastimati nella priorità.

### Decisioni PO Marco (5 in sospeso, tutte chiuse)
1. **NOMEN-1 — "Selezioni"** → **DISAMBIGUIAMO**. Rinomina `docs/modulo_selezioni.md` → `docs/modulo_vendite.md`. Nuovo stub `docs/modulo_selezioni_giorno.md` per i 5 router `scelta_*` di cucina.
2. **V-H.I cleanup `*_legacy.jsx` vini** → "non prima del 15 giugno" (rimosso vincolo settimanale, niente data limite).
3. **Endpoint `/menu/`** → "nel cassetto, poi lo faremo" — segnato in `inventario_pulizia.md`.
4. **MORT-2 turni vecchio + v2** → "lo vediamo quando sistemiamo meglio il modulo Dipendenti" — segnato in `controllo_design.md`.
5. **Mattone email M.D** → "non prioritario" — segnato in `architettura_mattoni.md`.

### Modifiche docs in questo commit
- `docs/modulo_vendite.md` (nuovo, contiene tutto il contenuto storico di `modulo_selezioni.md` + sezione 0 disambiguazione)
- `docs/modulo_selezioni.md` (svuotato → stub redirect verso `modulo_vendite.md` e `modulo_selezioni_giorno.md`)
- `docs/modulo_selezioni_giorno.md` (nuovo stub: 5 router gemelli, 24 capability, pattern comune)
- `docs/modulo_fatture_in_cloud.md` (nuovo stub: 17 endpoint reali — audit dichiarava 12)
- 5 docs con link interni aggiornati: `modulo_cucina.md`, `modulo_banca.md`, `readme.md`, `database.md` (2 occorrenze)
- `docs/roadmap.md` — nuova sezione "Docs hardening" con i 5 CRIT (CRIT-3 e CRIT-4 declassati a MED) + V-H.I tempistica aggiornata
- `docs/controllo_design.md` — voce MORT-2 turni rinviata
- `docs/inventario_pulizia.md` — voce `/menu/` "nel cassetto"
- `docs/architettura_mattoni.md` — M.D segnato "non prioritario (Marco 2026-05-19)"
- `CLAUDE.md` — nuova sezione "Disciplina docs": ogni nuova capability in un router → riga in tabella Capability del relativo `modulo_*.md`

### Cosa NON è in questo commit (per evitare scope creep)
- Tabella Capability standardizzata in cima a ogni `modulo_*.md` (4-6h, sessione dedicata futura)
- Split `modulo_cucina.md` → `cucina.md` + `task_manager.md` (CRIT-4 declassato, sessione dedicata)
- Estensione `push.sh` con warning router→docs (enhancement L1 guardiano, sessione tecnica separata)
- Verifica spot dei 3 claim del manuale (PIN 60s, JWT 30min, vini esauriti) — sessione dedicata
- Refactor strutturale `docs/{moduli, specs, adr}/` (2 giorni, non urgente)

### Riferimenti chiave
- Cartella audit: `docs/audit-2026-05-19/` (8 file, già committati in `90f1b73`)
- Verdetto adversarial: `docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` (87/100)
- Executive summary: `docs/audit-2026-05-19/05_EXECUTIVE_SUMMARY.md`
- Manuale utente: `docs/audit-2026-05-19/04_MANUALE_UTENTE.md` (~6.000 parole)

### Verifica post-deploy attesa
Nessuna verifica runtime (sessione di sola docs). Da verificare manualmente:
- I link interni nei 5 docs aggiornati puntano correttamente.
- `modulo_vendite.md` è leggibile end-to-end.
- `modulo_selezioni.md` (stub redirect) non lascia broken link.

### Prossimi step suggeriti
- Verifica spot 3 claim manuale prima di darlo allo staff.
- Tabella Capability standardizzata (sessione docs L, distribuita).
- Split `modulo_cucina.md` (sessione docs S).

---

## SESSIONE 2026-05-19 (cont. sera) — CG/Fatture redesign + modello stati 3D

### Sintesi
Sessione parallela alla F11 vini. Apertura: Marco lamenta che il dettaglio fattura ha bottoni e chip stato sparsi e confusi. Identificata la radice del problema: l'enum `cg_uscite.stato` a 8 valori schiaccia 3 dimensioni semantiche ortogonali, e nessuno aveva mai disambiguato. Sistemata la cosa "granitica" sui docs + memoria + codice, poi redesign vero del dettaglio fattura con tab CE dedicato + editor categoria/sottocategoria bidirezionale con vista Fornitori.

### Modello 3D stati pagamento (chiusura semantica)
Aggiunta sezione §15 in `docs/stato_pagamento_unificato.md` come modello canonico:
- **D1 — PAGAMENTO** (business, 3 valori): PAGATA / NON PAGATA / PARZIALMENTE PAGATA
- **D2 — Modificatori tecnici** (CG-only): `*` non riconciliata, `?` da verificare
- **D3 — SCADENZA/TEMPO**: in scadenza / scaduta / rateizzata / spostata

Regole: nel modulo Fatture D1 e D3 vanno SEPARATI (2 chip distinti). Nel modulo CG si possono UNIRE. D3 irrilevante se D1=PAGATA. RATEIZZATA/SPOSTATA sono D3, non D1.

Aggiunto richiamo in `CLAUDE.md` + memoria persistente `feedback_stati_pagamento_3_dimensioni.md`. Commenti allineati in `StatoPagamentoBadge.jsx`, `statoPagamento.js`, `fatture_stato_service.py`.

### Componenti nuovi/aggiornati
- **`StatoScadenzaBadge.jsx` v1.0** (nuovo): badge dedicato a D3 con 4 chip (💤 in_scadenza, ⚠ scaduta, 📆 rateizzata, ↩ spostata). Export `deriveStatoScadenza(uscitaStato, scadenzaISO)` + `giorniLabel(scadenzaISO)`.
- **`StatoPagamentoBadge.jsx` v1.3**: gestisce SOLO D1+D2. RATEIZZATO/SPOSTATO proiettati su `da_pagare` (D1=NON PAGATA).
- **`fatture_stato_service.py` v2.1**: `set_stato()` scrive SOLO D1+D2. Mutazioni D3 passano da endpoint dedicati.

### FattureDettaglio v3.1 — redesign secondo il modello 3D
1. **Header**: 2 chip distinti D1+D3 in cima. Rimossi i 2 bottoni inline "📅 sposta competenza" / "📆 spalma su N mesi" dal sottotitolo (spostati nel tab CE). I 2 chip read-only restano come segnale rapido.
2. **Tab Pagamenti**: riquadro "Stato pagamento attuale" in cima, con chip D1+D2 grande + bottoni di cambio (`Da pagare` / `❓ Da verificare` / `Pagato*`) sotto label "Cambia stato →". Banner verde "🔒 Stato definitivo" se riconciliato. Riquadro nascosto per fatture rateizzate.
3. **Tab "Conto Economico"** (NUOVO, 4° tab): 3 sezioni:
   - **📅 Competenza P&L**: 2 card "Mese singolo" + "Spalmatura" con bottoni di modifica.
   - **🏷 Categoria nel CE**: aggregato read-only + tabella per riga con dropdown editabili (bidirezionale con Fornitori).
   - **📊 Dove appare nel CE**: fetch lazy, mostra importo P&L, mese, categoria, % ricavi, % categoria, link al CE.
4. **Footer ripulito**: rimossa label "STATO:" + i 3 bottoni di cambio (erano fuorvianti). Ora solo "Modifica anagrafica fornitore" + "Chiudi".

### Bidirezionalità categoria fatture ↔ fornitori
La nuova tabella "Modifica per riga" nel tab CE riusa **lo stesso endpoint** di `FattureFornitoriElenco`: `POST /contabilita/fe/categorie/fornitori/prodotti/assegna`. Effetto by design: modificare qui aggiorna anche tutte le righe esistenti con stessa descrizione di quel fornitore + il mapping `fe_prodotto_categoria_map` + la vista Fornitori. Zero rischio di drift fra moduli.

### Endpoint backend
- **NUOVO** `GET /contabilita/fe/fatture/{id}/ce-impatto`: ritorna impatto P&L per il tab CE.
- **ESTESO** `GET /contabilita/fe/fatture/{id}`: response aggiunta `categoria_aggregata[]` + `escluso_acquisti` + righe con `categoria_id/sottocategoria_id/categoria_nome/sottocategoria_nome/categoria_auto`.

### File modificati
**Backend:** `app/routers/fe_import.py` (get_fattura_detail esteso + endpoint ce-impatto), `app/services/fatture_stato_service.py` (v2.1), `frontend/src/pages/admin/FattureElenco.jsx` (guardia cambiaStato ristretta a STATI_MANUALI).

**Frontend:** `frontend/src/components/StatoScadenzaBadge.jsx` (nuovo), `StatoPagamentoBadge.jsx` (v1.3), `utils/statoPagamento.js` (commenti), `pages/admin/FattureDettaglio.jsx` (v3.1 redesign).

**Docs/config:** `docs/stato_pagamento_unificato.md` (§15), `docs/modulo_controllo_gestione.md` (aggiornamento), `CLAUDE.md` (richiamo §3D), `versions.jsx` (3 bump), `VERSION` (5.15→5.16), `docs/sessione.md` (questa entry).

**Memoria persistente:** `feedback_stati_pagamento_3_dimensioni.md`, `feedback_coordinamento_sessioni_parallele.md`.

### Note di coordinamento sessioni parallele
Marco mi ha richiamato a metà sessione: avevo dichiarato che il refactor vini era "Fasi 1-7 chiuse, restano 8/9/10" basandomi sulla memoria del 14 maggio, mentre dal `git log` si vedeva che l'altro agente in parallelo aveva già fatto il cutover (`ba344e2`) + vini 3.46→3.53. Scritta memoria comportamentale: PRIMA di dichiarare stato corrente a Marco, verificare SEMPRE `git log --oneline -15` + `git status --short`. La memoria personale può essere stantia di giorni, il `.guardiano_state.json` è fermo al 28 aprile e non è canale real-time.

### Verifiche post-deploy attese
- Aprire una fattura: header mostra 2 chip distinti D1+D3.
- Tab Pagamenti: riquadro stato pagamento con chip + 3 bottoni cambio.
- Tab Conto Economico: 3 sezioni renderizzate, fetch lazy "Dove appare" funzionante.
- Cambio categoria su una riga del tab CE → in Fornitori la stessa descrizione mostra la categoria aggiornata.
- Fattura PAGATA: tab Pagamenti mostra banner "🔒 Stato definitivo".
- Fattura rateizzata: niente riquadro stato (banner viola "Rateizzata in spesa fissa X" resta).

### Roadmap CG aggiornata (codici brevi C1-C6)
- **C1** (G.3.2) Spalmatura competenza — ✅ FATTO
- **C2** (G.3.4) Vendite per tipo food/beverage — 🟡 in pausa (8 domande pending per Marco sul tracciato iPratico)
- **C3** Ammortamenti — stand-by
- **C4** Food cost vero per categoria — da pianificare
- **C5** Budget vs consuntivo — da pianificare
- **C6** Export PDF CE — bloccato (manca M.B PDF brand)

### Prossima sessione
Marco userà la nuova UI fatture in produzione. Quando vorrà rispondere alle 8 domande iPratico pending, si attacca C2 (vendite per tipo).

---

## SESSIONE 2026-05-19 — F11 Hotfix giornata di test ad osteria chiusa

### Sintesi
Marco apre la Cantina post-cutover S3 e mi segnala bug man mano che li trova. Risolti uno alla volta con piccoli push frequenti (vini 3.47 → 3.53). Tutti i bug derivano da lettori che il sed S3 aveva mancato + banner di transizione che erano rimasti.

### Fix lato backend (sed esteso `vini_magazzino → vini_bottiglie` su altri 5 file)
1. **`vini_cantina_tools_router.py`** (matrice + stampe inventario PDF + locazioni). Senza questo: stampe PDF 500, matrice "non configurata".
2. **`vini_magazzino_db.py`** (modulo core legacy con 133 occorrenze, riusato da molti endpoint). Senza questo: matrice/operazioni varie 500.
3. **`vini_magazzino_router.py`** (`/dashboard`, `/movimenti-globali`). Senza questo: vendite e dashboard vuote.
4. **`vini_xlsx_v2.py`** (import/export Excel).
5. **`vini_settings.py`** (NAZIONE/REGIONE distinct).

### Fix lato frontend
6. **Banner READ-ONLY rimossi** in 4 punti (Cantina classica deprecata):
   - `SchedaVino.jsx` footer (riga 1617)
   - `SchedaVinoV2.jsx` top (riga 31)
   - `CantinaV2.jsx` scheda inline (riga 300)
   - `GestioneVino2.jsx` header (riga 135-138)
7. **`SchedaVinoV2` + `CantinaV2` inline**: `readOnly={true}` → `readOnly={false}` (cantina v2 ora scrivibile).
8. **BulkActionBar Cantina v2**: rimossi bottoni "Modifica" + "Duplica" deprecati (erano disabilitati).
9. **Wizard Step 4**: rimossa 4° LocCard "Locazione 3" (gestita SOLO dalla matrice, come SchedaVino). Le celle matrice ora contano nel totale + nello sblocco "Avanti".
10. **Wizard Step 3**: aggiunto auto-calcolo Prezzo Carta da Listino via `onBlur` (replica MagazzinoViniNuovo legacy, endpoint `/vini/pricing/calcola`).
11. **Bottone "🗑️ Elimina vino"** nella SchedaVino (doppia conferma + cascade movimenti/note/celle). Visibile solo se `!readOnly`. Endpoint backend già esistente `DELETE /vini/magazzino/delete-vino/{id}`.
12. **Bottone "🍷 Vai al madre"** nel footer SchedaVino: prop opzionale `onOpenMadre(mid)` passata da Cantina v2 inline (`handleMadreClick`) e da SchedaVinoV2 route (`navigate('/vini/v2/cantina?vista=madri&openMadre={mid}')`). Effetto auto-apertura nella CantinaV2 via deep-link.
13. **Stale cache fix**: dopo edit in SchedaVino, Cantina v2 ricarica la lista via `onVinoUpdated={fetchData}` (prima un edit del prezzo non si rifletteva nella scheda madre senza Ctrl+Shift+R).

### Versioni post-giornata
- **vini 3.53** (3.47 + 3.48 + 3.49 + 3.50 + 3.51 + 3.52 + 3.53)
- **sistema 5.15** (Marco mi ha ricordato di bumpare anche `VERSION` root)

### Task pending registrati durante la giornata (per future sessioni)
- **Task #2 / V.20** — Import/Export Vini v3 (template strutturato 3 fogli Produttori/Madri/Bottiglie con FK + auto-creazione + diff). Sessione dedicata (~1 intera).
- **Task #3 / V.21** — Bulk delete da BulkActionBar Cantina v2 (XS, backend già pronto).
- **Task #136 / V.22** — Refactor UX Vista Sommelier (CartaStaff) — mobile-first per servizio in sala.

### Decisioni operative confermate durante la giornata
- **Cancellazione vino**: bottone scheda con doppia conferma + cascade DB. Bulk delete rimandato.
- **Carico senza locazione**: convenzione "📦 DA POSIZIONARE" come voce in Locazione 1 dei settings (no schema change). Marco l'aggiunge manualmente.
- **Template import/export Excel**: resta v2 "piatto" per ora, refactor v3 a 3 fogli rimandato a sessione dedicata.

### Verifiche post-deploy
- ✓ DB rinominato correttamente: 14 tabelle finali, conteggi corretti (1287 bottiglie, 995 madre, 350 produttori, 40 fornitori, 1637 denominazioni, 68 vitigni, archivio legacy 1287).
- ✓ Backup automatico mig 133 esistente: `vini_magazzino.sqlite3.pre-cutover-20260518-231936` (2.2M).
- ✓ Cantina, schede bottiglia/madre, wizard, carta PDF cliente, iPratico, vendite, stampe PDF inventario, matrice — tutti operativi.

### Aggiornamenti docs (oggi)
- `docs/roadmap.md` §V: V.6+V.7+V.8 marcati CHIUSI con sotto-tabella Fasi 1-10. Aggiunte V.20/V.21/V.22 da rivedere.
- `docs/modulo_vini.md`: nuova sezione "📌 STATO POST-CUTOVER (2026-05-19)" all'inizio (~200 righe) con: schema DB, relazioni, concetti semantici critici, UI post-cutover, wizard, endpoint principali. Header bumpato a 3.53. Sezioni storiche legacy mantenute per riferimento.
- `docs/sessione.md`: questa entry.
- Memoria interna: `project_refactor_anagrafiche_vini.md` aggiornata da "fasi 1-7 chiuse" a "CHIUSO 2026-05-19".

### Prossima sessione
Marco domani inserisce vini reali nell'osteria. Se emergono altri bug li fixiamo. Altrimenti si riapre la roadmap V.1/V.2/V.3 (priorità top: DISCONTINUATO UI + alert sottoscorta + storico prezzi grafico) o si attacca uno dei nuovi V.20/V.21/V.22.

---

## SESSIONE 2026-05-18 (parte 4) — CUTOVER: S1+S2+S3 in giornata

### Sintesi
Marco vuole chiudere il refactor anagrafiche oggi in 3 sessioni: wizard scritto + Cantina classica spenta + rename atomico. Domani osteria chiusa → giornata di test e fix se serve. Backup automatico nella mig 133 + raccomandazione backup VPS manuale prima del push.

### S1 — Attivazione wizard
- Backend `POST /vini/anagrafiche/bottiglia/` con schema `BottigliaCreate` (~30 campi annata) + `create_bottiglia()` nel model + sync cascade automatico al madre.
- Frontend `submitWizard()` in `NuovoVinoV2.jsx`: orchestra 4-5 POST sequenziali (produttore se _new → madre se _new → bottiglia → loop celle matrice).
- `PreviewModal` evoluto da "preview senza scrittura" a "Riepilogo prima della creazione" con bottone "✓ Conferma e crea". Schermata successo post-submit con ID generati + opzione "+ Nuovo vino".

### S2 — Spegnimento Cantina classica
- `vini_repository.py` (carta/calici/storico) + `ipratico_products_router.py` (sync) refactorati per leggere `vini_bottiglie_v2`. Sed mirato preservando i path file SQLite.
- `App.jsx`: 6 route `/vini/magazzino/*` ora redirect a `/vini/v2/*`. Helper `RedirectMagazzinoToV2` preserva `:id` nelle scheda dettaglio.
- `ViniNav.jsx` v3.0: tab "Cantina" punta direttamente a v2. Tab "Cantina 2" rimosso (era ridondante).
- **9 file FE rinominati `_legacy.jsx`** (MagazzinoVini, MagazzinoViniNuovo, MagazzinoViniDettaglio, MagazzinoAdmin, RegistroMovimenti, CantinaTools, MovimentiCantina, MagazzinoSubMenu, ViniDatabase). I file restano nel repo come archivio.

### S3 — Cutover atomico
- **Mig 133** `app/migrations/133_cutover_rename_tabelle_v2.py`: backup file `.pre-cutover-YYYYMMDD-HHMMSS` prima del rename + transazione atomica BEGIN/COMMIT con 7 ALTER (1 legacy → _legacy_YYYYMMDD + 6 _v2 → senza suffisso). Idempotente: skip se cutover già applicato. ABORT pulito se 6 `_v2` mancanti o nome destinazione già esistente.
- **Sed `_v2 → ""` nei 7 file backend runtime**: `vini_anagrafiche_db.py` (dict TABELLE), `vini_anagrafiche_sync.py`, `vini_anagrafiche_migrate.py`, `vini_anagrafiche_router.py` (schemi + commenti runtime), `vini_v2_router.py`, `vini_repository.py`, `ipratico_products_router.py`. Migrations 125-131 INTOCCATE (storia).
- **Tabelle satellite restano col nome attuale**: `vini_magazzino_movimenti`, `vini_magazzino_note`, `matrice_celle`. Refactor separato eventuale post-cutover.

### Verifiche
- `py_compile` OK su tutti i 7 file refactorati + mig 133.
- `esbuild` OK su App.jsx + ViniNav.jsx + NuovoVinoV2.jsx + tutti i pages/vini/v2/*.
- **Smoke test sandbox mig 133**: prima run = 1 backup + 7 rename atomici + 14 tabelle finali con conteggi corretti (995 madre, 1287 bottiglie, 350 produttori, 40 fornitori, 1637 denominazioni, 68 vitigni). Seconda run = skip idempotente.

### Bump versione
- vini 3.43 → 3.44 (S1) → 3.45 (S2) → **3.46 (S3)**.

### File toccati (commit pendente — TRE COMMIT consecutivi)

**S1 — Attivazione wizard (`vini 3.44`)**:
- Backend nuovo: nessuno
- Backend modificato: `app/models/vini_anagrafiche_db.py` (+create_bottiglia, +get_bottiglia, +BOTTIGLIA_FIELDS, +_now_iso), `app/routers/vini_anagrafiche_router.py` (+BottigliaCreate, +POST /bottiglia/)
- Frontend modificato: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx` (+submitWizard, +stato saving/result/error, +parseNum helper, PreviewModal con onConfirm/saving/result)
- Versioni: `frontend/src/config/versions.jsx`

**S2 — Spegnimento Cantina classica (`vini 3.45`)**:
- Backend modificato: `app/repositories/vini_repository.py` (4 SELECT), `app/routers/ipratico_products_router.py` (5 SELECT)
- Frontend modificato: `frontend/src/App.jsx` (route redirect, helper RedirectMagazzinoToV2, import lazy rimossi), `frontend/src/pages/vini/ViniNav.jsx` v3.0
- Frontend rinominati: 9 file `*_legacy.jsx` (MagazzinoVini, MagazzinoViniNuovo, MagazzinoViniDettaglio, MagazzinoAdmin, RegistroMovimenti, CantinaTools, MovimentiCantina, MagazzinoSubMenu, ViniDatabase)
- Versioni: `frontend/src/config/versions.jsx`

**S3 — Cutover atomico (`vini 3.46`)**:
- Backend nuovo: `app/migrations/133_cutover_rename_tabelle_v2.py`
- Backend modificato (sed `_v2 → ""`): `app/models/vini_anagrafiche_db.py`, `app/services/vini_anagrafiche_sync.py`, `app/services/vini_anagrafiche_migrate.py`, `app/routers/vini_anagrafiche_router.py`, `app/routers/vini_v2_router.py`, `app/repositories/vini_repository.py`, `app/routers/ipratico_products_router.py`
- Versioni: `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggeriti (3 push consecutivi)
```
./push.sh "[core] vini 3.44 — S1 wizard attivato (POST bottiglia + submitWizard FE) → la cantina ora scrive sulle _v2"
./push.sh "[core] vini 3.45 — S2 Cantina classica spenta (route redirect + 9 file _legacy + vini_repository/ipratico leggono _v2)"
./push.sh "[core] vini 3.46 — S3 CUTOVER ATOMICO (mig 133 backup + rename _v2→\"\" + sed 7 file backend)"
```

### ⚠️ Procedura backup PRIMA del push S3
Sul VPS, prima di lanciare `./push.sh` per S3:
```bash
ssh trgb
cd /home/marco/trgb/trgb
zip -r /home/marco/backups_cutover_$(date +%Y%m%d-%H%M%S).zip locali/tregobbi/data/
```
Doppio livello di sicurezza: backup VPS manuale + backup automatico mig 133.

### Smoke test post-deploy S3
1. Aprire Cantina → vedere 1287 bottiglie + nomi madre coerenti.
2. Aprire una scheda bottiglia → tab Anagrafica/Prezzi/Movimenti/Stats funzionano.
3. Creare un vino nuovo dal wizard → toast successo + bottiglia visibile in cantina.
4. Aprire carta cliente PDF → 1287 vini stampati correttamente.
5. iPratico sync (`/ipratico/products/missing` o `/match`) → risponde.

### Rollback in caso di problema
- Restore del file `app/data/vini_magazzino.sqlite3.pre-cutover-YYYYMMDD-HHMMSS` → stato pre-cutover ripristinato.
- Git revert dei 3 commit (S1+S2+S3).

---

## SESSIONE 2026-05-18 (parte 3) — M2.9-ter: matrice scaffali anche in creazione

## SESSIONE 2026-05-18 (parte 3) — M2.9-ter: matrice scaffali anche in creazione

### Sintesi
Marco voleva poter scegliere già in creazione la posizione fisica delle bottiglie sugli scaffali (cella riga × colonna della matrice), invece di rimandarla alla scheda → tab Giacenze post-creazione. Decisione operativa: se l'utente lo sa, deve poterlo mettere — la tabella è la stessa.

**Regola che mi sono preso (e memorizzato)**: prima di scrivere un componente nuovo, grep nel repo per pattern simili. Riusare `MatricePicker.jsx` esistente con un'estensione retrocompatibile, niente fork. Marco: *"non farei cose diverse, usa stesso codice, smetti di riscrivere"*.

### Fatto `[core]`
- **`MatricePicker.jsx`** estensione minima: 2 prop opzionali `pendingCells` + `onPendingChange`. Quando passate (con `vinoId=null`), entra in modalità "draft": click pre-seleziona celle nella lista controllata invece di POST API. Comportamento storico invariato per SchedaVino. ~25 righe aggiunte, render esistente riusato.
- **Wizard Step 4** — sezione "🗄️ Posizione scaffali (opzionale)" che monta `<MatricePicker vinoId={null} pendingCells={annata.MATRICE_CELLE} onPendingChange={...} />`. L'utente vede l'occupazione e pre-seleziona. Rimosso il banner-testo che diceva "si farà dopo".
- **`PreviewModal`** — riga "🗄️ Posizione scaffali" con le celle pre-selezionate formato `(col,riga)`.
- **emptyAnnata()** — campo `MATRICE_CELLE: []` di default.

### Decisione di design
- La matrice è M:N condivisa: non importa quando l'utente la compila, il dato finale è lo stesso. Non c'è motivo di forzare un solo punto.
- Modalità draft = niente scrittura DB nel wizard (è ancora preview-only). Al cutover scrittura, le celle preselezionate vanno chiamate via `matrice_assegna_cella` per ognuna.

### Verifiche
- `esbuild` OK su MatricePicker (8.1 KB) + NuovoVinoV2 (67.8 KB).
- Render Step 4: griglia compatta, click su cella libera la colora con tag amber, click rimuove. Celle occupate da altri vini bloccate (con tooltip vino occupante).

### Bump versione
- vini 3.42 → **3.43**.

### File toccati (commit pendente)
- Frontend modificato: `frontend/src/pages/vini/MatricePicker.jsx` (estensione draft), `frontend/src/pages/vini/v2/NuovoVinoV2.jsx` (Step 4 + PreviewModal + emptyAnnata), `frontend/src/config/versions.jsx`.
- Docs: `docs/sessione.md`, `docs/changelog.md`.
- Memoria: `feedback_riusa_non_riscrivere.md` (nuova regola operativa per me).

### Commit suggerito
```
./push.sh "[core] vini 3.43 — M2.9-ter posizione scaffali matrice anche in creazione (riuso MatricePicker con modalità draft)"
```

---

## SESSIONE 2026-05-18 (parte 2) — M2.9-bis: vitigni strutturati sul madre (mig 131)

## SESSIONE 2026-05-18 (parte 2) — M2.9-bis: vitigni strutturati sul madre (mig 131)

### Sintesi
Esteso M2.9-bis con persistenza strutturata dei vitigni "tipici" sul madre (Marco: "ho 10 campi vitigni nella tabella bottiglie, perché sul madre li hai solo stringa?"). Decisione: i 5+5 slot sul madre = blend tipico di riferimento, quelli sulla bottiglia = blend effettivo per annata, NON si sincronizzano. UI dinamica unificata tra wizard e anagrafiche: autocomplete + righe `[nome][% input][×]`, max 5, zero campi vuoti pre-allocati.

### Fatto `[core]`
- **Mig 131** — `app/migrations/131_madre_vitigni_strutturati.py`: ADD COLUMN x10 su vini_madre_v2 (`vitigno_1_id..vitigno_5_id` INTEGER + `vitigno_1_pct..vitigno_5_pct` REAL). Backfill: copia dalla bottiglia più recente di ogni madre (ANNATA DESC, id DESC). Idempotente. Smoke test sandbox: 32/995 popolati (gli altri 963 hanno bottiglie senza vitigni strutturati, lascia NULL).
- **Backend model** `app/models/vini_anagrafiche_db.py`: `MADRE_FIELDS` esteso con 10 nuovi campi. `get_madre()` decora con `vitigni_list: [{vitigno_id, vitigno_label, pct}]` via JOIN. `promote_madre_a_composto` accetta `vitigni: List[{vitigno_id, pct}]` (preferita) — risolve nomi via JOIN, scrive i 5 slot, ricostruisce la stringa per la composizione descrizione.
- **Backend router** `app/routers/vini_anagrafiche_router.py`: `VitignoSlot` schema + `MadrePromotePayload.vitigni`. `MadreBase`/`MadreUpdate` estesi con i 10 campi (PATCH `/madre/{id}` accetta direttamente i vitigni strutturati).
- **FE wizard `NuovoVinoV2.jsx`**: `PromuoviMadreModal` inizializza la lista vitigni dai dati del madre (madre.vitigni_list), submit manda `vitigni: [...]` strutturata.
- **FE anagrafiche `AnagraficheVini.jsx`**: import `vitigniToString`. `MadreEditModal` con sezione "🍇 Vitigni tipici (max 5)" — caricamento via GET `/madre/{id}`, autocomplete + righe compatte, save esplode in `vitigno_1_id..pct` con null espliciti sui rimossi. Preview descrizione composta ora include i vitigni come 4° ingrediente. `isCompostaMode` true anche se l'utente ha solo aggiunto vitigni (senza nome_etichetta/grado).

### Decisione di design
- **Vitigni madre = tipici / riferimento.** Vitigni bottiglia = effettivi per annata. Possono divergere senza sync — sono semantiche diverse.
- **UI dinamica, zero campi vuoti**: pattern unificato tra wizard e anagrafiche.

### Verifiche
- `py_compile` OK su mig 131 + model + router.
- `esbuild` OK su NuovoVinoV2 (66.9 KB) + AnagraficheVini (75.6 KB).
- Mig 131 in sandbox: prima run aggiunge 10 colonne + backfilla 32 madri, seconda run skippa entrambe le operazioni (idempotente).

### Bump versione
- vini 3.40 → 3.41.

### File toccati (commit pendente)
- Backend nuovo: `app/migrations/131_madre_vitigni_strutturati.py`
- Backend modificato: `app/models/vini_anagrafiche_db.py`, `app/routers/vini_anagrafiche_router.py`
- Frontend modificato: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggerito
```
./push.sh "[core] vini 3.41 — M2.9-bis vitigni strutturati sul madre (mig 131 + 5 slot + UI dinamica anagrafiche/wizard)"
```

---

## SESSIONE 2026-05-18 — M2.9-bis Promozione madri legacy → descrizione composta

### Sintesi
Chiusura del modello "descrizione composta" iniziato in M2.9. I 1287 madri legacy (descrizione testuale libera) ora possono essere promossi uno a uno al modello composto (descrizione_auto=1, ricomposta dai 4 ingredienti: denominazione + nome_etichetta + vitigni + grado). Triggers di promozione: bottone in wizard Step 3 quando si crea un'annata su madre legacy; oppure modifica diretta del madre in Anagrafiche se vengono valorizzati gli ingredienti. Badge 📜 OLD sui legacy (no badge sui composti = standard, scelta UX di Marco: "il nuovo è lo standard, l'OLD è l'eccezione").

### Fatto `[core]`
- **Backend model** — `app/models/vini_anagrafiche_db.py`: nuova funzione `promote_madre_a_composto(mid, denominazione_id, nome_etichetta, grado_alcolico_tipico, vitigni_stringa)` che aggiorna i 4 ingredienti, ricompone descrizione via `componi_descrizione` e setta `descrizione_auto=1`. Idempotente. Raise ValueError se la composizione sarebbe vuota. `MADRE_FIELDS` esteso con `nome_etichetta` + `descrizione_auto`.
- **Backend router** — `app/routers/vini_anagrafiche_router.py`: nuovo endpoint admin `POST /vini/anagrafiche/madre/{mid}/promote-composto`. Payload `MadrePromotePayload` con i 4 ingredienti opzionali. Verifica FK denominazione, chiama model, cascade sync su bottiglie. `MadreBase`/`MadreUpdate` estesi con `nome_etichetta` + `descrizione_auto`.
- **Frontend wizard `NuovoVinoV2.jsx`**:
  - Step 2 — badge 📜 OLD inline sui madri legacy nella lista (descrizione_auto=0). Anche sulla card "vino madre selezionato" sotto.
  - Step 3 — banner warning grosso con bottone "🔧 Sistema il madre" quando si lavora su un madre legacy. Non bloccante: si può proseguire senza promuovere.
  - Nuovo componente `PromuoviMadreModal` con form 4 ingredienti (autocomplete denominazioni + nome_etichetta + lista vitigni con %, fino a 5 + grado), preview live "Nuova descrizione" (helper JS `componiDescrizione` gemello del backend), descrizione attuale legacy mostrata read-only in alto. Submit → POST endpoint backend.
- **Frontend anagrafiche `AnagraficheVini.jsx`**:
  - `MadrePanel` (lista madri): badge 📜 OLD inline accanto alla descrizione. Filtro "📜 Solo legacy" per scoprire tutti i madri da promuovere.
  - `MadreEditModal`: campo `nome_etichetta` aggiunto. Badge 📜 OLD / ✓ COMPOSTA in header. Preview "Descrizione composta (anteprima)" live se attivata la modalità composta (denominazione + nome_etichetta o grado). Campo descrizione testuale si auto-disabilita in modalità composta. Al save, se modalità composta, descrizione viene ricomposta e `descrizione_auto=1` settato.

### Decisioni di design
- **Default = "nuovo standard"**: la convenzione è che i madri nuovi (creati via wizard) e quelli promossi hanno `descrizione_auto=1` = no badge. Il badge 📜 OLD esiste solo sui legacy `descrizione_auto=0` per ricordare che vanno "sistemati". Marco: "sulle new non mettere un bollino, dovrebbe essere lo standard, piuttosto mettile su tutte le attuali che partono come OLD". Convenzione coerente: il nuovo è lo standard, l'eccezione è l'OLD.
- **Promozione non bloccante**: il wizard mostra il banner ma permette comunque di creare l'annata su un madre legacy. Marco: "se non viene usato va bene lo stesso perché il sistema li leggerà sulla stampa PDF e sulla carta html comunque corretti". La descrizione testuale legacy continua a funzionare ovunque.
- **Promozione progressiva**: i 1287 madri legacy si sistemano man mano che l'utente li tocca, senza job batch. Migrazione organica.

### Versione
- frontend `versions.jsx`: vini 3.39 → 3.40 (stabile, color green)
- VERSION root: invariato (modulo vini bump indipendente)

### Verifiche
- `py_compile` OK su router + model + service descrizione
- esbuild OK su NuovoVinoV2.jsx (66 KB) + AnagraficheVini.jsx (70 KB) — JSX/import puliti
- Smoke flow logico: wizard Step 3 su madre legacy → modal con preview live, save → POST endpoint → cascade sync su bottiglie → madre re-fetched in parent con descrizione_auto=1 → banner sparisce.

### Prossima sessione possibile
- Push M2.9-bis + verifica live con click manuale su un madre legacy reale (es. quello "Langhe DOC Rossj-Bass" citato come riferimento)
- Eventuale promozione massiva semi-automatica per madri dove la regex riesce a separare denominazione + nome etichetta + vitigni dalla descrizione testuale (sondaggio: quanti dei 1287 si auto-promuoverebbero in modo affidabile?)
- M2.10 — riepilogo finale architettura Cantina 2 prima di considerarla "pronta per cutover" parallelo a Cantina 1

### File toccati (commit pendente)
- Backend: `app/routers/vini_anagrafiche_router.py`, `app/models/vini_anagrafiche_db.py`
- Frontend: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggerito
```
./push.sh "[core] vini 3.40 — M2.9-bis Promozione madri legacy → descrizione composta (backend promote endpoint + modal wizard + badge OLD)"
```

---

## SESSIONE 2026-05-16 — G.3 Fase E parte 1/2: schema DB + parser PDF (storico)

**Header originale (pre-M2.9-bis):** G.3 Fase E parte 1/2: schema DB costo personale (mig 132 — `dipendenti_costo_consuntivo` + `f24_versamenti`) + parser ELAB pdf + parser F24 pdf — testati su PDF reali Aprile 2026 con saldi al centesimo. + G.3 Fase D Conto Economico fix cascata (drill-down righe + % sui ricavi + RATEIZZAZIONE_TASSE + aggregazione per RIGA con fallback). + lato Vini: M2.4-5 prezzo_unitario snapshot + M2.5-arch nav refactor + SchedaMadreV2 full-frame + M2.5.1 Produttori + M2.5.2 Distributori/Denominazioni. Versione modulo vini 3.28 → 3.30.

## SESSIONE 2026-05-16 — G.3 Fase E parte 1/2: schema DB + parser PDF

### Sintesi
Marco ha fornito 3 PDF mensili campione del consulente paghe (LUL già importato, ELAB e F24 nuovi). Confermato: solo il netto bonificato in `cg_uscite` non basta — il costo aziendale vero (lordo + carico ditta INPS + ratei 13ª/14ª/ferie + TFR + INAIL) sta nell'ELAB pagina 8 "COSTO CONSUNTIVO". Per Aprile 2026: netto bonificato € 12.140 vs costo vero € 20.489 → utile sovrastimato di € 8.349/mese.

Sessione dedicata a porre le fondamenta: schema DB + parser PDF. Niente UI / niente refactor del service CE: rimandati a sessione successiva. Tutto a basso impatto sul sistema in produzione (tabelle nuove vuote, parser non chiamati da nessun endpoint).

### Fatto
- **Mig 132** `[core]` — `app/migrations/132_g3_fase_e_costo_personale.py`. Crea tabella `dipendenti_costo_consuntivo` in dipendenti.sqlite3 (21 colonne) e `f24_versamenti` in foodcost.db (25 colonne). UNIQUE su (anno, mese, dipendente) e (anno, mese, matricola) per anti-doppio. 5 indici sul costo, 6 sul F24 (compresi raggruppamento, banca_movimento_id, hash). Pattern cross-DB via PRAGMA database_list (riusato dalla mig 060). Idempotente.
- **Parser ELAB** `[core]` — `app/services/elab_parser.py`. Estrae:
  - meta: anno/mese (da titolo "DAL MESE DI X Y"), azienda (codice + ragione sociale), sha256 del PDF
  - 10 dipendenti con dettaglio costo (matricola, nome, ore, lordo, contributi, straord, ratei, TFR, totale)
  - riga "T O T A L I AZIENDA" come totale aggregato
  - INAIL del mese (pagina 2 sezione POSIZIONE INAIL → tot 92,14€ Aprile)
  - lista warnings su righe parziali/totali mancanti
  Test 3GOBBI_ELAB_4.pdf: 10 dipendenti + totale azienda € 20.488,88 = somma costo dipendenti, ZERO discrepanza.
- **Parser F24** `[core]` — `app/services/f24_parser.py`. Multi-pagina (ogni pagina = una delega F24 separata). Riconosce 5 sezioni (Erario / INPS / Regioni / IMU+Tributi Locali / INAIL) tramite regex specifiche. Codici tributo mappati con descrizione human-readable. Formato importi Entratel "compresso" (rimuovi punti, dividi per 100). `CODICI_CREDITO` whitelist (1704, 6781) per riconoscere compensazioni come crediti anche senza segno "-" esplicito. Test 3GOBBI_F24_4.pdf: 3 deleghe, saldi 90,00 / 5.483,90 / 0,00 = saldi PDF attesi al centesimo.

### Decisioni di design
- **Tabella `dipendenti_costo_consuntivo` in dipendenti.sqlite3** (non in foodcost.db). Coerente con disciplina modulare (CLAUDE.md): prefisso `dipendenti_*`. Il CE leggerà via apertura connection separata (pattern già esistente per vendite_conn).
- **Tabella `f24_versamenti` in foodcost.db**. Cross-modulo: collegata a CE (cassa) e banca_movimenti (riconciliazione). Non solo dipendenti.
- **Anti-doppio import** via campo `fonte_hash` (sha256 del PDF) — se stesso file ricaricato, l'import lato app skip-pa.
- **Match dipendente_id best-effort**: la tabella ha sia `matricola` (chiave certa) sia `dipendente_id` (FK soft, NULL ammesso). L'import del PDF associa matricola → dipendente_id via lookup nome.
- **Whitelist codici credito F24**: codici 1704 e 6781 sono SEMPRE crediti (compensazioni). Altri codici Erario (1001, 1040, 1075) sono SEMPRE debiti. Eventuali futuri segni espliciti "-" continuano a essere riconosciuti.

### Verifiche
- py_compile pulito su mig 132, elab_parser, f24_parser.
- Mig 132 testata in sandbox `/tmp/mig132_test/`: tabelle create con 21 + 25 colonne, 5 + 6 indici. Re-run senza errori (CREATE IF NOT EXISTS).
- Parser ELAB Aprile 2026: 10 dipendenti, INAIL 92,14€, totale azienda 20.488,88€. Somma dei `costo_totale` per dipendente coincide con `totale_azienda` al centesimo.
- Parser F24 Aprile 2026: 3 deleghe con saldi 90,00 + 5.483,90 + 0,00. Compensazioni 6781 (375,86€ credito) e 1704 (1.237,42€ credito su 4 mesi) riconosciute. 16 righe estratte totali (Erario + INPS + Regioni + 4 comuni + INAIL).

### File toccati (commit pendente)
- Backend nuovo: `app/migrations/132_g3_fase_e_costo_personale.py`, `app/services/elab_parser.py`, `app/services/f24_parser.py`
- Docs: `docs/changelog.md`, `docs/sessione.md`, `docs/roadmap.md` (già aggiornata in commit precedente)

### Prossima sessione (G.3 Fase E parte 2/2)
- E.4: UI Dipendenti "Carica buste paga del mese" — dropzone per i 3 file LUL+ELAB+F24
- E.5: refactor `_aggregate_stipendi` in `conto_economico.py` (legge da `dipendenti_costo_consuntivo` se mese presente, fallback netti)
- E.6: nuovo tipo `F24_STIPENDI` in `cg_spese_fisse` (anti-doppio competenza vs cassa)
- E.7: mig 133 retro import gen-apr 2026 dagli 8 PDF archiviati (4 ELAB + 4 F24)
- E.8: tab "Costi mensili" in Dipendenti — vista per consultare costo aziendale per mese
- E.9: rimozione warning banner CE "costo personale parziale" — solo dopo verifica Marco

---

## SESSIONE 2026-05-16 — G.3 Conto Economico Fase D (cascata fix) + bug aggregazione

### Sintesi
Chiusa Fase D di G.3 con verifica sui dati reali di Aprile 2026. Trovati e fixati 4 bug a cascata. Aggregazione del CE per categoria reimplementata sul livello RIGA (era a livello fornitore, perdeva categorizzazioni granulari come A2A). Aggiunto drill-down 3 livelli + percentuali sui ricavi (convenzione ristorazione). Programmata Fase E (costo personale completo via import ELAB+F24).

### Fatto (in più commit aggregati lungo la sessione)
- **Bug 1 — Load failed CE**: `f.escluso_acquisti` → `ffc.escluso_acquisti` in `conto_economico.py` (regola CLAUDE.md: escluso_acquisti vive su `fe_fornitore_categoria`).
- **Bug 2 — Stipendi invisibili**: `app/routers/dipendenti.py:1478` salvava `periodo_riferimento` come "Aprile 2026" testuale. Fix: `f"{anno}-{int(mese):02d}"`. Mig 130 normalizza retroattivamente 35 record storici.
- **Bug 3 — Rateizzazioni pregresse**: nuovo tipo `RATEIZZAZIONE_TASSE` su `cg_spese_fisse`, distinto da `TASSA` (correnti) e `RATEIZZAZIONE` (rate generiche). Mig 131 riclassifica id=22,23 (Abaco, Fondo Est). Escluso in competenza, incluso in cassa.
- **Bug 4 — Aggregazione per fornitore vs per riga**: il CE raggruppava solo per `fe_fornitore_categoria.categoria_id`, perdendo i fornitori con righe categorizzate ma senza categoria a livello fornitore (es. A2A: 62 righe UTENZE 100% ma `categoria_id=NULL` perché escluso da ricette). Fix: aggregazione per `fe_righe.categoria_id` con fallback gerarchico (1. riga → 2. fornitore → 3. "Non categorizzato"). Per Aprile: "Non categorizzato" passa da € 6.677 a € 3.269 (-51%), UTENZE da € 70 a € 3.160.
- **Drill-down 3 livelli**: il CE ora espande categoria → sottocategoria → righe singole. Click su una riga apre `/acquisti/dettaglio/:id` (fattura), `/controllo-gestione/spese-fisse?highlight=:id` (spesa fissa) o `/dipendenti/buste-paga` (stipendio).
- **Percentuali sui ricavi**: sostituito `pct_su_spese` con `pct_su_ricavi` (convenzione ristorazione: food cost % = costo merce / ricavi). Barra orizzontale "Ripartizione dei ricavi" a 3 fette. Gestione caso perdita.
- **Warning banner CE**: "Costo personale parziale — STAFF mostra solo netti bonificati. Mancano carico ditta + ratei + TFR + INAIL. Per Aprile 2026 il costo reale è ~€ 20.500 vs € 12.140 attualmente conteggiati → utile sovrastimato di ~€ 8.000/mese". Da rimuovere a chiusura Fase E.
- **Roadmap G.3 Fase E**: sezione dedicata in `docs/roadmap.md` con piano completo (mig 132 nuove tabelle, parser PDF ELAB + F24, UI upload, refactor `_aggregate_stipendi`, anti-doppio F24_STIPENDI, mig 133 retro gen-apr 2026).

### Decisioni (Marco 2026-05-16)
- **Food cost % calcolato sui RICAVI, non sul totale spese**. Convenzione universale ristorazione. Per Aprile: food cost 26,4%, costi op 59,8%, utile 13,9% (somma 100%).
- **F24 stipendi: importeremo anche il PDF** per riconciliazione cassa + validazione cross-check + sblocco modalità Cassa del CE.
- **Storico Fase E**: solo 2026 (gen-apr). Anni precedenti li abbiamo ma non ci interessano.
- **F24 mai inseriti in cg_spese_fisse**: nessun rischio doppio conteggio.

### Numeri reali di Aprile 2026 (post-fix, pre-Fase E)
- Ricavi:           € 49.057
- Costo merce:      € 12.936 (26,4%)
- Margine lordo:    € 36.121 (73,6%)
- Costi op:         € 29.324 (59,8%) — di cui STAFF solo netti
- Utile netto:      € 6.797 (13,9%) ⚠ sovrastimato di ~€ 8.000/mese (Fase E lo correggerà)
- "Non categorizzato" Aprile: € 3.985 (era € 7.393 prima del fix per riga)

### Verifiche
- py_compile pulito su conto_economico, controllo_gestione_router, mig 129/130/131.
- JSX braces bilanciate su ControlloGestioneContoEconomico.jsx (664 lines, 295 `{` = 295 `}`).
- Conservazione importi: per ognuna delle 52 fatture di Aprile, somma degli split del CE == imponibile DB (3 fatture con scarto 0,08-0,18€ da arrotondamento XML SDI, totale 0,13€ su 23.349€).
- Test sample fattura Sogegross 6934 (475€) spezzata correttamente: 95,24 MATERIE PRIME + 222,70 BEVANDE + 157,24 Non categorizzato.

### File toccati (sessione completa, multi-push)
- Backend: `app/services/conto_economico.py`, `app/routers/controllo_gestione_router.py`, `app/routers/dipendenti.py`, `app/services/auth_service.py` (PIN random — sicurezza)
- Migration: `app/migrations/129_conto_economico_fase_a.py` (mapping aggiornato), `app/migrations/130_normalizza_periodo_riferimento_stipendi.py` (nuovo), `app/migrations/131_riclassifica_tasse_arretrate.py` (nuovo)
- Frontend: `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx` (v1.1: drill-down, % ricavi, deep-link, warning banner), `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx`, `frontend/src/pages/banca/BancaCrossRef.jsx`
- Docs: `docs/roadmap.md` (sezione G.3 Fase E)

### Prossimo
- **G.3 Fase E — Costo personale completo** (sessione dedicata): parser ELAB+F24, nuove tabelle DB, UI upload, refactor `_aggregate_stipendi`, mig retro gen-apr 2026.

---

## SESSIONE 2026-05-16 — M2.4-5 prezzo_unitario + M2.5-arch nav refactor

### Sintesi
Due cambi atomici, stessa sessione.

**M2.4-5 — prezzo_unitario snapshot:** finora `vini_magazzino_movimenti` salvava solo qta+tipo, il ricavo era una stima (qta × prezzo carta attuale, impreciso se il prezzo è cambiato). Da oggi snapshot del prezzo per ogni movimento → ricavo reale, costo acquisto storico, margine effettivo, ricarico %.

**M2.5-arch — ristrutturazione nav Vini:** Marco ha proposto di rinominare "Gestione 2" in "Cantina 2" (è una cantina alternativa, non un modulo generico) e di liberare lo spazio per un nuovo tab dedicato alle entità master (produttori, distributori, denominazioni, vitigni, vini madre), oggi sepolto sotto Impostazioni → "🧪 Anagrafiche (beta)". Promosso a tab di primo livello "📚 Anagrafiche".

### Decisioni M2.5-arch
- **Nome del nuovo tab**: "Anagrafiche" (non "Gestione"). Coerente con backend `/vini/anagrafiche/*`, file `AnagraficheVini.jsx`, modulo `vini_anagrafiche_db.py`, docs `refactor_anagrafiche_vini.md`. Termine standard nel mondo gestionali italiani.
- **Destino del pannello beta**: rimosso da Impostazioni Vini (non sono impostazioni vere e proprie). Vive solo nella nuova tab.
- **Cantina 2**: rinomina solo della label UI ("Gestione 2" → "Cantina 2") e dell'header interno di GestioneVino2.jsx. Path `/vini/v2` e nome file invariati (no rotture su link/routing).
- **Sub-rename UI "Fornitori" → "Distributori"**: vocabolario di osteria. La tabella DB resta `vini_fornitori_v2` (mappa 1:1, no rinomina backend).
- **Approccio operativo**: M2.5-arch fa solo l'ossatura (rename + promozione + spostamento). Le sessioni successive (M2.5.1 Produttori, M2.5.2 Distributori, M2.5.3 Denominazioni, M2.5.4 Vitigni) rilavorano una sotto-tab alla volta.

### Fatto M2.4-5 (prezzo_unitario)
- `app/migrations/129_movimenti_prezzo_unitario.py`: ADD COLUMN `prezzo_unitario REAL` + backfill best-effort (VENDITA→PREZZO_CARTA, CARICO→EURO_LISTINO). Idempotente.
- `app/models/vini_magazzino_db.py`: `registra_movimento()` accetta `prezzo_unitario` con autopop server-side (None → SELECT del prezzo carta/listino).
- `app/routers/vini_magazzino_router.py`: `MovimentoCreate.prezzo_unitario: Optional[float]` + propagazione.
- `app/routers/vini_v2_router.py`: `/madre/{id}/stats` ora usa `COALESCE(m.prezzo_unitario, b.PREZZO_CARTA, 0)`, espone nuovi KPI `qta_acquisti` + `costo_acquisti_totale`. `/madre/{id}/movimenti` espone `prezzo_unitario`.
- `frontend/src/pages/vini/SchedaVino.jsx`: form "Aggiungi movimento" con input `€/bt` autopop (VENDITA→PREZZO_CARTA, CARICO→EURO_LISTINO), editabile. Tabella movimenti con colonne €/bt e Totale.
- `frontend/src/components/vini/SchedaMadreV2.jsx`: tab Movimenti distingue prezzo reale vs stima (asterisco + italic). Tab Statistiche aggiunge riga Acquisti: Bt acquistate, Costo acquisti, Margine lordo, Ricarico %.

### Fatto M2.5-arch (nav refactor)
- `frontend/src/pages/vini/ViniNav.jsx`: rename "Gestione 2" → "Cantina 2"; nuovo tab "📚 Anagrafiche" → `/vini/anagrafiche` (admin/sommelier).
- `frontend/src/pages/vini/v2/GestioneVino2.jsx`: header interno "🧪 Cantina 2".
- `frontend/src/pages/vini/anagrafiche/AnagraficheHub.jsx` (NUOVO): pagina contenitore con ViniNav globale + montaggio AnagraficheVini.
- `frontend/src/pages/vini/AnagraficheVini.jsx`: header rebrand "📚 Anagrafiche Vini" (rimosso "🧪 beta"). Sotto-tab "Fornitori" → "Distributori" (UI only).
- `frontend/src/pages/vini/ViniImpostazioni.jsx`: rimossa voce "🧪 Anagrafiche (beta)" da MENU + dal renderer (import commentato).
- `frontend/src/App.jsx`: lazy import `AnagraficheHub` + Route `/vini/anagrafiche` con `sub="settings"`.
- `frontend/src/config/versions.jsx`: vini 3.28 → 3.29.

### Verifiche
- Sintassi JS: i file editati hanno tutti corpo coerente (no JSX in `.js`, import puliti).
- Routing: nuovo path `/vini/anagrafiche` non collide con path esistenti. ViniNav `current="anagrafiche"` matcha.
- Le link legacy non sono toccate: `/vini/v2` continua a funzionare, `/vini/settings` non ha più la sezione anagrafiche ma il default `import` apre senza errori.

### Fatto SchedaMadreV2 full-frame
- `frontend/src/components/vini/SchedaMadreV2.jsx`: altezza fissa `78vh` sul wrapper interno + `flex-1 overflow-auto min-h-0` sul contenitore tab. Header e TabBar sticky, contenuto tab scrolla internamente. Coerente con SchedaVino classica in modalità inline.

### Fatto M2.5.1 Produttori (CRUD + counts + merge)
- **Backend**: `vini_anagrafiche_db.py` con `list_produttori(with_counts, only_orphans, nazione)` + `count_vini_per_produttore` + `list_madri_per_produttore` + `merge_produttori`. Router con GET arricchito (`?with_counts`, `?with_madri`) + POST `/produttori/{src}/merge?target_id={dst}` (admin, cascade sync).
- **Frontend**: nuovo file `pages/vini/anagrafiche/ProduttoriPanel.jsx`. Sostituisce CrudList generica nella sotto-tab Produttori. KPI riepilogativi (totali + n.orfani), tabella con colonne ordinabili (Nome / Nazione / Regione / Madri / Btg / Giac.), filtri (ricerca + nazione + checkbox "solo orfani"). Click su riga → modale dettaglio con lista vini madre. Modali Edit/Nuovo, modale Merge duplicati con radio destinazione + doppia conferma.
- Versione modulo vini 3.29 → 3.30.

### Verifiche
- `py_compile` OK su `vini_anagrafiche_db.py` + `vini_anagrafiche_router.py`.
- Endpoint compatibili indietro: chi chiamava `/produttori/` senza query param riceve la stessa lista di prima (campi nuovi solo se `with_counts=true`).

### Prossimo
- M2.5.2 — Distributori: stesso pattern + colonna rappresentante + contatti.
- M2.5.3 — Denominazioni: gestione casi extra non in eAmbrosia/MASAF.
- M2.5.4 — Vitigni: aggiunta vitigni custom oltre ai ~60 canonici.

---

## SESSIONE 2026-05-15 (notte) — M2 sessione 1 (Modulo Gestione Vino 2)

### Sintesi
Marco ha proposto di rigirare la strategia post-cutover: invece della UI beta "Anagrafiche" minimale + cutover atomico, vuole **un modulo parallelo completo** (Gestione Vino 2) che legga dalle tabelle `_v2`. Lo prova read-only per qualche settimana, poi se gli piace si fa il cutover. Strategia "Piano B" (4 viste essenziali, no duplicazione di Dashboard/Carta/Calici/Vendite che restano sul modulo classico).

### Decisioni
- **Read-only durante test parallelo**: modifiche solo da Cantina classica (scrive su `vini_magazzino`). Modulo v2 mostra solo `_v2`. Niente sync delta, niente rischio drift.
- **Ambito Piano B**: 4 viste — Cantina v2 (lista + raggruppato per madre), Scheda Vino v2 (anagrafica con campi madre 🔗), Per Produttore v2, Nuovo Vino v2 (wizard 3-step preview-only). Le altre pagine Vini (Dashboard, Carta cliente, Calici, Vendite) restano sul classico.
- **3 sessioni**: 1) backend + nav + Cantina (oggi), 2) Scheda v2 + tab Anagrafica refactor, 3) Per Produttore + Nuovo 3-step + docs/push finale.

### Fatto in sessione 1
- `app/routers/vini_v2_router.py` (~270 righe): 4 endpoint read-only `/vini/v2/bottiglie/`, `/bottiglie/{id}`, `/madri-raggruppate/`, `/dashboard/`. JOIN bottiglia + madre + produttore + fornitore + denominazione. Filtri replica MagazzinoVini.jsx (search, tipologia, produttore, distributore, 4 stati, 4 flag, giacenza, listino).
- `main.py`: import + `_mount(vini_v2_router)`.
- `frontend/src/pages/vini/ViniNav.jsx`: voce "🧪 Gestione 2" (admin/sommelier).
- `frontend/src/App.jsx`: route `/vini/v2/*` con splat per subroute.
- `frontend/src/pages/vini/v2/GestioneVino2.jsx`: entry point con sub-nav 4 viste + banner test parallelo.
- `frontend/src/pages/vini/v2/CantinaV2.jsx` (~450 righe): vista funzionante. Sidebar filtri identica + riepilogo tipologie chip + tabella bottiglie con badge slate-700/sfondo tipologia/chip Flag + toggle Bottiglie/Madri.
- `frontend/src/pages/vini/v2/{PerProduttoreV2,NuovoVinoV2,SchedaVinoV2}.jsx`: placeholder stub.

### Verifiche
- `py_compile` OK su `vini_v2_router.py` + `main.py`.
- Routing: App.jsx ha import GestioneVino2 + Route splat `/vini/v2/*`. ViniNav ha la voce. Zero modifiche a codice esistente del modulo classico.

### Prossimo
- M2.4 SchedaVinoV2 con modal madre
- M2.5 PerProduttoreV2 funzionante
- M2.6 NuovoVinoV2 wizard 3-step preview

---

## SESSIONE 2026-05-15 (sera) — V-H.F STATO_VENDITA INTEGER

### Sintesi
Marco ha chiesto di non avere 6 codici lettera per STATO_VENDITA (eccessivi) — analisi sul DB reale ha confermato: 3 codici (N/T/S) mai usati su 1287 vini, 1 (F) usato 1 volta. Schema ridotto a 4 livelli numerici 0..3 con ordinamento naturale (intensity-ordered).

### Schema finale
| Livello | Nome | Note |
|---|---|---|
| 0 | NON_VENDERE | bloccato in carta |
| 1 | CONTROLLARE | verifica annata/conservazione |
| 2 | VENDERE | default nuovi vini |
| 3 | SPINGERE | promuovere attivamente |

### Mig 128 — rebuild colonna su vini_magazzino + vini_bottiglie_v2
Pattern: ADD COLUMN nuova INTEGER DEFAULT 2 + UPDATE backfill via CASE + DROP COLUMN vecchia + RENAME COLUMN. Backup esplicito pre-mig. Idempotente. Mapping: V→2, C→1, F→3, S→3, T→1, N→0, NULL→2. Testata su copia DB locale: 1287 record → 901 livello 1, 385 livello 2, 1 livello 3.

### Refactor codice
- BE: vini_magazzino_db.py (KPI query, ORDER BY, bulk-fix), vini_magazzino_router.py (Pydantic Optional[int] con ge=0/le=3), vini_xlsx_v2.py (template Excel hint + esempio).
- FE: viniConstants.js (oggetto 4 chiavi numero), SchedaVino.jsx (badge fix per "0" falsy), MagazzinoVini.jsx (filter String() per coerenza int/string), AnagraficheVini.jsx (mostra label).

### File toccati
- `app/migrations/128_stato_vendita_int.py` (NEW)
- `app/migrations/125_refactor_anagrafiche_setup.py` (commento DDL)
- `app/models/vini_magazzino_db.py`
- `app/routers/vini_magazzino_router.py`
- `app/services/vini_xlsx_v2.py`
- `frontend/src/config/viniConstants.js`
- `frontend/src/pages/vini/SchedaVino.jsx`
- `frontend/src/pages/vini/MagazzinoVini.jsx`
- `frontend/src/pages/vini/AnagraficheVini.jsx`
- `docs/modulo_vini.md` §3.5
- `docs/changelog.md`

### Verifiche
- `py_compile` OK su 5 file backend
- Mig 128 testata su copia DB locale + idempotenza verificata
- Distribuzione post-mig: 1 livello 1 (901 record), livello 2 (385), livello 3 (1) — coerente con pre-mig

### Status backlog Vini
- V-H.F (rename STATO_VENDITA): chiuso ✓
- V-H.I (cleanup vini_model.py legacy): pending, basso priority

---

## SESSIONE 2026-05-15 — Discovery dinamica DB

### Sintesi
Marco ha richiesto 3 cose: (1) procedere con V-H.F rename stati Vini, (2) verificare che i DB v2 siano scaricabili localmente post-push, (3) fixare push.sh per scaricare TUTTI i DB della cartella + UI Backup per mostrarli tutti. Fatti i punti 2 e 3 in questo push, V-H.F nel prossimo.

### Risultato P2 (check DB locali)
DB v2 effettivamente scaricati dal push, ma nel path vecchio `app/data/` invece del nuovo `locali/tregobbi/data/`. Conteggi tornano: 1287 bottiglie, 995 madre, 68 vitigni, 1637 denominazioni. Sintomo: push.sh ancora puntato al path legacy.

### Risultato P3 (fix push.sh + backup)
- **push.sh**: `DB_LOCAL`/`DB_REMOTE` cambiati a `locali/$LOCALE/data/`. Lista DB scoperta via SSH una volta sola (`ls *.sqlite3 *.db | grep -vE 'wal|shm|prev|bak'`) e riusata in sanity check + sync + post-deploy. Niente più liste hardcoded.
- **`app/routers/backup_router.py`**: rimossa `DATABASES` hardcoded. `_discover_databases()` scansiona `locale_data_dir()`. `/backup/info` ritorna tutti i DB scoperti → UI Impostazioni→Backup mostra l'elenco completo automaticamente.
- **`scripts/backup_db.sh`**: lista `DBS` scoperta dinamicamente cercando in `$LOCALE_DATA_DIR` poi `$DATA_DIR` (dedup per nome). Cron notturno backuppa automaticamente qualsiasi DB nuovo.

### File toccati
- `push.sh` (DB_LOCAL/REMOTE canonical, discovery DBS via SSH, sanity + post-deploy adattati)
- `app/routers/backup_router.py` (DATA_DIR da locale_data_dir, `_discover_databases()`, usato in download/info/list)
- `scripts/backup_db.sh` (DBS array popolato dinamicamente con dedup)

### Verifiche
- `bash -n` OK su push.sh + backup_db.sh
- `py_compile` OK su backup_router.py
- Test runtime sandbox: discovery scopre i 10 DB attesi (admin_finance, bevande, clienti, dipendenti, notifiche, tasks, vini, vini_magazzino, vini_settings, foodcost.db)

### Prossimo (separato in commit dedicato)
- V-H.F: rename codici STATO_VENDITA lettera → parlanti. Stile G.6 (mig + censimento + refactor backend + frontend).

---

## SESSIONE 2026-05-14 (sera) — Fase 8 opzione C (vista esplorativa annate)

### Sintesi
Marco ha richiesto la Fase 8 "workflow inserimento 3-step", ma ho identificato un'ambiguità di design nel doc canonico: dove vanno scritte le nuove bottiglie? Tre opzioni proposte (A sandbox `_v2`, B dual-write con `ADD COLUMN madre_id` su `vini_magazzino`, C read-only vista esplorativa). Marco ha scelto **C** — test UI senza rischio, decisione su A/B rimandata al post-testing.

### Implementazione Fase 8 (opz. C)
- **Backend**: `list_bottiglie_by_madre(mid)` in `vini_anagrafiche_db.py` + endpoint `GET /vini/anagrafiche/madre/{id}/bottiglie` che ritorna le annate con campi annata-specifici (formato, prezzi, qta, stato, locazioni, vitigni 5 slot). I campi anagrafici esclusi: sono ridondanza sincronizzata, accessibili via GET /madre/{mid}.
- **Frontend**: bottone 🍷 nella riga del MadrePanel (accanto al ✏️ di edit) apre `AnnateModal`. Modal mostra header con info del madre (descrizione, produttore, tipologia, nazione/regione) + riepilogo aggregato (n. bottiglie, pezzi totali, annate disponibili, formati) + tabella read-only con ID, annata, formato, prezzo carta/calice/listino, qta totale, stato vendita+riordino, locazioni. Footer chiarisce: per editare usa Magazzino classico.

### File toccati
- `app/models/vini_anagrafiche_db.py` (+`list_bottiglie_by_madre`)
- `app/routers/vini_anagrafiche_router.py` (+endpoint GET madre/{id}/bottiglie)
- `frontend/src/pages/vini/AnagraficheVini.jsx` (+state viewAnnate, +bottone 🍷, +componente AnnateModal)

### Verifiche
- `py_compile` OK su model+router.
- Frontend logico: state `viewAnnate` + setter + bottone + render + componente AnnateModal in scope, 6 ricorrenze.

### Decisione tecnica
- Fase 8 originale (inserimento 3-step) RIMANDATA. Per ora Marco testa la vista nuova "madre + annate" e valida la migrazione clustering. Quando l'UI è solida, decideremo A o B per il workflow inserimento.

---

---

## SESSIONE 2026-05-14 — Refactor anagrafiche vini (Fase 7) + fix Fase 6

### Sintesi
Sessione di consolidamento. Chiuso il refactor del campo `nazione_origine` sui vitigni (rimosso, fuorviante per vitigni multi-nazione). Poi implementata l'intera Fase 7 del refactor: service `vini_anagrafiche_sync.py` che propaga i campi anagrafici dal `vini_madre_v2` (+ produttori/fornitori/denominazioni) alle bottiglie collegate, agganciato automaticamente ai 4 PATCH del router. Aggiunti endpoint admin `/sync-all` (safety net contro drift) e `/rollback` (drop tabelle `_v2` con backup esplicito e confirm string). Bottone "Risincronizza tutto" nella tab Panoramica dell'UI beta.

### Fase 6 fix — Rimozione `nazione_origine` da vitigni
- Marco ha notato che il seed metteva Gewürztraminer come "Francia" ma è coltivato in Italia/Germania/Alsazia. Estesa l'osservazione a tutti i vitigni multi-nazione (Pinot Nero, Cannonau/Grenache, Primitivo/Zinfandel, ecc.).
- Decisione: rimuovere la colonna. L'info nazione storica eventuale finisce in `note` come testo libero ("Francia (Bordeaux). Coltivato in tutto il mondo").
- Codice aggiornato: `VITIGNI_FIELDS` in models, Pydantic `VitignoBase/Update` senza nazione, `VITIGNO_FIELDS` in `AnagraficheVini.jsx` con placeholder note esplicativo.
- Mig 127 riscritta: tuple `(nome, note)` e INSERT su 2 colonne. 60 vitigni canonici aggiornati con note descrittive.
- Comando SQL one-shot dato a Marco: `ALTER TABLE vini_vitigni_v2 DROP COLUMN nazione_origine;` (eseguito post-push, ok su VPS).

### Fase 7 — Sync runtime + rollback

#### A. Service `app/services/vini_anagrafiche_sync.py` (~230 righe)
- 5 funzioni esposte:
  - `sync_bottiglie_from_madre(mid) -> int` (n righe aggiornate)
  - `sync_bottiglie_from_produttore(pid) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_bottiglie_from_fornitore(fid) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_bottiglie_from_denominazione(did) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_all_bottiglie() -> {n_madre_processati, n_bottiglie_aggiornate, n_orfani_skippati, durata_sec}`
- Una sola query JOIN per madre: `vini_madre_v2 ⨝ produttori_v2 ⟕ fornitori_v2 ⟕ denominazioni_v2`. Fallback intelligenti: `madre.nazione || produttore.nazione`, denominazione_id NULL → `DENOMINAZIONE = NULL`.
- Campi sincronizzati (9): PRODUTTORE, DESCRIZIONE, DENOMINAZIONE, TIPOLOGIA, NAZIONE, REGIONE, DISTRIBUTORE, RAPPRESENTANTE, ABBINAMENTI.
- Campi non toccati: annata-specifici, stati operativi, locazioni/qta, vitigni (5 slot + TEXT legacy).
- Bottiglie orfane (`madre_id IS NULL`) saltate — restano con TEXT free-form originale.

#### B. Aggancio nei 4 PATCH del router
- `PATCH /madre/{id}` → `sync_bottiglie_from_madre(mid)` → return include `_sync: {n_bottiglie}`.
- `PATCH /produttori/{id}` → `sync_bottiglie_from_produttore(pid)` (cascade su tutti i madre).
- `PATCH /fornitori/{id}` → idem.
- `PATCH /denominazioni/{id}` → idem.
- Sostituiti tutti i `TODO Fase 7` con codice vivo.

#### C. Endpoint `POST /vini/anagrafiche/sync-all` (admin)
- Safety net contro drift. Idempotente.
- Esposto via bottone "🔄 Risincronizza tutto" in tab Panoramica di `AnagraficheVini.jsx`, con conferma `window.confirm` e report inline (madre, bottiglie, orfani, durata).

#### D. Endpoint `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES` (admin)
- DISTRUTTIVO: droppa le 6 tabelle `_v2` (bottiglie → madre → vitigni/denominazioni/fornitori/produttori).
- Backup esplicito pre-drop: copia file DB con suffisso `.pre-rollback-<timestamp>`.
- Confirm string obbligatorio (no click accidentali). NESSUN bottone UI: solo via curl admin.
- Use case: finestra rollback fino a 24h dopo lo swap atomico (Fase 10).

### File toccati
- `app/services/vini_anagrafiche_sync.py` (NUOVO)
- `app/routers/vini_anagrafiche_router.py` (4 PATCH aggiornati + 2 endpoint nuovi)
- `app/migrations/127_seed_vitigni_base.py` (tuple e SQL senza nazione_origine)
- `app/models/vini_anagrafiche_db.py` (VITIGNI_FIELDS senza nazione_origine)
- `frontend/src/pages/vini/AnagraficheVini.jsx` (Pydantic-free, panel SyncAll)

### Verifiche smoke test
- `python3 -m py_compile` OK su service, router, mig 127.
- Import `from app.services.vini_anagrafiche_sync` OK — 5 funzioni esposte come previsto.
- `app.utils.locale_data.locale_data_path('vini_magazzino.sqlite3')` risolve correttamente al path locale (assente sul Mac per problema noto push.sh non scarica `_v2`, presente sul VPS).

### Prossimi step
- Marco testa: PATCH madre/produttore/fornitore/denominazione → controlla che le bottiglie collegate riflettano i nuovi valori in real-time.
- Bottone "Risincronizza tutto" come safety net dopo eventuali sessioni di pulizia manuale.
- Fase 8: workflow inserimento nuovo vino 3-step (produttore → madre → bottiglia). Da fare quando le anagrafiche sono state validate dall'uso.

---

## SESSIONE 2026-05-13 — Refactor anagrafiche vini (Fasi 1-4)

### Sintesi
Sessione lunga: progettazione iterativa dello schema del refactor strutturale del modulo Vini (V.6 anagrafiche + V.7 vino madre + V.8 vitigni con %), discusso poco alla volta su richiesta di Marco. Strategia blue-green rinforzata. 4 fasi su 6 completate. Domani si parte da Fase 5 (migrazione dati clustering dei 1287 vini esistenti).

### Decisioni di schema (tutte in `docs/refactor_anagrafiche_vini.md`)
- **6 tabelle nuove** con suffisso `_v2` nello stesso file `vini_magazzino.sqlite3`:
  - `vini_produttori_v2` (cantine, indirizzo validato)
  - `vini_fornitori_v2` (distributori con rappresentante inline come campi `rappresentante_nome/telefono/email`)
  - `vini_denominazioni_v2` (DOC/DOCG/IGT/AOC, codice_eambrosia UNIQUE come chiave naturale)
  - `vini_vitigni_v2` (anagrafica canonica vitigni)
  - `vini_madre_v2` (etichetta stabile, FK a produttori/fornitori/denominazioni)
  - `vini_bottiglie_v2` (ex `vini_magazzino` + `madre_id` + 5 slot vitigno colonna)
- **Decisione chiave**: scartato il "modulo Vini duplicato completo" — la blue-green è già abbastanza sicura, modulo duplicato avrebbe introdotto sync delta movimenti al cutover.
- **Fornitore sul madre** (non sulla bottiglia): 1 vino = 1 distributore.
- **Vitigni come 5 colonne** in `vini_bottiglie_v2` (non tabella di link): più snello, basta per il caso d'uso.
- **Campi anagrafici duplicati e sincronizzati**: la fonte di verità è il madre, ma anche le bottiglie hanno copia coerente (sync via service Python, niente trigger SQLite).
- **API eAmbrosia** trovata e validata: `GET /api/v1/geographical-indications` ritorna ~3995 voci EU. Per le italiane si arricchisce con menzione DOC/DOCG/IGT dai PDF MASAF.

### Fase 1 — Setup impalcatura (mig 125)
- Backup esplicito pre-mig + CREATE TABLE delle 6 tabelle `_v2` + copia 1287 vini da `vini_magazzino` → `vini_bottiglie_v2` (`madre_id` e 5 slot vitigno NULL).
- Verifica: 6 tabelle create in produzione, `vini_bottiglie_v2` con 1287 righe.

### Fase 2 — Backend CRUD anagrafiche
- `app/models/vini_anagrafiche_db.py` (~440 righe): funzioni CRUD per le 5 anagrafiche.
- `app/routers/vini_anagrafiche_router.py`: 26 endpoint REST su prefix `/vini/anagrafiche/`. Admin guard sulle scritture, FK validation su madre, DELETE protetto con 409 se record collegati.
- Mappa nomi tabella centralizzata in costante `TABELLE` per facilitare lo swap finale.
- Router registrato in `main.py`.

### Fase 3 — Seed denominazioni
- `app/services/vini_denominazioni_sync.py` (~280 righe): pipeline fetch eAmbrosia API → parse PDF MASAF italiani → compose con mapping euristico per nazioni non italiane (Francia AOC/IGP, Germania QbA/Landwein, Austria DAC/Landwein, Spagna DO/VdT, Portogallo DOC/Vinho Regional) → upsert su `codice_eambrosia` UNIQUE.
- PDF MASAF copiati in `app/data/seed_denominazioni/` come asset di seed (490KB DOP + 426KB IGP).
- Endpoint admin `POST /vini/anagrafiche/denominazioni/sync?dry_run=true|false`.
- **Risultato**: 1637 denominazioni vino UE inserite. 523 italiane (di cui 505 con DOC/DOCG/IGT dal MASAF), 440 francesi, 149 spagnole, 147 greche, 54 rumene, 54 bulgare, 46 tedesche, 44 portoghesi, ecc.
- **Fix necessari emersi in sessione**:
  - Mig 126: rimosso vincolo `UNIQUE(nazione, nome, tipo)` su `vini_denominazioni_v2` perché eAmbrosia ha 5 casi rumeni con stesso nome+tipo ma codici diversi (es. "Dealu Mare" PDO x4). Chiave naturale corretta = `codice_eambrosia`.
  - Regex `P[DG]O-IT-` corretto a `(?:PDO|PGI)-IT-` (matchava solo DOP, non IGP perché PGI ha P+G+I, non P+G+O).
  - Mapping nazioni esteso con NL/BE/DK/SE/FI/PL/EE/LV/LT/IE.

### Fase 4 — Seed vitigni base (mig 127)
- 60 vitigni canonici: 33 italiani (Nebbiolo, Sangiovese, Glera, Trebbiano, ecc.) + 27 internazionali (Pinot Noir, Cabernet Sauvignon, Chardonnay, Syrah, ecc.).
- Note descrittive su ogni vitigno (es. Cannonau = Grenache, Primitivo = Zinfandel).
- INSERT OR IGNORE su `nome` UNIQUE — idempotente. L'utente può aggiungere altri via CRUD `POST /vini/anagrafiche/vitigni/`.

### Fase 5 — Migrazione dati clustering ✅
- Service `vini_anagrafiche_migrate.py` + endpoint `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false`. Pipeline 6 step (produttori → fornitori → denominazioni match → madre clustering → link bottiglie → parser vitigni).
- Fix preferenza canonical naming: non-uppercase prima di uppercase (es. "Camperchi" vs "CAMPERCHI" sceglie il primo).
- **Risultati produzione 2026-05-13**:
  - 350 produttori distinct creati (solo 3 multi-variante banali case-sensitive)
  - 40 fornitori (con rappresentanti inline)
  - 995 vini madre clusterizzati
  - 270 denominazioni linkate automaticamente (exact match) / 725 no_match (compileranno a mano in Fase 6 UI)
  - 1285 bottiglie linkate al madre, 2 orfane (senza produttore)
  - 37 vitigni assegnati su 44 bottiglie con campo VITIGNI valorizzato (campo poco usato da Marco)
- Vitigni non riconosciuti (~13): Clairette, Verdeca, Susumaniello, Vernaccia, Catarratto, Zibibbo, Gewürztraminer, ecc. — da aggiungere all'anagrafica.

### Stato DB post sessione
```
vini_produttori_v2     0    (popolato in Fase 5)
vini_fornitori_v2      0    (popolato in Fase 5)
vini_denominazioni_v2  1637 (sync eAmbrosia + MASAF)
vini_vitigni_v2        60   (seed mig 127)
vini_madre_v2          0    (popolato in Fase 5 via clustering)
vini_bottiglie_v2      1287 (copia da vini_magazzino mig 125, madre_id NULL)
```

### Fasi rimaste (domani / sessioni successive)
- **Fase 5** — Migrazione dati esistenti (PRIORITARIA domani). Algoritmo di clustering: estrae produttori distinct + fornitori + cluster `(produttore, descrizione)` → vini madre + link bottiglie → madre. Parser vitigni TEXT → 5 slot. Endpoint admin `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false` con report cluster sospetti.
- **Fase 6** — UI gestione anagrafiche "🧪 beta" in `ViniImpostazioni.jsx` (sub-menu nuovo).
- **Fase 7** — Service `vini_anagrafiche_sync.py` (sync runtime campi ridondanti dal madre alle bottiglie) + endpoint admin rollback rapido.
- **Fase 8** — Workflow nuovo inserimento vino 3-step (Scegli produttore → Scegli madre → Annata).
- **Fase 10** — Cutover atomico (swap tabelle in transazione).

### Note operative
- **Backup automatico DB**: la mig 125 ha già creato `vini_magazzino.sqlite3.pre-mig-125-<ts>` come safety net.
- **Marco superadmin**, login via `POST /auth/login` con `{"username":"marco","password":"5261"}`.
- **Python venv**: `/home/marco/trgb/venv-trgb/bin/python` (non `/venv/`, è `/venv-trgb/`).
- **Path DB**: `locali/tregobbi/data/vini_magazzino.sqlite3` (R6.5 layout).
- **Auth service**: `create_access_token` vive in `app.core.security`, NON in `app.services.auth_service`.
- **Endpoint API**: niente prefix `/api/` (path diretti tipo `https://trgb.tregobbi.it/vini/anagrafiche/stats/`).
- **Push.sh non scarica DB v2 sul Mac**: nota di Marco da indagare in sessione futura (non urgente).

### Memorie persistenti salvate
- `reference_trgb_api_no_prefix.md` — niente `/api/` nelle URL.
- (esistenti, non toccate oggi)

---

## SESSIONE 2026-05-12 — Audit modulo Vini + V-H.A/H/B chiusi

---

## SESSIONE 2026-05-12 — Audit modulo Vini + V-H.A/H/B chiusi

### Sintesi
Sessione di audit profondo del modulo Vini, con piano di hardening tecnico in 8 task (V-H.A..H). Conclusione: V-BUG1 era un falso positivo. Iniziati i lavori di pulizia, restano 5 task tecnici (C, D, G, E, F) prima di poter affrontare la roadmap V prioritaria (V.1, V.2, V.3, V.6, V.7, V.8, V.5).

### Riprogrammazione priorità roadmap V
Marco ha rivisto le priorità della sezione V (Vini) di roadmap.md:
- **Prioritari** (in quest'ordine): V.1 → V.2 → V.3 → V.6 → V.7 → V.8 → V.5
- **Basso**: V.4 (note degustative AI, declassato da ALTA), V.9, V.10, V.11, V.12
- **Da valutare**: V.13-V.18

### V-H.A — Fix bug FORMATO droppato dalla CRUD `[core]`
Il campo `FORMATO` esisteva nel DB e nel FE ma **non era nei Pydantic** `VinoMagazzinoBase`/`VinoMagazzinoUpdate`. FastAPI lo droppava silenziosamente. Aggiunto a entrambi gli schema in `vini_magazzino_router.py:54-57` e `:150`. Bug invisibile da quando esiste il campo. Effort: 2 righe.

### V-H.B — V-BUG1 falso positivo `[doc]`
V-BUG1 in `problemi.md` dichiarava un endpoint `POST /vini/magazzino/import` con FORCE senza admin guard. **Quell'endpoint non esiste**. Verificati uno per uno tutti gli endpoint massivi reali: hanno tutti `_require_admin`/`is_admin`. Voce chiusa in `problemi.md` come falso positivo.

### V-H.H — Allineamento docs `[doc]`
- `modulo_vini.md` §3.5: elenco campi DB completo e categorizzato (anagrafica, prezzi, flag, stati, locazioni, metadati). Era fermo a 26 campi storici, ora i 35 reali.
- `roadmap.md` sezione V: priorità ridefinite. Aggiunta sezione "Hardening tecnico modulo Vini" con i task V-H.A..H. V-DEBT1 marcato obsoleto, V-DEBT2 confermato.
- `problemi.md` V-BUG1: chiuso come falso positivo con verifica endpoint per endpoint.

### V-H.C — Trailing slash uniformati `[doc]`
Censiti tutti gli endpoint backend del modulo Vini con `/` finale dichiarato (5 in `vini_magazzino_router.py`, 3 in `bevande_router.py`) e relative chiamate FE. **Nessun mismatch**: tutte le chiamate FE hanno già lo slash giusto. Verosimilmente effetto positivo della disciplina post-fix Chiusure Turno. Modulo Vini conforme alla regola CLAUDE.md.

### V-H.D — QTA_TOTALE read-only via API + cintura+bretelle DB `[core]`
Audit: Pydantic `VinoMagazzinoBase`/`Update` **non avevano** `QTA_TOTALE` → era già impossibile patcharlo via API (mio audit precedente era impreciso). FE usa `QTA_TOTALE` solo in lettura (display, filtri, sort), mai in payload. Aggiunto `data.pop("QTA_TOTALE", None)` in `update_vino` (`vini_magazzino_db.py:893`) come safety contro chiamate dirette future. Nessuna modifica FE necessaria.

### V-H.G — Soglie configurabili Vini (mig 123 + UI Impostazioni) `[core]`
**12 soglie operative** estratte dal codice e migrate a `vini_widget_settings` (DB `vini_settings.sqlite3`, tabella key/value/tipo/descrizione/updated_at, seed via mig 123). Pattern coerente con `dipendenti_settings` (mig 118). Lavoro completo in un solo commit:

- **Migration 123** — `app/migrations/123_vini_widget_settings.py`. Idempotente (INSERT OR IGNORE). 12 default seedati.
- **Service `vini_widget_settings_service.py`** — single source of truth dei default (importati anche dalla migration), cache process-life invalidabile, helper `calcola_prezzo_calice_default(prezzo_carta)` riusato da 4 punti.
- **Endpoint** in `vini_settings_router.py`: `GET /settings/vini/widget/`, `PUT /settings/vini/widget/` (batch update), `POST /settings/vini/widget/reset` (admin only).
- **Hook FE** `useViniWidgetSettings.js` — cache process-life, expone `get(key, default)`.
- **Refactor consumer**:
  - BE: `vini_metrics.py` (ritmo top/medio), `vini_magazzino_db.py` (vini_fermi 30gg, top_vendute 30gg, qta_suggerita 60gg/2), `vini_magazzino_router.py`+`vini_repository.py`+`vini_pricing_router.py` (prezzo calice via helper)
  - FE: `CaliciDisponibiliCard.jsx` (fresh/alert hours), `DecidiPrezzoCalice.jsx` (soglie warn/block %)
- **UI**: nuova sezione "Widget e soglie" in `ViniImpostazioni.jsx`, raggruppata per area (Calici / Dashboard / Riordino / Ritmo / Prezzo calice). Edit inline + Salva batch + Reset default (admin).

Le 12 soglie sono: `calici_fresh_hours` (12), `calici_alert_hours` (36), `vini_fermi_giorni` (30), `top_vendute_giorni` (30), `qta_suggerita_giorni_storico` (60), `qta_suggerita_divisore` (2), `ritmo_soglia_top` (5), `ritmo_soglia_medio` (1), `decidi_calice_soglia_warn_pct` (40), `decidi_calice_soglia_block_pct` (50), `prezzo_calice_divisore` (5), `prezzo_calice_step_round` (0.5).

### V-H.E — Normalizzazione 4 flag SI/NO → INTEGER 0/1 + eliminazione DISCONTINUATO `[core]`

**Migrazione 124** (single shot atomico, backup esplicito):
- Backup `vini_magazzino.sqlite3.pre-mig-124-YYYYMMDD-HHMMSS` salvato nello stesso path del DB prima di toccarlo (recovery: rinominare).
- Consolidamento `DISCONTINUATO='SI'` → `STATO_RIORDINO='X'` (decisione Marco: i due erano sinonimi semantici, DISCONTINUATO eredità Excel).
- ADD COLUMN `<flag>_INT` per i 4 flag (CARTA, IPRATICO, BIOLOGICO, VENDITA_CALICE).
- Backfill: `'SI'→1`, `'NO'→0`, NULL→NULL/default 0.
- DROP COLUMN delle 4 colonne TEXT vecchie + DISCONTINUATO (richiede SQLite >= 3.35, OK su Python 3.12).
- RENAME COLUMN `<flag>_INT` → nome canonico.
- Idempotente (check tipo PRAGMA all'ingresso). Re-run no-op.

**Refactor backend** (5 file):
- `vini_magazzino_db.py`: schema CREATE TABLE aggiornato (INTEGER), commenti, query SQL `CARTA = 'SI'` → `CARTA = 1`, default `"NO"` → 0, ALTER TABLE DISCONTINUATO rimosso.
- `vini_repository.py`: query WHERE + compare `(r["VENDITA_CALICE"] or "") == "SI"` → `bool(r["VENDITA_CALICE"] or 0)`.
- `vini_magazzino_router.py`: Pydantic `Optional[str]` → `Optional[int]`, default `"NO"` → `0`, rimossa Pydantic DISCONTINUATO, compare, output dict.
- `vini_cantina_tools_router.py`: helper `_yn_to_int` e `_int_to_yn` per import/export Excel (Marco lascia file Excel leggibile con SI/NO, il DB resta INTEGER). DISCONTINUATO param Query deprecato. SELECT senza DISCONTINUATO.
- `vini_router.py`: commenti aggiornati.

**Refactor frontend** (5 file):
- `MagazzinoVini.jsx`: select option `value="1"/"0"`, filtri client-side con `String(v.CARTA ?? "") === sel`, badge tabella `=== 1`, bulk select con coerce Number, rimosso filtro DISCONTINUATO.
- `MagazzinoAdmin.jsx`: colonne grid `options: ["","1","0"]` con `optionLabels` per visual "SI"/"NO", `fSoloCarta` filtro `=== 1`, rimossa colonna DISCONTINUATO.
- `MagazzinoViniNuovo.jsx`: state init `CARTA: 1` etc, save coerce `? 1 : 0`, helper `flagToggle` aggiornato a INTEGER 0/1 con compat retroattiva.
- `SchedaVino.jsx`: FlagBadge `=== 1`, FlagToggle accetta INTEGER 0/1, save senza DISCONTINUATO, FlagToggle "Forza Prezzo" semplificato (era SI/NO→1/0, ora diretto).
- `ViniVendite.jsx`: compare `VENDITA_CALICE === 1` (era `(v.VENDITA_CALICE || "") === "SI"`).

**Da fare in coda (V-H.I):** tabella `vini` legacy (`vini_model.py`) — 3 occorrenze `CARTA='SI'` in staging import Excel. Lascio TEXT perché Marco ha detto di sistemare l'import dopo.

### V-H.J — Import/Export Vini v2 (vecchia logica eliminata) `[core]`

Sostituita la vecchia logica import/export Excel (eredità Excel originale) con un nuovo formato unificato. Decisione Marco: "passato, elimina, ormai mesi che usiamo nuovo sistema".

**Nuovi endpoint** (`vini_cantina_tools_router.py`):
- `GET /vini/cantina-tools/template-v2` → scarica il template `.xlsx` ufficiale
- `POST /vini/cantina-tools/import-v2` → importa dal nuovo formato (skip se ID esiste)
- `GET /vini/cantina-tools/export-v2` → esporta tutti i vini nello stesso formato

**Service `app/services/vini_xlsx_v2.py`** (nuovo, ~450 righe):
- `TEMPLATE_COLUMNS`: schema autoritativo (single source of truth) con tipo + obbligatorio + valori validi per ogni colonna.
- `generate_template_xlsx()`: 4 fogli (Vini, Locazioni dinamiche dal DB locazioni-config, Riferimento valori dinamici, Istruzioni).
- `generate_export_xlsx()`: stesso layout del template, dati popolati con tutti i vini del DB → **round-trip pulito**.
- `parse_import_xlsx()`: valida header, salta righe esempio, gestisce SI/NO → 0/1, INSERT solo se ID vuoto, SKIP se ID esiste, errore di riga se ID inesistente.
- Costanti `TIPOLOGIA_VALIDE`, `FORMATO_VALIDI`, `STATO_VENDITA_VALIDI`, `STATO_RIORDINO_VALIDI`, `STATO_CONSERVAZIONE_VALIDI` promosse qui da `vini_model.py`.

**Chiave d'unicità**: `id` (vini_magazzino.id, auto-increment). Marco: "la chiave per me è l'ID; se esiste non va sovrascritto". Per modificare un vino esistente → scheda gestionale, mai import.

**Eliminato**:
- `POST /vini/cantina-tools/import-excel` → rimosso del tutto
- `GET /vini/cantina-tools/export-excel` → rimosso del tutto
- `app/models/vini_model.py`: `normalize_dataframe`, `init_database`, `clear_vini_table`, `_clean_str` → file ridotto a stub deprecati con `NotImplementedError` (impedisce regressioni silenti se import legacy sopravvive). DB legacy `vini.sqlite3` resta intoccato (V-H.I lo pulirà se vuoto).

**UI Impostazioni Vini → sezione "Import / Export" rifatta**:
- 4 card a griglia 2×2: 📥 Scarica template / 📤 Importa vini / 💾 Esporta tutto / 📖 Guida (in-page con i punti chiave).
- Risultato import dettagliato (inseriti, saltati, errori con riga + motivo).
- Card "⚠ Azione admin: Azzera database cantina" come `<details>` collassato sotto, con doppia conferma (richiede sia "sicuro?" sia "hai fatto export di backup?").

### V.6+V.7+V.8 — Refactor anagrafiche vini (Fase 1: setup impalcatura) `[core]`

Inizio del refactor strutturale grosso. Schema concordato iterativamente con Marco in sessione (vedi `docs/refactor_anagrafiche_vini.md` per il design completo). Strategia: **blue-green rinforzata** (tabelle `_v2` parallele nello stesso file `vini_magazzino.sqlite3`, swap atomico finale, 3 rinforzi: snapshot esplicito, endpoint rollback rapido, UI nuova etichettata "beta").

**Decisione architetturale**: scartato il "modulo Vini duplicato completo" (frontend+backend separati su `/vini-test/...`) perché introduceva sync delta movimenti al cutover senza ridurre la complessità vera del refactor (clustering, sync anagrafiche, parser vitigni).

**Mig 125 (Fase 1)**: backup esplicito pre-mig + CREATE TABLE delle 6 tabelle `_v2` (`vini_produttori_v2`, `vini_fornitori_v2`, `vini_denominazioni_v2`, `vini_vitigni_v2`, `vini_madre_v2`, `vini_bottiglie_v2`) + copia 1287 vini da `vini_magazzino` → `vini_bottiglie_v2`. Le tabelle `_v2` sono pronte ma vuote (eccetto bottiglie). Marco continua a usare il modulo Vini normalmente, nessun impatto sull'utente.

**Prossime fasi pianificate** (file `docs/refactor_anagrafiche_vini.md` §4):
- Fase 2: backend service + endpoint CRUD scheletro `/vini/anagrafiche/...`
- Fase 3: seed denominazioni (eAmbrosia API + parsing PDF MASAF)
- Fase 4: seed vitigni base (~50)
- Fase 5: migrazione dati (clustering produttori → madre → bottiglie + parser vitigni)
- Fase 6: UI gestione anagrafiche (sezione "🧪 beta" in `ViniImpostazioni.jsx`)
- Fase 7: service sync + endpoint rollback rapido
- Fase 8: workflow nuovo inserimento 3-step (produttore → madre → annata)
- Fase 10: cutover atomico (rename tabelle in transazione)

Effort totale stimato: 12-14h distribuite su 3-4 sessioni di sviluppo + 1 di verifica Marco.

### Task di hardening tecnico ancora aperti (per la prossima sessione)
- **V-H.F** Rename STATO_VENDITA codici lettera → parlanti + CHECK constraint (decisione: dopo il refactor anagrafiche per non mescolare 2 refactor strutturali)
- **V-H.I** Cleanup completo file legacy `vini_model.py` (eliminare definitivamente) + valutare se eliminare DB `vini.sqlite3` se vuoto in produzione

### Memoria persistente salvata
- `feedback_soglie_hardcoded.md`: vietato hardcodare soglie operative. Prima di scrivere `const SOGLIA = 12`, fermarsi e proporre `*_settings` + UI Impostazioni.

---

## SESSIONE 2026-05-11 — G.7 + G.8 + 5 bug fix + ripristino dati audit

### Sintesi
Sessione lunga, 4 fasi consecutive:
1. **G.7 Sposta data** chiuso (UX 2-celle + endpoint /uscite/{id}/scadenza esteso + /ripristina-data + chip Spostato)
2. **5 bug operativi** scovati a catena (Chiusure pagina vuota, widget Home double-count, riapri rata UI, filtro Scadenzario, filtri speciali UX)
3. **Bug critico storico**: scoperto che 138 fatture VERIFICARE erano state distrutte da un re-import perché `/uscite/import` non proteggeva quegli stati. Mig 115 di ripristino + fix endpoint.
4. **G.8 — Stato macro/sotto** end-to-end (backend + frontend): tassonomia CHIUSO/APERTO sopra i sotto-stati. Architettura difensiva contro futuri bug di omissione.

### G.7 — UX "Sposta data" + completamento stato SPOSTATO `[core]`
- Backend: `PUT /controllo-gestione/uscite/{id}/scadenza` esteso (auto-setta `SPOSTATO` se data nuova ≠ originale + preserva `data_scadenza_originale` alla prima rinegoziazione). Nuovo endpoint `PUT /controllo-gestione/uscite/{id}/ripristina-data`.
- Frontend `FattureDettaglio.jsx`: card scadenza ridisegnata in 2 sotto-celle ("Scadenza iniziale" read-only + "Programmata" editabile con bottoni "Sposta data"/"Ripristina originale" + badge "spost.").
- Chip "Spostato" aggiunto in `FattureElenco.jsx` (drill-down filtro pagamento) e `ControlloGestioneUscite.jsx` (palette fuchsia).

### Bug 1 — Chiusure Turno: pagina vuota da settimane `[core]`
`ChiusureTurnoLista.jsx` faceva fetch a `${API}/admin/finance/shift-closures?from_date=...` SENZA trailing slash. FastAPI 307 redirect → proxy strippava l'`Authorization` → 401 silente → array vuoto (file usa `fetch()` direct, non `apiFetch()` che gestirebbe il 401). Fix: aggiunto `/` prima del `?` + commento esplicativo.

### Bug 2 — Widget Home "Incasso ieri" double-counting `[core]`
`_incasso_ieri()` in `dashboard_router.py` faceva `SUM(totale_incassi)` su pranzo+cena. Ma nel form Chiusura Turno i campi della CENA sono inseriti come **valori CUMULATIVI giornalieri** (commento UI a riga 591 di `ChiusuraTurno.jsx`: "valori giornalieri — i parziali cena sono calcolati"). Sommare conta due volte il pranzo. Per il 10/05: 1.963 + 2.866 = 4.829 mostrato vs reale 2.866. Fix: `COALESCE(MAX(cena), MAX(pranzo), 0)` invece di SUM. Coerente con `vendite_aggregator.giorni_merged()` riga 89.

### Bug 3 — Riapri rata pagata in modale Piano Rate `[core]`
Marco aveva marcato per errore una rata di FAMIGLIA COTARELLA come pagata, senza modo di riaprirla dalla UI. Aggiunta funzione `riapriRata` + colonna "Azioni" in tabella. Bottone "↺ Riapri" condizionale, esteso poi con prompt nuova data (default 1° mese prossimo) che attiva SPOSTATO automaticamente — semantica coerente con G.7.

### Bug 4 — Scadenzario Uscite: filtro periodo iterato 2 volte `[core]`
Marco voleva vedere la rata Cotarella scaduta a marzo mentre filtra Maggio. Prima tentativo: SCADUTO bypassa filtroDa → troppo permissivo, trascinava archivio 2024. Secondo tentativo: cap 60gg → arbitrario, non rispetta la semantica del filtro. **Rollback definitivo a strict**: il filtro è chiaro per costruzione; se ci sono scaduti vecchi visibili dove non vorresti è perché sono **dati sporchi** (61 SCADUTO pre-2026 da bonificare), non si nasconde il sintomo via UI. Marco mi ha ripreso giustamente: "perché stai facendo caos? quelle fatture non hanno data di scadenza quindi trascini il dubbio?". Lesson learned, memoria salvata.

### Bug 5 — Filtri speciali Scadenzario: ripulizia `[core]`
Mostra escluse: 0 fornitori con `escluso_acquisti=1` in DB → toggle morto, rimosso da UI. Mostra rateizzate: aggiunto count "(45)" + tooltip esplicativo. Solo in pagamento: aggiunto tooltip su quando si popola (post batch). Pulita clausola SQL morta `u.stato <> 'RATEIZZATO'` nel backend post-G.6 (0 hit reali, ridondante con `rateizzata_in_spesa_fissa_id IS NULL`).

### Chip KPI con doppio numero "filtrato / totale" `[core]`
Confusione tra count chip top (filtrato) e sidebar (globale). Implementata opzione B dei mockup: chip mostra `(n_filtrato / n_totale_globale)`. Es: con filtro Mag → "Scaduto € 3.942 (5 / 85)". Quando non c'è filtro periodo, i due numeri coincidono e mostra solo `n`.

### BUG CRITICO storico — /uscite/import distruggeva VERIFICARE/SPOSTATO/RATEIZZATO `[core]`
Marco nota: "0 verificare ma ieri ne avevamo gestite 138". Diagnosi: il branch protetto in `/uscite/import` (riga 534) era `if ex["stato"] in ("PAGATO","PAGATO_MANUALE","PARZIALE")`. Per gli altri stati "decisi dall'utente" (VERIFICARE, SPOSTATO, RATEIZZATO) il re-import sovrascriveva con uno stato calcolato `PROGRAMMATO`/`SCADUTO`. Bug **preesistente** per DA_VERIFICARE, amplificato da G.6/G.7 con i nuovi stati. Le 138 fatture VERIFICARE ripristinate da mig 113 erano state travolte da un re-import successivo. **Mig 115** rifa il ripristino (120 CONTROLLARE + 18 RISTO TEAM → VERIFICARE).

### G.8 — Stato macro/sotto a 2 livelli `[core]`
Architettura difensiva strutturale. Marco ha proposto: 2 livelli, macro (CHIUSO/APERTO) sopra sotto-stato. Implementato come **mig 116** con `cg_uscite.stato_macro` come `GENERATED ALWAYS AS (...) VIRTUAL`: si autocalcola da `stato` ad ogni read, invariante DB-level. Service Python centralizzato `app/services/stati_pagamento.py` (STATI_CHIUSI, STATI_APERTI, is_chiuso, is_aperto, derive_macro). Refactor `/uscite/import` come **whitelist invariante**: `STATI_DERIVATI_DA_DATA = {PROGRAMMATO, SCADUTO}` — solo questi 2 sono ricalcolabili, tutti gli altri (presenti e futuri) sono protetti per costruzione. Mai più un bug di omissione su questa logica. Mirror frontend in `frontend/src/utils/statoPagamento.js` + refactor 5 punti chiave (FattureDettaglio, ControlloGestioneUscite, ControlloGestioneSpeseFisse).

### File modificati
**Backend**
- `app/routers/controllo_gestione_router.py` — endpoint G.7 (scadenza esteso + ripristina-data), refactor /uscite/import whitelist invariante, espone stato_macro in GET /uscite, pulita clausola SQL morta
- `app/routers/dashboard_router.py` — fix double-counting widget Home
- `app/services/stati_pagamento.py` — **nuovo**, costanti+helper centralizzati
- `app/migrations/115_ripristina_verificare_post_g6.py` — **nuovo**, mig ripristino 138 VERIFICARE
- `app/migrations/116_stato_macro_generated.py` — **nuovo**, GENERATED VIRTUAL column + VIEW aggiornata

**Frontend**
- `frontend/src/utils/statoPagamento.js` — **nuovo**, mirror JS del service
- `frontend/src/pages/admin/FattureDettaglio.jsx` — 2-celle scadenza + isChiuso refactor
- `frontend/src/pages/admin/FattureElenco.jsx` — chip Spostato
- `frontend/src/pages/admin/ChiusureTurnoLista.jsx` — trailing slash fix
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` — chip Spostato + chip KPI doppio numero + filtri ripuliti + refactor stato_macro
- `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx` — bottone Riapri rata + isChiuso refactor

**Docs**
- `docs/stato_pagamento_unificato.md` — §12 G.6 + §13 G.7 + §14 G.8 livello macro/sotto
- `docs/roadmap.md` — G.7 ✅ + G.8 ✅
- `docs/changelog.md` — voci dettagliate

### Verifica post-deploy
Su VPS dopo push.sh:
- HTTP 200 OK, backend up, niente errori in log
- `schema_migrations`: 115 applicata alle 14:15, 116 alle 14:37 ✓
- `SELECT COUNT(*) FROM cg_uscite WHERE stato='VERIFICARE'` → **138** ✓ (i 120 CONTROLLARE + 18 RISTO TEAM ripristinati)
- `GROUP BY stato_macro` → APERTO 388 / CHIUSO 1746 ✓ (totale 2134 = 2089 visibili + 45 fatture rateizzate nascoste)

### Lezioni operative salvate in memoria
- **Rename stati richiede verifica semantica**, non solo testuale. Conta gli hit delle clausole post-rename: se 0, la clausola era pensata per un significato che non vale più — segnalare/rimuovere/aggiornare. Salvato in `feedback_rename_semantica.md`.
- **Sessione TRGB si chiude con docs**: a fine sessione aggiornare sessione.md + changelog.md SEMPRE, non aspettare. Marco mi ha definito "bambino genio che si dimentica di allacciarsi le scarpe". Salvato in `feedback_chiudere_sessione.md`.

### Note operative aperte (non urgenti)
- **1291 "Da riconciliare"** nel chip CG Uscite: 1118 fatture + 166 spese fisse + 7 stipendi PAGATO_MANUALE senza match banca. 521 da Fatture in Cloud, 754 senza data_scadenza. Da decidere se filtrare per orizzonte temporale.
- **61 SCADUTO pre-2026** (PREGIS 40, METRO 9, ecc.): dati operativi storici mai aggiornati. Bonifica con audit Excel + mig 117 quando serve. **Marco ha detto "sono già state sistemate, non urgente"**.
- **Discrepanza RT vs canali Chiusura Turno** (€2.143 sul 10/05): chiusura RT 2.686 vs incassi canali 2.866. Non è bug software, è errore di battitura registratore o pre-conti aperti. Da chiarire con chi chiude i turni.
- **FastAPI deprecation warning** in `banca_router.py:2064` (`regex=` → `pattern=`). Non bloccante.
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` — chip Spostato + filtro SCADUTO bypassa filtroDa
- `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx` — bottone Riapri rata
- `docs/stato_pagamento_unificato.md` — §12 G.6 + §13 G.7
- `docs/roadmap.md` — G.7 ✅ FATTO
- `docs/changelog.md` — voci sessione 2026-05-11

### Commit suggeriti
```
[core] G.6+G.7: rename stati al maschile + SPOSTATO + UX Sposta data
[core] Fix Chiusure Turno: trailing slash mancante in ChiusureTurnoLista.jsx
[core] Fix widget Home Incasso ieri: SUM faceva double-count del pranzo
[core] CG Spese Fisse: bottone 'Riapri' nella modale Piano Rate
[core] CG Scadenzario: filtro periodo lascia passare SCADUTO sopra filtroDa
```

### Note operative aperte
- **1291 Da riconciliare**: chip CG Uscite gonfio. 1118 fatture + 166 spese fisse + 7 stipendi, 521 da Fatture in Cloud (`fic_pagato_raw=1`), 754 senza `data_scadenza`. Da rivedere: filtro orizzonte temporale del chip (es. ultimi 24 mesi) per renderlo azionabile.
- **Discrepanza RT vs canali Chiusure Turno**: per 10/05 il delta è € 2.143 (RT 2.686 vs incassi canali 4.829-1.963=2.866). Vale la pena indagare se è errore di battitura sul registratore o se ci sono pre-conti aperti non ancora battuti. Non è bug software.

---

## SESSIONE 2026-05-08 — Fix Home dashboard: 4 query rotte (Vendite, Vini, Ricette, Flussi-cassa)

### Cosa ha mostrato Marco
"In Acquisti vedo `1250 da pagare`, vero? In Vendite `incasso ieri 0`, falso." Marco chiedeva un audit dato per dato di tutte le card dei moduli sulla Home.

### Diagnosi (dataset locale, DB freschi del giorno)
Audit `app/routers/dashboard_router.py` (endpoint `GET /dashboard/home`) — 4 bug nascosti dietro `try/except` silenziosi che cadevano in fallback statico:

1. **Vendite — `_incasso_ieri()`**: cercava `shift_closures` in `foodcost.db`, ma la tabella vive in `admin_finance.sqlite3` (modulo cassa, locale-aware). Eccezione swallowed → IncassoIeri() = zero. Realtà ieri: €1.348 / 21 coperti su 2 turni.
2. **Coperti mese — `_coperti_mese()`**: stesso bug DB sbagliato → 0 falso, mostrato anche dentro la card Controllo Gestione. Realtà: 172 coperti maggio 2026.
3. **Vini — blocco in `_alerts()` e `_moduli_summary()`**: query usavano `attivo` e `scorta_minima` che NON esistono nel DB Tre Gobbi. Le colonne reali sono in MAIUSCOLO (QTA, PREZZO, …). Eccezione → fallback statico "Cantina & Vini". Realtà: 1.238 etichette, 1.261 bottiglie.
4. **Ricette — blocco in `_moduli_summary()`**: cercava tabella `ricette` con `attiva` e `food_cost_pct`. Tabella reale: `recipes` con `is_active`. Niente `food_cost_pct` (calcolo costoso, va via join recipe_ingredients × ingredient_prices). Fallback statico "Gestione Cucina". Realtà: 48 schede, 34 piatti, 5 senza prezzo vendita.
5. **Flussi cassa — blocco in `_moduli_summary()`**: tabella `flussi_cassa` non esiste in nessun DB (mai creata). Fonte vera: `finanza_movimenti` in foodcost.db con colonne `dare`/`avere`/`data` (`dare` già negativo). 2.643 movimenti totali, 23 nel mese corrente.

Caso a parte: **Acquisti `1250 fatture / €588.608`** — dato VERO, ma fuorviante. 1249 su 1250 fatture hanno `stato_pagamento='da_pagare'` (default all'import SDI), solo 1 marcata pagata manualmente. 3 anni di backlog SDI mai aggiornato. Non è bug del codice, è workflow operativo. Lasciato invariato: decisione separata se cambiare semantica del badge.

### Cosa è stato fatto — `[core]`
Modifiche solo a `app/routers/dashboard_router.py` (modulo: platform, dashboard aggregatore generico):
- `_incasso_ieri()`: `sqlite3.connect(locale_data_path("admin_finance.sqlite3"))` invece di `get_foodcost_connection()`. Stessa query.
- `_coperti_mese()`: stesso refit di DB.
- `_alerts()` blocco vini: `PRAGMA table_info(vini)` per detectare dinamicamente le colonne reali (case-insensitive). Se non c'è `qta` o `scorta_minima`, no alert (silenzioso, non errore).
- `_moduli_summary()` blocco vini: stesso pattern dinamico. Conta tutte le etichette + somma `QTA` come "bottiglie in giacenza".
- `_moduli_summary()` blocco ricette: query su `recipes` con breakdown is_base 0/1 + selling_price > 0. Line2: "X piatti · Y senza prezzo" o "X piatti · Y basi". Badge = piatti senza prezzo vendita.
- `_moduli_summary()` blocco flussi-cassa: query su `finanza_movimenti` con `SUM(avere + dare)`. Line2: "+€E / −€U · N mov.".

Nessuna migration DB. Nessun nuovo file. Nessuna dipendenza nuova.

### File modificati
- `app/routers/dashboard_router.py` (5 punti — 4 fix + 1 helper dinamico colonne vini)

### Commit
`[core] fix dashboard Home: 4 query rotte (vendite, vini, ricette, flussi-cassa)`

### Verifica post-deploy
Marco deve fare Ctrl+Shift+R sulla Home e controllare che le 5 card mostrino numeri reali (vedi tabella in changelog). Se restano statiche, problema di cache CDN/browser (pulire/forzare reload).

### Note operative aperte
- **Acquisti `1250 fatture`**: workflow da decidere — o marca pagate, o cambia semantica badge a "ultimi 30/60gg".
- **Saldo Flussi cassa "tutto uscite"**: `finanza_movimenti` contiene solo movimenti banca, non corrispettivi. Per saldo "vero" (incassi netti − uscite) servirebbe unire shift_closures + finanza_movimenti. Fix successivo se serve.
- **Coperti maggio 2025 = 0**: dato storico mancante (modulo cassa post-2025), non bug.

---

## SESSIONE 2026-05-07 (II) — Fix falsi positivi `lkg_corrupt` da race check vs backup orario

### Cosa ha mostrato Marco
Dopo il push del fix UI backup (parser timestamp duale), la pagina mostrava correttamente l'ultimo backup di ~1h fa con dimensione 34.93 MB. Però appariva un nuovo problema: il riquadro era passato da rosso ("88 ore") a rosso diverso ("PROBLEMI RILEVATI") con `Issues attive (3): lkg_corrupt:foodcost.db / vini.sqlite3 / clienti.sqlite3`. Contraddizione interna: le 4 card sopra mostravano tutto verde, "Last known good 15/15 integri".

### Diagnosi
- L'endpoint `/system/backup-health` (Python) apre i file LKG con `sqlite3.connect("file:...?mode=ro", uri=True)` → read-only puro → 15/15 ok.
- Lo script `check_backup_health.sh` (bash, cron `*/30`) apriva i file LKG con `sqlite3 "$f" "PRAGMA integrity_check"` → modalità RW default. Su un file con `journal_mode=WAL` ereditato dal source, SQLite crea `<db>-shm` e `<db>-wal` accanto. Visto già nell'output `=== 7. LKG ===` precedente: i `-shm`/`-wal` avevano mtime alle `19:50` (da check), mentre i `.sqlite3` avevano mtime alle `19:00` (da backup orario).
- Confronto fra il log delle 19:30 (`OK: 10/10`) e quello delle 20:00 (`Corrotti: 3`): il check ha trovato corrupt **esattamente al minuto :00**, in concomitanza con il cron del backup orario. La causa è una race tra `cp -f` di `update_lkg()` (non atomico — `clienti.sqlite3` da 25 MB richiede centinaia di ms) e `sqlite3 integrity_check` del check. I 3 DB sospetti erano i 3 più grandi e più scritti (foodcost 7 MB, vini 0.8 MB ma write-heavy, clienti 25 MB).
- Conferma: test manuale fuori finestra cron (`sqlite3 PRAGMA integrity_check` su tutti e 3, sia RW che read-only) → tutti `ok`.

### Cosa è stato fatto — `[core]`

**A. `scripts/check_backup_health.sh` v1.1**
- Estratto `check_lkg_integrity()` come helper.
- `sqlite3 -readonly "$f"` invece di `sqlite3 "$f"` → no creazione di `-shm`/`-wal` accidentali.
- Retry-once dopo 3 secondi se la prima passata non ritorna `ok`. Tre secondi sono sufficienti perché `cp -f` di un DB da 25 MB su disco SSD finisca. Se anche il retry fallisce → corruption reale, segnaliamo.
- Aggiornato docstring con nota sulla v1.1 e cambio di cron suggerito (`15,45 * * * *`).

**B. `scripts/backup_db.sh::update_lkg()`**
- Dopo `cp -f`, `rm -f` su `<db>-shm` e `<db>-wal` orfani. Pulizia idempotente, non rompe nulla se non presenti.
- Motivo: ripulire i residui esistenti (creati dai check pre-A) e blindare contro tool esterni futuri che aprissero la LKG in RW.

**C. NON modificato** `setup-backup-and-security.sh`: è uno scaffold del first-time setup che ha solo 2 cron base (hourly + daily 03:30), mentre la crontab reale del VPS ha 4 job (orario, daily 03:00, daily 18:00, health check). Quel file è già fuori sync, sistemarlo qui sarebbe fuori scope. La crontab del VPS va aggiornata a mano (vedi punto sotto).

### Da fare manualmente sul VPS dopo il push
Sfasare il cron del check da `*/30` a `15,45` per non sovrapporsi mai ai cron di backup (`0 * * * *` orario, `0 3,18 * * *` daily):
```
crontab -e
```
Cambiare la riga:
```
*/30 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
```
in:
```
15,45 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
```
Anche senza questo cambio, il fix A (readonly + retry) dovrebbe già azzerare i falsi positivi, ma la sfasatura è cintura+bretelle.

### File modificati
- `scripts/check_backup_health.sh` (helper + readonly + retry + docstring)
- `scripts/backup_db.sh` (cleanup -shm/-wal in update_lkg)
- `VERSION` (5.13 → 5.14)
- `frontend/src/config/versions.jsx` (sistema 5.13 → 5.14)
- `docs/changelog.md` (entry "2026-05-07 (II)")
- `docs/sessione.md` (questa sezione)

### File NON modificati
- `app/routers/backup_router.py` — già fixato nel push precedente
- `setup-backup-and-security.sh` — scaffold obsoleto, fuori scope
- `main.py::system_backup_health` — già usa read-only correttamente

### Verifica suggerita post-deploy
1. Aspettare il prossimo run del check (ogni :15 e :45 dopo aver sfasato il cron, o ogni :00 e :30 se non sfasato).
2. Hard refresh `/impostazioni/sistema?tab=backup`.
3. Box deve diventare verde "SISTEMA SANO" e restare tale anche al run successivo.
4. Sul VPS: `cat /home/marco/trgb/trgb/app/data/backups/.last_health_status.json` → `"status":"healthy"`, `"issues":[]`.
5. Sul VPS: `ls /home/marco/trgb/trgb/app/data/backups/last_known_good/*-shm /home/marco/trgb/trgb/app/data/backups/last_known_good/*-wal 2>&1` → dopo il prossimo backup orario non ci devono più essere file `-shm`/`-wal` (rm -f li ha puliti, e con readonly nessuno li ricrea).

### Commit suggerito
`./push.sh "[core] Fix falsi positivi lkg_corrupt: sqlite3 -readonly + retry nel check + cleanup -shm/-wal"`

---

## SESSIONE 2026-05-07 — Fix UI Backup: parser timestamp dual-format + DATABASES allineato

### Cosa ha chiesto Marco
Marco ha aperto la pagina "Impostazioni → Backup" e ha visto due segnali in contraddizione: il box verde "SISTEMA SANO" diceva backup orario 50 min fa / daily 1h fa / Drive sync 1h fa / LKG 15/15 integri, mentre subito sotto un box rosso urlava "Ultimo backup di 88 ore fa — verifica il cron". Domanda: tutto a posto o devo preoccuparmi?

### Diagnosi
Diagnosi remota via `ssh trgb`:
- **Crontab**: tutti e 4 i job attivi (orario, daily 03:00, daily 18:00, health check ogni 30 min). OK.
- **Script `backup_db.sh`**: versione v2 post-incidente (commit `aefc9b73`), eseguibile, ultimo run hourly del 7 mag 19:00 con 15 OK / 0 falliti.
- **Cartelle daily reali sul VPS**: 14 cartelle, l'ultima `20260507180001` di 1h fa. Backup giornalieri **regolari**.
- **Dati LKG**: tutti i 10 DB + 5 JSON config aggiornati al 7 mag 19:00.
- **Drive sync**: OK al 7 mag 18:00 (DB + LKG + runbook).

Quindi il sistema di backup era ed è perfettamente sano. Bug nella UI:
- Le cartelle daily nuove (dal 5 mag) hanno il formato `YYYYMMDDHHMMSS` (14 cifre, da `date +%Y%m%d%H%M%S` dello script v2).
- Le 3 cartelle storiche del 2/3/4 mag hanno il vecchio formato `YYYYMMDD_HHMMSS` (con underscore).
- `app/routers/backup_router.py::_parse_folder_timestamp` parsava SOLO il vecchio formato → ignorava 11 cartelle nuove → "ultimo backup" interpretato come 4 mag 03:30 → allarme 88h.
- Le dimensioni "0.03 MB" mostrate per il 3-4 mag erano probabilmente rumore: il parser non riconosceva le cartelle nuove e si limitava a misurare residui orfani.

### Cosa è stato fatto — `[core]`
- **`backup_router.py::_parse_folder_timestamp`** riscritta per accettare entrambi i formati. Tenta prima il nuovo (`%Y%m%d%H%M%S`, 14 cifre, `isdigit()`) per evitare il costo dell'eccezione sul caso comune; in fallback prova il vecchio (`%Y%m%d_%H%M%S`, 15 char con underscore in posizione 8). Tutto il resto respinto. Test su nomi reali del VPS: 14/14 OK.
- **`DATABASES` allineata a `scripts/backup_db.sh::DBS`**: aggiunti `notifiche.sqlite3`, `tasks.sqlite3`, `bevande.sqlite3` che il cron già copiava ma che mancavano nel download on-demand `/backup/download`. Ordine concettuale (foodcost → finance → vini → tenant DB) coerente con lo script.
- Aggiornati commenti/docstring del router per documentare i due formati timestamp e la motivazione della modifica.
- Bumpato `VERSION` 5.12 → 5.13 e allineato `versions.jsx` `sistema.version` (era rimasto indietro a 5.11 dalla sessione precedente — fix dell'allineamento approfittando del bump).

### File modificati
- `app/routers/backup_router.py` (parser duale + DATABASES + commenti)
- `VERSION` (5.12 → 5.13)
- `frontend/src/config/versions.jsx` (`sistema: 5.11 → 5.13`)
- `docs/changelog.md` (entry 2026-05-07)
- `docs/sessione.md` (questa sezione)

### File NON modificati (volutamente)
- `scripts/backup_db.sh` — la v2 sul VPS è già corretta, è il client (router) che leggeva male.
- `frontend/src/pages/admin/ImpostazioniSistema.jsx` — il `TabBackup` legge gli endpoint `/backup/info` + `/backup/list` + `/system/backup-health` invariati; basta che il backend ritorni dati giusti, niente da toccare lato React.

### Verifica suggerita post-deploy
1. Hard refresh `/impostazioni/sistema?tab=backup` (Ctrl+Shift+R).
2. Box rosso "Ultimo backup di X ore fa" deve sparire (l'età deve risultare ~1h o meno, non più 88h).
3. La sezione "Backup giornalieri sul server" deve mostrare ~14 cartelle con dimensioni realistiche (~30-35 MB ciascuna, non 0.03 MB).
4. Cliccare "Scarica backup completo": il `.tar.gz` deve contenere ora 10 DB (non 7) — verificabile con `tar tzf trgb-backup-*.tar.gz | wc -l`.
5. Il box verde "SISTEMA SANO" deve restare verde (legge `/system/backup-health`, non toccato).

### Commit suggerito
`./push.sh "[core] Fix UI Backup: parser timestamp dual-format + DATABASES allineato (10 DB)"`

---

## SESSIONE 2026-05-04 — Selezioni: 5a zona Piatti del giorno + categoria madre paese formaggi + widget salumi mostra prodotti

### Cosa ha chiesto Marco
1. Aggiungere sezione "Piatti del giorno" dentro Selezioni (separata, ma 5a tab della pagina).
2. Nel widget Salumi della Home mostrare i nomi dei prodotti, non i totali per categoria.
3. Nei Formaggi aggiungere "Formaggi Italiani" e "Formaggi Francesi" come categoria madre, dentro le quali stanno le categorie figlie esistenti (Vaccino, Caprino, Ovino, Misto).

### Cosa è stato fatto

#### A) Piatti del Giorno (5a zona di Selezioni) — `[mixed]`
- **mig 107** crea `piatti_giorno`, `piatti_giorno_categorie`, `piatti_giorno_config` (pattern salumi). Seed 6 categorie generiche: Antipasto / Primo / Secondo / Contorno / Dolce / Speciale.
- **router** `app/routers/piatti_giorno_router.py` — CRUD + categorie + config (gemello di `scelta_salumi_router.py`). Prefix `/piatti-giorno/`. Stato attivo/archivio.
- **main.py** importa e monta il router via `_mount("piatti_giorno_router", piatti_giorno_router)`. Backward-compat: nessun module.json esplicito → loader default-attivo.
- **frontend** `zonaConfig.js` aggiunge zona `"piatti-giorno"` con icona 🍽️, accent verde-emerald, `showPesoPrezzo: true` (override esplicito perché stato="attivo" ma il prezzo serve), descrizione textarea. `ZONA_ORDER` esteso da 4 a 5 zone.
- **`SelezioniDelGiorno.jsx`** non tocca nulla: la sidebar legge `ZONA_ORDER` e `ZONA_CONFIG` → la 5a tab compare automaticamente. Stesso `ZonaPanel` riusato.

#### B) Widget Salumi/Formaggi mostra prodotti — `[core]`
- **`SelezioniCard.jsx` v1.1**: per zone `stato === "attivo"` (Salumi, Formaggi) il mini-blocco appiattisce `categorie[].tagli[]` e mostra i primi 3 NOMI dei prodotti. Per zone `stato === "venduto"` (Macellaio, Pescato) resta la preview categoria + count come prima (perché ce ne sono tanti per categoria, l'aggregato ha più senso).
- Niente modifiche backend: `dashboard_router._salumi_widget` e `_formaggi_widget` già passano 2 tagli per categoria → il widget Home ne mostra 3 totali appiattendo, OK.

#### C) Categoria madre paese sui Formaggi — `[core]`
- **mig 107** ALTER TABLE `formaggi_tagli` ADD COLUMN `paese` TEXT (idempotente, NULL ammesso). Indice `idx_formaggi_paese`.
- **`scelta_formaggi_router.py`**: aggiunto `paese` in `TaglioIn`/`TaglioOut`. Helper `_has_paese_column()` per detect a runtime (pattern preventivo dal feedback "schema_drift_legacy_columns" in memoria). INSERT/UPDATE branchano in base alla colonna presente, fallback graceful se mig 107 non ancora applicata.
- **`zonaConfig.js`** formaggi: nuovo campo extra `paese` come SELECT (Italia 🇮🇹, Francia 🇫🇷, Altro), e `raggruppaPer: { campo: "paese", label: "Paese", emojiMap }`.
- **`ZonaPanel.jsx`**:
  - supporto generico per `campiExtra[].options` → renderizza `<select>` invece di `<input>`.
  - supporto generico per `cfg.raggruppaPer` → la tabella raggruppa le righe per il campo indicato, con header di gruppo (es. "🇮🇹 Italia · 5"). Ordering: prima i valori noti dell'emojiMap, poi gli altri alfabetici, infine "Senza paese" alla fine.
  - supporto generico per `cfg.showPesoPrezzo` come override esplicito.

### File creati
- `app/migrations/107_piatti_giorno_e_formaggi_paese.py` (3 tabelle nuove + 1 ADD COLUMN, idempotente)
- `app/routers/piatti_giorno_router.py` (~365 righe, gemello di scelta_salumi_router)

### File modificati
- `main.py` — import + `_mount` del nuovo router piatti_giorno
- `app/routers/scelta_formaggi_router.py` — campo paese + INSERT/UPDATE branchati
- `frontend/src/pages/selezioni/zonaConfig.js` — 5a zona + select paese formaggi + raggruppaPer
- `frontend/src/pages/selezioni/ZonaPanel.jsx` — supporto select / raggruppamento / showPesoPrezzo override
- `frontend/src/components/widgets/SelezioniCard.jsx` — preview prodotti per zone "attivo"
- `frontend/src/config/versions.jsx` — `selezioni: 1.0 → 1.1`
- `VERSION` — `5.11 → 5.12`

### Verifica suggerita post-deploy
1. `/selezioni/piatti-giorno` mostra la 5a tab con CRUD funzionante (creare 1 piatto di test, archiviarlo, riattivarlo).
2. Widget Selezioni in Home: mini-blocco Salumi e Formaggi mostrano i nomi dei prodotti, non più "Insaccati · 5".
3. `/selezioni/formaggi` mostra il dropdown Paese nel form di creazione/modifica. Tabella raggruppata per "🇮🇹 Italia" / "🇫🇷 Francia" / "Senza Paese" finché Marco non assegna i paesi ai formaggi esistenti.

### Cose volutamente NON fatte (rinviate)
- Integrazione "Piatti del giorno" altrove (Home widget, modulo Cucina, menu carta) — Marco ha detto "ti spiegherò il passo successivo dopo".
- Aggiornamento `_salumi_widget` / `_formaggi_widget` per portare più di 2 tagli per categoria: il widget Home ne mostra 3 appiattendo da più categorie, sufficiente in pratica.
- Modifica delle categorie salumi/formaggi figlie esistenti: restano "Vaccino", "Caprino" ecc. condivise tra i due paesi (Marco: "le categorie di prima esistenti vanno bene").

---

## SESSIONE R8b + R8c (2026-05-02 nottata) — Module loader backend + filtro menu frontend

### Cosa è stato fatto
- **R8b backend**: nuovo modulo `app/platform/module_loader.py` (221 righe). Legge `locali/<TRGB_LOCALE>/moduli_attivi.json` + i 14 `core/moduli/<id>/module.json` per costruire la mappa `router_file → module_id` (46 router classificati). Espone `is_router_active()`, `is_module_active()`, `get_module_info()`, `boot_banner()`. Default backward-compat assoluta: `"*"` o file mancante → tutti attivi. Cache via `lru_cache`.
- **main.py integrato**: 47 `app.include_router(...)` wrappati in helper `_mount(router_file, router, **kwargs)` che fa il check del loader. Banner finale al boot stampa moduli attivi + eventuali skip. Endpoint nuovo `GET /system/modules` per esporre lo stato al frontend.
- **R8c frontend**: nuovo `frontend/src/utils/activeModules.js` (139 righe). Pattern speculare a `localeStrings.js`: load al boot in `main.jsx` (parallelo a brand+strings), cache, hook `useActiveModules()`. Esporta `isMenuKeyActive()`, `isModuleActive()`, `filterMenuByActive()`.
- **Header.jsx + Home.jsx aggiornati**: filtro `MODULES_MENU` (Header dropdown navigazione + Home grid moduli) per `isMenuKeyActive(k)`. Su tregobbi (wildcard "*") = no-op visivo, niente cambia.
- **Mismatch chiavi risolti**: `cassa.module.json` `frontend_menu_key: "cassa"→"vendite"` (allineato a MODULES_MENU.vendite), `task_manager.module.json` `"task_manager"→"tasks"` (allineato a MODULES_MENU.tasks).
- **`/system/modules` espone** anche `frontend_menu_keys` (lista chiavi MODULES_MENU dei moduli attivi) per filtro facile lato FE.
- **TabHomeActions.jsx NON filtrato**: pannello admin per config azioni rapide deve mostrare tutte le route esistenti (anche di moduli temporaneamente disattivati) per non perdere config.

### File creati
- `app/platform/__init__.py` (1 riga)
- `app/platform/module_loader.py` (221 righe)
- `frontend/src/utils/activeModules.js` (139 righe)

### File modificati
- `main.py`: import loader, helper `_mount`, 47 include sostituite con `_mount(...)`, endpoint `/system/modules`, banner boot
- `core/moduli/cassa/module.json`: frontend_menu_key
- `core/moduli/task_manager/module.json`: frontend_menu_key
- `frontend/src/main.jsx`: import + load `loadActiveModules()` in parallelo
- `frontend/src/components/Header.jsx`: hook `useActiveModules()` + filtro `visibleKeys`
- `frontend/src/pages/Home.jsx`: hook + filtro `visibleModules`

### Verifica
- `python -m compileall app/platform main.py` → OK
- `node --check frontend/src/utils/activeModules.js` → OK
- Test loader con `TRGB_LOCALE=tregobbi`: 14 moduli attivi (wildcard), 46/46 router montati, `frontend_menu_keys` espone le 13 chiavi MODULES_MENU del FE.
- Test loader con `TRGB_LOCALE=test_demo` + `{"moduli": ["vini","cassa"]}`: 18/46 router montati (vini 7 + cassa 3 + platform 8), banca/ricette/tasks/etc DISATTIVATI.

### Backward-compat assoluta su tregobbi
- moduli_attivi.json ha `"*"` → tutti attivi → comportamento IDENTICO a pre-R8.
- `is_router_active()` su nome non mappato → True (default safe).
- Frontend: se `/system/modules` non risponde → fallback wildcard, niente filtro applicato, tutto visibile.

### Punti di attenzione (non bloccanti)
- 4 moduli backend (`banca`, `controllo_gestione`, `menu_carta`, `cucina`) hanno `frontend_menu_key` impostato ma NON c'è una chiave corrispondente in MODULES_MENU oggi. Le voci di questi moduli vivono come sub-menu di altri (ricette/vendite/...) o sono raggiungibili solo via URL. Quando in futuro si aggiungono chiavi top-level in `modulesMenu.js`, il filtro le riconosce automaticamente.
- `TabHomeActions.jsx` mostra tutte le route, anche di moduli disattivi (volutamente — pannello admin di config).

### Suggested commit
`./push.sh "[core] R8b+R8c — module loader backend (app/platform/module_loader.py) + endpoint /system/modules + filtro menu frontend (useActiveModules hook). Default wildcard, no behavior change su tregobbi. Test demo locale [vini,cassa]: 18/46 router montati."`

---

## SESSIONE R8a (2026-05-02) — Manifesti moduli dichiarativi (zero rischio runtime)

### Cosa è stato fatto
- Creati 13 `core/moduli/<id>/module.json` (uno per modulo vendibile) + 1 `core/moduli/platform/module.json` per i servizi infrastrutturali sempre attivi.
- Mappati i 46 router esistenti ai 13 moduli + platform: vini (7 router), ricette (8), acquisti (4), controllo_gestione (1), banca (1), dipendenti (3), prenotazioni (3), clienti (1), cassa (3), menu_carta (3), cucina (1), task_manager (2), statistiche (1), platform (8).
- Creato `locali/tregobbi/moduli_attivi.json` = `{"moduli": ["*"]}` (wildcard backward-compat).
- Creato `locali/trgb/moduli_attivi.json` = idem (demo completa).
- Creato `locali/_template/moduli_attivi.json.template` con documentazione inline (lista moduli disponibili + 3 esempi configurazione).

### File modificati / creati
- nuovi: `core/moduli/{vini,ricette,acquisti,controllo_gestione,banca,dipendenti,prenotazioni,clienti,cassa,menu_carta,cucina,task_manager,statistiche,platform}/module.json` (14 file)
- nuovi: `locali/{tregobbi,trgb}/moduli_attivi.json`, `locali/_template/moduli_attivi.json.template`

### Schema module.json
Ogni manifesto contiene: `id`, `nome` (UI), `versione`, `descrizione`, `vendibile` (bool), `dipendenze_platform` (lista mattoni M.A-M.I), `dipendenze_opzionali` (altri moduli che potenziano questo), `router_files` (lista file in `app/routers/`), `endpoint_prefix` (lista prefissi FastAPI), `tabelle_db` (lista tabelle SQL), `frontend_route` (lista route), `frontend_menu_key` (chiave in `modulesMenu.js`).

Per `platform`: in più `always_active: true` e mappa stato `mattoni` (M.A...M.I).

### Verifica
- Nessuno legge questi file ancora → zero impatto runtime → backend del ristorante intoccato. Sicuro anche di sabato sera.
- I file servono come contratto per R8b (backend module_loader) e R8c (frontend filter menu).

### Cosa NON ho fatto (R8b/R8c)
- Backend: `app/platform/module_loader.py` da scrivere in R8b. Oggi `main.py` continua a montare i 46 router come sempre.
- Frontend: filtro menu da scrivere in R8c. Oggi `modulesMenu.js` mostra tutto come sempre.

### Suggested commit
`./push.sh "[core] R8a — manifesti dichiarativi 13 moduli vendibili + platform (core/moduli/<id>/module.json) + moduli_attivi.json per locale (tregobbi/trgb='*' backward-compat) + template documentato. Nessun cambio runtime, scaffold per R8b loader."`

---

## SESSIONE R6.5 push 1 (2026-05-02) — Path tenant-aware su tutti i DB SQLite

### Cosa è stato fatto
- Applicato `app/utils/locale_data.locale_data_path()` a tutti i 10 DB SQLite operativi (sorpresa: 10, non 9 — `vini.sqlite3` ancora attivo via `vini_model.py`, `dashboard_router.py`, `alert_engine.py`).
- I file DB restano fisicamente in `app/data/` (push 2 li sposta).
- Zero behavior change su tregobbi: l'helper trova i DB nel legacy path `app/data/` via fallback storico.
- Disciplina forzata: ogni modulo pre-R8 punta al locale corrente via `TRGB_LOCALE` env (default `tregobbi`).

### File modificati (~52)
**Modelli (8):** `foodcost_db`, `vini_magazzino_db`, `settings_db`, `notifiche_db`, `tasks_db`, `bevande_db`, `clienti_db`, `dipendenti_db`.
**Core (1):** `core/database.py` (MAIN_DB_PATH + SETTINGS_DB_PATH).
**Migration runner:** `migration_runner.py` (CRITICO — punto di ingresso al boot).
**Router (~12):** `banca_router`, `fe_import`, `fe_categorie_router`, `fe_proforme_router`, `fattureincloud_router`, `controllo_gestione_router`, `admin_finance` (FOODCOST_DB_PATH), `chiusure_turno`, `dipendenti` (cross-DB foodcost queries), `ipratico_products_router`, `menu_carta_router` (TASKS_DB), `dashboard_router` (vini.sqlite3 in 2 punti).
**Servizi (4):** `corrispettivi_export`, `corrispettivi_import` (DB_PATH importato anche da admin_finance), `vendite_aggregator`, `alert_engine`.
**Migrazioni (22):** 050, 068, 070-073, 075-088, 090, 096, 097.
- Escluse: 057 (CSV output), 060 (self-aware via PRAGMA database_list), 064 (bug originale `.db` no-op safe), 089/095/101 (solo docstring, usano modelli già aggiornati).
**Config locale (2):** `auth_service.py` (USERS_FILE), `closures_config_router.py` (CONFIG_FILE).
**TODO inline:** 9 tools/scripts one-shot + 4 cartelle uploads/backups (app/data/uploads, ipratico_uploads, documenti_dipendenti, backups) — fuori scope R6.5, marcati per Modulo K-bis post-R6.5.

### Verifica
- `python -m compileall` su `app/{models,core,migrations,routers,services,utils}` → zero errori sintassi.
- Smoke test import: tutti i path si risolvono correttamente. Sul VPS dove i DB esistono in `app/data/`, il fallback storico li trova → zero behavior change.
- Grep finale `app/data/X.sqlite3|.db|.json`: zero match in codice eseguibile (solo docstring storiche e bug noto migrazione 064).

### Note tecniche
- `vini.sqlite3` è ancora attivo (era stato erroneamente censito come 9 DB nel piano §3 R6.5; sono 10): aggiornata tabella §6.
- `settings_db.py` e `core/database.py` puntavano entrambi a `vini_settings.sqlite3` con costanti diverse — ora entrambi via `locale_data_path()`, stesso file. Riconciliazione implicita.
- `cucina_db.py` non toccato: è solo alias di `get_foodcost_connection()` (Fase 0 split).
- Migrazione 064 mantiene il bug `dipendenti.db` (non esiste, no-op safe). Migrazione 060 è già self-aware via PRAGMA.

### Push 2 (separato, prossimo)
Spostamento fisico file DB da `app/data/` a `locali/tregobbi/data/` sul VPS, sotto `[locale:tregobbi]`. Zero downtime: l'helper è già pronto per entrambi i path (lookup #1 tenant → fallback #2 legacy).

### Suggested commit
`./push.sh "[core] R6.5 push 1 — locale_data_path() su 10 DB SQLite (modelli + core + migration_runner + router + servizi + 22 migrazioni + users.json + closures_config.json)"`

---

## SESSIONE R7 (2026-05-02) — Chiusura prima fase refactor monorepo

### Cosa è stato fatto
- Push R7: scaffold `locali/_template/` completo (assets/data/seeds con `.gitkeep`) + `docs/architettura_locale.md` (doc canonico multi-tenant) + sync stato §6 `refactor_monorepo.md` + `roadmap.md` §0 + fix logo gobbette SVG su `deploy/sites/trgb.it/index.html`
- Fix `.git/index.lock` orfano (processo git precedente crashato)
- Rimossi `trgb_reel.mp4` e `trgb_reel_v2.mp4` (file temporanei altro agente)

### File modificati
- `docs/architettura_locale.md` (NUOVO — doc canonico)
- `locali/_template/assets|data|seeds/.gitkeep` (NUOVI — scaffold)
- `locali/_template/branding|locale|strings|deploy/env.production.template` (NUOVI)
- `docs/refactor_monorepo.md` (§6 stato R7 aggiornato con hash `936a5e6`)
- `docs/roadmap.md` (§0 stato R7 ✅ FATTO)
- `deploy/sites/trgb.it/index.html` (gobbette SVG path reali + rimosso link prototipo)

### Verifica post-push
- HTTP probe `trgb.tregobbi.it` → 405 (backend vivo, 136ms)
- Commit `936a5e6` confermato su `main`

### Stato refactor
R1✅ R2✅ R3✅ R4✅ R5✅ R6✅ R7✅ — R6.5 DA FARE — R8 DA FARE

### Prossima sessione
- R6.5: applica `locale_data_path()` ai 9 DB SQLite operativi (prerequisito R8)
- R8: architettura modulare + feature flags (sessione lunga)

### Commit
`[mixed] R7 — scaffold locali/_template/ + docs/architettura_locale.md + sync stato §6 refactor_monorepo + roadmap §0 + trgb.it gobbette SVG` (commit `936a5e6`)

---

**Ultimo aggiornamento:** 2026-04-28 (sessione 59 cont. e — VPS: aggiornamento minor 64 pacchetti + upgrade major Ubuntu 22.04 → 24.04.4 LTS Noble + ricreazione venv Python 3.12)
**Documenti collegati:** [`docs/roadmap.md`](./roadmap.md) · [`docs/problemi.md`](./problemi.md) · [`docs/changelog.md`](./changelog.md) · [`docs/architettura_mattoni.md`](./architettura_mattoni.md) · [`docs/home_per_ruolo.md`](./home_per_ruolo.md) · [`docs/mattone_calendar.md`](./mattone_calendar.md) · [`docs/menu_carta.md`](./menu_carta.md) · [`docs/modulo_pranzo.md`](./modulo_pranzo.md) · [`docs/deploy.md`](./deploy.md)

---

## SESSIONE 59 cont. e (2026-04-27/28) — VPS: AGGIORNAMENTO MINOR + UPGRADE MAJOR UBUNTU 24.04 LTS NOBLE

### Background
A fine giornata Marco vuole aggiornare il VPS. Banner Ubuntu segnalava da
giorni "System restart required" (kernel updates pendenti) + "New release
'24.04.4 LTS' available". Affrontiamo entrambi: prima il minor (64 pacchetti
+ kernel) come riscaldamento, poi il major Jammy → Noble.

### Fase 1 — Aggiornamento MINOR (sicuro)
Tempo: ~15 min.

**Pacchetti**: 64 upgradable, tutti security/bugfix. Niente major bump
critico — nginx resta 1.18 (patch ubuntu14.8→14.10), systemd resta 249.11
(patch 3.19→3.20), Python invariato. Notabili:
- nodejs 20.19.6 → 20.20.2
- docker-compose-plugin 2.40.3 → 5.1.3 (TRGB non usa Docker)
- linux-firmware 316MB
- Kernel 5.15.0-176 installato (era -173)

**Procedura**: `apt update && apt upgrade -y && apt autoremove -y && reboot`.
Reboot pulito. Backend e frontend ripartiti via systemd. Probe HTTP tutti
verdi (vedi `.guardiano_state.json` audit `post-reboot-vps`).

### Fase 2 — Upgrade MAJOR Ubuntu 22.04 → 24.04.4 LTS
Tempo: ~1h 45min totali. Operazione delicata.

**Pre-flight obbligatorio**:
1. **Snapshot Aruba**: creato 27/04 23:49, scade 29/04 23:00. Rete di
   sicurezza per rollback completo VM.
2. **Backup tar.gz locale**: 577MB in `~/backups/pre-upgrade-noble-20260427-2350.tar.gz`
   (DB tutti + uploads + nginx config + systemd unit). Push su gdrive via
   rclone in 33s.
3. **Cleanup `/boot`**: rimosso kernel 5.15.0-173 (era 66% pieno → 34%, da
   180MB liberi a 278MB). Necessario per i nuovi initramfs noble.
4. **Checkpoint WAL** su tutti `app/data/*.sqlite3` con `PRAGMA wal_checkpoint(TRUNCATE)`.
   Errori "malformed schema" su 9 file `vini_magazzino.CORROTTO-*` /
   `FORENSE-*` (artefatti recovery S51-52, file morti — non bloccante).
5. **Stop servizi TRGB** durante backup per consistenza WAL.

**Procedura**: `sudo do-release-upgrade`. ~30 min download + ~45 min
install + prompt config + 280 obsolete pacchetti rimossi + reboot.

**Prompt config gestiti** (tutti KEEP LOCAL):
- `/etc/sudoers` — contiene NOPASSWD per restart trgb-backend/frontend
- `/etc/ssh/sshd_config` — hardening Marco
- `/etc/fail2ban/jail.conf` — regole ban brute force
- `/etc/xrdp/xrdp.ini` — config RDP server
- `/etc/fwupd/fwupd.conf` — non rilevante su VPS

**Snap thunderbird unreachable** → SKIP (non serve sul server, bloccava
solo il pacchetto desktop).

**Repo terze parti disabilitati** (sono ancora installati ma niente
aggiornamenti futuri finché non riabilitati): docker, nodejs, chrome.
Per TRGB serve riattivare nodejs in futuro (task #44, non urgente: Node
20 è ancora installato e funziona).

### Fase 3 — Fix post-reboot (CRITICO)
Tempo: ~15 min.

**Problema 1 — Backend giù**: dopo reboot tutti gli endpoint 502. Causa:
il `venv-trgb` aveva librerie Python in `lib/python3.10/site-packages/`
ma ora il sistema ha solo Python 3.12. `ModuleNotFoundError: No module
named 'uvicorn'` in loop restart.

Fix:
```bash
sudo systemctl stop trgb-backend
mv /home/marco/trgb/venv-trgb /home/marco/trgb/venv-trgb.OLD-noble-20260427
python3 -m venv /home/marco/trgb/venv-trgb
/home/marco/trgb/venv-trgb/bin/pip install --upgrade pip wheel setuptools
cd /home/marco/trgb/trgb && /home/marco/trgb/venv-trgb/bin/pip install -r requirements.txt
sudo systemctl reset-failed trgb-backend
sudo systemctl start trgb-backend
```

**Problema 2 — `email-validator` mancante**: backend riparte ma crasha
con `ImportError: email-validator is not installed`. In Pydantic 2.x
`email-validator` è un extra opzionale (era incluso nelle vecchie versioni).

Fix: `/home/marco/trgb/venv-trgb/bin/pip install email-validator` →
backend UP alle 00:47:11.

**Versioni installate** (NUOVE rispetto a pre-upgrade):
- pandas 2.x → **3.0.2** (major bump)
- numpy 1.x → **2.4.4** (major bump)
- fastapi → 0.136.1
- pydantic → 2.13.3
- weasyprint → 68.1
- cryptography → 47.0.0
- Pillow → 12.2.0

Funziona tutto, ma **requirements.txt non ha pinning stretti** → pip ha
pescato le ultime release del 2026. Task #46: pinning con `pip freeze`
per evitare sorprese future.

### Verifica post-upgrade
Tutti gli endpoint verdi via probe HTTP da Mac:
- `GET /` → 405 (backend FastAPI vivo)
- `GET /uploads/inesistente.jpg` → 404 application/json (Modulo K mount OK)
- `GET /lista-spesa/items/` → 401 (Modulo J + mig 105 OK)
- `GET /haccp/report/recent-events` → 401 (Modulo I OK)
- `GET /dashboard/cucina` → 401 (Modulo H OK)
- `GET /controllo-gestione/spese-fisse/.../piano-rate` → 401 (M.6 OK)
- `GET /pranzo/menu/oggi/` → 401
- `GET /menu-carta/editions/` → 401

Servizi systemd: `trgb-backend`, `trgb-frontend`, `nginx` tutti
`active (running)`. Vite 5.4.21 ready in 550ms (Node 20 ancora funzionante
nonostante repo nodesource disabilitato).

### Warning non bloccanti rilevati
- `FastAPIDeprecationWarning: regex has been deprecated, please use pattern instead`
  in `banca_router.py:2056` (e probabilmente altri). Sweep da fare in task #45.

### Backlog post-upgrade (5 task creati)
- **#44**: Re-add nodejs repo per noble (`curl -fsSL setup_20.x | bash`).
  Bassa urgenza: Node 20 ancora installato, serve solo per aggiornamenti
  futuri.
- **#45**: Sweep `regex=` → `pattern=` in router FastAPI (deprecation).
  Media urgenza, non bloccante.
- **#46**: Pinning `requirements.txt` (`pip freeze > requirements-noble.txt`)
  per evitare sorprese future. Media urgenza.
- **#47**: Cleanup `venv-trgb.OLD-noble-20260427` dopo 24-48h di conferma
  stabilità. Bassa.
- **#48**: Aggiornare `docs/deploy.md` con sezione stack noble + procedura
  upgrade major. Media (FATTO in questa sessione, vedi sotto).

### Suggested commit (per docs)
`./push.sh "Sessione 59 chiusa — docs: upgrade Ubuntu 24.04 Noble + Python 3.12 + procedura upgrade in deploy.md"`

---

## SESSIONE 59 cont. d (2026-04-27) — MODULO K: UPLOAD UTENTE FUORI REPO + chiude D3

### Background
Bug D3 (foto Menu Carta non si vede nel modal preview) trascinato dal Modulo
D: file caricato correttamente sul VPS ma SW cachava la index.html sotto la
chiave del path foto, e i redeploy con `git clean -fd` cancellavano i file.
Fix tampone su sw.js insufficiente. Marco "prosegui in ordine" → ora K.

### Decisioni
- Path upload utente FUORI dal repo:
  - **Prod (VPS)**: `/home/marco/trgb_uploads/` (default)
  - **Dev (Mac/sandbox)**: `<repo>/static/uploads_dev/` (gitignored)
  - Override `TRGB_UPLOADS_DIR` env var.
- Mount FastAPI separato `/uploads` accanto a `/static`.
- Path nel DB diventa `/uploads/menu_carta/<eid>/<pid>.jpg`.
- **Compat read** dei path legacy `/static/menu_carta/...`: lasciati intatti
  nel DB; il mount `/static` continua a servirli. delete/get cercano in
  entrambi i path (resolve helper). Migrazione DB OPZIONALE, documentata.
- Detect environment (prod vs dev) automatico (presenza `/home/marco/trgb`
  o env `TRGB_ENV=prod`).

### File toccati
**Backend:**
- `app/utils/uploads.py` (NUOVO) — `get_uploads_dir()` + `ensure_subdir()` +
  `to_db_path()`. Detect env, env var override, crea cartella se mancante.
- `app/services/menu_carta_image_service.py` v1.0 → v1.1: usa helper, salva
  in `<UPLOADS>/menu_carta/...`, restituisce path `/uploads/...`. Aggiunto
  `_resolve_existing_path()` per delete/get che trovano file in entrambi i
  path (nuovo + legacy).
- `main.py` — mount `/uploads` con `check_dir=False` (non crasha se la
  cartella manca al boot, viene creata al primo upload). Stamp del path al
  boot per debug.

**Frontend:**
- `frontend/public/sw.js` — `isUserUpload()` ora bypassa anche `/uploads/`.
  `API_PATHS` aggiornati con `/lista-spesa/` e `/haccp/` (nuovi router K
  nei moduli precedenti, non bypassati prima).

**Config / docs:**
- `.gitignore` — `static/uploads_dev/` e `trgb_uploads/` (entrambi
  gitignored, doppia sicurezza).
- `docs/deploy.md` — nuova sezione 4.3 "Upload utente — directory
  persistente FUORI dal repo": setup VPS una-tantum, migrazione foto
  esistenti opzionale (cp -rn + UPDATE SQL), backup rclone.
- `docs/problemi.md` — D3 marcato ✅ RISOLTO con dettaglio della causa
  radice e soluzione.

### Verifica fatta
- py_compile uploads.py + menu_carta_image_service.py + main.py OK.
- Test runtime helper: `get_uploads_dir()` ritorna path corretto (in dev:
  `/sessions/.../static/uploads_dev`, creata al volo).
- `to_db_path("menu_carta", 12, "345.jpg")` → `/uploads/menu_carta/12/345.jpg` ✓
- `ensure_subdir("menu_carta", "999")` crea sotto-cartella, idempotente.
- sw.js parse OK (test con `new Function()` in node).

### Setup VPS post-push (UNA TANTUM)
1. SSH al VPS:
   ```
   ssh trgb
   mkdir -p /home/marco/trgb_uploads
   chown marco:marco /home/marco/trgb_uploads
   chmod 755 /home/marco/trgb_uploads
   ```
2. Restart backend (push.sh lo fa già). Log dovrebbe stampare:
   `📁 Upload utente: /home/marco/trgb_uploads`
3. Opzionale — migrazione foto esistenti:
   ```
   mkdir -p /home/marco/trgb_uploads/menu_carta
   cp -rn static/menu_carta/* /home/marco/trgb_uploads/menu_carta/ 2>/dev/null || true
   sqlite3 app/data/foodcost.db "
     UPDATE menu_dish_publications
        SET foto_path = REPLACE(foto_path, '/static/menu_carta/', '/uploads/menu_carta/'),
            updated_at = datetime('now')
      WHERE foto_path LIKE '/static/menu_carta/%';
   "
   ```

### Da verificare dopo push
1. Backend boot → log con `📁 Upload utente: /home/marco/trgb_uploads`.
2. Probe `curl -I https://trgb.tregobbi.it/uploads/` — atteso 200/403/404
   (mount esiste, non più 502).
3. Login → Menu Carta → carica una foto piatto nuova → file deve apparire
   in `/home/marco/trgb_uploads/menu_carta/<eid>/<pid>.jpg`. Path in DB
   con `/uploads/...`. Modal mostra preview correttamente. Click "Apri in
   nuova scheda" apre l'immagine reale (no rimbalzo a /).
4. Foto vecchie già in `static/menu_carta/`: continuano a funzionare via
   mount `/static` (compat read).

### Suggested commit
`./push.sh "Modulo K — Upload utente fuori repo: app/utils/uploads.py + mount /uploads + service refactor + sw.js bypass + risolve D3"`

---

## SESSIONE 59 cont. c (2026-04-27) — MODULO J: LISTA SPESA CUCINA (Fase 1 MVP)

### Background
Marco "prosegui" → modulo J. Roadmap già definiva 4.8 (Fase 1 MVP testuale) +
4.9-4.13 (Fase 2 link ingredienti/scorte/auto-da-menu). Le scorte ingredienti
oggi NON esistono in DB (ingredients ha solo anagrafica), quindi
l'auto-generazione "scorte basse + ricette pianificate − giacenze" della
spec iniziale richiederebbe prima un sotto-modulo giacenze. Decisione:
chiudo ora la Fase 1 MVP testuale (utile da subito), Fase 2 a iterazione
successiva.

### Decisioni
- DB: nuova tabella `lista_spesa_items` su `foodcost.db` (mig 105) con
  campi essenziali: titolo, quantita_libera (testo), urgente, fatto,
  fornitore_freeform (testo), ingredient_id NULLABLE FK (per Fase 2 4.9),
  note, metadata utenti.
- Router: nuovo `/lista-spesa/items/` con CRUD + filtri + bulk-delete
  completati. Ordinamento smart: non-fatti prima, urgenti in alto,
  recent first.
- Frontend: pagina sotto Gestione Cucina `/cucina/spesa`. Stile Home v3
  originale potenziato (palette orange cucina, font-playfair, RicetteNav).
  Form quick-add in alto, KPI 4-tile, filtri stato/urgenti/fornitore,
  raggruppamento per fornitore, modale edit, touch target 44pt.

### File toccati
**Backend:**
- `app/migrations/105_lista_spesa.py` (NUOVO) — CREATE TABLE IF NOT EXISTS
  `lista_spesa_items` + 3 indici. Idempotente.
- `app/routers/lista_spesa_router.py` (NUOVO) — `GET /lista-spesa/items/`
  (con filtri + KPI), `POST`, `PUT /{id}` (toggle fatto + completato_at/da
  automatici, edit fields), `DELETE /{id}`, `DELETE /` (bulk svuota
  completati). Schemi pydantic ListaSpesaItemIn/Update.
- `main.py` — import + `app.include_router(lista_spesa_router)`.

**Frontend:**
- `frontend/src/pages/cucina/ListaSpesa.jsx` (NUOVO) v1.0 — pagina con
  RicetteNav current="spesa" + 4 KPI tile (totale, da fare, urgenti aperti,
  completati) + form quick-add (titolo + quantità + fornitore + urgente) +
  filtri (segmented stato + toggle urgenti + cerca fornitore + svuota
  completati) + lista raggruppata per fornitore + modale edit. Checkbox
  toggle 7×7 con stato visivo distinto. Tutto touch-friendly (44pt).
- `frontend/src/pages/ricette/RicetteNav.jsx` — voce "🛒 Spesa" tra
  "Ingredienti" e "Selezioni".
- `frontend/src/App.jsx` — lazy import + Route `/cucina/spesa` con
  `ProtectedRoute module="ricette" sub="spesa"`.
- `frontend/src/config/modulesMenu.js` — voce "Lista Spesa" sotto
  Gestione Cucina.
- `frontend/src/config/versions.jsx` — nuovo `listaSpesa: 1.0 alpha`.
- `app/data/modules.json` — sub `spesa` (admin/chef/sous_chef/commis).

### Verifica fatta
- py_compile mig+router+main OK.
- Dry-run mig 105 su copia foodcost.db: tabella creata, idempotente.
- esbuild ListaSpesa.jsx + App.jsx OK.

### Backlog Modulo J (iterazioni successive)
- J.4 — Fase 2 link ingrediente + storico prezzi (4.9): typeahead su
  ingredients, click item → modal storico prezzi + ultimo fornitore.
- J.5 — Fase 2 vista per fornitore + WhatsApp veloce (4.10): bottone WA
  che genera messaggio "ciao FORNITORE, ci servirebbe X..." via M.C composer.
- J.6 — Fase 2 generazione automatica da menu pranzo (4.11): "Genera
  spesa per W18" legge ricette del menu, somma yield ingredienti, append
  alla lista. Bottone in compositore Pranzo.
- J.7 — Template ricorrenti (4.12): usa skill schedule, genera lista
  settimanale.
- J.8 — Workflow ordinato/in_arrivo/ricevuto (4.13): matching XML fatture.

### Da verificare dopo push
1. Migrazione 105 deve girare al boot del VPS — log `[105] lista_spesa_items: tabella pronta`.
2. Login → Gestione Cucina → nuova entry "🛒 Spesa" nella RicetteNav top.
3. `/cucina/spesa`: form quick-add, aggiungi 3-4 voci di test, marca una
   urgente, una fatta. KPI in alto si aggiornano.
4. Filtro "Da fare/Fatti/Tutti" funziona; toggle "Solo urgenti" filtra.
5. Cambio fornitore → raggruppamento dinamico per fornitore.
6. Click su voce → modale edit con tutti i campi modificabili.
7. "Svuota completati" elimina solo le voci con fatto=1.

### Suggested commit
`./push.sh "Modulo J (Fase 1 MVP) — Lista Spesa Cucina: mig 105 + /lista-spesa/items + pagina /cucina/spesa con CRUD, filtri, raggruppamento fornitore, urgenti"`

---

## SESSIONE 59 cont. b (2026-04-27) — MODULO I: LOOP HACCP COMPLETO (iter 1)

### Background
Dopo Modulo H (Dashboard Cucina chef), Marco "prosegui in ordine" → Modulo I.
Il modulo Cucina/Tasks MVP esiste dalla sessione 43 (DB tasks.sqlite3 con
checklist_template + instance + execution + task_singolo). Mancava la chiusura
del loop: una vista aggregata mensile per chef/admin con compliance, eventi
critici, top FAIL — utile sia operativamente che come base per il futuro PDF
registro mensile firmabile (rimandato a I.4 successiva).

### Scope iter 1 (questa pass)
- Solo aggregazione + UI consultiva. NO PDF, NO foto+firma su FAIL (richiede
  Modulo K Upload utente fuori repo prima).

### Decisioni
- Service `haccp_report_service.py` read-only su `tasks.sqlite3`.
- Router separato `haccp_router.py` con prefix `/haccp` (NO sotto `/tasks`
  per separare dominio audit dal dominio operativo).
- Pagina frontend invece sotto `/tasks/haccp` (UX coerente: chef apre Task
  Manager e trova il report lì, niente nuova top-level entry).
- Sub-key `haccp` aggiunto a modules.json sotto `tasks` (ruoli admin/chef/
  sous_chef — il commis non vede il report ma solo l'agenda).
- Stile pagina: Home v3 originale potenziato (KPI tile tintate, Section card
  brand-cream, font-playfair sui titoli, palette brand-red coerente con il
  resto di Task Manager).

### File toccati
**Backend:**
- `app/services/haccp_report_service.py` (NUOVO) — `compute_monthly_report
  (anno, mese)` ritorna kpi/per_reparto/compliance_giornaliera/top_item_fail/
  eventi_critici/giornate_senza_dati. + helper `list_critical_events_recent
  (giorni)` per future widget.
- `app/routers/haccp_router.py` (NUOVO) — `GET /haccp/report/{anno}/{mese}`
  + `GET /haccp/report/recent-events?giorni=7`. Auth richiesta. Validazione
  range mese e blocco mese futuro.
- `main.py` — import + `app.include_router(haccp_router)`.

**Frontend:**
- `frontend/src/pages/tasks/ReportHACCP.jsx` (NUOVO) — Pagina con selettore
  mese + 6 KPI tile (compliance, istanze, eventi critici, FAIL, scadute,
  gap registro) + 2 sezioni affiancate (per_reparto bar chart, top FAIL) +
  tabella eventi critici + serie temporale compliance giornaliera + lista
  giornate gap. Pattern Home v3 potenziato.
- `frontend/src/pages/tasks/Nav.jsx` — nuova entry "📊 Report HACCP" tra
  Task e Template, autoActive aggiornato per pathname `/tasks/haccp`.
- `frontend/src/App.jsx` — lazy import + Route con `ProtectedRoute
  module="tasks" sub="haccp"`.
- `frontend/src/config/modulesMenu.js` — voce "Report HACCP" sotto Task
  Manager.
- `frontend/src/config/versions.jsx` — `tasks 1.3 → 1.4`, nuovo
  `haccp 1.0 alpha`.
- `app/data/modules.json` — sub `haccp` aggiunto.

### Verifica fatta
- py_compile service+router+main OK.
- esbuild ReportHACCP.jsx + App.jsx OK.
- Logica SQL: aggregazioni testate mentalmente contro lo schema mig 084
  (stati validi: INSTANCE_STATI={APERTA,IN_CORSO,COMPLETATA,SCADUTA,SALTATA}
  EXEC_STATI={OK,FAIL,SKIPPED,PENDING}). Compliance % esclude SALTATE dal
  denominatore. Eventi critici filtra `tipo IN ('TEMPERATURA','NUMERICO')`
  con valore fuori `[min_valore, max_valore]`. Gap registro non considera
  giorni futuri.

### Backlog Modulo I (iterazioni successive)
- I.4: PDF registro mensile firmabile (WeasyPrint, Service haccp_pdf_service)
- I.5: Foto + firma su item FAIL (richiede Modulo K Upload prima)
- I.6: Scadenze documenti staff con alert (es. corso HACCP) — lega 6.5
  roadmap

### Da verificare dopo push
1. Backend boot: `[haccp_router]` registrato senza errori. Probe:
   `curl -I https://trgb.tregobbi.it/haccp/report/recent-events` → 401
   (auth richiesta) — corretto.
2. Login → Task Manager → tab "📊 Report HACCP" appare nella nav top.
3. Apri `/tasks/haccp` → mese corrente preselezionato → KPI con valori
   reali (probabilmente bassi, niente cronologia in produzione fresca).
4. Selettore mese: prev/next funziona, blocco su mese futuro.
5. Top FAIL e eventi critici: vuoti se niente FAIL/temperature anomale —
   mostra messaggio "✓ nessun problema".
6. Gap registro: lista giorni del mese corrente senza istanze (probabile
   se i template non sono attivi).

### Suggested commit
`./push.sh "Modulo I (iter 1) — Loop HACCP report mensile: backend /haccp/report + pagina /tasks/haccp con compliance, eventi critici, top FAIL, gap registro"`

---

## SESSIONE 59 cont. (2026-04-27) — MODULO H: DASHBOARD CUCINA CHEF

### Background
Dopo aver chiuso M.6 (Piano rate esteso), Marco ha detto "ripartiamo in ordine"
sui moduli pendenti dell'audit cucina. Modulo H = Dashboard Cucina chef: una
vista operativa giornaliera per il chef, complementare alla `RicetteDashboard`
(che è analitica food cost). La RicetteDashboard rimane com'è — rinominata in
"Dashboard FC" nei menu — e affiancata da una nuova `DashboardCucina` con
focus sull'oggi: cosa serve sapere appena entri in cucina al mattino.

### Decisioni
- Pagina nuova `/cucina/dashboard` (NON estensione di RicetteDashboard).
- Sub-route `cucina_dashboard` registrato in `modules.json` (ruoli: admin,
  chef, sous_chef, commis).
- Backend: nuovo endpoint `GET /dashboard/cucina` aggregatore — ritorna in
  un'unica chiamata pranzo oggi+7gg, carta attiva, alert allergeni, KPI
  ricette, ricette modificate ultimi 7gg, ingredienti senza prezzo.
- Filtri intelligenti: alert allergeni esclude le righe testuali della carta
  (`recipe_id IS NULL`) come "Coperto", "Acqua", "Raccontati a voce" — non
  sono piatti veri quindi non hanno senso nell'alert.

### File toccati
**Backend:**
- `app/routers/dashboard_router.py` — nuovo `GET /dashboard/cucina` in fondo
  al file (in coda agli endpoint esistenti).

**Frontend:**
- `frontend/src/pages/cucina/DashboardCucina.jsx` (NUOVO) — pagina con
  PageLayout + header KPI 5 card + grid 2 colonne (Pranzo · Carta · Alert
  Allergeni · Ricette modificate) + barra azioni rapide. Pattern coerente
  con M.I primitives (Btn, PageLayout, EmptyState).
- `frontend/src/App.jsx` — lazy import `DashboardCucina` + Route
  `/cucina/dashboard` con `ProtectedRoute module="ricette" sub="cucina_dashboard"`.
- `frontend/src/config/modulesMenu.js` — voce "Dashboard Cucina" come prima
  entry sub di Gestione Cucina, "Dashboard" rinominato "Dashboard FC".
- `frontend/src/config/versions.jsx` — `ricette: 3.11 → 3.12` + nuovo
  `cucinaDashboard: 1.0 alpha`.
- `app/data/modules.json` — sub `cucina_dashboard` aggiunto + label
  "Dashboard" → "Dashboard FC" per chiarezza.

### Verifica fatta
- `py_compile dashboard_router.py` OK.
- `esbuild DashboardCucina.jsx` + `esbuild App.jsx` OK (solo warning innocui
  su `import.meta` in iife — è il check non runtime).
- Test SQL diretto sul DB locale: pranzo oggi (1 menu bozza, 6 righe), carta
  attiva (Primavera 2026, 36 publications), KPI ricette (48 attive, 14 basi,
  34 piatti, 5 senza prezzo), alert allergeni (5 contorni reali — ignora
  righe testuali), 82 ingredienti senza prezzo, 5 ricette modificate ultimi
  7gg.

### Da verificare dopo push
1. Login → menu Gestione Cucina → "Dashboard Cucina" deve essere prima voce
   del sub-menu.
2. Apri `/cucina/dashboard` → verifica che si carichi con dati reali.
3. KPI in alto coerenti; widget Pranzo Oggi mostra 6 piatti bozza con prezzi
   15/25/35; Carta cliente "Primavera 2026" con 36 piatti; alert allergeni
   con 5 contorni; 5 ricette modificate.
4. Click su una ricetta nei "modificate recentemente" o "alert allergeni"
   apre la scheda ricetta.
5. Click "Apri carta cliente pubblica" apre `/carta/menu` in nuova tab.
6. Pulsanti azioni rapide in fondo navigano correttamente.

### Iter 2 (stessa sessione, post-feedback Marco) — H v1.1 refactor stile
Marco: "ok buon inizio MA NON HAI RISPETTATO LA REGOLA DI MANTENERE IL DESIGN
UGUALE.. manca la barra menu". Mancavano due cose:
1. **Sub-nav RicetteNav**: la pagina non aveva la barra di navigazione del
   modulo cucina. Aggiunta come prima entry "🍳 Cucina" → `/cucina/dashboard`
   in `RicetteNav.jsx` (e rinominata "Dashboard" → "Food Cost" per chiarezza).
2. **Stile Home v3 originale potenziato**: la pagina usava `PageLayout` con
   card bianche neutre e font sistema. Refactor totale a v1.1:
   - Wrapper `<div className="min-h-screen bg-brand-cream">` + `<RicetteNav>`.
   - Header con saluto contestuale (`Buongiorno/pomeriggio/sera, {nome} 🍳`)
     in `font-playfair text-orange-900` 2xl/3xl + data lunga italiana.
   - 5 KPI tile con sfondo tintato (`bg-orange-50`/`bg-indigo-50`/...),
     border colorato coordinato, emoji 28px, valore tabular extrabold,
     border-radius 14px, shadow Home v3 `0 2px 10px rgba(0,0,0,.06)`.
   - 4 Section card con stesso pattern (Pranzo amber, Carta indigo, Alert
     red/emerald, Ricette modificate bianca neutra). Header sezione con
     emoji 24px + titolo `font-playfair`.
   - Barra "Azioni rapide" con tile colorati coordinati al modulo target
     (Menu Pranzo amber, Menu Carta indigo, Archivio orange, Food Cost
     blue, Ingredienti emerald, Nuova ricetta neutral). Touch target 44pt.
   - StatoBadge palette tintata (no più styling neutro tailwind shadcn-like).
   - `TrgbLoader` come loader iniziale invece di testo statico.

### File toccati Iter 2
- `frontend/src/pages/cucina/DashboardCucina.jsx` v1.0 → v1.1 (refactor
  totale: rimosso PageLayout/Btn/EmptyState, aggiunti RicetteNav + KpiTile +
  Section + QuickAction custom + TrgbLoader).
- `frontend/src/pages/ricette/RicetteNav.jsx` — aggiunta entry "🍳 Cucina"
  come prima voce, rinominata "Dashboard" → "Food Cost" per evitare
  ambiguità tra le due dashboard.

### Suggested commit
`./push.sh "Modulo H v1.1 — refactor stile Home v3 originale potenziato (KPI+Section card tintate, font-playfair, brand-cream) + RicetteNav con entry Cucina"`

---

## SESSIONE 59 (2026-04-27) — MODULO M.6: PIANO RATE PER TUTTE LE SPESE FISSE

### Background
Marco ha rilevato un bug UX su una spesa fissa di tipo `RATEIZZAZIONE` ("Tassa
Rateizzazione Fondo Est rif. N°572"): nel form Modifica Spesa Fissa ha inserito
2525€ pensando fosse il totale da dividere tra le 21 rate, ma il sistema usa
quell'importo come *importo per ogni periodo* — risultato: 21 uscite generate da
2525€ cad invece che il totale 2525€ diviso in 21. Inoltre, sebbene il bottone
"Piano" fosse disponibile per le RATEIZZAZIONI, il modale appariva vuoto perché
le uscite erano state generate dal job periodico delle spese fisse (che NON
popola `cg_piano_rate`), non dal wizard di rateizzazione.

### Decisione (confermata da Marco)
Estendere il concetto di **Piano rate a TUTTE le spese fisse** (non più solo
PRESTITO/RATEIZZAZIONE), in modo che:
1. Il bottone "Piano" sia visibile per ogni spesa fissa attiva.
2. Quando il piano è vuoto ma esistono già `cg_uscite` per quella spesa, il
   backend auto-popola `cg_piano_rate` derivandole dalle uscite esistenti.
3. Una volta popolato, l'utente può: modificare singoli importi, modificare
   singole scadenze, oppure usare un nuovo widget **Ricalcola dividendo X
   totale per N rate non pagate** per dividere uniformemente un totale tra le
   rate non ancora pagate (rispettando quanto già versato).
4. Nel form Modifica Spesa Fissa, l'icona ℹ accanto al campo Importo chiarisce
   che si tratta di importo per periodo, non totale.

### File toccati
**Backend:**
- `app/routers/controllo_gestione_router.py` — `GET /spese-fisse/{id}/piano-rate`
  con auto-popolamento da `cg_uscite` quando `cg_piano_rate` è vuoto. Estrae
  numero_rata da nota se nel formato "Rata N/M", altrimenti enumera 1..N.

**Frontend:**
- `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx`
  - Bottone "Piano" sempre visibile per spese fisse attive (label tooltip
    differenziata per PRESTITO/RATEIZZAZIONE vs altri tipi).
  - Bottone "Storico" rimane per i tipi non-prestito/rateizzazione (i due
    bottoni sono complementari).
  - Tooltip ℹ accanto a label "Importo (€)" nel form: «Importo per ogni periodo
    (NON totale). Per dividere un totale tra N rate: salva, poi usa Piano →
    Ricalcola dividendo».
  - Nuovo state `pianoTotaleDividere` + funzione `ricalcolaDividendo()`.
  - Nuovo pannello giallo "↻ Ricalcola dividendo: € [input] per N rate non
    pagate [Applica]" sopra la tabella rate del modale Piano (visibile solo se
    ci sono rate non ancora pagate). Calcolo: `(totale - già_versato) / N rate
    non pagate`, applicato come `pianoEdits` in attesa di conferma con "Salva".
  - Header modale aggiornato per riflettere "Piano rate" generico per tipi
    diversi da PRESTITO/RATEIZZAZIONE.
- `frontend/src/config/versions.jsx` — `controlloGestione: 2.15 → 2.16`.

### Verifica fatta
- Edit puntuali coerenti con stack esistente (Tooltip già importato, pattern
  pianoEdits già adottato).
- Auto-popolamento idempotente: usa `INSERT` con try/except sull'UNIQUE
  `(spesa_fissa_id, periodo)`, quindi se per qualche motivo la query gira due
  volte non duplica nulla.
- Rate già pagate vengono ignorate dal "Ricalcola dividendo" (mantengono il
  loro importo storico) — coerente con il comportamento del POST piano-rate
  che già esclude `PAGATA / PAGATA_MANUALE / PARZIALE` dagli UPDATE.

### Da verificare dopo push
1. Apri Controllo Gestione → Spese Fisse → trova "Tassa Rateizzazione Fondo Est
   rif. N°572" → click "Piano". Devono apparire le 21 rate da 2525€ cad
   (auto-popolate al volo dal backend).
2. Inserisci nel campo "Ricalcola dividendo" il totale corretto (es. 2525) →
   Applica → tutte le rate non pagate diventano `2525/21 ≈ 120,24` cad.
3. "Salva modifiche" → controlla che le `cg_uscite` non pagate siano state
   aggiornate al nuovo importo.
4. Apri una spesa fissa di tipo AFFITTO o UTENZA → click "Piano" → deve mostrare
   le scadenze passate/future con i relativi importi (auto-popolati). Il
   bottone "Storico" resta disponibile in parallelo per la vista cronologica.
5. Form Nuova/Modifica Spesa Fissa → l'icona ℹ accanto a "Importo" mostra il
   tooltip al hover.

### Suggested commit
`./push.sh "M.6 — Piano rate esteso a tutte le spese fisse: auto-popola cg_piano_rate da cg_uscite, ricalcola dividendo, tooltip Importo + Piano sempre visibile"`
**Storico mini-sessioni dettagliato:** [`docs/sessione_archivio_39.md`](./sessione_archivio_39.md)

---

## SESSIONE 58 cont. (2026-04-26) — MODULO PRANZO DEL GIORNO

### Background
Marco oggi gestisce il menu del pranzo di lavoro a mano in Word (file storico
`2025-new-tregobbi-pranzo`). Vuole portare la gestione nel gestionale per:
1. Comporre il menu del giorno con piatti riusabili dal catalogo
2. Generare un PDF stampabile con brand cliente "Osteria Tre Gobbi"
3. Tenere un archivio storico dei menu pubblicati

### Decisioni prese (con Marco)
- **Approccio piatti**: ibrido — catalogo riusabile + righe ad-hoc ammesse.
- **Posizione modulo**: sub-voce di Gestione Cucina (route `/pranzo`, sub `pranzo`
  in `modules.json`). Niente modulo top-level.
- **Output**: PDF brand cliente Osteria Tre Gobbi (font Cormorant Garamond, sfondo
  bianco, logo `static/img/logo_tregobbi.png`) — coerente con carta vini cliente,
  NON brand TRGB-02 software.
- **Categorie**: piatti categorizzati nel DB (antipasto/primo/secondo/contorno/
  dolce/altro). PDF stampa lista flat ordinata per categoria, senza titoli sezione.

### Schema DB (mig 102, foodcost.db)
- `pranzo_piatti` — catalogo riusabile (id, nome, categoria, attivo, recipe_id NULL FK)
- `pranzo_menu` — menu del giorno con UNIQUE su `data`, prezzi 1/2/3, footer, stato bozza|pubblicato|archiviato
- `pranzo_menu_righe` — righe M:N con snapshot nome+categoria (piatto_id NULL se ad-hoc)
- `pranzo_settings` — riga unica id=1 con default titolo/sottotitolo/prezzi/footer
- Seed: 6 piatti dal Word di Marco (bresaola, scorzonera, fusilli cinghiale, plin,
  anatra, filetto). Prezzi default 15/25/35.

### File toccati
**Backend:**
- `app/migrations/102_pranzo_init.py` — schema + seed
- `app/repositories/pranzo_repository.py` — CRUD piatti, settings, upsert menu per data, archivio
- `app/routers/pranzo_router.py` — endpoint `/pranzo/piatti/`, `/pranzo/menu/`, `/pranzo/menu/{data}/`, `/pranzo/menu/{data}/pdf/`, `/pranzo/settings/`
- `app/services/pranzo_pdf_service.py` — generatore PDF brand cliente con WeasyPrint
- `static/css/menu_pranzo_pdf.css` — stile A4 Cormorant Garamond
- `main.py` — registrazione `pranzo_router.router`
- `app/data/modules.json` — sub `pranzo` aggiunto a `ricette`

**Frontend:**
- `frontend/src/pages/pranzo/PranzoMenu.jsx` — pagina con 4 tab (Oggi/Archivio/Catalogo/Impostazioni)
- `frontend/src/App.jsx` — route `/pranzo` con `ProtectedRoute module="ricette" sub="pranzo"`
- `frontend/src/config/modulesMenu.js` — voce "Menu Pranzo" sotto Gestione Cucina
- `frontend/src/config/versions.jsx` — `pranzo: 1.0 alpha`, `ricette: 3.5 → 3.6`

### Verifica fatta
- `python3 -m py_compile` backend OK
- `esbuild` frontend OK
- Dry-run mig 102 su copia foodcost.db: 4 tabelle create, 6 piatti seed, settings popolate
- Test repository end-to-end: list piatti, get_settings, upsert_menu (4 righe), get_menu_by_data, list_menu, build HTML PDF (no WeasyPrint locale, ma string-builder OK)

### Da verificare dopo push
1. Migrazione 102 deve girare al boot del VPS — controllare log per `[102] modulo Pranzo: 4 tabelle pronte`.
2. Sub-voce "Menu Pranzo" appare nel dropdown Header sotto Gestione Cucina.
3. `/pranzo` carica con 4 tab funzionanti.
4. Tab Oggi: data picker, scelta piatti dal catalogo (chip cliccabili), aggiunta riga ad-hoc, riordino con frecce, salva crea il menu.
5. Tab Archivio: elenco menu storici, click 📄 PDF apre il PDF in nuova tab, click ✏️ apre il menu in tab Oggi.
6. PDF: layout A4, logo Tre Gobbi, titolo, lista piatti centrata in maiuscolo, box Menù Business con 3 prezzi, footer.
7. Tab Catalogo: CRUD piatti, raggruppamento per categoria.
8. Tab Impostazioni: salvataggio default titolo/prezzi/footer.

### Note
- Nessun mattone nuovo introdotto. Il PDF cliente non passa per M.B (brand TRGB
  software): replica il pattern già usato dalla carta vini cliente con CSS
  dedicato. Razionale: il brand cliente vive separato dal brand software (vedi
  CLAUDE.md, sessione 28 palette TRGB-02).
- Il `recipe_id` su `pranzo_piatti` e' opzionale: oggi non collegato a nulla, ma
  prepara il terreno per legare i piatti alle ricette del food cost se in futuro
  Marco vorra' calcolare il margine del pranzo di lavoro.

### Iterazione 2 — Visione d'insieme + impostazioni in RicetteSettings (stessa giornata)

Marco, dopo la prima passata: "se aggiungi qualcosa in un modulo devi rispettarne
l'insieme — grafica, pulsanti, menu, dropdown, barra menu, docs" e "non perdere
mai la visione dell'insieme". Inoltre: "le impostazioni del Menu Pranzo spostale
nelle impostazioni della gestione cucina, in un sidebar dedicato".

Correzioni applicate:

**1. Sub-nav del modulo** — `frontend/src/pages/ricette/RicetteNav.jsx` ora
include la tab "Pranzo" (icona 🥙). Aggiunta in stessa sessione anche la tab
"Menu Carta" (icona 📜) che era stata dimenticata nella sessione 57.

**2. Coerenza visiva** — `PranzoMenu.jsx` ora ha lo stesso wrapper di
`RicetteArchivio` / `RicetteSettings`: niente `PageLayout`, ma
`<RicetteNav current="pranzo"/>` in cima + `bg-brand-cream` + card
`bg-white shadow-2xl rounded-3xl border-neutral-200 p-6 sm:p-8`. Header con
titolo Playfair `text-orange-900`. Palette interna `bg-stone-*` → `bg-neutral-*`
per matchare il modulo (orange come modulo color).

**3. Impostazioni dentro RicetteSettings** — la tab Settings di PranzoMenu e'
stata rimossa (resta a 3 tab: Oggi/Archivio/Catalogo). Le impostazioni vivono
ora in `frontend/src/pages/ricette/PranzoSettingsPanel.jsx`, montato come voce
`pranzo` (icona 🥙) nel `MENU` sidebar di `RicetteSettings`. Pattern stabilito:
ogni futura aggiunta a Gestione Cucina porta le sue impostazioni nello stesso
sidebar, niente tab Settings standalone.

**4. Docs dedicato** — creato `docs/modulo_pranzo.md` con design completo
(scopo, schema DB, endpoint, frontend, service PDF, workflow osteria, V1+).
Aggiunto al blocco "Documenti collegati" di sessione.md.

**5. Skill guardiano** — aggiornata `~/.claude/skills/guardiano/SKILL.md`
con un nuovo step "Visione d'insieme del modulo" nel pre-audit, che verifica
sub-nav, dropdown header, modules.json, versions, docs dedicato e palette.

**6. Memoria** — salvato feedback `feedback_visione_insieme.md` con la
checklist 6-punti.

### File toccati (iterazione 2)
- `frontend/src/pages/ricette/RicetteNav.jsx` — tab Pranzo + Menu Carta
- `frontend/src/pages/pranzo/PranzoMenu.jsx` — wrapper allineato, tab Settings rimossa, palette neutral
- `frontend/src/pages/ricette/PranzoSettingsPanel.jsx` — nuovo
- `frontend/src/pages/ricette/RicetteSettings.jsx` — voce `pranzo` nella sidebar
- `docs/modulo_pranzo.md` — nuovo design doc
- `docs/sessione.md` — questo blocco
- `~/.claude/skills/guardiano/SKILL.md` — step "Visione d'insieme"

### Iterazione 3 — Settimanalizzazione + pesca da ricette + pagina solo compositore (stessa giornata)

Marco, dopo aver guardato l'UI: 4 indicazioni in cascata che hanno richiesto un refactor profondo (mig 102 NON ancora pushata in prod, quindi riscritta in-place — niente mig 103 di adattamento):

**1. PDF a pagina singola, niente logo**
- `static/css/menu_pranzo_pdf.css` v1.1: `@page` margini 14×18mm, wrapper `.menu-page` con `height: 269mm` (area utile A4) + `page-break-inside/-after: avoid`. Lista piatti in flex column con `flex: 1 1 auto justify-center` per riempire/comprimere lo spazio.
- `app/services/pranzo_pdf_service.py`: rimosso `LOGO_PATH` e tag `<img>`, rimosso constant.

**2. Piatti pescati dalle `recipes` via service_type "Pranzo di lavoro"**
- Eliminata tabella `pranzo_piatti` dal modello (catalogo separato non serve, esiste gia' il pool ricette filtrato per service_type, mig 074).
- Repository: nuovo `list_piatti_disponibili()` con JOIN `recipes ⋈ recipe_service_types ⋈ service_types WHERE name='Pranzo di lavoro' AND active=1 AND r.is_active=1 AND COALESCE(is_base,0)=0`. Ordinamento per `recipe_categories.sort_order` poi `menu_name` (fallback `name`).
- Mappatura categoria: `recipe_categories.name` (Antipasto/Primo/...) → categoria semantica pranzo (antipasto/primo/...). Voci non riconosciute → "altro".
- `pranzo_menu_righe` ora ha `recipe_id` (FK opzionale a `recipes` ON DELETE SET NULL) invece di `piatto_id`. Snapshot `nome` + `categoria` ancora salvati (per archivio storico se la ricetta viene rinominata/eliminata).
- Endpoint nuovo: `GET /pranzo/piatti-disponibili/`. Endpoint catalogo (`/piatti/`) rimossi.

**3. Menu SETTIMANALE invece che giornaliero, con vista Programmazione**
- `pranzo_menu`: chiave UNIQUE su `settimana_inizio` TEXT (lunedi YYYY-MM-DD) invece di `data`.
- Helper `lunedi_di(iso)` nel repo + `lunediDi(iso)` lato frontend: normalizza qualsiasi giorno della settimana al lunedi corrispondente. Marco puo' picckare un giorno qualsiasi dal date input HTML5 e il sistema risale al lunedi.
- Endpoint `GET /pranzo/menu/{settimana}/` accetta qualsiasi giorno della settimana.
- Endpoint nuovo `GET /pranzo/programmazione/?n=8&fino_a=YYYY-MM-DD` ritorna le ultime N settimane CON le righe per la vista comparativa.
- Frontend tab "Programmazione" mostra le N settimane in colonne side-by-side, raggruppate per categoria. Default 8 settimane (selezionabile 4-52). Permette di cogliere a colpo d'occhio cosa e' stato proposto e non ripetersi.
- PDF testata: `_format_settimana(monday_iso)` produce stringhe del tipo "Settimana del 27 aprile - 1 maggio 2026" o "Settimana del 27 aprile - 3 maggio 2026" se a cavallo di mese.

**4. Prezzi/testata/footer SOLO in Impostazioni — pagina e' solo compositore**
- Rimossi prezzo_1/2/3, titolo, sottotitolo, footer_note, stato, da `pranzo_menu`. Schema piu' magro.
- I default vivono SOLO in `pranzo_settings` (riga unica id=1). Nessun override per settimana.
- `pranzo_pdf_service.py`: legge testata/prezzi/footer SEMPRE da `settings`, mai dal menu.
- Frontend `PranzoMenu.jsx` v2.0 e' un compositore puro: 2 tab (Settimana / Programmazione), niente form prezzi/testata/footer/stato. Link `⚙️ Impostazioni →` rimanda a `/ricette/settings`. Link `📚 Gestisci ricette →` a `/ricette/archivio`.
- `PranzoSettingsPanel.jsx` (gia' esistente in iterazione 2) resta com'era — i campi che stavano nella tab Settings rimossa sono gia' presenti qui.

### Verifica iterazione 3
- `python3 -m py_compile` backend OK.
- `esbuild` frontend OK (PranzoMenu v2.0 ridotto da 32kb a 23kb dopo tagli).
- Dry-run mig 102 su copia foodcost.db: 3 tabelle (`pranzo_menu`, `pranzo_menu_righe`, `pranzo_settings`), schema corretto.
- Test repository: `lunedi_di('2026-04-30')` → `2026-04-27` (giovedi → lunedi stessa settimana ISO). `upsert_menu` funziona, `list_menu` ritorna archivio, `list_programmazione(n=4)` ok.
- Test PDF HTML: contiene "Settimana del 27 aprile", piatti, "15€", nessun `<img>`, wrapper `menu-page`.

### Da verificare dopo push (iterazione 3)
1. Mig 102 al boot VPS: log `[102] modulo Pranzo settimanale: 3 tabelle pronte`.
2. Marco entra in `/ricette/archivio`, apre una ricetta esistente (es. fusilli), tab/sezione tipi servizio: spunta "Pranzo di lavoro", salva. Verifica che la ricetta compaia nel pool di `/pranzo`.
3. `/pranzo` tab Settimana: il date picker carica la settimana corrente, il pool mostra le ricette appena marcate, click su una chip aggiunge una riga. Salva → "Crea menu settimana".
4. Click 📄 PDF: si apre PDF con testata "Settimana del DD - DD MMMM YYYY", lista piatti, box Menù Business con i prezzi delle Impostazioni Cucina, footer.
5. Tab Programmazione: vede le settimane come colonne side-by-side. Cambia il selettore a 4/12/26 settimane.
6. Impostazioni Cucina sidebar "Menu Pranzo": cambia un prezzo o il titolo, salva. Rigenera il PDF della settimana → vede il nuovo valore (perche' il PDF legge sempre da settings, mai snapshot per-settimana).

### File toccati (iterazione 3)
- `app/migrations/102_pranzo_init.py` — riscritta v2.0 (no pranzo_piatti, settimana_inizio, recipe_id, no override)
- `app/repositories/pranzo_repository.py` — riscritta: `list_piatti_disponibili`, `lunedi_di`, settimanale, `list_programmazione`
- `app/routers/pranzo_router.py` — riscritta v2.0: niente CRUD piatti, niente prezzi/testata nei payload, endpoint `/piatti-disponibili/` e `/programmazione/`
- `app/services/pranzo_pdf_service.py` — riscritta v2.0 settimanale, niente logo, legge tutto da settings
- `static/css/menu_pranzo_pdf.css` — v1.1 pagina singola
- `frontend/src/pages/pranzo/PranzoMenu.jsx` — v2.0 compositore puro, 2 tab
- `docs/modulo_pranzo.md` — aggiornare con nuovo modello (vedi iter 3)
- `docs/sessione.md` — questo blocco

### Note iterazione 3
La tabella `pranzo_piatti` (catalogo separato) era stata creata in iterazione 1 e mai usata in prod. Riscriverla via mig 102 era sicuro perche' la mig non era mai girata sul VPS. Se in futuro si scoprisse che il pool ricette non basta (es. piatti senza ingredienti che non si vogliono creare come ricetta), si potra' reintrodurre con una tabella `pranzo_piatti_ad_hoc` complementare al pool ricette.

### Iterazione 4 — RicetteNuova: ingredienti opzionali + form riorganizzato

Marco: "quando vado a salvare una ricetta mi impone di aggiungere un ingrediente, ma talvolta sono dei placeholder per dei piatti da usare in menu o pranzo; quindi senza ricetta compilata" + "Va sistemato un po quel form se vai a toccarlo" + "Rendilo coerente con le grafiche che stiamo usando" + "Organizzalo meglio".

Soluzione: il backend (`POST /foodcost/ricette`) gia' accetta lista items vuota — il vincolo era solo lato frontend (`RicetteNuova.jsx` righe 141 e 157). Tolto + form riscritto.

**v3.0 RicetteNuova.jsx**:
- Ingredienti OPZIONALI: lista vuota crea un piatto "placeholder" per uso in menu carta / menu pranzo senza scheda food cost.
- Resa default `1 porzione` (prima era required > 0): per piatti placeholder Marco non deve riempire la resa, parte ok.
- Riorganizzato in 5 sezioni nette:
  1. Anagrafica (nome interno, categoria, flag ricetta base)
  2. Nome cliente & menu (nome menu, descrizione, tipi servizio chips) — solo se NON base
  3. Resa & prezzo (resa, unita, prezzo vendita, tempo prep)
  4. Composizione (opzionale, con badge "⚠ Piatto placeholder" se vuoto)
  5. Note interne
- Helper components `<Section>` e `<Field>` per ridurre il rumore JSX e uniformare titoli/hint.
- Palette allineata: tutte le sezioni `bg-neutral-50 border-neutral-200 rounded-xl`. La sezione "Nome cliente & menu" ha accent `border-orange-200 bg-orange-50/40` per evidenziarla (era amber/giallo prima — off-pattern). Chip tipo servizio attivo: `bg-orange-100 border-orange-300 text-orange-900` (era amber-600 bianco).
- CTA salva: `<Btn>` primary del modulo (prima era "chip amber"). Label dinamica: "Salva ricetta" oppure "Salva piatto placeholder" se nessun ingrediente.
- Hint visibile sui tipi servizio: "Spunta 'Pranzo di lavoro' per aggiungere il piatto al pool del modulo Menu Pranzo" — chiude il loop UX col modulo Pranzo.
- Wrapper esterno coerente con RicetteArchivio/RicetteSettings: `<RicetteNav current="archivio">` + `bg-brand-cream` + card `shadow-2xl rounded-3xl border-neutral-200 p-6 sm:p-8`.

**Da fare in futuro:** stesso refactor su `RicetteModifica.jsx` (oggi simile a v2.1 di Nuova). Marco non l'ha chiesto esplicitamente; aspetto che ci tocchi.

### File toccati (iterazione 4)
- `frontend/src/pages/ricette/RicetteNuova.jsx` v3.0 — riscritta

### Iterazione 5 — Allineamento PranzoMenu al design Gestione Turni + filtro pool scalabile

Marco: "il design della settimana copialo dai turni" + "il filtro per selezionare i piatti devi farlo diverso, diventeranno tanti" + "programmazione ok (guarda sempre design da gestione turni)".

**Pattern UI replicato da `frontend/src/pages/dipendenti/FoglioSettimana.jsx` e `PerDipendente.jsx`**:
- Toolbar 3-sezioni: LEFT navigazione settimana ◀ [range · W##] ▶ Oggi · CENTER segmented control "Settimana | Programmazione" · RIGHT azioni dinamiche pubblicate dal componente attivo
- ISO week format `YYYY-Www` come label informativa accanto al range (es. "27 apr – 1 mag 2026 · W18"). Backend continua a salvare `settimana_inizio` come lunedi YYYY-MM-DD: l'ISO week vive solo come display
- Card bianca contenuto su `bg-brand-cream`, max-width 1600px (come turni)
- Touch target 44pt (`min-h-[44px]`) come da pattern turni
- "Copia da settimana precedente" come azione rapida nel compositore (analogo a "Copia settimana" dei turni)

**Layout compositore (replica del 1fr + 360px panel di FoglioSettimana)**:
- Colonna principale: lista righe del menu con sort/move/categoria/elimina
- Side panel (laterale su desktop, sotto su mobile): pool ricette con search

**Pool piatti — filtro scalabile (rimpiazza le chip flat)**:
- Search input testuale (filtra su `nome` e `menu_description`) con icona ⌕ e bottone di clear
- Select categoria singolo (Tutti / Antipasto / Primo / Secondo / ...)
- Lista raggruppata per categoria con header "ANTIPASTO · 3", scrollabile (max-h 320px)
- Ogni riga: nome del piatto + label "+ aggiungi" a destra, hover orange-50
- Counter "X di Y" mostra quanti piatti matchano il filtro corrente
- Pensato per scalare a 50-100 ricette pranzo: il search dimensiona la lista, niente saturation di chip

**TabProgrammazione**: identica concettualmente alla griglia colonne di PerDipendente. Ogni colonna = una settimana, con label range + contatore piatti + ISO week (W##), raggruppata per categoria. Selettore N nella toolbar (4/6/8/12/16/26/52). Click PDF/elimina inline.

**Pattern "azioni dinamiche"**: i tab pubblicano le proprie azioni nella RIGHT della toolbar comune via `registerActions(node)`. Cosi' la toolbar resta una sola, ma le azioni cambiano per tab (Compositore: PDF · Copia prec. · Elimina · Salva. Programmazione: select N settimane · Aggiorna).

### File toccati (iterazione 5)
- `frontend/src/pages/pranzo/PranzoMenu.jsx` v3.0 — riscritta full

### Verifica iterazione 5
- esbuild OK (PranzoMenu 26.9kb dal precedente 22.8kb — atteso, aumenta per toolbar/filtri scalabili).
- Pattern verificato vs FoglioSettimana riga 469-484 (LEFT nav settimana) e righe 486-507 (segmented control) — replicato classe-per-classe.

### Da verificare dopo push (iterazione 5)
1. `/pranzo`: la toolbar e' identica nello spirito a `/dipendenti/turni` (◀ range · W## ▶ Oggi · segmented control · azioni a destra).
2. Click sulla settimana che già ha un menu: le righe si caricano. Click "📄 PDF" apre il PDF.
3. Click "📋 Copia prec.": carica le righe della settimana precedente nello stato corrente. Bisogna salvare per persistere.
4. Pool: digitare "ravioli" filtra a chi ha ravioli nel nome. Cambiare categoria a "Primo" mostra solo i primi.
5. Programmazione: settimane in colonne side-by-side (scroll orizzontale se molte). Cambiare il selettore a 4/12/26 settimane.

### Iterazione 6 — IngredientPicker typeahead + quick-create al volo

Marco: "A volte gli ingredienti non ci sono (nel senso che ancora non sono stati creati e matchati, devi trovare un modo migliore per gestirli. L'elencone con tutti gli ingredienti ha poco senso".

Nel form ricetta il select ingredienti era un dropdown con TUTTI gli ingredienti (potenzialmente centinaia post-import fatture XML). Due problemi:
1. Lista enorme = navigazione impossibile
2. Se l'ingrediente non c'è ancora (fattura non ancora importata, ingrediente non ancora matchato) bisognava uscire dal form, andare in `/ricette/ingredienti`, crearlo, tornare, riprendere

**v3.1 RicetteNuova.jsx — IngredientPicker + QuickCreateIngrediente**:

`<IngredientPicker>`:
- Pill cliccabile quando ingrediente già selezionato (mostra nome + unità default)
- Click → diventa input testuale typeahead, focus automatico
- Risultati filtrati su `name.includes(q)` con limite 12 visibili (no overflow)
- Hover orange-50, click → seleziona + propaga `default_unit` al campo `unit` della riga (se non già modificato dall'utente)
- Se la query non corrisponde a nessun ingrediente: bottone in coda alla lista "+ Crea 'foo' come nuovo ingrediente" (orange-50/40)
- Click outside chiude il dropdown

`<QuickCreateIngrediente>` (modal):
- Campi minimi: nome (precompilato dal testo digitato), unità default (g/kg/L/ml/cl/pz), categoria opzionale
- Endpoint: `POST /foodcost/ingredients/` (esiste già, accetta payload `{name, default_unit, category_id?}`)
- Su success: aggiunge alla lista locale `ingredienti`, seleziona automaticamente nella riga del form ricetta
- Niente prezzo: si aggiunge dopo nella pagina ingredienti (lo dico nel hint del modal)

**Endpoint usato**: `GET /foodcost/ingredients/categories` per popolare il select categoria del modal.

### File toccati (iterazione 6)
- `frontend/src/pages/ricette/RicetteNuova.jsx` v3.1 — IngredientPicker + QuickCreateIngrediente

### Verifica iterazione 6
- esbuild OK (RicetteNuova: 22.8kb → 31.5kb, atteso per nuovi componenti).
- Endpoint `/foodcost/ingredients/categories` confermato esistente in `foodcost_ingredients_router.py:242`.

### Da verificare dopo push (iterazione 6)
1. `/ricette/nuova`: cliccare "+ Ingrediente": appare un input typeahead invece del select grande.
2. Digitare "rabarbaro" (assumendo non esista): appare in coda "+ Crea 'rabarbaro' come nuovo ingrediente". Click → modal con nome precompilato. Salvare con unità "g" e nessuna categoria.
3. Tornati nel form: la riga ha "rabarbaro (g)" come ingrediente selezionato e l'unità della riga e' "g".
4. Cliccare la pill ingrediente: torna in modalita' typeahead per cambiarlo.
5. Verificare che salvando la ricetta la riga viene persistita correttamente (ingredient_id valorizzato).

### Backlog suggerito (post-iterazione 6)
- `RicetteModifica.jsx` ha lo stesso layout vecchio (non riorganizzato + select grande). Da portare a v3.1 quando lo si tocca.
- `IngredientPicker` potrebbe essere estratto in `frontend/src/components/IngredientPicker.jsx` se lo riusi altrove.

### Iterazione 7 — HOTFIX Load failed su /pranzo (mig 102 non girata sul VPS)

Marco ha fatto push dopo l'iter 5. Su `/pranzo` la pagina ha mostrato "Errore: Load failed" sul caricamento del menu della settimana, mentre il pool ricette caricava correttamente. Diagnosi: la mig 102 non era ancora stata eseguita sul DB di prod (foodcost.db sul VPS), quindi le tabelle `pranzo_menu`, `pranzo_menu_righe`, `pranzo_settings` non esistevano. Il pool ricette funzionava perché legge `recipes` (gia' esistente). La SELECT su `pranzo_menu` falliva con SQLite OperationalError → 500 → su Safari "Load failed" (network-level error percepito dal fetch).

**Fix robustness in `app/repositories/pranzo_repository.py`** (pattern preso da `vini_magazzino_db.init_magazzino_database`):
- Aggiunta funzione `_ensure_schema(conn)`: CREATE TABLE IF NOT EXISTS per le 3 tabelle + INSERT OR IGNORE settings id=1. Idempotente, gated da `_SCHEMA_READY` cache di processo (1 volta per worker FastAPI).
- Chiamata in tutti i metodi che leggono/scrivono `pranzo_*`: `get_settings`, `update_settings`, `get_menu_by_settimana`, `list_menu`, `list_programmazione`, `upsert_menu`, `delete_menu`. NON in `list_piatti_disponibili` (legge solo `recipes`).
- Cosi' il modulo Pranzo funziona anche se la mig 102 non e' ancora stata applicata: le tabelle vengono create al primo accesso. La mig esplicita resta per la traccia in `schema_migrations`.

### Verifica iterazione 7
- py_compile OK su tutti i moduli pranzo.
- Test ricreato lo scenario di prod: `foodcost.db` con TUTTE le tabelle `pranzo_*` droppate. Chiamate `get_settings`, `list_menu`, `get_menu_by_settimana`, `upsert_menu`, `list_piatti_disponibili` → tutte ritornano risposte valide, le 3 tabelle pranzo si materializzano al primo accesso.

### File toccati (iterazione 7)
- `app/repositories/pranzo_repository.py` — `_ensure_schema(conn)` + chiamate in 7 metodi

### Iterazione 8 — HOTFIX freeze pagina /pranzo (re-render cascata su register-callback)

Marco: "Lo da ancora, e quando sei sulla pagina pranzo sembra crashare tutto.. qualsiasi cosa clicco fuori non risponde". Sintomo: l'errore "Load failed" persiste E la pagina blocca i click anche fuori (header, link al resto del modulo). Diagnosi:

Il pattern v3.0 usava `registerActions(node)` per pubblicare le azioni del tab dentro la toolbar globale. Il child `TabCompositore` faceva `registerActions(<JSX>)` in un `useEffect`. Ogni volta che le dipendenze cambiavano, il child generava una nuova istanza JSX (nuovo riferimento), chiamava `setActionsState(newNode)` nel parent, il parent re-renderizzava, e il ciclo poteva ri-aprirsi se le useCallback non erano perfettamente stabili. Risultato: re-render in cascata che congela il main thread (fino al blocco completo della tab del browser).

**Fix v3.1 — riscrittura senza child component callback-based**:
- TabCompositore e TabProgrammazione **eliminati** come componenti separati. Tutta la logica vive nel root `PranzoMenu`.
- Niente `registerActions` / `setActionsState`. Le azioni del compositore (Ordina, Riga ad-hoc, Copia prec., PDF, Elimina, Salva) vivono in una sub-toolbar **dentro la card del compositore**, in alto a destra. Le azioni della programmazione (selettore N, Aggiorna) vivono nella card programmazione.
- Toolbar principale resta fissa: LEFT nav settimana, CENTER segmented control, RIGHT shortcut globali (Gestisci ricette, Impostazioni). Niente JSX dinamico passato child→parent.
- Effetti puliti: `useEffect(loadMenu)` triggera solo se `tab === "compositore"`; `useEffect(loadProgrammazione)` solo se `tab === "programmazione"`. Niente cross-trigger.
- `PoolPiatti` resta componente separato: il suo state e' **interamente locale** (q, cat), comunica col parent solo via `onPick` callback. Niente feedback al parent. Sicuro.

**Errori HTTP gestiti meglio**: il blocco `else` di loadMenu ora setta `setMenu(null); setRighe([])` insieme al messaggio. Cosi' anche se un 500 capita, la UI resta coerente e non blocca su uno state ibrido.

### File toccati (iterazione 8)
- `frontend/src/pages/pranzo/PranzoMenu.jsx` v3.1 — riscritta senza pattern register-callback

### Verifica iterazione 8
- esbuild OK (PranzoMenu 26.3kb dal 26.9, leggermente piu' magro).
- Confermato `grep registerActions` in PranzoMenu.jsx → 0 hit.
- Logica preservata: pool ricette con search/filtro, programmazione N settimane, design turni-style, copia da settimana precedente.

### Da verificare dopo push (iterazione 8)
1. `/pranzo`: la pagina non blocca i click. Cliccare il logo TRGB in alto, la nav-bar (Ricette/Ingredienti/etc) deve rispondere.
2. Se Load failed persiste: il fix iter 7 (`_ensure_schema`) crea le tabelle al volo, quindi il problema non dovrebbe ripresentarsi. Se ricapita, controllare console browser per stack trace 500.
3. Le azioni Ordina / Riga ad-hoc / Copia prec. / PDF / Elimina / Salva sono ora in alto a destra dentro la card "Piatti della settimana", non piu' nella toolbar globale.

### Iterazione 9 — Hardening Load failed: init al boot + endpoint diagnostico + tolleranza GET menu

Sintomo dopo iter 8: la pagina non crasha piu' (fix re-render OK), ma "Errore rete: Load failed" persiste sulla GET di `/pranzo/menu/{settimana}/`. Il pool ricette carica correttamente (3 di 3) → la rete e l'autenticazione funzionano. Quindi il problema sta in quello specifico endpoint.

**Diagnosi possibili**:
- Backend non aveva ancora il fix iter 7 (`_ensure_schema`) deployato → 500 → su Safari "Failed to fetch" (su 5xx con body strano puo' essere percepito come network error)
- Lock SQLite causato dal CREATE TABLE in race con altre query alla prima request
- 404 dell'endpoint che genera un body strano

**Mosse iterazione 9**:

1. **Init al boot** (`main.py`): chiamato `init_pranzo_db()` 1 volta al boot del backend, pattern identico a `init_magazzino_database` del modulo Vini. Cosi' le 3 tabelle pranzo esistono GIA' quando arriva la prima request, niente CREATE TABLE in race condition. La `_ensure_schema(conn)` resta nei singoli metodi del repo come safety net (gated da `_SCHEMA_READY`, gira 1 volta per processo).

2. **Endpoint diagnostico** `GET /pranzo/health` (no auth, public_router): ritorna `{ok, tables, n_settings, n_menu}`. Marco puo' aprirlo da browser per vedere se il backend pranzo risponde e se le tabelle ci sono. Esempio: `https://app.tregobbi.it/pranzo/health`.

3. **GET /menu/{settimana}/ tollerante**: niente piu' 404 quando la settimana e' vuota. Ritorna SEMPRE 200 con shape `{settimana_inizio, menu: null}`. Riduce le superfici di errore: il frontend non deve gestire un branch 404 separato.

4. **Frontend `loadMenu` aggiornato**: legge il nuovo shape `{settimana_inizio, menu}` e tiene compatibilita' col vecchio shape (caso "il backend non e' ancora stato deployato"). Aggiunto `console.error` nel catch e messaggio piu' utile: "Prova Ctrl+Shift+R; se persiste apri /pranzo/health".

### File toccati (iterazione 9)
- `main.py` — `init_pranzo_db()` al boot + include `pranzo_router.public_router`
- `app/repositories/pranzo_repository.py` — `init_pranzo_db()` esposto
- `app/routers/pranzo_router.py` — `public_router` con `/health` + GET menu sempre 200
- `frontend/src/pages/pranzo/PranzoMenu.jsx` — `loadMenu` legge shape `{menu}` con compat backend vecchio + log dettagliato

### Verifica iterazione 9
- py_compile OK su tutto.
- esbuild OK (PranzoMenu 26.7kb).
- Test boot init + nuovo shape: `init_pranzo_db()` setta `_SCHEMA_READY=True`, `get_menu_by_settimana('2026-04-20')` ritorna `None` su settimana vuota, `upsert_menu` funziona.

### Da verificare dopo push (iterazione 9)
1. **Test diagnostico**: aprire `https://app.tregobbi.it/pranzo/health` da browser. Atteso: JSON tipo `{"ok": true, "tables": ["pranzo_menu","pranzo_menu_righe","pranzo_settings"], "n_settings": 1, "n_menu": N}`. Se ritorna `{"ok": false, "error": "..."}` Marco mi manda lo screenshot dell'errore.
2. `/pranzo`: non deve piu' apparire "Errore rete: Load failed" sulla settimana vuota (ora ritorna 200 con menu null).
3. Console browser su `/pranzo` (Inspector → Console): se ci sono ancora errori, devono apparire log `[pranzo] loadMenu fail` con stack utile.
4. Log VPS al primo boot dopo push: deve apparire `[init] pranzo_db OK`. Se appare `[init] pranzo_db WARN: ...`, l'init al boot ha fallito ma il backend continua (le request fanno fallback a `_ensure_schema` al primo touch).

### Iterazione 10 — Workaround "Failed to fetch": endpoint by-week (query string) + UI degradabile

Sintomo dopo iter 9: "Errore rete: Load failed" persiste sull'endpoint `GET /pranzo/menu/{settimana}/` (path parameter). Il pool ricette continua a funzionare. La causa precisa non e' identificata, ma l'ipotesi e' un'idiosincrasia di routing/proxy sul path parameter con data ISO finale (`/menu/2026-04-20/`).

**Workaround pragmatico**:

1. **Backend nuovo endpoint** `GET /pranzo/menu/by-week/?settimana=YYYY-MM-DD`: stessa logica di `/menu/{settimana}/` ma usa query string invece di path parameter. Stesso shape di risposta `{settimana_inizio, menu}`. Il vecchio endpoint resta per backward compat.

2. **Frontend `loadMenu` con doppio tentativo**:
   - Prova `/pranzo/menu/by-week/?settimana=YYYY-MM-DD` come primo tentativo
   - Se fallisce (network o non OK), retry su `/pranzo/menu/{YYYY-MM-DD}/` come fallback compat backend vecchio
   - Se entrambi falliscono: `setMenu(null); setRighe([])` e log `console.error` ma niente messaggio rosso invasivo. La pagina rimane utilizzabile: si puo' comunque comporre dal pool e salvare.

3. **`copiaSettimanaPrecedente` aggiornata** col medesimo doppio tentativo.

4. **UI degradabile**: rimosso il banner rosso "Errore rete: Load failed" dal flusso di loadMenu. Ora il fail e' silente (visibile solo in console). La card "Piatti della settimana" mostra il suo empty state e Marco puo' continuare a lavorare.

### File toccati (iterazione 10)
- `app/routers/pranzo_router.py` — nuovo endpoint `GET /menu/by-week/`
- `frontend/src/pages/pranzo/PranzoMenu.jsx` — `loadMenu` doppio tentativo, `copiaSettimanaPrecedente` doppio tentativo, UI degradabile

### Verifica iterazione 10
- py_compile + esbuild OK (PranzoMenu 27.2kb).
- Logica preservata: la pagina ora mostra empty state se entrambi i tentativi falliscono, log dettagliato in console.

### Da verificare dopo push (iterazione 10)
1. `/pranzo`: l'errore "Load failed" non dovrebbe piu' essere visibile come banner. La pagina dovrebbe caricare la settimana.
2. Se il fix funziona: la causa era proprio il path-param. Da capire il perche' (proxy nginx? regex routing?).
3. Console browser: se compaiono `[pranzo] by-week non OK NNN` o `[pranzo] by-week fail`, mandarmi il dettaglio.

### Iterazione 11 — TROVATO il vero bug: schema vecchio sul VPS → 502 Bad Gateway

Diagnostica chiave: Marco apre `https://trgb.tregobbi.it/pranzo/health` e funziona (`tables: pranzo_piatti, pranzo_menu, pranzo_menu_righe, pranzo_settings`). MA in un'altra tab vede "502 Bad Gateway" → il backend crashava su una specifica request, non era proxy/CORS/path-param.

**Causa root**: la mig 102 v1 (con catalogo `pranzo_piatti`) era stata applicata sul VPS in passato. Quando ho riscritto la mig 102 v2 (settimanale, no catalogo) in iter 5, le tabelle restavano sul VPS con SCHEMA VECCHIO:
- `pranzo_menu` aveva `data UNIQUE`, NON `settimana_inizio`
- `pranzo_menu_righe` aveva `piatto_id`, NON `recipe_id`
- `pranzo_settings` mancava di varie colonne

`_ensure_schema(conn)` usava `CREATE TABLE IF NOT EXISTS`: trovava le tabelle esistenti, NON le ricreava. Poi tentava `CREATE INDEX ... ON pranzo_menu(settimana_inizio DESC)` → SQLite OperationalError "no such column" → eccezione → backend ritorna 500/timeout → nginx lo scarta come 502.

Il pool funzionava (`/piatti-disponibili/` legge solo `recipes`, non chiama `_ensure_schema`). La `health` funzionava (legge solo `sqlite_master`). Quindi sembrava un mistery, ma in realtà ogni endpoint che toccava le tabelle pranzo_* crashava.

**Marco ha cliccato "Crea menu" e funzionava** perché `_SCHEMA_READY` era già `True` (cache di processo) — `_ensure_schema` saltava — la POST faceva direttamente l'INSERT che, fortuitamente, le colonne richieste **erano gia' aggiunte** da qualche tentativo precedente di `_ensure_schema` (parziale prima del crash). O qualche worker era riuscito a portare il DB in stato compatibile. Comunque ora il fix copre tutti i casi.

**Fix iter 11 — soft migration in `_ensure_schema`**:
- Helper `_cols(cur, table)` → set delle colonne via `PRAGMA table_info`
- Per ogni tabella, dopo `CREATE TABLE IF NOT EXISTS`, ispeziona le colonne reali e fa `ALTER TABLE ADD COLUMN` per quelle mancanti.
- `pranzo_menu`: aggiunge `settimana_inizio` (con backfill da `data` se presente), `created_by`, `created_at`, `updated_at`. Indice su settimana_inizio creato DOPO l'ALTER.
- `pranzo_menu_righe`: aggiunge `recipe_id`, `categoria`, `ordine`, `note`, `nome` (le righe vecchie con `piatto_id` restano leggibili — la colonna piatto_id non interferisce).
- `pranzo_settings`: aggiunge tutte le 8 colonne mancanti con default coerenti.

**Bonus iter 11**:
- Endpoint diagnostico `GET /pranzo/smoke/{settimana}/` (no DB, no auth) per isolare proxy vs codice DB.
- Endpoint `GET /menu/by-week/` ora ha try/except con log e ritorna 200 con `{error: "..."}` invece di 500/502 in caso di problema.
- Stesso fix per `GET /menu/{settimana}/`.
- Query `get_menu_by_settimana` semplificata: rimosso il LEFT JOIN su `recipes` (non serviva, i campi `recipe_menu_name`/`recipe_name` non sono mai usati dal frontend).

### File toccati (iterazione 11)
- `app/repositories/pranzo_repository.py` — soft migration completa, query semplificata
- `app/routers/pranzo_router.py` — endpoint smoke + try/except con log su menu

### Verifica iterazione 11
- py_compile OK.
- Test scenario C (schema vecchio della mig 102 v1): soft migration aggiunge tutte le colonne mancanti, get/upsert/list funzionano. Le righe vecchie con `piatto_id` restano leggibili come `nome=NULL, categoria='altro'` (snapshot manca, ma non crasha).

### Da verificare dopo push (iterazione 11)
1. Log VPS al boot: serie di righe `[pranzo] aggiunta colonna ...` se schema vecchio. Una volta sole le 3 tabelle sono allineate, il backend sopravvive a ogni request.
2. `/pranzo/menu/2026-04-20/` o `/pranzo/menu/by-week/?settimana=2026-04-20` rispondono con 200 + JSON. Niente 502.
3. La pagina `/pranzo` carica senza banner errore, mostra il menu W17 salvato con 6 piatti.
4. Test: aprire `https://trgb.tregobbi.it/pranzo/smoke/2026-04-20/` (no auth) → deve rispondere `{"ok": true, "settimana_ricevuta": "2026-04-20", "endpoint": "smoke"}`.

---

## SESSIONE 58 (2026-04-25) — VINI QUICK WINS: bottiglia in mescita, ritmo+scarico, fix calice, validazioni

### Background
Audit logica consumo vini ha rivelato 4 problemi:
1. Vino con `VENDITA_CALICE='SI'` e ultima bottiglia "consumata" sparisce dalla carta calici, anche se ci sono ancora calici da vendere nella bottiglia aperta.
2. SCARICO non entrava nel ritmo di vendita: vendite registrate erroneamente come scarichi venivano perse dal KPI bt/mese.
3. Auto-calcolo PREZZO_CALICE non funzionava quando PREZZO_CARTA era valorizzato dal calcolo automatico (onBlur EURO_LISTINO).
4. Annata e grado alcolico senza validazione: si poteva inserire qualsiasi cosa.

### Soluzioni adottate (decise con Marco)

**1. BOTTIGLIA_APERTA (anti-fuga dalla carta calici)**
- Nuova colonna `BOTTIGLIA_APERTA INTEGER DEFAULT 0` su `vini_magazzino` (DB separato `vini_magazzino.sqlite3`).
- Migrazione esplicita `app/migrations/101_vini_bottiglia_aperta.py` + auto-migrazione idempotente in `init_magazzino_database()` (CREATE TABLE per nuove installazioni + ALTER TABLE per quelle esistenti).
- Schemi Pydantic `VinoMagazzinoBase` + `VinoMagazzinoUpdate` aggiornati.
- `load_vini_calici()` in `app/repositories/vini_repository.py` ora include `BOTTIGLIA_APERTA = 1` nel filtro: passa se qta>=soglia OR negative-mode OR bottiglia aperta.
- Toggle UI in scheda vino tab Giacenze, visibile solo se `VENDITA_CALICE='SI'`. Banner contestuale con istruzioni.
- Nuovo endpoint `GET /vini/magazzino/calici-disponibili/` che ritorna i vini con flag attivo.
- Nuovo widget riutilizzabile `frontend/src/components/widgets/CaliciDisponibiliCard.jsx` con lista compatta + toggle off rapido (✕ inline). Click su una riga apre la scheda vino. Integrato in:
  - `ViniVendite.jsx` (header sopra il form di registrazione vendita)
  - `DashboardSala.jsx` (col 2, sotto SelezioniCard, modalita' compact)

**2. Ritmo include VENDITA + SCARICO**
- `app/models/vini_magazzino_db.py` — query in `get_vino_stats()` cambiata da `tipo = 'VENDITA'` a `tipo IN ('VENDITA','SCARICO')`. Razionale (deciso con Marco): se la bottiglia non c'e' piu', conta come venduta ai fini del ritmo. RETTIFICA esclusa (e' valore assoluto, non delta).
- Nuovi campi nella response stats: `vendite_calici` (di cui mescita, conteggia VENDITA con nota `[CALICI]`) e `scarichi` (di cui scaricate non vendute).
- Frontend tab Statistiche del vino: nuova riga "di cui mescita N · scaricate M" sotto il count vendite.

**3. Fix auto-calcolo PREZZO_CALICE**
- `autoCalcPrezzo()` in SchedaVino: dopo aver settato `PREZZO_CARTA = data.prezzo_carta`, ora ricalcola anche `PREZZO_CALICE = round((carta/5) * 2) / 2` se `PREZZO_CALICE_MANUALE = 0`. Prima del fix il calice si aggiornava solo se l'utente digitava il prezzo carta a mano (perche' il setEditData programmatico non triggera l'onChange dell'input).

**4. Validazioni annata + grado**
- Componente `Input` esteso con prop `min, max, placeholder, hint`.
- Annata: `type="number" min={1900} max={anno_corrente+2}` + hint "solo anno a 4 cifre".
- Grado alcolico: `type="number" min={0} max={25} step={0.1}`.
- Hard validation in `saveEdit()` prima del PATCH: regex `^\d{4}$` su annata + range 0-25 su grado, blocco con messaggio user-friendly.

### File toccati
**Backend:**
- `app/models/vini_magazzino_db.py` — colonna BOTTIGLIA_APERTA in CREATE TABLE + ALTER nella migration leggera; query `get_vino_stats()` con SCARICO e nuovi campi vendite_calici/scarichi.
- `app/repositories/vini_repository.py` — `load_vini_calici()` filtro esteso.
- `app/routers/vini_magazzino_router.py` — schemi Pydantic + endpoint `GET /calici-disponibili/`.
- `app/migrations/101_vini_bottiglia_aperta.py` — nuova migrazione esplicita.

**Frontend:**
- `frontend/src/components/widgets/CaliciDisponibiliCard.jsx` — nuovo componente riutilizzabile.
- `frontend/src/pages/vini/SchedaVino.jsx` — toggle bottiglia in tab Giacenze + statistiche di cui mescita/scaricate + fix calice + validazioni annata/grado + Input esteso.
- `frontend/src/pages/vini/ViniVendite.jsx` — integrazione widget.
- `frontend/src/pages/DashboardSala.jsx` — integrazione widget.
- `frontend/src/config/versions.jsx` — Vini 3.22 → 3.23.

### Verifica
- `python3 -m py_compile` su backend OK.
- `esbuild` su tutti i frontend OK.

### Da verificare dopo push
1. La migrazione 101 deve girare al boot del VPS — controllare i log per `[101] BOTTIGLIA_APERTA pronta`.
2. Aprire un vino con `VENDITA_CALICE='SI'` in scheda vino tab Giacenze: deve apparire il toggle "Bottiglia in mescita".
3. Accenderlo, portare la giacenza a 0 (con uno SCARICO), controllare la carta calici: il vino deve restare visibile.
4. Spegnere il toggle: con giacenza 0, sparisce dalla carta calici come prima.
5. ViniVendite: comparire la card "🥂 Calici disponibili" sopra il form. Click su una riga apre la scheda vino.
6. DashboardSala (login come sala/sommelier): col 2 mostra "🥂 Calici al banco" sotto SelezioniCard.
7. Annata: provare a inserire "23" o "20XX" — deve dare errore al salva.
8. Grado: provare a inserire 50 — deve dare errore al salva.
9. Listino: cambiare valore, onBlur deve aggiornare prezzo carta E prezzo calice (se non manuale).
10. Tab Statistiche di un vino con calici registrati: deve mostrare "di cui mescita N · scaricate M" sotto il count vendite.

### Cose discusse ma rimandate (sessione/i futura/e)
Dopo il pushed, Marco ha messo in fila altre richieste su Gestione Vini che richiedono interventi piu' grossi e vanno pianificate a parte:
- **Più distributori/rappresentanti/listini per vino** (strutturale): tabella `vino_distributori` con record per coppia.
- **Famiglia vino che raggruppa annate** (strutturale): tabella `vini_famiglie` + foreign key, statistiche cross-annata.
- **Anagrafiche normalizzate** (medio-grosso): produttori, distributori, denominazioni in tabelle dedicate con autocomplete + dedup.
- **Vitigni con percentuali** (medio): tabella vitigni + join vino_vitigni con percentuale, somma=100%.

### Iterazione 2 — Allineamento CSS HTML al PDF (Fase 1 carta vini)

Marco: la pagina HTML `/vini/carta` era stata abbandonata. Estetica disallineata dal PDF cliente che gira su iPad. Vuole 2 fasi:
- **Fase 1**: allineare l'HTML al CSS PDF esistente (stessa identita' osteria, niente brand TRGB-02 — quello e' del software, non del cliente).
- **Fase 2** (futura): pagina dinamica moderna React con search/filtri/interazione (i mockup A+B+C mostrati restano base ispirazionale).

Fase 1 implementata (questa iterazione):

**`static/css/carta_html.css` riscritto da zero (294 righe → 280 con commenti)**:
- Conversione canonica pt → px (1pt ≈ 1.333px) per matchare il PDF dimensione per dimensione.
- Sfondo `#fdf8f0` (beige) → `#ffffff` (bianco come PDF).
- Body 15px → 16px (= 12pt PDF).
- Tipologia 22px → 21px (= 16pt PDF), con `text-transform: uppercase` e tracking 0.08em.
- Calici title 24px → 29px (= 22pt PDF).
- Aggiunte classi frontespizio: `.front-page`, `.front-logo`, `.front-title`, `.front-subtitle`, `.front-date`, `.front-version` (analoghe alla pagina di apertura del PDF).
- Tutte le classi Pattern A / B / C dei `bev-*` (carta bevande) riallineate ai pt esatti del PDF (10pt → 13px, 11pt → 15px, 13pt → 17px, ecc.).
- Body wrappato in max-width 210mm (A4) + padding 28mm × 22mm per simulare la pagina A4 sul browser.
- Aggiunto blocco `@media (max-width: 600px)` per mobile (consultazione iPad portrait / smartphone).

**`app/routers/vini_router.py` endpoint `/carta`**:
- Sostituito `<h1 class="title">OSTERIA TRE GOBBI — CARTA DEI VINI</h1>` con un `<div class="front-page">` che richiama il frontespizio del PDF (logo + titolo CARTA VINI + sottotitolo Osteria Tre Gobbi + data "Aggiornata al gg/mm/AAAA").
- Aggiunti `<meta viewport>` per mobile e `<title>` HTML.
- Logo path `/static/img/logo_tregobbi.png` (gia' presente, usato anche dal PDF).

Risultato: aprendo `/vini/carta` su iPad o browser, la pagina ha la stessa estetica del PDF cliente — identico a livello visivo, solo che e' live (la query DB gira a ogni GET, niente bisogno di rigenerare PDF).

### Da verificare (Fase 1)
1. `/vini/carta` su browser desktop: deve apparire come il PDF (sfondo bianco, frontespizio con logo, sezioni tipografiche identiche).
2. Stesso URL su iPad: il viewport meta + max-width 210mm dovrebbero centrare il contenuto.
3. Smartphone (`<600px`): media query aumenta padding e riduce font; deve restare leggibile.
4. Logo: visibile in cima (path /static/img/logo_tregobbi.png e' gia' servito dal back).

### Iterazione 3 — Carta cliente pubblica (Fase 2)

Marco: pagina pubblica accessibile da QR sul tavolo, ottimizzata iPhone + iPad portrait/landscape, identita' osteria (palette beige/marrone, Cormorant Garamond), niente note degustative in v1 (saranno aggiunte da Marco in futuro generandole con AI e personalizzandole).

Implementato:

**Backend:**
- Nuovo endpoint pubblico (no auth) `GET /vini/carta-cliente/data` in `app/routers/vini_router.py`. Ritorna JSON strutturato `{ data_aggiornamento, calici[], tipologie[{nome, nazioni[{nome, regioni[{nome, produttori[{nome, vini[]}]}]}]}] }`. I calici hanno il flag `in_mescita` (BOTTIGLIA_APERTA=1). Riusa `load_vini_ordinati()` e `load_vini_calici()` raggruppando flat → nested mantenendo l'ordinamento canonico (tipologia/nazione/regione configurati in vini_carta_settings).

**Frontend:**
- Nuova route pubblica `/carta` in `App.jsx`. Gestita PRIMA del check token con `BrowserRouter` dedicato — non monta Header/ToastProvider/useUpdateChecker per non esporre il chrome del gestionale al cliente.
- Nuovo componente `frontend/src/pages/public/CartaClienti.jsx` (lazy import). CSS-in-JS inline col tag `<style>` in testa al componente — token osteria definiti localmente per non dipendere da carta_html.css (decoupling utile in futuro per il foglio stile cliente personalizzato).
- Funzionalita' v1:
  - Header con overline "Osteria" + "TRE GOBBI" + sottotitolo "Carta dei vini" + data aggiornamento.
  - Search box live (filtra in tempo reale per descrizione, vitigno, regione, produttore, annata).
  - Chip filtro tipologia: "Tutti", "🥂 Calici", + una chip per ogni tipologia presente. Solo una attiva alla volta.
  - Sezione "Al calice" in cima quando presente, badge "in mescita" inline per i vini con BOTTIGLIA_APERTA=1.
  - Sezioni bottiglie raggruppate per tipologia → nazione → regione → produttore, con tipografia e separatori coerenti col PDF (filetti decorativi nazione, dotted divider tra vini).
  - Empty state con messaggio contestuale (no risultati per la ricerca / sezione vuota).
  - Loading skeleton e errore di rete con messaggio amichevole.
- Responsive:
  - iPhone (<768px): max-width 580px, padding 18px, font normale.
  - iPad portrait+ (≥768px): padding 28px, header 36px font, voci 16px (un poco piu' grandi).
  - Desktop (≥1024px): max-width 680px centrata.
- Non usa `apiFetch` (che fa redirect login su 401). Usa `fetch` nativo verso endpoint pubblico.

### File toccati (Fase 2)
- `app/routers/vini_router.py` — endpoint `/carta-cliente/data` (no auth).
- `frontend/src/App.jsx` — lazy import CartaClienti + ramo pubblico per path `/carta` prima del check token.
- `frontend/src/pages/public/CartaClienti.jsx` — nuovo componente.
- `frontend/src/config/versions.jsx` — Vini 3.23 → 3.24.

### Da verificare (Fase 2)
1. `https://app.tregobbi.it/carta` accessibile senza login (no redirect).
2. Su iPhone: legibilita', search, filtri tipologia funzionanti.
3. Su iPad portrait: layout centrato max 580px, font leggermente piu' grandi.
4. Su iPad landscape e desktop: max 680px centrata.
5. Vino con BOTTIGLIA_APERTA=1 deve apparire nella sezione "Al calice" anche se QTA_TOTALE=0, con badge "in mescita".
6. Cambia il prezzo di un vino dal gestionale → ricarica /carta → prezzo aggiornato.
7. Filtro "🥂 Calici": nasconde la sezione bottiglie e mostra solo i calici.
8. Search "barolo": filtra in tempo reale solo le voci che matchano (sezioni vuote scompaiono).

### Iterazione 4 — Indice + drill-down + bevande

Marco: il filtro a chip orizzontale strapazzava a destra. Inoltre la carta deve includere anche le bevande (non solo vini).

Implementato:

**Backend:**
- Endpoint `/vini/carta-cliente/data` esteso: ritorna anche `bevande` (sezioni attive con voci, escluso `note_interne` staff). Riusa `_load_sezioni_attive` + `_load_voci_attive` da `carta_bevande_service`. Skip della sezione "vini" placeholder.

**Frontend (`CartaClienti.jsx` riscritta da zero, v2.0):**
- **Pagina indice** (homepage): raggruppata in 2 macro VINI / BEVANDE. Voci tipografiche con titolo + sottotitolo + contatore + chevron. La voce "🥂 Al calice" e' marcata in terracotta. Sezione "Indice" stile carta antica.
- **Drill-down**: tap su una sezione → vista dedicata. Top bar sticky con `‹ Indice` + breadcrumb. Search ristretta alla sezione corrente. Footer prev/next per saltare alle sezioni adiacenti senza tornare all'indice.
- **Search globale**: dall'indice, mostra lista risultati cross-sezione (vini, calici, bevande) con click che apre la sezione di pertinenza.
- **Render bevande con 3 pattern**:
  - `tabella_4col` (Distillati, Amari & Liquori): tabella regione/produttore/nome/prezzo + descrizione opzionale, raggruppata per regione.
  - `scheda_estesa` (Birre, Aperitivi, Amari di Casa): nome + sottotitolo + prezzo + meta (produttore/regione/formato/gradazione/IBU) + descrizione.
  - `nome_badge_desc` (Tisane, Te): nome + badge tipologia colorato + prezzo + paese origine + descrizione. Palette badge te' replicata (nero/verde/oolong/rosso/puer/bianco/tisana).
- Stato locale: `sezioneAperta` (string|null) per drill-down, `search` (resettata al cambio sezione).

### File toccati (Iter 4)
- `app/routers/vini_router.py` — endpoint estende risposta con `bevande[]`.
- `frontend/src/pages/public/CartaClienti.jsx` — riscrittura totale (v2.0).
- `frontend/src/config/versions.jsx` — Vini 3.24 → 3.25.

### Da verificare (Iter 4)
1. `/carta` apre l'indice con due macro: VINI (Calici + tipologie) e BEVANDE (Aperitivi, Birre, …).
2. Tap su "Rossi" apre la sezione drill-down. Top bar sticky con `‹ Indice` funzionante.
3. Search dall'indice: digito "barolo" e vedo lista risultati con label "Rossi · Marchesi di Barolo · Piemonte". Tap su risultato apre Rossi.
4. Search dentro una sezione: ristretta a quella sezione.
5. Sezione "Tè" mostra badge colorati per tipologia.
6. Sezione "Distillati" usa layout tabella 4 colonne con raggruppamento per regione.
7. Sezione "Birre" mostra scheda estesa con gradazione e IBU se presenti.
8. Footer prev/next salta alla sezione adiacente.
9. Su iPhone tutti i layout sono leggibili e i tap target adeguati.
10. Su iPad portrait/landscape: contenuto centrato con margini ariosi.

### Iterazione 5 — Vista sommelier `/vini/carta-staff`

Nuova pagina protetta per il sommelier con info live + locazioni:

**Backend** — `GET /vini/magazzino/carta-staff/`:
- Lista flat vini in carta (`CARTA='SI'`)
- Campi: codice, descrizione, annata, produttore, regione, tipologia, vitigni, grado, prezzo bottiglia + calice (fallback `PREZZO_CARTA/5`), flag `vendita_calice` e `in_mescita` (BOTTIGLIA_APERTA)
- **Locazioni**: array `{nome, qta}` solo per le locazioni con qta>0
- Status calcolato: `in_mescita` se BOTTIGLIA_APERTA=1; `scarsa` se qta<=2; `esaurita` se qta=0; altrimenti `in_carta`

**Frontend** — `frontend/src/pages/vini/CartaStaff.jsx`:
- Identita' osteria (Cormorant Garamond, palette beige/marrone/terracotta)
- Toolbar: search + chip filtri (Tutti / 🥂 In mescita / Calici / Scarsa giacenza / per tipologia) con conteggi
- Tabella raggruppata per Tipologia · Nazione · Regione
- Riga: codice (R.087), vino+annata+meta, prezzi (bottiglia + 🥂 calice), **locazioni multiple su righe** con qta tra parentesi, giacenza colorata, badge status
- Auto-refresh ogni 30s
- Click sulla riga → apre `/vini/magazzino/:id`
- Responsive: mobile layout card invece di tabella

**Route** `/vini/carta-staff` protetta, voce "🥂 Sommelier" in ViniNav.

### Iterazione 6 — Centro Carta gestionale rifondato

Marco: i 3 pulsanti "Anteprima / Aggiorna anteprima / Apri HTML" creavano confusione. Layout vecchio aveva editor + iframe parziale "solo vini" + 3 set duplicati di pulsanti export.

**Soluzione**: split-pane a 3 colonne con anteprima live della carta intera (vini + bevande) sempre visibile, auto-refresh dopo save.

**`CartaBevande`** (shell v3.0-split-pane):
- Layout `[sidebar 200px][editor][iframe live]` da `xl:` (≥1280px), stack verticale sotto
- Header con 5 azioni globali ben distinte:
  - **⤢ Espandi anteprima** → `/vini/carta/anteprima` (vista a tutta pagina)
  - **📄 PDF cliente** | **📄 PDF staff** | **📝 Word** → carta master `/bevande/carta/*`
  - **↗ Vedi come cliente** → apre la pagina pubblica `/carta` in nuova tab
- State `previewKey` incrementato dopo ogni save → l'iframe si rimonta e ricarica → **no piu' pulsante "Aggiorna anteprima" manuale**
- L'iframe punta a `/bevande/carta` (carta MASTER vini+bevande), non piu' a `/vini/carta` (parziale).

**`CartaVini`** (v4.0-info-pane):
- Rimossi i 4 pulsanti locali (Aggiorna anteprima / Apri HTML / Scarica PDF / Scarica Word)
- Rimosso l'iframe locale (carta intera ora globale)
- Pannello informativo con: descrizione del flusso vini-da-Cantina, riquadro "cosa entra in carta", 3 bottoni rapidi (Vai alla Cantina / Vista sommelier / Ordinamento)

**`CartaSezioneEditor`**:
- Nuova prop `onSaved` opzionale
- Chiamata dopo save voce / toggle attivo / duplica / elimina / reorder / bulk-import
- CartaBevande la passa per trigger refresh iframe

**`CartaAnteprima`** (v2.0):
- Vista a tutta pagina dello stesso iframe master
- Bottoni: ← Centro Carta · Ricarica · PDF cliente · PDF staff · Word

### File toccati (Iter 5+6)
- `app/routers/vini_magazzino_router.py` — nuovo endpoint `/carta-staff/`.
- `frontend/src/pages/vini/CartaStaff.jsx` — nuovo componente.
- `frontend/src/pages/vini/ViniNav.jsx` — voce "Sommelier".
- `frontend/src/pages/vini/CartaBevande.jsx` — refactor split-pane.
- `frontend/src/pages/vini/CartaVini.jsx` — pannello info pulito.
- `frontend/src/pages/vini/CartaAnteprima.jsx` — vista espansa pulita.
- `frontend/src/pages/vini/CartaSezioneEditor.jsx` — prop `onSaved`.
- `frontend/src/App.jsx` — lazy + route `/vini/carta-staff`.
- `frontend/src/config/versions.jsx` — Vini 3.25 → 3.27.

### Da verificare (Iter 5+6)
1. `/vini/carta-staff` accessibile da menu "Sommelier", mostra vini in tabella con tutti i campi richiesti incluse le locazioni.
2. Filtro "🥂 In mescita" mostra solo vini con BOTTIGLIA_APERTA=1.
3. Auto-refresh 30s visibile da log network.
4. `/vini/carta` apre il Centro Carta con 3 colonne (su desktop): sidebar + editor + anteprima.
5. Editing una voce in una sezione (es. Aperitivi): dopo "Salva", l'iframe a destra si ricarica automaticamente e mostra la modifica.
6. Header: "Espandi anteprima" porta a `/vini/carta/anteprima`. "Vedi come cliente" apre `/carta` in nuova tab.
7. Click su "Vini" nella sidebar: pannello informativo, niente piu' iframe locale, niente piu' pulsanti ridondanti.
8. CartaAnteprima: bottone "← Centro Carta" torna alla shell. Reload + 3 pulsanti export.
9. iPad portrait: stack verticale (sidebar in cima, editor sotto, iframe in fondo). Da `xl:` torna lo split a 3 colonne.

### Iterazione 7 — Anteprima rimossa dal Centro Carta

Marco: "non mi piace quella vista dell'anteprima, toglila del tutto".

- **`CartaBevande` (v3.1-no-preview)**: layout torna a 2 colonne (sidebar + editor). Tolto iframe live e tutto lo state di refresh (`previewKey`, `triggerPreviewRefresh`). Header con 4 azioni globali (rimossa "Espandi anteprima" perche' non c'e' piu' anteprima da espandere): **PDF cliente** · **PDF staff** · **Word** · **↗ Vedi come cliente**.
- **`CartaAnteprima` (v3.0-removed)**: pagina trasformata in un semplice `<Navigate to="/vini/carta" replace />` per non rompere eventuali deep-link. File mantenuto perche' la sandbox non permette `rm`; Marco potra' eliminarlo dal terminale Mac quando vuole, insieme alla route corrispondente in `App.jsx` (riga 211 + lazy import riga 24).
- **`CartaVini`**: aggiornato il testo informativo (rimosso riferimento all'anteprima a destra che si rinfresca).
- **`CartaSezioneEditor`**: prop `onSaved` resta ma diventa orphan (nessuno la passa piu'). Innocua, non rimossa per evitare di toccare il file da 575 righe.
- Versione modulo Vini: 3.27 → 3.28.

### File toccati (Iter 7)
- `frontend/src/pages/vini/CartaBevande.jsx` — semplificazione layout.
- `frontend/src/pages/vini/CartaAnteprima.jsx` — diventa redirect.
- `frontend/src/pages/vini/CartaVini.jsx` — testo aggiornato.
- `frontend/src/config/versions.jsx` — Vini 3.27 → 3.28.

### Pulizia opzionale (quando Marco ha tempo da terminale Mac)
```
rm frontend/src/pages/vini/CartaAnteprima.jsx
# poi togliere da frontend/src/App.jsx le righe:
#   - lazy import CartaAnteprima (~riga 24)
#   - <Route path="/vini/carta/anteprima" .../> (~riga 211)
```

---

## SESSIONE 57 cont. (2026-04-25 sera) — MODULO GUARDIANO L1+L2+L3 + CLEANUP + S52-1 CHIUSO + PIN admin random

> **Nota cronologica:** sessione parallela a S58 (Vini quick wins). Marco lavora con più finestre Claude in contemporanea. S58 ha implementato la pagina pubblica `/carta` per la carta vini cliente (palette osteria beige/marrone, Cormorant Garamond) — i 3 mockup per il menu PIATTI fatti qui erano in stile brand TRGB-02 (gestionale), andranno riallineati alla palette osteria di S58 quando si implementa la pagina pubblica `/m/{slug}` per il menu carta cliente.

### Punto di partenza
Dopo il push del modulo Menu Carta (S57), Marco ha perso la cache di Claude. Ricognizione completa del repo (40 domande tematiche per allineamento). Marco approva: implementare modulo guardiano L1+L2+L3, cleanup batch, PIN admin sicuro, mockup menu QR per scelta stile.

### Cosa è stato fatto

**Modulo guardiano (concept di Marco):**
- **L1** Pre-push checks in `push.sh`: debounce ≥30s con conferma soft `[y/N]`, probe HTTP `https://trgb.tregobbi.it/`, lettura accessi nginx ultimi 60s via SSH (best effort), conferma soft se servizio attivo. Stamp `.last_push` (gitignored). Risolve 1.12 e 1.14.a.
- **L2** Registry pattern uniformi: `docs/architettura_pattern.md` con sezioni API/SQLite/Mattoni/Schede testa+tab/Palette/Auth/File system/Docs/Push. Da consultare a inizio sessione di sviluppo.
- **L3** Inventario pulizia: `docs/inventario_pulizia.md` con lista viva di codice morto, file orfani, backup forensi, TODO WAL coverage, decisioni pendenti.

**File "controllo design" (richiesto da Marco):**
- `docs/controllo_design.md` con 6 voci iniziali: pattern testa+tab da estendere a ClientiScheda/ControlloGestioneUscite, dark mode, tool config stampe M.B (8.14), Home per ruolo widget (8.10), PWA→app ufficiale priorità alta (1.1), WAL mode esteso a tutti i DB (1.11.2).

**Cleanup batch:**
- `app/services/auth_service.py`: PIN admin di default da "0000" hardcoded a random 6 cifre (`secrets.randbelow`) stampato in console al primo boot se `users.json` manca. Marco lo legge dal log e lo cambia subito.
- Voce roadmap 1.15 chiusa dopo verifica grep: import morti `vini_db` già rimossi nelle sessioni 52-53 (commenti `# Nota 2026-04-21 (sessione 52): rimosso import fantasma` lo confermano).
- Identificati come codice morto: `app/data/dipendenti.db` (0 byte), `.claude/worktrees/livelli-cucina/`, `app/routers/ingredients_router.py`, `app/routers/settings_router.py`. **Workspace Cowork ha mount FUSE read-only sui rm**: Marco li elimina a mano dal terminale Mac (comandi sotto).
- `vini.sqlite3` verificato con grep cross-repo: NON è abbandonato, ancora usato da `core/database.py`, `alert_engine.py`, `dashboard_router.py`, `backup_router.py`. Resta in produzione.
- `run_server.py` (root): script bash legacy con path `/Volumes/Underline/trgb_web` non più valido. Tracciato in `inventario_pulizia.md` per decisione futura.
- `.gitignore`: aggiunto `.last_push` (runtime modulo guardiano).

**S52-1 (corruzione vini_magazzino) chiuso:**
- 4 giorni di servizio stabile post-fix sessione 53. Marco conferma: nessuna nuova manifestazione. Spostato in Risolti in `docs/problemi.md`. Roadmap 1.13 (pulizia backup forensi) sbloccato — comando in `inventario_pulizia.md`.

**Mockup pagina QR menu cliente (per piatti, NON per vini — quello l'ha fatto S58):**
- 3 varianti HTML in `docs/mockups/`:
  - `menu_qr_v1_minimal.html` — testo elegante, no foto, gobbette mini header
  - `menu_qr_v2_brand_pieno.html` — hero immagine cover, foto card, badge allergeni
  - `menu_qr_v3_ibrido.html` — testo + foto miniature tonde
- **ATTENZIONE**: questi mockup sono in palette brand TRGB-02 (gestionale). S58 ha stabilito che la palette per il cliente è "osteria" (beige/marrone, Cormorant Garamond). Quando si implementa la pagina pubblica `/m/{slug}` per il menu carta piatti, allineare a S58 in `frontend/src/pages/public/CartaClienti.jsx`.

### Decisioni di Marco raccolte (S57 cont.)
- **Foto piatti menu carta**: cartella locale `app/data/menu_carta/foto/` (aggiunta a §8 architettura_pattern). UI upload da fare quando popoli foto vere.
- **Generatore MEP**: resta manuale (bottone "⚙ Genera MEP cucina"), no auto-rigenerazione su modifica piatto.
- **5 partite fisse della 097**: decisione parcheggiata, valuteremo.
- **PWA Fase 0 (1.1)**: priorità ALTA confermata da Marco. Tracciato in roadmap + controllo_design §5. Importante per "PWA verso app ufficiale".
- **WAL mode 1.11.2**: applicare a tutti i DB in batch (modulo guardiano L3 lo traccia con tabella coverage). Marco: "uniformiamo, modulo guardiano aiuta a tenere logica comune".
- **PIN sicurezza users.json**: delegato a Claude → random 6 cifre fatto.
- **Domande in coda** (mattoni M.D/G/H, prenotazioni 2.x, preventivi 10.3, CG v2.x): rifare quando il contesto le richiama.

### Roadmap punti chiusi (S57 cont.)
- ✅ 1.12 push.sh debounce
- ✅ 1.14.a soft-check servizio
- ✅ 1.15 import morti vini_db (era già fatto, voce obsoleta)
- ✅ 1.16 modulo guardiano L2 architettura_pattern.md (nuovo)
- ✅ 1.17 modulo guardiano L3 inventario_pulizia.md (nuovo)
- ✅ 1.20 PIN admin random (nuovo)
- ✅ S52-1 (problemi.md) chiuso

### Roadmap punti nuovi (S57 cont.)
- 1.18 Cleanup file morti (`run_server.py`, `update_vps.sh` orfano) — DA FARE, Marco decide
- 1.19 Migrazioni DB unificate (anche fuori foodcost.db) — DA FARE in sessione tecnica

### File modificati
- `app/services/auth_service.py` (PIN random + secrets import)
- `push.sh` (modulo guardiano L1)
- `.gitignore` (aggiunto .last_push)
- `docs/sessione.md` (questa entry)
- `docs/problemi.md` (S52-1 chiuso, spostato in Risolti)
- `docs/roadmap.md` (1.15/1.12/1.14.a chiusi, 1.16-1.20 nuovi, 1.1 priorità alta, 1.13 sbloccato)
- `docs/changelog.md` (entry S57 cont.)

### File nuovi
- `docs/architettura_pattern.md`
- `docs/inventario_pulizia.md`
- `docs/controllo_design.md`
- `docs/mockups/menu_qr_v1_minimal.html`
- `docs/mockups/menu_qr_v2_brand_pieno.html`
- `docs/mockups/menu_qr_v3_ibrido.html`

### Operazioni che Marco DEVE fare A MANO dal terminale Mac (PRIMA del push)
Il workspace Cowork ha mount FUSE read-only sui `rm`/`rmdir`:

```bash
cd /Users/underline83/trgb

# 1. File DB orfano (0 byte)
rm app/data/dipendenti.db

# 2. Worktree git abbandonato (.claude/worktrees/livelli-cucina, ~500MB)
rm -rf .claude/worktrees/livelli-cucina
git worktree prune --verbose
git worktree list   # verifica resti solo /Users/underline83/trgb [main]

# 3. Router morti (non importati da main.py)
rm app/routers/ingredients_router.py
rm app/routers/settings_router.py
```

### Commit suggerito
```
./push.sh "S57 cont.: modulo guardiano L1+L2+L3 + PIN admin random + cleanup codice morto + 3 mockup QR menu + S52-1 chiuso"
```

### Cose lasciate aperte (deliberatamente)
- **Scelta mockup QR menu piatti**: Marco vede i 3 e decide quale (allineato alla palette osteria di S58).
- **5 partite fisse MEP**: Marco valuterà.
- **Foto piatti menu carta**: cartella locale stabilita, UI upload da fare.
- **Modulo guardiano L4** (`/system/maintenance` endpoint + banner FE): da sessione dedicata.
- **WAL mode 1.11.2** sui restanti 6 DB: in batch quando facciamo cleanup tecnico.
- **Backup forensi VPS**: comando in `inventario_pulizia.md`, Marco esegue quando vuole.
- **Domande in coda**: mattoni M.D/G/H, prenotazioni 2.x, preventivi 10.3, CG v2.1+.

---

## SESSIONE 57 (2026-04-25) — MODULO MENU CARTA + import MEP cucina

### Punto di partenza
Marco ha condiviso il PDF "menù-A5-primavera-2026-definitivo.pdf" e chiesto:
1) checklist di lavoro per i cuochi, 2) come archiviare nel modulo Gestione Cucina.

### Cosa è stato fatto

**Deliverable preliminari** (sessione preparatoria, niente codice):
- `docs/menu_carta.md` — design doc completo (619 righe) con schema DB, endpoint, mockup UI, mappa piatti, integrazioni mattoni
- `Checklist_Cucina_Primavera_2026.docx` (22 pagine) e `.pdf` — mise en place per partita + scheda piatto per ogni piatto del menu

**Implementazione (6 blocchi di codice):**

#### Blocco A — import 5 template MEP nel modulo Cucina HACCP
- **Migrazione 097_import_mep_templates.py** → tasks.sqlite3
- 5 nuovi `checklist_template`: MEP Basi & Fondi (33 item, scadenza 09:00), MEP Antipasti (23), MEP Primi (15), MEP Secondi (19), MEP Contorni (11)
- Tutti reparto=cucina, frequenza=GIORNALIERA, turno=APERTURA, attivo=0 (Marco li attiva da Impostazioni Cucina)
- 101 item totali estratti dal docx
- Idempotente (skip su nome duplicato)

#### Blocco B — schema DB Menu Carta
- **Migrazione 098_menu_carta_init.py** → foodcost.db
- 4 nuove tabelle: `menu_editions`, `menu_dish_publications`, `menu_tasting_paths`, `menu_tasting_path_steps`
- ALTER recipes ADD: `allergeni_calcolati`, `istruzioni_impiattamento`, `tempo_servizio_minuti`
- Vincolo unique: una sola edizione `in_carta` per volta

#### Blocco C2 — seed ricette test (Food Cost) [aggiunto su richiesta Marco "metti come test"]
- **Migrazione 099_seed_food_cost_test.py** → foodcost.db
- 9 ingredient_categories, 82 ingredients, 14 ricette base (fondi/salse/polente/mantecature), 28 ricette piatto
- 186 recipe_items totali con sub_recipe linking
- Tutte le 28 ricette piatto agganciate a service_type "Alla carta"
- Marco affinerà i grammi/procedure dal modulo Ricette esistente

#### Blocco C — router Menu Carta + seed Primavera 2026
- **Migrazione 100_seed_menu_primavera_2026.py** → foodcost.db (1 edition + 36 publications + 2 tasting paths + 10 steps)
- **app/routers/menu_carta_router.py** → 19 endpoint protected + 1 pubblico (no auth) `/menu-carta/public/today` per QR menu cliente
- Endpoint principali: editions/ (CRUD + publish/clone/archive), publications/ (CRUD), tasting-paths/ (CRUD)
- Registrato in `main.py` con prefix `/menu-carta`

#### Blocco D — frontend Menu Carta
- `frontend/src/pages/cucina/MenuCartaElenco.jsx` — lista edizioni raggruppata per stato (in carta / bozze / archiviate), modali "Nuova" e "Clona"
- `frontend/src/pages/cucina/MenuCartaDettaglio.jsx` — testa fissa colorata + 4 KPI + 4 tab (Sezioni / Degustazioni / Anteprima / Anagrafica), modale edit pubblicazione con tutti i campi prezzo
- Voce in `modulesMenu.js`: sotto "Gestione Cucina" → "Menu Carta"
- Route in `App.jsx`: `/menu-carta` e `/menu-carta/:id`
- Pattern: testa+tab gemello SchedaVino, palette TRGB-02, Playfair Display sui titoli, touch target 44pt

#### Blocco E — generatore MEP dinamico dal menu attivo
- Endpoint `POST /menu-carta/editions/{id}/generate-mep` e `GET .../mep-preview`
- Crea N template "MEP Carta · {Partita} · {slug}" in tasks.sqlite3 — uno per partita (Antipasti/Primi/Secondi/Contorni), un item per piatto pubblicato
- Item = "Nome piatto — istruzioni_impiattamento" (con flag descrizione_variabile dove applicabile)
- Idempotente: rimuove i precedenti per quella edizione (LIKE 'MEP Carta · % · {slug}') e li ricrea
- I 5 template MEP fissi della 097 restano fallback indipendenti
- Bottone "⚙ Genera MEP cucina" in MenuCartaDettaglio testa

#### Blocco F — export PDF menu cliente
- Endpoint `GET /menu-carta/editions/{id}/pdf` via mattone M.B PDF brand
- Template `app/templates/pdf/menu_carta.html` con CSS dedicato in `_menu_carta_css()` del router (Playfair Display titoli sezione maiuscoli centrati con tracking, dish a 2 colonne nome+desc / prezzo, tasting in card bordo blue)
- Bottone "⬇ PDF stampabile" in MenuCartaDettaglio testa
- Riusa il branding TRGB (header logo gobbette, strip, footer)

### Architettura: il "pezzo magico"
Le checklist mise en place del cuoco di partita non sono più hardcoded: derivano dal menu pubblicato. Quando cambia stagione (clone → modifica → publish) basta `POST /generate-mep` e i template MEP della cucina si aggiornano in automatico. I 5 template fissi della 097 restano come scheletro per il caso "menu non ancora archiviato".

### File modificati
**Migrazioni (4 nuove):** `097_import_mep_templates.py`, `098_menu_carta_init.py`, `099_seed_food_cost_test.py`, `100_seed_menu_primavera_2026.py`
**Backend nuovo:** `app/routers/menu_carta_router.py`, `app/templates/pdf/menu_carta.html`
**Backend modificato:** `main.py` (import + include_router x2)
**Frontend nuovo:** `frontend/src/pages/cucina/MenuCartaElenco.jsx`, `MenuCartaDettaglio.jsx`
**Frontend modificato:** `frontend/src/config/modulesMenu.js`, `frontend/src/App.jsx`
**Docs:** `docs/menu_carta.md` (design), `Checklist_Cucina_Primavera_2026.docx`/`.pdf` (operativo)

### Verifiche eseguite
- Sintassi Python su tutte le migrazioni e router (ast.parse OK)
- Test end-to-end migrazioni 097-100 su DB di test (counts corretti, idempotenza OK)
- Generatore MEP testato: edizione Primavera 2026 → 4 template "MEP Carta" con item dai 28 piatti pubblicati
- esbuild OK su MenuCartaElenco.jsx e MenuCartaDettaglio.jsx (213kb e 229kb)
- Smoke test importazione router FastAPI: 19 endpoint auth + 1 pubblico registrati

### Da verificare dopo push
1. Lancia `./push.sh` con il commit (sotto). Le 4 migrazioni partono in ordine.
2. **Cucina HACCP**: Impostazioni Cucina → Template → vedi 5 nuovi "MEP · ..." con attivo=0. Attiva quelli che vuoi mettere in produzione.
3. **Menu Carta**: header dropdown → Gestione Cucina → Menu Carta. Vedi "Primavera 2026" in stato `IN CARTA`. Apri → testa+tab + 4 KPI + tutti i 36 piatti raggruppati per sezione.
4. **Modale piatto**: clic su un piatto → vedi tutti i campi prezzo (singolo/range/piccolo-grande), allergeni, descrizione variabile, badge.
5. **Anteprima**: tab Anteprima → vedi rendering simil-PDF (vuol dire che i dati sono coerenti per il PDF reale).
6. **PDF**: bottone "⬇ PDF stampabile" → apre `/menu-carta/editions/1/pdf`. Verifica branding e layout.
7. **Genera MEP**: bottone "⚙ Genera MEP cucina" → conferma → torna in Impostazioni Cucina e vedi 4 nuovi template "MEP Carta · {partita} · primavera-2026" con item presi dai piatti.
8. **Clona**: dalla lista edizioni clic "Clona →" → crea bozza Estate 2026 → conferma che ha tutti i 36 piatti.
9. **Pubblica**: pubblica la bozza → conferma che Primavera 2026 va in archiviata e Estate 2026 va in_carta (vincolo unique).
10. **Endpoint pubblico**: `GET /menu-carta/public/today` (no auth) → JSON menu corrente per QR cliente.

### Cose lasciate aperte (deliberatamente)
- **Ricette popolate sono test**: gli ingredienti (manzo filetto, tartare, asparagi, ...) e le grammature sono stimate dal menu PDF. Marco le aggiusta da Modulo Ricette quando vuole. Il food cost % oggi è inattendibile finché non arrivano fatture reali con prezzi mappati.
- **Foto piatti**: schema pronto (`foto_path` su menu_dish_publications) ma non c'è ancora upload UI.
- **Multilingua**: niente colonne `_en`. Da v2 quando serve.
- **Storico prezzi pubblicazioni**: niente trigger di log. Da v2.
- **Checker M.F per food cost % oltre soglia**: idea nel design doc, da implementare quando le ricette sono popolate sul serio.
- **Pagina pubblica `/m/{slug}` per QR**: solo l'endpoint API esiste. La pagina frontend pubblica è da fare (Fase 4 della roadmap menu carta).

### Commit suggerito (UNICO push, le migrazioni partono in ordine)
```
./push.sh "Modulo Menu Carta sessione 57: 4 migrazioni (097 import MEP, 098 schema, 099 seed ricette test, 100 seed Primavera 2026) + router 20 endpoint + 2 pagine FE testa+tab + generatore MEP dinamico + export PDF brand"
```

---

## SESSIONE 56 (2026-04-25) — FATTURE+FORNITORI: testa fissa + linguette + breadcrumb anti-matrioska

### Problema
Il dettaglio fattura (`FattureDettaglio`) e il dettaglio fornitore (`FornitoreDetailView` dentro `FattureFornitoriElenco`) erano al vecchio layout sidebar scura + main, gemello del vecchio SchedaVino. Inoltre — problema vero — quando dal tab Fatture di un fornitore si cliccava una fattura, `FattureDettaglio` veniva montato INLINE dentro `FornitoreDetailView` con `inline={true}` → due sidebar colorate sovrapposte, due barre "← Torna…", layout scatola-dentro-scatola ("matrioska").

### Soluzione adottata (Strada B = redesign completo, scelta da Marco)
1. Refactor visivo di entrambe le schede al pattern **testa fissa colorata + linguette**, gemello di SchedaVino.
2. Anti-matrioska: l'apertura della fattura da dentro un fornitore non e' piu' nested. Lo stato `openFatturaFromForn` vive nel container `FattureFornitoriElenco` (non piu' in `FornitoreDetailView`), e quando e' valorizzato il container monta `FattureDettaglio` a tutta pagina passando una prop `breadcrumb`. Il breadcrumb sostituisce la barra "← Torna…" e mostra `Fornitori › {NomeFornitore} (Fatture) › FT {numero}` cliccabile.

### FattureDettaglio.jsx — refactor
- Aggiunta palette `FATTURA_HEADER` (soft) accanto a `FATTURA_SIDEBAR` esistente. Helper `getFatturaHeader(stato, isRateizzata)`.
- Aggiunta costante `TABS = [riepilogo, pagamenti, righe]` + state `activeTab` (default `"riepilogo"`).
- Aggiunto handler `handleChangeTab` con dirty-check (chiede conferma se editingScadenza/Iban/Mp e annulla in caso di cambio forzato).
- Aggiunta nuova prop opzionale **`breadcrumb`** (`Array<{label, onClick?}>`). Se passata, sostituisce la classica chiusura/return e si rende come barra di navigazione cliccabile in cima.
- Rimossa sidebar scura. Nuova testa colorata con: badge (FT numero, stato uscita, rateizzata, batch, riconciliata banca), titolo (fornitore_nome), sottotitolo (P.IVA, data fattura, scadenza), 4 KPI (Totale, Imponibile, IVA, "Da pagare" con calcolo giorni mancanti via helper `daysFromToday()`).
- Tab `Riepilogo`: nuovo, contiene scadenza + modalita' + IBAN (read-only), info pagamento effettivo, info meta (importato/ID/batch), link a "Modifica anagrafica fornitore" (deep-link `?piva=xxx`).
- Tab `Pagamenti`: contiene la sezione pre-esistente "Pagamenti & Scadenze" con i 3 form editable (scadenza/modalita'/IBAN) e banner rateizzata con link spesa fissa.
- Tab `Righe`: contiene la tabella righe pre-esistente (con tfoot totale e overflow-x-auto su portrait).
- Footer sticky con: `Segna pagata` (se `onSegnaPagata` & non pagata & non rateizzata), `Modifica anagrafica fornitore` (se P.IVA), `Chiudi` (se `onClose`).
- Tutte le prop esistenti (`fatturaId, inline, onClose, onFatturaUpdated, onSegnaPagata, ref, hasPendingChanges`) sono **preservate** — nessuno dei 4 call site (App.jsx route standalone, FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite) si rompe.

### FornitoreDetailView (dentro FattureFornitoriElenco.jsx) — refactor
- Aggiunta palette `FORNITORE_HEADER` (soft, teal/amber/slate) + helper `getFornitoreHeader`. Costante `TABS_FORN = [anagrafica, fatture, prodotti]` (3 tab invece di 2).
- Rimossa sidebar scura. Nuova testa colorata con: badge stato (ATTIVO/IN SOSPESO/ESCLUSO + N fatt./N da pagare), titolo (fornNome), sottotitolo (P.IVA, C.F., sede), 4 KPI (Totale spesa, Fatture pagate/totali, Media fatt., Da pagare).
- Tab `Anagrafica`: contiene **Categoria generica fornitore** (select cat./sottocat. + breakdown stats) e **Condizioni di pagamento** (preset, modalita', giorni, note + auto-rilevamento) — entrambe spostate qui dal main content unificato.
- Tab `Fatture`: la lista esistente, sort, selezione massiva, segna pagate/non pagate. Click su riga → `onOpenFattura(id)` (callback al container) invece dell'ex `setOpenFatturaId(id)` locale.
- Tab `Prodotti`: la lista esistente con assegnazione categoria/sottocat e bulk assign.
- **Rimosso completamente** lo state `openFatturaId` interno e il blocco `openFatturaId ? <FattureDettaglio inline/> : <lista>` — non c'e' piu' nesting.
- Rimosse le funzioni locali `segnaPagataManuale` e `handleFatturaUpdatedInline` — spostate al container.
- Aggiunta prop `onOpenFattura` alla signature.

### FattureFornitoriElenco (container) — modifiche
- Nuovo state `openFatturaFromForn` (id fattura aperta da dentro un fornitore).
- Helper `refreshFatture()` (ricarica solo le fatture del fornitore corrente dopo un cambio).
- Funzioni `segnaPagataManuale(id)` e `handleFatturaUpdatedInline(f)` portate qui dal `FornitoreDetailView` (ora passate come prop a `FattureDettaglio`).
- Nuovo ramo nel render condizionale, prima del ramo fornitore: se `openKey && openFatturaFromForn` → render di `<FattureDettaglio breadcrumb=[...] inline />` con breadcrumb 3-livelli (Fornitori › Nome (Fatture) › FT numero) cliccabile.
- Passa `onOpenFattura={(id) => setOpenFatturaFromForn(id)}` a `FornitoreDetailView`.

### Anti-matrioska in pratica
- Click su fornitore nella lista → vista fornitore (testa teal + tab anagrafica/fatture/prodotti).
- Click su tab `Fatture` → lista fatture del fornitore.
- Click su una riga fattura → `onOpenFattura(id)` → container setta `openFatturaFromForn` → vista fornitore SPARISCE, vista fattura PRENDE TUTTA LA PAGINA con breadcrumb ambra in cima.
- Click su `Fornitori` nel breadcrumb → torna alla lista (reset openKey + openFatturaFromForn).
- Click su `{NomeFornitore} (Fatture)` nel breadcrumb → torna a vista fornitore sul tab Fatture.
- Una sola scheda di dettaglio aperta alla volta. Mai due sidebar.

### Responsive iPad
- KPI header `grid-cols-2 md:grid-cols-4` (2x2 su iPad portrait, 1x4 da landscape) in entrambe le schede.
- Tab bar `overflow-x-auto` + `whitespace-nowrap` sulle linguette.
- Breadcrumb `overflow-x-auto` per non strapparsi su portrait stretto.
- Tabelle Righe / lista fatture / lista prodotti gia' avevano `overflow-x-auto` nei wrapper, mantenuto.
- Bottoni del footer azione su `Btn size="md"` per touch target 44pt.

### File toccati
- `frontend/src/pages/admin/FattureDettaglio.jsx`
- `frontend/src/pages/admin/FattureFornitoriElenco.jsx`

### Verifica compilazione (esbuild)
Tutti e 5 i file potenzialmente impattati passano: `FattureDettaglio.jsx`, `FattureFornitoriElenco.jsx`, `FattureElenco.jsx` (consumer), `ControlloGestioneUscite.jsx` (consumer), `SchedaVino.jsx` (gemello, non toccato).

### Da verificare dopo push
1. **Lista fatture** (`/acquisti/elenco`): click su una fattura → nuovo layout, tab e KPI funzionano.
2. **Pagina standalone fattura** (`/acquisti/dettaglio/:id`): stesso layout, FattureNav sopra, back button.
3. **Lista fornitori** (`/acquisti/fornitori`): click su un fornitore → nuovo layout fornitore.
4. **Dentro un fornitore**, tab Fatture, click su una fattura → ATTENZIONE matrioska — la vista fornitore deve sparire e apparire SOLO la fattura con breadcrumb ambra in cima.
5. **Breadcrumb cliccabile**: click sul nome fornitore → torna al fornitore tab Fatture; click su "Fornitori" → torna alla lista fornitori.
6. **ControlloGestioneUscite** (split lista uscite + dettaglio fattura): la fattura aperta a destra ora ha la nuova UI testa+tab, ma niente breadcrumb (perche' il container non lo passa). Verificare che il flusso sia coerente.
7. **Deep-link** `?piva=xxx` (cliccabile da `FattureDettaglio` con bottone "Modifica anagrafica fornitore"): apre il fornitore corrispondente. Preservato.
8. **iPad portrait**: KPI 2x2, tab bar scrolla orizzontalmente, breadcrumb scrolla orizzontalmente.
9. **Dirty-check**: in `FattureDettaglio` con scadenza/IBAN/MP in editing, cambiare tab → conferma; idem cambiando fornitore.

### Cose lasciate aperte (deliberatamente)
- **ClientiScheda** e **ControlloGestioneUscite (vista uscita lato sinistro)**: hanno copiato il vecchio pattern visivamente ma non importano `FattureDettaglio`/`FornitoreDetailView` come componenti. Restano col vecchio stile finche' non si refactorano anche loro. Da pianificare in futuro.

---

## SESSIONE 55 (2026-04-24) — SCHEDA VINO: testa fissa + linguette

### Problema
Il dettaglio vino (`SchedaVino.jsx`, usato sia da `MagazzinoVini` come takeover sia da `MagazzinoViniDettaglio` come pagina standalone) era diventato un muro verticale: sidebar scura a sinistra + 6 sezioni impilate a destra (anagrafica, giacenze, movimenti, storico prezzi, statistiche vendita, note). Troppe informazioni in uno scroll unico, poco leggibile su iPad.

### Nuova struttura
1. **Testa colorata fissa** — sfondo gradiente soft per tipologia (palette `TIPOLOGIA_HEADER` affiancata alla `TIPOLOGIA_SIDEBAR` scura già presente). Contiene:
   - Badge: codice `#id`, tipologia, bollini In carta / iPratico / Calice / Biologico / stato vendita.
   - Titolo vino (`DESCRIZIONE · ANNATA · FORMATO`) + sottotitolo (`produttore · regione · vitigni · grado`).
   - X di chiusura in alto a destra.
   - **4 KPI sempre visibili**: Giacenza totale, Prezzo carta, Ricarico (× calcolato come `PREZZO_CARTA / (EURO_LISTINO · (1 − SCONTO/100))`, color-coded emerald ≥3, amber ≥2, red <2), Ritmo bt/mese (da `vinoStats.ritmo_vendita.bt_mese`).
   - Grid `grid-cols-2 md:grid-cols-4` → 2×2 su iPad portrait, 1×4 da tablet landscape.
2. **Tab bar** orizzontale sotto la testa, con `overflow-x-auto` su portrait. 6 linguette: Anagrafica / Giacenze / Movimenti (n) / Prezzi (n) / Statistiche / Note (n). Contatore a lato per quelle con dati.
3. **Tab content**: rendering condizionale con `{activeTab === "..." && (...)}`. Le sezioni esistenti sono state mantenute così come sono, avvolte ciascuna nel suo blocco condizionale — niente duplicazione di logica.
4. **Footer sticky** con `Duplica vino` + `Chiudi` (quando presente `onClose`).

### Logica aggiunta
- `activeTab` useState, default `"anagrafica"`.
- `ricarico` useMemo — null se manca listino/prezzo/sconto, altrimenti float.
- `handleChangeTab(newTab)` — controlla `hasPendingChanges()`, chiede conferma e annulla editMode/giacenzeEdit se l'utente decide comunque di cambiare tab.
- `tabCount(key)` — contatore per movimenti/prezzi/note (null per anagrafica/giacenze/stats).

### Adattamenti iPad
- `grid-cols-4` dei prezzi view-mode → `grid-cols-2 md:grid-cols-4`.
- `grid-cols-4` dei prezzi edit-mode → `grid-cols-2 md:grid-cols-4`.
- `grid-cols-4` dei FlagToggle → `grid-cols-2 md:grid-cols-5` (sono 5 toggle).
- Tabella Movimenti: wrapper `overflow-x-auto` + `min-w-[600px]` sulla table → scrolla orizzontalmente su portrait stretto invece di strapparsi.
- Tabella Prezzi: stesso pattern, `min-w-[720px]`.
- KPI header `grid-cols-2 md:grid-cols-4`.
- Tab bar `overflow-x-auto` con `whitespace-nowrap` sulle linguette.

### File toccati
- `frontend/src/pages/vini/SchedaVino.jsx` → palette `TIPOLOGIA_HEADER` + `getHeaderColors` + costante `TABS`; state `activeTab`, useMemo `ricarico`, handler `handleChangeTab`; blocco render riscritto (testa + tab bar + tab content + footer), sidebar scura rimossa; grid responsive sui prezzi/flag; overflow-x sulle tabelle movimenti/prezzi.

### Da verificare dopo push
1. Rotazione da iPad landscape a portrait: griglia KPI passa da 1×4 a 2×2, tab bar scrolla.
2. Navigazione tra tab con anagrafica in edit mode: deve chiedere conferma se ci sono modifiche non salvate.
3. Che `MagazzinoViniDettaglio` (route `/vini/magazzino/:id`) mostri correttamente la nuova UI — è un wrapper sottile, eredita la nuova struttura.
4. Frecce `‹ 2/47 ›` della barra ambra in `MagazzinoVini`: NON sono state toccate, stanno sopra la testa colorata perché sono gestite dal parent.

### Cose lasciate aperte (deliberatamente)
- **FattureDettaglio / FattureFornitoriElenco / ClientiScheda / ControlloGestioneUscite** hanno copiato il pattern "sidebar scura + main" di SchedaVino senza importarlo. NON sono state toccate: resteranno col vecchio stile finché non le si refactora anche loro. Marco ha esplicitamente detto che vuole rivederle in futuro.

### Iterazione 2 (stessa sessione 55) — Ricarico spostato
Marco: "il valore del ricarico ci sta, mettilo nella tab prezzi, ma toglilo da li sopra che non mi piace molto".

- Rimosso il KPI **Ricarico** dalla testa fissa. L'header ora ha **3 KPI** (Giacenza, Prezzo carta, Ritmo) in `grid-cols-3` fisso — 3 colonne sia portrait che landscape, entrano comodi anche su 820px.
- Nella tab **Prezzi** aggiunta una barra riepilogo in testa alla sezione, sopra il filtro per campo: 5 card compatte (Listino, Sconto, Costo netto, Prezzo carta in emerald, Ricarico con colore semantico × 3+/2+/< 2 come prima). Grid `grid-cols-2 md:grid-cols-5` → 2 colonne su iPad portrait (righe di 2+2+1), 5 su landscape.
- Costo netto calcolato inline come `EURO_LISTINO · (1 − SCONTO/100)`.

---

## SESSIONE 54 (2026-04-22) — FLUSSI CASSA CONTANTI: filtro data + tab Flusso contanti

### Modifiche
1. **Filtro data da/a** sui tab esistenti `Pagamenti spese` e `Versamenti in banca` (Flussi di cassa → Contanti).
   - BE: `/controllo-gestione/movimenti-contanti` accetta `data_da`/`data_a` (override su anno/mese).
   - BE: `/admin/finance/cash/daily` accetta `data_da`/`data_a`, `_aggregate_shift_closures_by_date` esteso con `date_from`/`date_to`.
   - FE: due input date "da"/"a" + pulsante "✕ pulisci" sotto la nav mese. Se valorizzati, disabilitano la nav mese.
2. **Nuovo tab "📊 Flusso contanti"** dentro Movimenti Contanti.
   - BE nuovo endpoint `/admin/finance/cash/flow` (admin_finance.py): eventi cronologici con saldo cumulativo riportato dal periodo precedente.
     - Entrata = contanti fiscali giornalieri (corrispettivi − elettronici).
     - Uscita  = `cg_uscite` con `metodo_pagamento = 'CONTANTI'`.
     - Giorni senza entrate né uscite non compaiono.
     - Saldo iniziale = somma entrate storiche − somma uscite contanti storiche prima del periodo (non tiene conto dei versamenti in banca, per volontà di Marco).
   - FE componente `SubFlussoContanti` in `GestioneContanti.jsx`: KPI (saldo iniziale / entrate / uscite / saldo finale) + tabella con cumulativo.

### File toccati
- `app/routers/controllo_gestione_router.py` → `get_movimenti_contanti` +data_da/data_a
- `app/routers/admin_finance.py` → `_aggregate_shift_closures_by_date` esteso + `get_cash_daily` +data_da/data_a + helper `_contanti_fiscali_by_date` + endpoint `/cash/flow` + `CashDailyResponse` con year/month/data_da/data_a Optional + import `timedelta`
- `frontend/src/pages/admin/GestioneContanti.jsx` → filtro data in `SubPagamentiContanti` + `SubVersamentiContanti` + nuovo `SubFlussoContanti` + sub-tab switcher a 3 voci

### Da verificare dopo push
- che il saldo iniziale del flusso sia sensato (può essere molto alto: tutti gli incassi contanti storici meno tutte le spese contanti storiche — è l'importo netto teorico generato in cassa dall'origine dei dati).
- che filtro data da/a funzioni anche con uno solo dei due campi compilato (es. solo "da" = "dalla data in poi").

### Iterazione 2 (stessa sessione 54)
Marco: "sottrai i versamenti così diventa una cassa contanti effettiva; però visto che non abbiamo caricato tutti i dati storici della banca, il numero risulterà troppo sbagliato. In impostazioni aggiungi la possibilità di settare una data iniziale con un valore iniziale".

Implementato:
1. **BE**: `/admin/finance/cash/flow` ora sottrae anche i **versamenti** (cash_deposits) dal saldo iniziale storico e li mostra come terzo tipo di evento nella tabella (type=`versamento`, icona 🏦, colonna Uscita).
2. **BE**: nuova tabella `cash_flow_baseline` (single row, id=1) in `admin_finance.sqlite3` con `baseline_date`, `baseline_value`, `note`.
3. **BE**: endpoints `GET /admin/finance/cash/flow/baseline` e `PUT /admin/finance/cash/flow/baseline` (PUT solo admin/superadmin).
4. **BE**: logica `/cash/flow` — se baseline attivo e `period_start >= baseline_date`: parte da `baseline_value` alla `baseline_date`, poi applica entrate − spese − versamenti tra baseline_date e giorno prima del periodo. Altrimenti fallback storico completo.
5. **FE BancaImpostazioni**: nuova voce menu "💰 Saldo cassa contanti" con tab dedicata (`TabCashBaseline`): data + valore iniziale + nota + Save/Reset, con spiegazione in basso.
6. **FE SubFlussoContanti**: rendering del tipo `versamento` (badge 🏦 Versamento sky), footer che distingue spese+versamenti, nota esplicativa che si adatta a baseline attivo/non attivo.

### File toccati (iter 2)
- `app/routers/admin_finance.py` → tabella+helper+2 endpoints baseline + helper `_sum_versamenti_range`, `_sum_spese_contanti_range` + `/cash/flow` riscritto con baseline logic + versamenti come eventi + nuovi campi response (`baseline_applicato`, `baseline_date`, `baseline_value`, `totale_versamenti`).
- `frontend/src/pages/banca/BancaImpostazioni.jsx` → voce menu "cash-baseline" + componente `TabCashBaseline`.
- `frontend/src/pages/admin/GestioneContanti.jsx` → `SubFlussoContanti` rendering versamento + footer/nota aggiornati.

### Verifiche sintassi
- `python3 -m py_compile admin_finance.py` → OK.
- esbuild su entrambi i .jsx → OK.

### Iterazione 3 (stessa sessione 54)
Marco: "Sistemiamo anche la parte di pre-conti e di spese varie; unendole in una sola categoria con 3 tab; come nome della categoria teniamo Spese varie, all'interno 3 tab: Pre-conti, Spese varie; Flusso Spese fa da totale sommando le due".

Implementato (FE only — nessuna modifica BE):
1. **Sidebar `GestioneContantiContent`**: rimossa voce separata `Pre-conti`. Ora il menu ha 3 voci: `Movimenti Contanti`, `Spese turno`, `Spese varie` (quest'ultima solo `superOnly`).
2. **Nuovo wrapper `SezioneSpeseUnificata`** con 3 sub-tab pill:
   - `📥 Pre-conti` → render `<SezionePreconti />` (invariato).
   - `💸 Spese varie` → render `<SezioneSpeseVarie />` (invariato).
   - `📊 Flusso spese` → nuovo componente `SubFlussoSpese`.
3. **Nuovo componente `SubFlussoSpese`**: aggrega cronologicamente preconti (entrate) + spese varie (uscite).
   - Fetch parallelo `/admin/finance/shift-closures/preconti` + `/admin/finance/cash/expenses` + `/admin/finance/cash/expense-categories` + `/admin/finance/cash/opening-balance/{year}`.
   - KPI: `Saldo inizio anno`, `Pre-conti entrate`, `Spese varie uscite`, `Saldo periodo` (entrate − uscite).
   - Tabella: Data / Tipo (badge `📥 Pre-conto` emerald o `💸 <categoria>` con colore dinamico da `COLOR_MAP`) / Descrizione / Entrata / Uscita / Cumulativo.
   - Cumulativo parte da 0 all'inizio del periodo (non ancorato: il saldo ancorato all'opening balance vive già in `SezioneSpeseVarie`). Nota esplicativa in fondo.
   - Nav mese + filtro data da/a speculari a `SubFlussoContanti`.
4. Le funzioni `SezionePreconti` e `SezioneSpeseVarie` sono rimaste invariate: solo `MENU_BASE` e il wrapper sono cambiati.

### File toccati (iter 3)
- `frontend/src/pages/admin/GestioneContanti.jsx` → `MENU_BASE` 4→3 voci, render `SezioneSpeseUnificata` sul key `spese-varie`, nuovi componenti `SezioneSpeseUnificata` + `SubFlussoSpese`.

### Verifiche sintassi (iter 3)
- esbuild `GestioneContanti.jsx` → OK.
- esbuild `BancaImpostazioni.jsx` → OK (non modificato, doppio check).

### Iterazione 4 (stessa sessione 54)
Marco: "in spese varie c'è un tastino per impostare il saldo iniziale, spostalo in flusso spese e permetti di indicare la data iniziale".

Implementato:
1. **BE**: nuova tabella `cash_spese_baseline` in `admin_finance.sqlite3` (single-row id=1) — campi `baseline_date`, `baseline_value`, `note`, `updated_by`, `updated_at`.
2. **BE**: helper `_ensure_cash_spese_baseline_table` + `_get_cash_spese_baseline`, modello Pydantic `CashSpeseBaseline`, endpoints `GET /admin/finance/cash/spese/baseline` e `PUT /admin/finance/cash/spese/baseline` (PUT solo admin/superadmin).
3. **FE SubFlussoSpese**: form collapsibile "Baseline saldo cassa pre-conti" con input `Data iniziale` + `Importo €` + `Note` + Salva/Rimuovi/Annulla. Visibile solo ad admin/superadmin (lettura `localStorage.role` + `isSuperAdminRole`).
4. **FE SubFlussoSpese**: logica saldo iniziale ancorato al baseline:
   - Se `baseline_date` è settato e cade ≤ `period_from`: fetch aggiuntivo preconti+spese nel range `[baseline_date, period_from-1]` → `saldoIniziale = baseline_value + preconti_pre − spese_pre`.
   - Altrimenti: saldoIniziale = 0.
   - Il cumulativo della tabella ora parte da `saldoIniziale` invece che da 0; nuova metrica `saldoFinale` al posto di `saldoPeriodo`.
5. **FE SubFlussoSpese**: KPI aggiornati — "Saldo iniziale" (con info baseline date), "Pre-conti entrate", "Spese varie uscite", "Saldo finale". Nota esplicativa in basso che si adatta a baseline attivo/non attivo.
6. **FE SezioneSpeseVarie**: rimosso il bottone "Imposta saldo iniziale" + form + handler + state (`showBalanceForm`, `balanceInput`, `balanceNoteInput`, `savingBalance`, `handleSaveBalance`). Sostituito con un hint che rimanda a "Flusso spese → Baseline saldo". La lettura dell'opening balance annuale per il KPI "Saldo anno" resta invariata (due sistemi paralleli di sola lettura per SezioneSpeseVarie, migrazione manuale se serve).

### File toccati (iter 4)
- `app/routers/admin_finance.py` → blocco BASELINE CASSA SPESE VARIE (tabella + helper + Pydantic + 2 endpoint).
- `frontend/src/pages/admin/GestioneContanti.jsx` → `SezioneSpeseVarie` pulita (form rimosso, hint aggiunto) + `SubFlussoSpese` riscritto con baseline form/state/logic, fetch pre-range, saldo iniziale/finale ancorati, handlers save/reset.

### Verifiche sintassi (iter 4)
- `python3 -m py_compile admin_finance.py` → OK.
- esbuild `GestioneContanti.jsx` → OK.

---

## SESSIONE 53 cont. (2026-04-21 pomeriggio) — VETTORE CORRUZIONE IDENTIFICATO + FIX IN PRODUZIONE

### Diagnosi (dopo richiamo di Marco a non cercare colpe esterne)
Riesame profondo di tutto il lavoro del 20/04: il vettore reale era nel commit `c31d70c` (20/04 19:23 — Vini v3.19 Fase 6 storico prezzi BE, *non* nel push S52 scagionato a metà giornata). Tre problemi cumulati nello stesso commit:
1. `init_magazzino_database()` apriva una scrittura su `sqlite_master` ad ogni boot del router (`CREATE TABLE IF NOT EXISTS vini_prezzi_storico` + `CREATE INDEX IF NOT EXISTS idx_vps_vino_data` con CHECK constraint).
2. `upsert_vino_from_carta()` e `update_vino()` accorpavano in **una singola transazione lunga** l'UPDATE/UPSERT su `vini_magazzino` + l'INSERT log su `vini_prezzi_storico`, con commit finale unico (commit intermedio rimosso).

Quando il push FE-only `da9b605` delle 22:29 ha riavviato il backend, il SIGTERM è arrivato mentre c'erano frame WAL misti su una transazione aperta → fsync interrotto → `sqlite_master` inconsistente → `malformed database schema`. Le 3 corruzioni successive (22:51, 23:16, 00:53) sono lo stesso pattern ripetuto durante la finestra di debug attivo con push concorrenti.

### Fix applicato (file unico `app/models/vini_magazzino_db.py`)
1. **`init_magazzino_database()`**: `SELECT 1 FROM sqlite_master` prima di `CREATE TABLE/INDEX` → zero scritture su sqlite_master a ogni boot.
2. **`upsert_vino_from_carta()`**: `conn.commit()` SUBITO dopo l'UPSERT principale; log storico in transazione separata best-effort (try/rollback).
3. **`update_vino()`**: stesso pattern.
4. `bulk_update_vini` lasciato com'è (atomicità voluta per ricalcolo-tutti, usato solo in operazioni manuali — finestra di esposizione molto stretta).

Sintassi verificata con `ast.parse()` → OK. Diff: +56/-29 righe su un solo file.

### Stato post-push
- S52-1 spostato in **osservazione** (declassabile a chiuso dopo 24-48h di servizio reale senza re-manifestazione).
- Da fare: riavviare monitor forense (`/tmp/trgb_monitor.sh`) in occasione del prossimo servizio pranzo/cena per validare sotto carico reale.
- Push S52 definitivamente scagionato: il danno era già nel codice 19:23 del 20/04, S52 ha solo propagato lo stato corrotto scaricato dal VPS.

### Lezione di metodo (per Claude)
Quando inseguo un vettore di corruzione SQLite e l'ipotesi 1 non regge: **non saltare a una nuova ipotesi esterna**, ma rifare un riesame *delle modifiche del codice già fatte nella sessione*, transazione per transazione. La causa più probabile è una scrittura su `sqlite_master` o una transazione lunga interrotta da SIGTERM, generata da uno dei miei commit recenti.

---

## SESSIONE 53 (2026-04-21 ~12:00-12:55) — 5ª CORRUZIONE + RECOVERY DA `.prev` LOCALE

### Contesto
Marco ha pushato il deliverable di sessione 52 (hardening 1.11.2 + cleanup `vini_db` + anti-conflitto). Al rientro: backend in **crash loop, 530+ restart in ~50 minuti** (Restart=on-failure, RestartSec=5). Stesso pattern: `malformed database schema (idx_vm_tipologia) - index ... already exists` su `vini_magazzino.sqlite3`. **5ª corruzione consecutiva.**

### Indagine (corretta dopo richiamo di Marco)
Inizialmente ho perso tempo facendo forensics VPS-side (`.recover` → solo `lost_and_found`, dati strutturalmente persi). Marco ha richiamato all'ordine: `push.sh` salva `cp $db → ${db}.prev` **prima** di scaricare il DB dal VPS, quindi il **backup sano della push precedente è già nel workspace locale**.

Verifica `.prev` (Python sqlite3 dopo `cp` su `/tmp` ext4 — FUSE workspace blocca SQLite I/O):
- 8 tabelle integre, `vini_magazzino`: **1261 righe**, `vini_magazzino_movimenti`: 267 righe
- `MAX(updated_at) = 2026-04-20T20:34:31` (= ultimo write reale prima della 1ª corruzione delle 22:43 di ieri)

### Recovery #5 (12:49:58 CEST) — eseguita da Marco
1. Mac: `scp app/data/vini_magazzino.sqlite3.prev trgb:/tmp/vini_magazzino.RESTORE.sqlite3` (652KB)
2. VPS: `systemctl stop trgb-backend` → backup corrotto come `CORROTTO-5-20260421-*` → `cp RESTORE → vini_magazzino.sqlite3` → chown marco:marco → `rm -f vini_magazzino.sqlite3-wal vini_magazzino.sqlite3-shm` → `systemctl start trgb-backend`
3. **Servizio UP alle 12:49:58 CEST** (PID 3232683, 115.4MB), `quick_check = ok`

### Verità forense importante (da non perdere)
**Il push di sessione 52 NON è il vettore di corruzione.** Cronologia:
- 20/04 22:43 → 1ª corruzione (sessione 51, recovery #1)
- 20/04 22:51 → 2ª corruzione
- 20/04 23:16 → 3ª corruzione
- 21/04 00:53 → 4ª corruzione (sessione 51 cont., recovery #4)
- 21/04 ~mattina → DB locale `.sqlite3` viene scaricato dal VPS già corrotto durante push di sessione 52
- 21/04 12:00 ca. → 5ª manifestazione (in realtà è il riapparire della 4ª, perché `.prev` mostra MAX(updated_at)=20:34 di ieri = stato **prima** della 1ª corruzione)

**Conseguenza:** la finestra reale da indagare è **20/04 22:00 → 21/04 02:00** (4 corruzioni in 2.5h durante debug attivo + push concorrenti). Il push S52 ha solo *propagato* lo stato corrotto.

### Perdita dati
Tutti i write di `vini_magazzino` tra **20/04 20:34 e 21/04 12:49** sono persi dal DB ufficiale. Per il servizio cena del 20/04 (20:34 → 22:43, ~2h), c'è una possibilità di recupero parziale dal file VPS `vini_magazzino.BACKUP-20260420-223719.sqlite3` (corrotto solo per `idx_vm_tipologia` duplicato, dati probabilmente intatti — da verificare con `.recover` o riprovare `.dump` ignorando il primo errore).

### Lezione di metodo (per Claude — già in memoria)
Quando il backend va giù dopo un push e c'è una `.sqlite3.prev` nel workspace locale: **aprire `.prev` PRIMA di fare qualsiasi forensica VPS-side**. La diagnostica VPS serve solo dopo aver verificato lo stato del backup di partenza.

### Pendenze sessione 53
1. **S52-1 NON declassabile**: il vettore vero non è ancora chiaro. Va aperta la finestra journalctl 20/04 22:00 → 21/04 02:00.
2. Decidere se tentare recupero delta cena 20:34-22:43 da `BACKUP-20260420-223719`.
3. Aggiornare `problemi.md` (S52-1 con manifestazione #5) e `changelog.md`.
4. Eventuale unificazione 1.14.a (anti-conflitto soft-check) con Level 1 del mattone housekeeping (proposto da audit S51).

---

## SESSIONE 52 (2026-04-21 mattina) — HARDENING POST 4° CORRUZIONE + METODO ANTI-CONFLITTO

### Contesto
Fix 1.11 (WAL + `.gitignore` `*.sqlite3-wal`/`-shm`) **non ha chiuso** il problema:
alle 00:53 è avvenuta una **quarta corruzione** di `vini_magazzino.sqlite3` **prima** del push
delle 00:54 → la causa radice iniziale (push → `git clean -fd` → WAL cancellato) spiega
solo parte degli eventi. Esiste un secondo vettore di corruzione ancora ignoto.

Dopo recovery #4 (01:12, da backup hourly 22:00 + WAL + synchronous=NORMAL + VACUUM) il
backend è rimasto **UP per 9.5h consecutive** con monitor forense attivo (`/tmp/trgb_monitor.sh`):
oltre 1000 letture `PRAGMA quick_check` ogni 30s, **tutte `ok`**. DB stabile a 659456 bytes,
nessun file `-wal` creato (nessuno ha scritto sul DB stanotte = non test di carico vero).

### Indagine codice (stamattina)
1. **Commit sospetto c31d70c** ("Vini v3.19: widget riordini Fase 6 — storico prezzi BE") ispezionato a fondo: `CREATE TABLE IF NOT EXISTS vini_prezzi_storico` + `CREATE INDEX IF NOT EXISTS idx_vps_vino_data` sono idempotenti. Gli hook in `update_vino` / `bulk_update_vini` / `upsert_vino_from_carta` fanno **solo INSERT**, nessun DDL runtime. **Commit scagionato dal ruolo di colpevole diretto.**
2. **Import rotti `vini_db`** — trovati 3 riferimenti a `from app.models import vini_db` (modulo inesistente) in `dashboard_router.py:739`, `dashboard_router.py:806`, `alert_engine.py:404`. L'errore `cannot import name 'vini_db' from 'app.models'` visto nel log 00:36 si origina da qui. Non causa direttamente corruzione sqlite_master, ma è codice morto che va pulito.
3. **`init_magazzino_database()`** è chiamata a import-time del router (`vini_magazzino_router.py:249`): idempotente per i `CREATE ... IF NOT EXISTS`. Il blocco migration MODIFICA (linee 471-518) è pericoloso solo alla PRIMA esecuzione dopo upgrade (già passata).

### Teoria di lavoro residua
Il pattern delle 4 corruzioni (22:29, 22:51, 23:16, 00:53 — 20-25 min di intervallo
durante finestra di debug attivo con push concorrenti) e il silenzio delle 9.5h
successive (zero push, zero uso) suggeriscono **SIGTERM al backend mid-write concorrente
a write pendenti nel WAL**. La fix 1.11 (WAL persistente + `.gitignore` protetto +
`synchronous=NORMAL` + `busy_timeout=30000`) **dovrebbe** aver ridotto la finestra di
vulnerabilità, ma il test vero è oggi sotto carico reale + push.

### Piano sessione 52 (questa sessione)
| Blocco | Cosa | Effort | Stato |
|--------|------|--------|-------|
| **A** | Fix 3 import morti `vini_db` → `vini_magazzino_db` | XS | ▶️ in corso |
| **B** | Fix 1.11.2: WAL + `synchronous=NORMAL` + `busy_timeout=30000` sui DB rimanenti (`bevande`, `clienti`, `tasks`, `settings`, `dipendenti`, `admin_finance`, `core/database.py`) | S | ▶️ in corso |
| **C** | Monitor forense resta attivo oggi — se corruzione ricapita sotto carico reale avremo timestamp ±30s correlabile a journalctl | — | attivo |
| **D** | Metodo anti-conflitto push ↔ uso attivo (vedi sotto + `docs/deploy.md`) | S | ▶️ in corso |

### Deliverable pronti per push (atomico)
- `app/routers/dashboard_router.py` (2 fix import)
- `app/services/alert_engine.py` (1 fix import)
- `app/models/bevande_db.py` / `clienti_db.py` / `tasks_db.py` / ecc. (PRAGMA WAL)
- `app/core/database.py` (PRAGMA WAL)
- `docs/deploy.md` (sezione 6 — anti-conflitto)
- `docs/sessione.md`, `docs/problemi.md`, `docs/roadmap.md`, `docs/changelog.md`

**Commit suggerito:** `./push.sh "Hardening 1.11.2: WAL esteso a tutti DB + fix import vini_db morti + metodo anti-conflitto push/uso documentato"`

---

## SESSIONE 51 cont. (2026-04-21 00:55) — POST-MORTEM CORRUZIONI: causa radice trovata + fix 1.11 applicato

### Contesto
La sessione 51 (20/04) si era chiusa con due recovery SQLite e passaggio manuale a WAL.
Durante l'aggiornamento docs post-sessione ho fatto il terzo push della serata (23:13).
Al mio rientro per check log (21/04 ~00:30), il backend era in **crash loop da ~2h**
con la stessa corruzione (restart counter 646). Terzo incidente dello stesso tipo.

### Causa radice (trovata dopo il terzo recovery)
**Bug nel `.gitignore`.** Il file aveva:
```
app/data/*.db-wal    ← protegge foodcost
app/data/*.db-shm    ← protegge foodcost
app/data/*.sqlite3   ← vini, notifiche, clienti, ecc.
# MANCAVA: app/data/*.sqlite3-wal
# MANCAVA: app/data/*.sqlite3-shm
```

Flusso corruzione a ogni push:
1. DB in WAL → nascono `vini_magazzino.sqlite3-wal` e `-shm`
2. `push.sh` → post-receive VPS → **`git clean -fd`** → cancella i due file non gitignored
3. `systemctl restart trgb-backend` → SQLite riapre senza WAL → sqlite_master corrotto

Match perfetto log deploy: 22:29, 22:51, 23:13 (+ 23:16) = push = corruzioni.
Foodcost salvo perché i suoi `-wal`/`-shm` erano gia' gitignored.

### Fix 1.11 applicato (commit successivo a questo doc)
1. **`.gitignore`**: aggiunte `app/data/*.sqlite3-wal` e `*.sqlite3-shm` con commento storico.
2. **`app/models/vini_magazzino_db.py`** → v1.6-wal-protected: `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000` in `get_magazzino_connection()`.
3. **`app/models/notifiche_db.py`** → v1.1-wal-protected: stessi 3 PRAGMA.
4. **`app/models/foodcost_db.py`**: aggiunto `synchronous=NORMAL` (WAL gia' presente).

### Recovery #3 (00:32)
- Preservato corrotto attuale come `CORROTTO-3-003238.sqlite3`
- `.dump` da `BACKUP-20260420-223719.sqlite3` → 647KB pulito
- `PRAGMA journal_mode=WAL; synchronous=NORMAL; VACUUM;`
- COUNT 1261 vini ✅, integrity ok ✅, swap + restart ok
- Backend `active (running)` alle 00:32:47, endpoint HTTP 200/401 ✅

### Deliverable pronto per push (atomico, critico)
- `.gitignore` (2 righe + commento)
- `app/models/vini_magazzino_db.py` (v1.6)
- `app/models/foodcost_db.py`
- `app/models/notifiche_db.py` (v1.1)
- `docs/changelog.md` (entry post-mortem)
- `docs/problemi.md` (S51-1 ora con causa radice)
- `docs/roadmap.md` (1.11 ✅, 1.11.2 nuovo, 1.12 downgrade priorita')
- `docs/sessione.md` (questa sezione)

### Follow-up aperti
- **1.11.2** coprire con WAL anche: `bevande`, `clienti`, `tasks`, `settings`, `dipendenti`, `admin_finance`, `core/database.py`
- **1.12** `push.sh` debounce anti-doppio-push (priorità ora media, il bug principale è risolto)
- **1.13** cleanup backup forensi quando stabile: ora ci sono anche `CORROTTO-3-*` e `FORENSE-2251`

### Comando push (atomico)
```
./push.sh "fix 1.11: WAL + .gitignore -wal/-shm — risolve corruzioni SQLite sessione 51 (post-mortem)"
```

⚠️ **ATTENZIONE AL PRIMO PUSH DOPO QUESTO FIX**: verificare che il backend torni UP
con `systemctl status trgb-backend` e `curl https://trgb.tregobbi.it/`. Se il DB è gia'
in WAL (lo è: abbiamo fatto recovery #3), il push NON dovrebbe corrompere, perché:
- Le nuove righe `.gitignore` escludono `-wal`/`-shm` da `git clean -fd`
- Il codice PRAGMA assicura che anche un DB ricreato da zero parta in WAL

---

## SESSIONE 51 — Vini v3.20 Fase 7 + v3.21 Fase 8 + TRIPLO recovery SQLite + WAL ✅ (testato OK)

Serata lunga: completate le ultime due fasi del refactor widget "📦 Riordini per fornitore" (v3.20 Fase 7 listino inline, v3.21 Fase 8 storico prezzi in SchedaVino), intervallate da **due crash del backend per corruzione di `sqlite_master`** su `vini_magazzino.sqlite3`. Entrambe recuperate col pattern dump+restore documentato nella memoria `feedback_sqlite_corruption_recovery.md`.

**Lato feature — v3.20 Fase 7 (listino inline in DashboardVini):**
- `frontend/src/pages/vini/DashboardVini.jsx` → colonna "Listino" editabile click-per-click (come già era per Prezzo Carta in Fase 5).
- Invio POST `/vini/magazzino/{id}/` con `origine="GESTIONALE-EDIT"`: l'hook Fase 6 logga automaticamente la variazione in `vini_prezzi_storico`.
- Feedback: spinner inline + toast successo/errore.

**Lato feature — v3.21 Fase 8 (sezione "Storico prezzi" in SchedaVino):**
- `frontend/src/pages/vini/SchedaVino.jsx` → header `v1.3-riordini-fase8`.
- Nuovo state: `prezziStorico`, `prezziLoading`, `prezziFiltroCampo` (listino / acquisto / ricarico / tutti).
- `fetchPrezziStorico()` → `GET /vini/magazzino/{id}/prezzi-storico/` → chiamato al mount e dopo ogni `saveEdit()` (riflette subito le modifiche locali).
- UI: pill di filtro + tabella con colonne Data · Campo · Prima · Dopo · Δ · Origine · Utente · Note. Δ visualizzato con ▲ rosso / ▼ verde (tolleranza 0.005), mapping amichevole di campo e origine (`GESTIONALE-EDIT`, `IMPORT-CSV`, `SCANNER-OCR`…).
- Nessuna modifica BE: endpoint già presente da Fase 6.

**Lato infrastruttura — doppio recovery SQLite:**

**Incidente #1 (22:37–22:43):**
- Push di Fase 6 aveva lasciato `sqlite_master` con duplicati su `locazioni_config`, `matrice_celle`, tutti gli `idx_vm_*`.
- Errore ciclico: `sqlite3.DatabaseError: malformed database schema (idx_vm_tipologia) - index already exists`.
- `PRAGMA integrity_check` fallisce; `REINDEX` fallisce con lo stesso errore (corruzione a livello catalogo).
- **Recovery:** `sqlite3 vini_magazzino.sqlite3 ".dump" | sqlite3 vini_magazzino_NEW.sqlite3` — gli errori `UNIQUE constraint` sono ATTESI (sono i duplicati scartati). File risultante 647KB, 1261 vini intatti.
- Backend UP alle 22:43.

**Incidente #2 (22:51–23:07):**
- Secondo `./push.sh` lanciato a 5 minuti dal primo → SIGTERM al backend mentre stava scrivendo schema (senza WAL, write atomic non garantito).
- Corruzione più grave: `malformed database schema (?)` — entry in `sqlite_master` con nome NULL.
- **PATH A (`.recover` sul file corrotto):** fallito — il DB recuperato (978KB) era privo della tabella `vini_magazzino`. Il `.recover` di SQLite non è riuscito a ricostruire la tabella principale.
- **PATH B (`.dump` dal `BACKUP-20260420-223719`):** successo — file 647KB con full schema, 1261 vini, `integrity_check = ok`, stessi errori UNIQUE attesi come incidente #1.
- Accettata micro-perdita dati nella finestra 22:29–22:51 (trascurabile: backend in crash loop quasi tutto il tempo, Marco ha confermato che nessuno ha usato l'app in quella finestra).
- **Recovery PATH B + switch a WAL:** `VACUUM` + `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` prima dello swap. Backend UP alle 23:07, HTTP 200 su backend e frontend, WAL attivo → protezione contro SIGTERM mid-write in futuro.

**Deliverable:**
- FE: `DashboardVini.jsx` (Fase 7), `SchedaVino.jsx` v1.3-riordini-fase8 (Fase 8), `versions.jsx` vini 3.19 → 3.20 → 3.21.
- BE: nessuna modifica (endpoint Fase 6 già esistente).
- Docs: `changelog.md` (entry v3.20 + v3.21), `sessione.md` (questa sezione).
- Memoria: nuova entry `feedback_sqlite_corruption_recovery.md` in auto-memory, referenziata in `MEMORY.md`.
- VPS: `vini_magazzino.sqlite3` ora in WAL mode (file 647KB pulito, 1261 vini). Backup forensi conservati: `CORROTTO-20260420-224312` (incidente #1), `CORROTTO-2.20260420-230727` (incidente #2), `FORENSE-2251`, `BACKUP-20260420-223719`.

**Testato OK post-recovery (Marco ha confermato tutti i test):**
1. DashboardVini → colonna Listino editabile inline, salva con hook Fase 6 → entry in storico.
2. SchedaVino → sezione "Storico prezzi" popolata, filtri pill funzionanti, Δ colorato correttamente.
3. Modifica listino da dashboard → refresh scheda → storico aggiornato.
4. Backend stabile su WAL, frontend HTTP 200.

**Follow-up da fare in push dedicato (NON urgente, quando si tocca backend vini):**
- Aggiungere `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` dentro `init_magazzino_database()` in `app/models/vini_magazzino_db.py`, così anche se il file viene ricreato da zero parte in WAL. Da replicare in init di `foodcost.db` e `notifiche.sqlite3` per simmetria.
- Considerare debounce in `push.sh`: se l'ultimo push è < 30 secondi fa → blocca con messaggio. Evita doppio push accidentale che manda SIGTERM mentre il backend sta facendo `init_*_database()`.
- Pulizia backup forensi: tra 1-2 giorni, tenere solo `CORROTTO-2.20260420-230727.sqlite3` come evidenza e rimuovere gli altri.

**Comandi push già eseguiti (storici):**
```
./push.sh "Vini v3.20: widget riordini Fase 7 — listino inline edit in DashboardVini"
./push.sh "Vini v3.21: widget riordini Fase 7 + SchedaVino Fase 8 — listino inline edit + sezione storico prezzi"
```

**Stato refactor widget "📦 Riordini per fornitore":** CHIUSO ✅ (tutte le 8 fasi in produzione da v3.21).

---

## SESSIONE 50quinquies — Vini v3.14: Ordine Categorie + TOC macro D.3 + skip vuote + numeri pagina ✅ (da testare post-push)

Quattro fix convergenti sulla Carta Bevande:

**1. Frecce ↑↓ via dalla sidebar, Ordine Categorie in Impostazioni**
- Marco: *"La gestione dell'ordinamento che vive nella pagina carta non mi piace per nulla"*. Le frecce admin in sidebar erano incoerenti col resto della UI ordinamento (Impostazioni Vini > Ordinamento Carta).
- `CartaBevande.jsx` → v2.3-shell: rimosse frecce, `moveSezione()`, role/isAdmin. Sidebar = sola navigazione.
- `ViniImpostazioni.jsx` → tab "Ordinamento Carta" guadagna come **prima zona** "Ordine Categorie", cornice ambra uniforme alle altre zone. Usa `OrderList` + `POST /bevande/sezioni/reorder` (endpoint gia' esistente).

**2. TOC PDF — macro-sezioni leggibili (variante D.3)**
- Marco: *"nell'indice la macro categoria (vini, amari…) e' veramente poco visibile"*. Prima le macro ("Vini", "Aperitivi", "Amari di Casa") usavano `.toc-tipologia` identica alle sotto-voci ("Rossi", "Bianchi").
- Iterazione a 3 round di mockup (in `docs/mockups/mockup_toc_macro.html`): R1 decorativo → rifiutato ("terribile, gioca col testo"); R2 5 varianti solo tipografia → scelta variante D (grande ma light); R3 D × 3 colori reali → scelta **D.3**.
- Aggiunta classe `.toc-macro` in `static/css/carta_pdf.css`: 18pt · peso 400 · uppercase · tracking 0.32em · colore `#5a4634` (marrone-terra, stesso delle nazioni).
- `build_toc_html` in `carta_bevande_service.py` emette `.toc-macro` per le macro (sia "Vini" che le 7 sezioni bevande standard); `.toc-tipologia` resta per il sotto-indice vini (Rossi/Bianchi/Bollicine).

**3. Skip sezioni vuote da TOC e corpo**
- Marco: *"compaiono ancora le categorie vuote, riusciamo a nasconderle?"*. Sezioni senza voci attive (es. "Tisane" senza record) apparivano come `<h2>` vuoto nel corpo e nell'indice.
- `build_carta_bevande_html` in `carta_bevande_service.py`: salta il blocco vini se `vini_rows` + `calici_rows` sono entrambi vuoti; salta le sezioni standard se `_load_voci_attive(key)` torna lista vuota.
- TOC era già coerente via `counts.attive` — ora i due builder (TOC + corpo) applicano lo stesso filtro.

**4. Numeri di pagina nell'indice PDF (WeasyPrint target-counter)**
- Marco: *"volevo chiederti se riusciamo a gestire i numeri pagine nell'indice"*.
- Aggiunte ancore nel corpo:
  - `build_section_html` → `<section id='sez-<key>'>` per ogni sezione bevande
  - `build_carta_bevande_html` → `<section id='sez-vini'>` sul blocco vini
  - `build_carta_body_html` in `carta_vini_service.py` → `<h2 id='vini-tip-<slug>'>` per ogni tipologia
- `build_toc_html` e `build_carta_toc_html` ora emettono ancore `<a class='toc-macro|toc-tipologia' href='#…'>` con struttura `<span class='toc-name'>…</span><span class='toc-leader'></span><span class='toc-pn'></span>`.
- CSS `carta_pdf.css`:
  - `.toc-macro`/`.toc-tipologia` convertiti a flex-anchor (display:flex, align-items:baseline, text-decoration:none)
  - `.toc-leader` → flex:1 con border-bottom dotted `#b89b6d` (leader a punti nello stile carta)
  - `.toc-pn::after` → `content: target-counter(attr(href url), page)` — WeasyPrint legge l'href e sostituisce col numero di pagina reale
- Effetto: ogni macro (Vini, Aperitivi, Amari di Casa…) e ogni tipologia vini (Rossi, Bianchi, Bollicine…) nell'indice ora ha linea dotted + numero pagina a destra. Comportamento da carta stampata professionale.

**Deliverable:**
- FE: `CartaBevande.jsx` v2.3-shell, `ViniImpostazioni.jsx` (+ zona Ordine Categorie), `versions.jsx` vini 3.13 → 3.14.
- BE:
  - `carta_bevande_service.py` → `build_toc_html` emette `.toc-macro` come ancora; `build_section_html` aggiunge `id='sez-<key>'`; `build_carta_bevande_html` aggiunge `id='sez-vini'` e skippa sezioni/vini vuoti.
  - `carta_vini_service.py` → `build_carta_toc_html` emette `.toc-tipologia` come ancora; `build_carta_body_html` aggiunge `id='vini-tip-<slug>'`.
  - `static/css/carta_pdf.css` → `.toc-macro`/`.toc-tipologia` flex-anchor + `.toc-leader` dotted + `.toc-pn::after` con `target-counter`.
- Docs: mockup conservato in `docs/mockups/mockup_toc_macro.html`, changelog, sessione.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta/aperitivi` → sidebar pulita, nessuna freccia ↑↓.
2. `/vini/impostazioni/ordinamento-carta` → prima zona "Ordine Categorie" con le 8 sezioni (vini + 7 bevande). Drag/up/down riordina, "Salva" persiste.
3. Dopo save: refresh → ordine persiste sia qui sia nella sidebar di `/vini/carta`.
4. Export PDF (`📄 PDF`) da `/vini/carta/*` → aprire → indice: "VINI"/"APERITIVI"/"AMARI DI CASA"/… in uppercase grande chiaro, ben staccate dalle sotto-voci Rossi/Bianchi.
5. Ordine nell'indice PDF rispetta il nuovo "Ordine Categorie".
6. **NUOVO** — indice PDF: ogni macro (e ogni tipologia vini) ha linea dotted + numero pagina a destra. I numeri corrispondono alla pagina dove compare effettivamente la sezione nel corpo.
7. **NUOVO** — sezioni senza voci attive (es. "Tisane", "Distillati" se vuoti) NON compaiono più né nell'indice né nel corpo.
8. PDF Staff e Word: stesso comportamento (Word usa il suo template DOCX, solo PDF è impattato dal CSS).

**Comando push:**
```
./push.sh "Vini v3.14: Ordine Categorie in Impostazioni + TOC macro D.3 + skip sezioni vuote + numeri pagina nell'indice"
```

---

## SESSIONE 50quater — Home v3.6: Selezioni sotto "Gestione Cucina" ✅ (da testare post-push)

Marco: *"il modulo selezioni vive in cucina, non deve avere tile suo in home"*.

Cambio di mental model UI: Selezioni del Giorno non e' un modulo autonomo ma una funzione della cucina (preparata dai cuochi, letta da sala/sommelier). Sparisce come tile a se' stante, resta un widget in Home pagina 1 e diventa una sub-voce di "Gestione Cucina".

**Modifiche:**
- `frontend/src/pages/Home.jsx` — `visibleModules` esclude `m.key === "selezioni"`. Il widget `SelezioniCard` in pagina 1 (quello con 4 mini-blocchi: macellaio/pescato/salumi/formaggi) rimane invariato.
- `frontend/src/config/modulesMenu.js` — rimossa voce top-level `selezioni`. Aggiunte 4 sotto-voci `Selezioni · <zona>` dentro `ricette.sub` (Gestione Cucina). Route invariate (`/selezioni/<zona>`).
- `frontend/src/components/Header.jsx` — `currentModule` ora matcha anche `sub.go` del menu (non solo il prefix di `cfg.go`). Cosi' navigando a `/selezioni/*` l'header mostra "Gestione Cucina" come modulo attivo. Pattern generale, utile per futuri sub-menu cross-modulo.
- `frontend/src/config/versions.jsx` — home 3.5 → 3.6.

**Invarianti:**
- Route `/selezioni/*` non cambiano (no impatto bookmark/cronologia).
- Permessi da `modules.json` invariati (la sezione `selezioni` resta nel DB, solo la UI cambia).
- Widget SelezioniCard in Home pagina 1 resta.

**Da testare post-push (Ctrl+Shift+R):**
1. Home pagina 2 "Moduli" → non c'e' piu' la tile Selezioni.
2. Header dropdown → non c'e' piu' "Selezioni" come voce top-level.
3. Header dropdown → "Gestione Cucina" contiene le 4 voci `Selezioni · Macellaio/Pescato/Salumi/Formaggi`.
4. Clic su una voce Selezioni → naviga correttamente a `/selezioni/<zona>`.
5. Mentre si e' su `/selezioni/*` → Header mostra "📘 Gestione Cucina" come modulo corrente (non "Menu").
6. Widget SelezioniCard in Home pagina 1 invariato.

**Comando push:** `./push.sh "Home v3.6: Selezioni sotto Gestione Cucina, via tile top-level"`

---

## SESSIONE 50ter — Carta delle Bevande: fix form + riordino sezioni + fix auth export ✅ (da testare post-push)

Tre follow-up sulla shell sidebar (50bis):

**1. Bug form "un campo scrive su tutti"** — inserendo una nuova voce in una sezione, digitare nel campo "nome" popolava anche "ingredienti" e "note". Root cause: il seed backend usa `{"key": "nome", …}` mentre il FE leggeva `f.name` (undefined) → tutti i campi condividevano chiave `undefined` nello state. Fix lato FE: helper `fieldId(f) = f?.name ?? f?.key` in `FormDinamico.jsx` + `CartaSezioneEditor.jsx` (`validate`, `emptyFromSchema`, `importColumns`). Retro-compat con entrambe le convention, zero migrazioni.

**2. Riordino sezioni (gap UI)** — il backend ha sempre avuto `POST /bevande/sezioni/reorder` ma nessun punto UI lo usava. Aggiunte frecce ↑↓ nella sidebar della shell, visibili solo a admin/superadmin. `moveSezione(index, direction)` swappa col vicino, rinumera 10/20/30/…, POST batch, rollback ottimistico su errore. Stesso pattern del riordino voci dentro l'editor.

**3. Fix auth anteprima/export (bug segnalato da Marco mid-session)** — cliccando "Anteprima sezione" in una sezione (es. birre), il tab nuovo mostrava "Not authenticated". `window.open(url)` non inoltra l'header `Authorization: Bearer`. Stesso bug latente su PDF/PDF Staff/Word nell'header shell. Creato helper `frontend/src/utils/authFetch.js` con `openAuthedInNewTab(url, opts)`: apre subito un tab placeholder (bypass popup blocker), poi fa fetch con token, crea blob URL, lo carica nel tab. Usato in `CartaSezioneEditor` (anteprima sezione) e `CartaBevande` (PDF/PDF Staff/Word).

**Deliverable:**
- FE: `FormDinamico.jsx` v1.1, `CartaSezioneEditor.jsx` v1.2-panel, `CartaBevande.jsx` v2.2-shell, nuovo `utils/authFetch.js`, `versions.jsx` vini 3.12 → 3.13.
- Docs: changelog + questo file.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta/aperitivi` → clic "+ Nuova voce" → scrivere in "nome" NON popola gli altri campi.
2. Ripetere test per altre 6 sezioni (birre, amari_casa, amari_liquori, distillati, tisane, te).
3. Frecce ↑↓ in sidebar visibili SOLO per admin/superadmin.
4. Clic ↑ sulla seconda sezione → swap con la prima, toast verde, sidebar si riordina.
5. Clic ↓ sull'ultima → freccia disabilitata.
6. F5 dopo riordino → ordine persiste (DB aggiornato).
7. Export PDF/HTML/Word rispetta il nuovo ordine sezioni.
8. Clic "👁 Anteprima sezione" in birre → apre tab con HTML della sezione, NIENTE 401.
9. PDF / PDF Staff / Word nell'header shell → aprono correttamente.

**Comando push:**
```
./push.sh "Carta Bevande: fix form (key/name) + riordino sezioni admin + fix auth anteprima/export (vini v3.13)"
```

---

## SESSIONE 50bis — Carta delle Bevande: shell con sidebar 8 sezioni ✅ (da testare post-push)

Dopo aver visto funzionare la shell di Selezioni del Giorno, Marco ha chiesto lo stesso pattern per la pagina `/vini/carta`. Prima era un hub-griglia con 8 card (Vini + 7 sezioni bevande); ora è una shell con sidebar a sinistra (8 voci sezione) e pannello a destra che cambia in base a `:sezione` nell'URL. Stesso layout di `SelezioniDelGiorno` e `ViniImpostazioni`.

**Decisioni:**
- Shell `/vini/carta/:sezione` rimpiazza l'hub-griglia.
- `CartaVini` e `CartaSezioneEditor` trasformati in **panel senza wrapper** (niente `min-h-screen`, niente `<ViniNav>`, niente bottone "← Carta"): ora sono blocchi renderizzati dentro la shell.
- `CartaSezioneEditor` riceve la sezione da prop `sezioneKey` invece che da `useParams()`.
- Default redirect `/vini/carta` → `/vini/carta/vini` (niente schermata intermedia).
- Redirect legacy `/vini/carta/sezione/:key` → `/vini/carta/:key`.
- Export buttons (PDF / PDF Staff / Word) e Btn "👁 Anteprima" vivono nell'header della shell, visibili per tutte le sezioni.
- `ViniNav` renderizzato una sola volta dalla shell, i panel non lo includono più.
- `CartaVini` e `CartaSezioneEditor` importati staticamente in `CartaBevande` (rimossi lazy imports doppi in App.jsx).

**Deliverable:**
- FE: `CartaBevande.jsx` v2.0-shell, `CartaVini.jsx` v3.6-panel, `CartaSezioneEditor.jsx` v1.1-panel, `App.jsx` nuove route + RedirectLegacySezione, `versions.jsx` vini 3.11 → 3.12.
- Docs: changelog + questo file.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta` redirige immediatamente a `/vini/carta/vini` — no schermata intermedia hub-griglia.
2. Sidebar mostra 8 sezioni con icone e contatori. Click su sezione cambia URL e pannello senza ricaricare.
3. Sezione "Vini" mostra anteprima embedded + 4 Btn (Aggiorna Anteprima / HTML / PDF / Word) dedicati.
4. Sezioni editabili (es. "Aperitivi") mostrano tabella + Btn "+ Nuova voce" + modal form + import testo.
5. Vecchi link `/vini/carta/sezione/aperitivi` redirigono a `/vini/carta/aperitivi`.
6. Btn "👁 Anteprima" in header shell apre `/vini/carta/anteprima` (pagina separata).
7. Btn PDF / PDF Staff / Word in header aprono i download bevande.
8. ViniNav in cima alla pagina con tab "Carta" evidenziata, una sola volta (no doppio nav).

---

## SESSIONE 50 — Selezioni del Giorno: 4 zone unificate ✅ (da testare post-push)

Refactor del lavoro fatto poco prima (Scelta del Macellaio + Scelta dei Salumi + Scelta dei Formaggi) in un **modulo unico "Selezioni del Giorno"** con 4 zone (Macellaio, Pescato, Salumi, Formaggi). Marco voleva una sola voce di menu con sidebar di navigazione fra le 4 zone, stile uniformato alle pagine "Impostazioni" gia' usate (ViniImpostazioni / ClientiImpostazioni).

**Decisioni architetturali:**
- **Aggiunta quarta zona "Pescato"** (modello macellaio + campo `zona_fao`). Categorie seed Crudo/Cotto/Crostacei/Molluschi.
- **Salumi/Formaggi: nuovo modello stato** "attivo/archiviato" (toggle in carta ↔ archivio) al posto del modello venduto/disponibile. Niente piu' grammatura/prezzo nella UI nuova. Mantenute le colonne legacy `venduto`/`venduto_at` per retrocompat. PATCH `/venduto` deprecato (alias che setta entrambi).
- **Pagina shell unica `/selezioni/:zona`** con sidebar a sinistra (stile ViniImpostazioni: `w-56 flex-shrink-0`, nav space-y-0.5, accent attivo per zona) + content area che monta `<ZonaPanel zona={zona} />` generico guidato da `ZONA_CONFIG`. Una sola pagina, 4 comportamenti via config.
- **Widget Home unificato `SelezioniCard`**: 2x2 con 4 mini-blocchi colorati (rosso/azzurro/ambra/giallo). Sostituisce le 3 card separate `MacellaioCard`/`SalumiCard`/`FormaggiCard` in Home e DashboardSala. Click su mini-blocco → `/selezioni/<zona>`.
- **modules_router**: nuovo modulo top-level `selezioni` con sub `macellaio/pescato/salumi/formaggi`; sub equivalenti rimossi dal modulo `ricette`.
- **Redirect legacy**: `/macellaio`, `/salumi`, `/formaggi`, `/pescato` → `/selezioni/<zona>`.

**Deliverable:**
- BE: migrazione 094 (pescato), router `scelta_pescato_router.py`, refactor `scelta_salumi_router` e `scelta_formaggi_router` (v1.1 attivo/archiviato), `dashboard_router` con `_pescato_widget` + `SelezioniWidget` raggruppato, `modules_router` con nuovo modulo `selezioni`.
- FE: `pages/selezioni/zonaConfig.js` (4 config), `ZonaPanel.jsx` (CRUD generico), `SelezioniDelGiorno.jsx` (shell + sidebar), `components/widgets/SelezioniCard.jsx` (widget 2x2 unificato). App.jsx con nuova route + redirect legacy. modulesMenu.js con voce unica. Home.jsx + DashboardSala.jsx aggiornati. versions.jsx con `selezioni v1.0 beta`.
- Docs: changelog + questo file.

**Da testare post-push:**
1. Migrazione 094: log avvio backend deve creare `pescato_tagli`, `pescato_categorie`, `pescato_config` con i 4 seed.
2. Push con `-m`: auto-detect dovrebbe attivarsi (modules_router cambia hash JSON moduli).
3. Login admin → dropdown deve mostrare "Selezioni del Giorno" 🍽️ con 4 sub (Macellaio, Pescato, Salumi, Formaggi). Le voci vecchie sotto Gestione Cucina devono sparire.
4. Click su "Macellaio" → URL `/selezioni/macellaio`, sidebar con 4 zone, accent rosso sulla zona attiva. Switch fra zone via sidebar deve cambiare URL e contenuto.
5. Aggiungere un pescato con `zona_fao` "FAO 37.2.1 Adriatico" → controllare che il campo extra sia salvato e mostrato nella tabella.
6. Aggiungere un salume e un formaggio nuovi (form senza grammatura/prezzo); toggle "Archivia" → deve passare in tab "Archivio".
7. Tornare in Home → un solo widget `SelezioniCard` con 4 mini-blocchi colorati. Conteggio totale in header. Click su un blocco → naviga alla zona corrispondente.
8. Bookmark legacy: aprire direttamente `/macellaio` deve fare redirect a `/selezioni/macellaio`. Idem per `/salumi`, `/formaggi`, `/pescato`.
9. DashboardSala (login utente sala) → deve mostrare `SelezioniCard` al posto di `MacellaioCard`.

**Push suggerito:** `./push.sh "Selezioni del Giorno: modulo unico 4 zone (macellaio/pescato/salumi/formaggi) con sidebar + widget Home unificato"`

---

## SESSIONE 50 — Scelta dei Salumi e Scelta dei Formaggi ✅ (da testare post-push)

Duplicato il pattern di "Scelta del Macellaio" su due nuovi moduli: **Scelta dei Salumi** e **Scelta dei Formaggi**, sottomoduli di Gestione Cucina. Marco voleva pagine in cui registrare gli articoli disponibili descrivendoli per la sala (testo lungo "narrabile" da raccontare al cliente). Scelta architettonica: 3 moduli completamente separati (no tabella unica con `tipo`), 3 widget Home distinti.

**Schema dati**: ogni modulo ha `*_tagli` (con `nome, categoria, grammatura_g, prezzo_euro, produttore, stagionatura, territorio, descrizione, note, venduto, venduto_at` + `origine_animale` per salumi / `latte` per formaggi), `*_categorie` (CRUD da Impostazioni futura), `*_config` (chiave/valore — almeno `widget_max_categorie=4`).

**UI lista**: card collassata con badge sintetico (produttore · stagionatura · origine/latte · territorio) + bottone "▼ Mostra dettagli" che apre la `descrizione` per la sala in un box colorato. Separa scheda interna (note operative) da narrazione cliente (descrizione).

**Deliverable:**
- BE: migrazioni 091 (salumi) + 092 (formaggi), 2 router con CRUD completo, registrazione in `main.py` e in `modules_router.py` (sub `salumi` + `formaggi` su `ricette`, ruoli admin/chef/sala/sommelier/superadmin), estensione `dashboard_router.py` con `_salumi_widget()` e `_formaggi_widget()` e nuovi modelli `SalumiWidget`/`FormaggiWidget`.
- FE: 2 pagine (`SceltaSalumi.jsx` + `SceltaFormaggi.jsx`) con form 2-col + datalist origine/latte + lista espandibile, 2 widget Home (`SalumiCard` border amber-200 🥓, `FormaggiCard` border yellow-200 🧀) impilati dopo `MacellaioCard`, route `/salumi` e `/formaggi` in App.jsx con `ProtectedRoute module="ricette" sub="salumi"|"formaggi"`, voci dropdown in `modulesMenu.js`, versions.jsx con `salumi` e `formaggi` v1.0 beta.
- Docs: changelog + questo file.

**Da testare post-push:**
1. Migrazioni 091 e 092: controllare log avvio backend, devono creare 6 tabelle (`salumi_tagli`, `salumi_categorie`, `salumi_config`, `formaggi_tagli`, `formaggi_categorie`, `formaggi_config`) e i seed delle categorie.
2. Push con `-m` (auto-detect dovrebbe attivarsi grazie alla modifica di `modules_router.py` che cambia hash del JSON moduli).
3. Login admin → vedere `/salumi` e `/formaggi` nel dropdown Gestione Cucina.
4. Aggiungere 2-3 salumi e 2-3 formaggi con descrizione lunga, controllare che la card si espanda e mostri la descrizione in box colorato.
5. Tornare in Home → verificare che i 3 widget (macellaio, salumi, formaggi) siano impilati nella colonna laterale con count corretto.
6. PATCH venduto: tap "Venduto" su un articolo → deve diventare grigio + count widget cala + count "venduti oggi" sale.
7. Login con utente sala → deve poter accedere alle 3 pagine, ma vedere solo i taglieri (non l'editor categorie).

**Comando push:**
```
./push.sh "feat: scelta salumi e formaggi - 2 nuovi moduli con widget home dedicati"
```

---

## SESSIONE 49 — Home per ruolo configurabile ✅ (da testare post-push)

Spostata la config dei pulsanti rapidi Home (prima hardcoded negli array `ADMIN_ACTIONS` di Home.jsx e `SALA_ACTIONS` di DashboardSala.jsx) nel DB. Admin può ora scegliere quali pulsanti mostrare nella Home di ciascun ruolo, in che ordine, con che emoji/colore/route, dall'interfaccia Impostazioni → "🏠 Home per ruolo". Supporta 9 ruoli (admin, superadmin, contabile, sommelier, chef, sous_chef, commis, sala, viewer). Fallback FE statico garantisce zero regressioni se il BE è giù.

**Deliverable:**
- BE: migration 090 (tabella `home_actions` in foodcost.db) + router CRUD+reorder+reset + seed defaults centralizzato in `app/services/home_actions_defaults.py`.
- FE: hook `useHomeActions()` con fallback statico, refactor Home.jsx/DashboardSala.jsx per leggere dal hook invece degli array hardcoded, tab "Home per ruolo" in Impostazioni con selettore ruolo, lista riordinabile (▲/▼), toggle attivo, modal edit/new con tendina route estratta da `modulesMenu.js`, reset defaults per ruolo.
- Docs: `home_per_ruolo.md` spec, changelog + questo file + versions.jsx bump home 3.4 → 3.5.

**Da testare post-push:**
1. Migration: controllare log avvio backend che crei la tabella + 44 righe seed.
2. Home admin: stessi 5 pulsanti di prima (chiusura turno, prenotazioni, cantina, food cost, CG).
3. DashboardSala: stessi 4 pulsanti di prima.
4. Impostazioni → Home per ruolo: selettore ruolo funziona, riordino persiste, toggle attivo/disattivo funziona, aggiungi/modifica/elimina funziona, reset defaults ripristina seed.
5. Creare un pulsante custom per un ruolo, rifare login con quell'account → appare.

---

## SESSIONE 48 — Mattone M.E Calendar ✅ (deployato + testato OK)

Implementato in autonomia il mattone condiviso **M.E — componente calendario React riutilizzabile**. Push 2026-04-19, test manuali su VPS verificati OK (tutte le 3 viste, tastiera, drill-down, responsive iPad). Sblocca tre consumer roadmap (2.1 Agenda prenotazioni, 3.7 Scadenziario flussi, 6.4 Calendario turni, 6.5 Scadenze documenti) senza che ogni modulo debba riscriversi il proprio calendario. Zero dipendenze esterne (pure React + Tailwind), stateless controllato, 3 viste (mese/settimana/giorno), palette brand, tastiera built-in, render prop escape hatches.

**Demo admin-only:** URL diretto `/calendario-demo` (NON linkato da menu), `~20` eventi finti che coprono tutti i 4 casi d'uso (prenotazioni blu, scadenze fatture rosse/amber, turni verde, checklist viola, scadenze documenti slate).

**File nuovi:**
- `frontend/src/components/calendar/CalendarView.jsx` (componente pubblico)
- `frontend/src/components/calendar/MonthView.jsx` + `WeekView.jsx` + `DayView.jsx`
- `frontend/src/components/calendar/calendarUtils.js` (helpers date)
- `frontend/src/components/calendar/constants.js` (MESI_IT, COLORI_EVENTO, VIEWS)
- `frontend/src/components/calendar/index.js` (barrel)
- `frontend/src/pages/admin/CalendarDemo.jsx` (vetrina demo)
- `docs/mattone_calendar.md` (spec completa)

**File modificati:**
- `frontend/src/App.jsx` — lazy import + rotta `/calendario-demo` (module="impostazioni")
- `docs/architettura_mattoni.md` — M.E marcato ✅ con snippet d'uso
- `docs/roadmap.md` — header mattoni aggiornato + sezione Completati sessione 48
- `docs/changelog.md` — entry 2026-04-19 (Mattone M.E)

**Limiti v1 (espliciti):**
- No drag&drop (può essere aggiunto nel `renderEvent` del consumer)
- No creazione inline (il click emette callback; modale è del consumer)
- No eventi multi-giorno con span continuo (allDay su più giorni → mostrato su ogni giornata)
- No fusi orari multipli, no i18n

**Prossimi consumer (nell'ordine del backlog Wave 2+):**
- 3.7 Scadenziario flussi (use case più diretto: fatture + rate + stipendi già in DB)
- 2.1 Agenda prenotazioni (integrazione con il planning esistente)
- 6.4 Calendario turni (useremo `renderDayCell` per linee colorate per ruolo)

---

## SESSIONE 47 — Carta Bevande v1.0 Fase 3 ✅

Estensione Carta Vini a 7 sezioni bevande (Aperitivi, Birre, Amari casa, Amari & Liquori, Distillati, Tisane, Tè). Nuovo service `carta_bevande_service.py` con 3 layout dispatcher (`tabella_4col` / `scheda_estesa` / `nome_badge_desc`) + sezione `vini_dinamico` delegata a `carta_vini_service`. Router `bevande_router.py` v1.1 con 5 endpoint (HTML preview, PDF cliente, PDF staff, DOCX, preview per-sezione). CSS `.bev-*` allineato HTML/PDF con page-break-avoid. Retro-compat assoluta: endpoint `/vini/carta*` invariati, DB `bevande.sqlite3` isolato. Resta Fase 4 (popolamento voci — task Marco).

---

## SESSIONE 46 — Phase A.3: Brigata Cucina ✅

Resi `sous_chef` e `commis` ruoli utente reali, con parità moduli col chef attuale e filtro task auto server-side (chef vede tutto; sous_chef vede `sous_chef+NULL`; commis vede `commis+NULL`). Anti-escalation sia in lettura sia in scrittura. Backward-compat totale per utenti chef esistenti.

**File toccati:**
- `app/services/auth_service.py` — `VALID_ROLES` esteso + nuovo helper `is_cucina_brigade`.
- `app/routers/modules_router.py` — stessa estensione `VALID_ROLES` (duplicazione pre-esistente, allineata).
- `app/data/modules.json` — ovunque `"chef"` → aggiunti `"sous_chef"` e `"commis"` (Ricette, Flussi/mance, Task Manager, Dipendenti/turni). `modules.runtime.json` NON toccato (auto-sync via `_seed_hash`).
- `app/routers/tasks_router.py` — helper `_livello_auto_for_role`, `_allowed_livelli_for_role`, `_enforce_livello_write`, `_check_instance_visibility`. Filtro auto su letture (`/tasks/tasks/`, `/agenda/`, `/agenda/settimana`, `/templates/`, `/instances/{id}`, `/templates/{id}`). Anti-escalation su write (create_task, update_task, completa_task, delete_task, assegna/completa/salta_instance, check_item).
- `frontend/src/pages/admin/GestioneUtenti.jsx` — `ROLES`+`ROLE_LABELS` estesi.
- `frontend/src/components/LoginForm.jsx` — palette orange-500/yellow-500 coordinata con `LIVELLI_CUCINA`.
- `frontend/src/pages/tasks/TaskList.jsx` — dropdown livello nascosto per sous_chef/commis + hint orange.
- `frontend/src/pages/tasks/TaskNuovo.jsx` + `TemplateEditor.jsx` — opzioni dropdown livello limitate al ruolo.
- `frontend/src/config/versions.jsx` — bump `tasks` 1.2 → 1.3.
- `docs/changelog.md` + `docs/sessione.md` + `docs/spec_brigata_cucina.md` (spec di riferimento).

**Spec:** `docs/spec_brigata_cucina.md` (single source of truth). Vincoli: worktree `.claude/worktrees/brigata-cucina` su branch `feat/brigata-cucina`; `users.json` NON toccato (è file con hash, backward-compat garantita dall'estensione — non restrizione — di `VALID_ROLES`).

---

## SESSIONE 46 — Phase A.2: Livelli Cucina ✅

Aggiunto campo `livello_cucina` (chef/sous_chef/commis/NULL) su task_singolo, checklist_template, checklist_instance. Attivo solo se reparto='cucina'. NULL = tutta la brigata. Backward-compat garantita.

**File toccati:**
- `app/migrations/088_livello_cucina.py` (NUOVO)
- `app/schemas/tasks_schema.py`
- `app/routers/tasks_router.py`
- `app/services/tasks_scheduler.py`
- `frontend/src/config/reparti.js`
- `frontend/src/pages/tasks/TaskNuovo.jsx`
- `frontend/src/pages/tasks/TemplateEditor.jsx`
- `frontend/src/pages/tasks/TaskList.jsx`
- `frontend/src/components/tasks/TaskSheet.jsx`
- `docs/changelog.md`
- `docs/sessione.md`
- `docs/spec_livelli_cucina.md` (spec di riferimento)

**Spec:** `docs/spec_livelli_cucina.md` (single source of truth)

---

## SESSIONE 43 — Modulo Cucina MVP ✅

Primo rilascio del modulo **Cucina**: checklist ricorrenti HACCP-friendly + task singoli per chef/sala. Ispirato a prompt Cowork (`docs/modulo_cucina_mvp_prompt.md`). Scopo: sostituire il registro cartaceo con un sistema tap-to-complete iPad-ready.

**Naming ambiguity risolta**: il modulo "Ricette/FoodCost" aveva già label "Gestione Cucina" in `modulesMenu.js`. Marco ha scelto label semplice **"Cucina"** (🍳) per il nuovo modulo, label "Gestione Cucina" rimane al modulo ricette per ora — pianificata unificazione futura.

**Backend** (5 file nuovi + 3 modificati):
- Migrazione `084_cucina_mvp.py` → nuovo DB dedicato `cucina.sqlite3` con 6 tabelle (checklist_template, checklist_item, checklist_instance, checklist_execution, task_singolo, cucina_alert_log scaffold V1) + 3 template seed disattivi (Apertura, Chiusura, Pulizia bar).
- `app/models/cucina_db.py` → `get_cucina_conn()` + `init_cucina_db()` difensivo al boot del router.
- `app/schemas/cucina_schema.py` → Pydantic models + costanti enum (FREQUENZE/REPARTI/TURNI/ITEM_TIPI/STATI).
- `app/routers/cucina_router.py` → **18 endpoint** su prefix `/cucina/`: CRUD template (6), agenda (3), instance/execution (5), task (5), scheduler (2). Trailing slash rispettato su tutti i root dei gruppi.
- `app/services/cucina_scheduler.py` → `genera_istanze_per_data` (INSERT OR IGNORE idempotente), `check_scadenze` (UPDATE WHERE scadenza_at < now), `calcola_score_compliance` (% item OK), `trigger_scheduler` fire-and-forget.
- **Aggancio dashboard_router**: lo scheduler gira lazy su ogni `GET /dashboard/home` (pattern M.F). Zero cron esterno.
- **Main.py**: import + include_router cucina.

**Frontend** (8 file nuovi + 4 modificati):
- `CucinaHome.jsx` — dashboard entry con 4 KPI card + lista istanze oggi per turno + task oggi.
- `CucinaNav.jsx` — nav top condivisa con VersionBadge e 5 voci.
- `CucinaAgendaGiornaliera.jsx` — navigazione data ←/→/oggi, filtro turno, KPI 4 mini-card, istanze raggruppate per turno, click → instance detail.
- `CucinaInstanceDetail.jsx` — **tap-to-complete** con 3 bottoni OK/FAIL/N.A. per item. **Numpad touch-friendly** per TEMPERATURA/NUMERICO (tasti 60pt). Range atteso mostrato ("0°..4° °C"), fuori range forza FAIL automatico con nota. Prompt testo per tipo TESTO. Progress bar, bottoni Completa/Salta sticky in fondo, assegna utente popover.
- `CucinaTemplateList.jsx` — lista admin raggruppata per reparto+turno, filtri, azioni toggle-attiva / modifica / duplica / elimina (con conferma cascade).
- `CucinaTemplateEditor.jsx` — form create/edit con items riordinabili ▲▼, auto-preset 0..4°C per primo TEMPERATURA, validazione client (nome, titolo, range min≤max, HH:MM).
- `CucinaTaskList.jsx` — tabella task con filtri user/data/stato, azioni inline Completa/Riapri/Annulla/Elimina.
- `CucinaTaskNuovo.jsx` — modal create/edit (riusato).
- `CucinaAgendaSettimana.jsx` — grid 7 colonne lun-dom, oggi evidenziato, pallini colorati per stato + abbreviazione turno, click giorno → agenda dettagliata. Scroll-x mobile.

**Config**:
- `modules.json` → entry `cucina` con ruoli (admin/chef pieno, sala limitato, viewer read-only).
- `modulesMenu.js` → voce `cucina` 🍳 con colori rossi (bg-red-50) — non collide con altri moduli.
- `versions.jsx` → `cucina v1.0 beta`.
- `.gitignore` → `app/data/cucina/` per futura cartella runtime (uploads V1).

**Workflow gotcha**: iniziato in worktree `claude/sharp-almeida-9d4785`, rilevato dopo 2 push inutili che `push.sh` dalla main dir non vede i commit (branch diverso). Switch a lavorare direttamente su `/Users/underline83/trgb/` main dallo step 5 in poi. Backend Step 1-4 copiato dal worktree al main via `cp` in blocco, frontend Step 5-8 scritto direttamente.

**Commit points** (uno per step come da feedback "no blocchi accoppiati"):
1. `cucina: migrazione MVP + 6 tabelle + 3 template seed`
2. `cucina: API CRUD template e items`
3. `cucina: scheduler + agenda + esecuzione checklist`
4. `cucina: backend MVP completo (DB + template CRUD + scheduler + agenda + task)`
5. `cucina: voce menu + home modulo`
6. `cucina: agenda giornaliera + esecuzione tap-to-complete`
7. `cucina: editor template admin`
8. `cucina: task singoli + agenda settimana`

**Test effettuati (backend)**: CRUD completo via chiamate dirette a funzioni router, validazione reparto/turno/tipo item, TEMPERATURA richiede min+max, permessi (chef bloccato su POST, sala 403, viewer read-only via middleware), idempotenza scheduler (2a chiamata = 0 creati), check_scadenze con ora futura, tap-to-complete APERTA→IN_CORSO→COMPLETATA, score compliance 100 e 50 su test-case, doppia completa 400, check su completata 400, salta con motivo, auto-scadenza task.

**Test effettuati (frontend)**: `vite build` clean su ogni step (858 moduli, 0 errori JSX/import).

**Non fatto (V1)**: foto/firma, integrazione M.F Alert Engine (scaffold `cucina_alert_log` pronto), dashboard KPI, PDF export, checker `@register_checker`, corrective action automatico, frequenze settimanale/mensile.

**Version bump**: nuovo modulo `cucina v1.0 beta` in `versions.jsx`.

---

## SESSIONE 42b — CG Liquidita' v2.10: tassonomia uscite ✅

Follow-up immediato di v2.9: la tassonomia custom esisteva solo per le entrate, mentre il ~38% delle uscite (135 movimenti su 351 negli ultimi 12 mesi) arrivava dal feed BPM con `categoria_banca=''` e finiva in un generico "Non categorizzato". Classificate ora con pattern matching su descrizione + categoria + sottocategoria.

**Backend** — `liquidita_service.py v1.1`:
- Nuova `classify_uscita(row)` con 11 tag ordinati per specificita': Fornitori, Stipendi, Affitti e Mutui, Utenze, Tasse, Carta, Banca, Assicurazioni, Bonifici, Servizi, Altro.
- Regole: `cat='Risorse Umane'` → Stipendi, `'effetti ritirati'/'add.effetto'` → Fornitori (RiBa), `'mutuo'/'rimborso finanz'` → Affitti e Mutui, `'imposta'/'f24'/'agenzia entrate'/'pag telemat'` → Tasse, `'cartimpronta'/'debit pagamento'` → Carta, `'comm su'/'commissioni'` → Banca, `'vostra disposizione'/'vs.disp'` → Bonifici (spesso fornitori non classificati), `'addebito diretto sdd'/'sdd core'` → Servizi.
- Nuove funzioni `uscite_mensili_anno(conn, anno)` e `ultime_uscite(conn, limit=15)` simmetriche alle entrate.
- `dashboard_liquidita()` ora restituisce `uscite_per_tipo`, `uscite_mensili`, `uscite_tags`, `ultime_uscite`.

**Frontend** — `ControlloGestioneLiquidita.jsx v1.1`:
- Palette `USCITA_COLORS` con 11 colori coerenti (ambra/viola/teal/blu/rosso/arancio).
- Nuova RIGA 3 simmetrica alla RIGA 2: PieChart uscite per tipo (1 col) + BarChart stacked "Uscite mensili {anno}" (2 col).
- Rimossa sezione barre CSS rosse per categoria (superata dal Pie).
- RIGA 5 ora ha tabelle gemelle "Ultime entrate" + "Ultime uscite" con badge colorato per tipo.
- Layout totale: 5 righe (KPI, Trend+PieE, PieU+MensiliU, MensiliE+YoY, TabE+TabU).

**Smoke test** (produzione 17 apr 2026):
- **Distribuzione finale v1.2 su 351 uscite 12m: Banca 101 / Fornitori 74 / Servizi 61 / Bonifici 41 / Carta 28 / Utenze 13 / Stipendi 12 / Affitti 10 / Tasse 9 / Assicurazioni 2 / Altro 0.** Zero residui non classificati.
- v1.1 iniziale aveva 35 residui in "Altro": 32 erano commissioni `comm.su bonifici` (pattern `"comm su"` non matchava il punto), 2 addebiti M.AV./R.AV., 1 `int. e comp. - competenze`. v1.2 aggiunge i pattern mancanti → 0 residui.

**Follow-up tracciati** (rimangono aperti):
- I "Bonifici" generici (32 casi/mese in media) sono quasi tutti fornitori non categorizzati; con lookup su `fe_fornitori` si potrebbero promuovere a Fornitori.

**Version bump:** Controllo Gestione 2.9 → 2.10.

---

## SESSIONE 42 — CG Liquidita' (principio di cassa) ✅

Follow-up diretto della sessione 41: quando Marco aveva chiesto di leggere le entrate dalla banca avevamo deciso di tenere la dashboard CG sul **principio di competenza** (vendite attribuite al giorno in cui sono fatte) e promettere una sezione dedicata al **principio di cassa** (entrate/uscite quando toccano il conto). Questa e' quella sezione.

**Backend** — nuovo service `app/services/liquidita_service.py`:
- `saldo_attuale(conn)` — saldo cumulativo + data ultimo movimento.
- `kpi_mese(conn, anno, mese)` — entrate/uscite/delta + breakdown entrate per tipo (POS/Contanti/Bonifici/Altro) + uscite per `categoria_banca`.
- `kpi_periodo_90gg(conn, data_riferimento)` — finestra rolling 90 giorni.
- `trend_saldo(conn, giorni=90)` — serie giornaliera saldo cumulativo.
- `entrate_mensili_anno(conn, anno)` — 12 mesi, breakdown per tipo (stacked bar).
- `confronto_yoy(conn, anno)` — anno corrente vs precedente.
- `ultime_entrate(conn, limit=15)` — tabella.
- `dashboard_liquidita(conn, anno, mese)` — entry point unico.

**Classificazione entrate custom** (`classify_entrata`): il feed banca BPM lascia molti POS senza `categoria_banca` quindi classifichiamo anche per pattern su descrizione (`inc.pos`, `incas. tramite p.o.s`, `vers. contanti`) + `sottocategoria_banca`. 4 bucket: POS / Contanti / Bonifici / Altro.

**Endpoint** — `GET /controllo-gestione/liquidita?anno=&mese=` in `controllo_gestione_router.py`.

**Frontend** — nuova pagina `ControlloGestioneLiquidita.jsx`:
- 6 KPI cards (saldo attuale, entrate mese, uscite mese, delta mese, entrate 90gg, media/giorno).
- LineChart trend saldo 90gg (colore `#2E7BE8`).
- PieChart entrate mese per tipo.
- Stacked BarChart entrate mensili anno.
- BarChart YoY (anno corrente vs precedente).
- Sezione uscite per categoria (barre CSS rosse).
- Tabella ultime 15 entrate con badge tipo colorato.
- Tab "🏦 Liquidita'" aggiunta in `ControlloGestioneNav` tra Dashboard e Uscite.
- Voce aggiunta in `modulesMenu.js` per il dropdown header.
- Rotta registrata in `App.jsx`.

**Smoke test** con dati reali (15 apr 2026): saldo €4.078,81 · Apr entrate €27.633 (POS 23.2k + Cash 4k) · 90gg entrate €159k uscite €151k delta +€7.855.

**Versione** `controlloGestione` 2.8 → 2.9.

**Nota architetturale** — `liquidita_service.py` e' un nuovo "mattone" disciplinato come `vendite_aggregator.py`: unica sorgente di verita' sulla liquidita', qualsiasi altra vista futura (es. cash flow previsionale 3.8) dovra' passare da qui.

**Follow-up possibili** (tracked, non urgenti):
- Tassonomia custom uscite (come abbiamo fatto per entrate) — molte uscite di Aprile sono `categoria_banca=''` nel feed.
- Integrazione scadenzario previsto (3.7) per proiezione cash flow 30/60/90gg.

---

## SESSIONE 41 — Fix CG vendite: shift_closures primario + daily fallback ✅

Marco: _"a marzo vedo pochissime entrate che in banca sono molto di più"_.

**Diagnosi.** Dashboard Controllo Gestione leggeva le vendite solo da `daily_closures` (tabella legacy, alimentata dall'import Excel mensile). Dal 4 marzo Marco ha iniziato a chiudere in-app via `shift_closures` (turni pranzo/cena) → il CG mostrava KPI troncati. Marzo: 20.265 € sulla dashboard vs 65.275,80 € reali. Stessa patch era già stata applicata al servizio export corrispettivi (2025, `_merge_shift_and_daily`) ma il CG non era stato aggiornato.

**Fix.** Nuovo service `app/services/vendite_aggregator.py` con `giorni_merged`, `totali_periodo`, `totali_mensili_anno` — merge shift (primario) + daily (fallback). Il router CG ora passa da qui per tutte e 3 le letture vendite (KPI mese, andamento annuale, confronto). Versione bump `2.7 → 2.8`.

**Discussione architetturale.** Marco ha proposto di leggere direttamente da banca. Abbiamo concordato: la dashboard attuale mostra **principio di competenza** (analitico, vendite attribuite al giorno in cui sono fatte → POS di marzo su marzo anche se accreditati ad aprile). Il **principio di cassa** (finanziario, entrate quando arrivano sul conto) meriterà una sezione "Liquidità" separata nella dashboard CG, da progettare in sessione dedicata.

**Cleanup collaterale.** Cancellato `app/services/admin_finance_stats.py`: era codice morto (nessun import lo usava) con 6 funzioni che leggevano solo `daily_closures`. Puliti i riferimenti in `docs/architettura.md`, `docs/design_gestione_vendite.md`, `docs/modulo_corrispettivi.md`. Verificato che `dashboard_router.py` legge già da `shift_closures` → nessun bug lì.

**Fuori scope (tracked per v2.9).** Progettare "sezione Liquidità" sulla dashboard CG per il principio di cassa (entrate banca, POS in arrivo, trend saldo).

---

## SESSIONE 40 — Assenze (Ferie / Malattia / Permesso) ✅

Marco: _"bisogna prevedere il concetto di 'ferie' — gente che mi avvisa che non c'è"_.

- ✅ **Migrazione 083**: tabella `assenze` in `dipendenti.sqlite3` con UNIQUE `(dipendente_id, data)`. Tre tipi: FERIE, MALATTIA, PERMESSO.
- ✅ **Backend CRUD**: `GET/POST /turni/assenze/`, `DELETE /turni/assenze/{id}`, `GET /turni/assenze/tipi`. POST fa upsert. I 3 builder (foglio, mese, dipendente) arricchiti con assenze.
- ✅ **FoglioSettimana**: OrePanel con mini-settimana 7 cerchietti clickabili per creare/eliminare assenze. Mini-popover scelta tipo.
- ✅ **VistaMensile**: pillole colorate in cella giorno + sezione "Assenze" nel PannelloGiorno.
- ✅ **PerDipendente**: banner pieno con emoji+label nel blocco giorno + metrica "Assenze" nei totali periodo.
- `versions.jsx`: dipendenti `2.25 → 2.26`.

---

## SESSIONE 40 — M.F Alert Engine + Pagina Impostazioni Notifiche ✅

Mattone M.F costruito mentre Marco è via dal PC, poi esteso con pagina configurazione su richiesta.

**Backend:**
- `app/services/alert_engine.py` — registry checker, config da DB (`alert_config`), anti-duplicato, dry-run, notifiche multi-canale
- `app/routers/alerts_router.py` — esecuzione checker + CRUD config (`GET/PUT /alerts/config/`)
- `app/models/notifiche_db.py` — nuova tabella `alert_config` con seed automatico per 3 checker

**3 checker:** `fatture_scadenza`, `dipendenti_scadenze`, `vini_sottoscorta`. Tutti configurabili da UI.

**Frontend:** `NotificheImpostazioni.jsx` — nuovo tab "🔔 Notifiche" in Impostazioni Sistema. Per ogni checker: toggle on/off, soglia giorni, anti-duplicato ore, destinatario ruolo, canali (in-app ✅, WhatsApp ✅, email 🔜). Bottone "Testa ora" per esecuzione manuale.

**Trigger:** fire-and-forget da `GET /dashboard/home`. Anche manuale da UI.

**Nota:** il codice inline in `dashboard_router._alerts()` (righe 370-442) resta — produce gli `AlertItem` per la UI Home. L'engine M.F crea le notifiche persistenti dettagliate. Refactoring futuro: usare engine in dry-run per i conteggi dashboard.

---

## SESSIONE 40 — S40-15 CHIUSO (FIC righe via XML SDI fallback) ✅

Marco ha segnalato che da fine marzo le fatture FIC di alcuni fornitori arrivano senza righe in `fe_righe`. Casi verificati: OROBICA PESCA 201969/FTM (2026-03-31, €7425,24, `fic_id=405656723`, DB id=6892), FABRIZIO MILESI 2026/300.

**Diagnosi** — via nuovo `GET /fic/debug-detail/{fic_id}` (sessione precedente, poi esteso in questa): FIC ritorna `is_detailed=false, items_list=[], e_invoice=true, attachment_url=(pre-signed url temporaneo)`. Significa che la fattura su FIC e' stata registrata come "Spesa" senza dettaglio strutturato, quindi le righe esistono SOLO dentro il tracciato XML SDI. Verificato sullo schema OpenAPI ufficiale (`fattureincloud/openapi-fattureincloud/models/schemas/ReceivedDocument.yaml`): `items_list` e' popolato solo in modalita' detailed; l'unico accesso al file firmato e' `attachment_url`. Non esiste endpoint dedicato al download XML (gli endpoint `/received_documents/pending` di marzo 2026 sono solo per documenti NON ancora registrati — non applicabile qui).

**Soluzione — fallback XML SDI**

1. **Nuovo mattone** `app/utils/fatturapa_parser.py`: parser riusabile che normalizza bytes → XML (zip/p7m/plain/utf-16 + fallback `openssl cms -verify`), estrae `DettaglioLinee` da FatturaPA. Nessuna nuova dipendenza Python. Test su XML sintetico OK (namespace `p:`, virgola decimale, sconto SC, `CodiceTipo=INTERNO`).
2. **Sync FIC** (`_fetch_detail_and_righe`): quando `items_list` e' vuoto ma `e_invoice + attachment_url` presenti → scarica XML via `download_and_parse()` → popola `fe_righe` da `DettaglioLinee` → auto-categorizza. Exception swallow rimosso, ora `traceback.print_exc()` esplicito.
3. **Recovery retroattivo**: `POST /fic/refetch-righe-xml/{db_id}` per singolo, `POST /fic/bulk-refetch-righe-xml?anno=&solo_senza_righe=true&limit=N` per bulk. Entrambi ritornano contatori + dettaglio per-fattura.
4. **UI** Fatture › Impostazioni › FIC (v2.3): card debug ora mostra `xml_parse` (preview righe dal tracciato SDI), nuova card "📥 Recupero righe da XML SDI" con singolo + bulk (conferma, spinner, report dettagliato).

**File toccati**
- NEW `app/utils/fatturapa_parser.py`.
- `app/routers/fattureincloud_router.py` (fallback XML, debug-detail esteso, 2 endpoint recovery).
- `frontend/src/pages/admin/FattureImpostazioni.jsx` v2.3.

**v2 fix (stesso giorno)**: schema SQL sbagliato (`fornitore_denominazione` → `fornitore_nome`). Preflight PRAGMA table_info su tutto il router. Bulk ridotto a batch=50, time budget 90s, `stopped_by_timeout` + `rimanenti_stima`. **v3 skipped_non_fe**: il bulk ora distingue fatture non-FE (`e_invoice=false`) come `skipped` anziche' `fail`. UI: contatore separato, banner esplicativo, righe non-FE in grigio con ⏭, messaggio "rilancia" appare solo se restano FE vere.

**Verifica completezza import marzo 2026**: confronto export FIC vs DB → 66/66 fatture presenti. Panoramica 2025-2026: 52 fatture senza righe di cui 32 affitti mensili + 18 Amazon marketplace (tutte non-FE), 2 FE vere (OROBICA+MILESI, risolte col bulk).

---

## SESSIONE 40 — Wave 1 + Wave 2 + Wave 3 (CHIUSE ✅)

Marco ha aperto con una lista di 17 bug distribuiti su 6 moduli: Dipendenti (5), UI generica (2), Acquisti (2), Controllo Gestione (2), Flussi di Cassa (4), Statistiche (2). Triage: 3 wave ordinate per impatto × sforzo, dettaglio completo in `problemi.md` (punti `S40-1 ... S40-17`).

### Wave 1 completata — 3 fix bloccanti

- **S40-1 Dipendenti crash al save** (`DipendentiAnagrafica` v2.6) — mancava trailing slash sul POST, ennesima occorrenza dello stesso pattern documentato in CLAUDE.md.
- **S40-2 "+ Nuovo reparto" non fa nulla** (`GestioneReparti` v1.2) — flag `isCreating` mancante, allineato al pattern di `DipendentiAnagrafica`.
- **S40-3 Campanello iPad click non apre** (`Tooltip` v1.2 + `Header`) — nuova prop `disableOnTouch` sul Tooltip, applicata a 🔔 e 🔑 per evitare il double-tap friction su icone universali.

### Wave 2 completata — 6 fix UX su Dipendenti, CG, Flussi

- **S40-4 Soft-delete dipendente libera colore** (`dipendenti.py` DELETE) — `UPDATE … SET attivo=0, colore=NULL` invece di lasciare il colore "occupato" nel picker.
- **S40-5 Auto-ID dipendente progressivo** (`dipendenti.py` POST + `DipendentiAnagrafica` v2.7) — generatore `_genera_codice_dipendente` produce `DIPNNN` con padding a 3 cifre. Codice ora optional in pydantic e nel form.
- **S40-6 Nickname per stampe turno** (migrazione 081 + tutto il path turni) — colonna `nickname TEXT` su `dipendenti.sqlite3`, esposta in tutte le SELECT (4 in `dipendenti.py`, 2 in `turni_router.py`, 4 in `turni_service.py`). Cell label foglio settimana, OrePanel, PDF e composer WA usano nickname con fallback al nome. Saluto WA: "Ciao Pace, ecco i tuoi turni…".
- **S40-9 Default filtri Uscite CG** (`ControlloGestioneUscite` v3.1) — apre con `{DA_PAGARE, SCADUTA, PAGATA}` su mese corrente invece di "tutto da inizio anno".
- **S40-10 Somma residuo Excel-style** (stesso file) — `useMemo sommaSelezionati` mostra il totale residuo nella bulk action bar.
- **S40-11 Finestra _score_match** (`banca_router.py`) — cutoff duro a 180 giorni + penalita' progressiva oltre 30gg, evita di suggerire match SDD-08apr26 vs Amazon-11ago25.

### Wave 3 completata — 4 fix UX su CG, Acquisti, Flussi, iPad

- **S40-7 CG tab bar uniformata** (Dashboard/Confronto/Uscite/Riconciliazione) — wrapper esterno senza padding → Nav full-width + contenuto wrappato `<div className="px-4 sm:px-6 pb-6">`. Riconciliazione passa da `bg-neutral-50` a `bg-brand-cream`, titoli `font-playfair text-sky-900`. Uscite importa ora `ControlloGestioneNav` (rimosso back button custom duplicato).
- **S40-8 Acquisti nascondi fornitori ignorati** (`fe_import.py` + `FattureElenco` v3.2) — LEFT JOIN `fe_fornitore_categoria fc_excl` in `GET /fatture`, FE filtra `!f.escluso_acquisti` di default. Toggle "Mostra anche ignorati" nella sidebar (visibile solo se esistono escluse), badge ambra "ESCLUSO" sulla riga quando visibili.
- **S40-12 Flussi workbench bulk Parcheggia/senza match** (migrazione 082 + `banca_router.py` + `BancaCrossRef` v5.2) — colonne `parcheggiato` + `parcheggiato_at` su `banca_movimenti`, nuovi endpoint `POST /cross-ref/parcheggia-bulk` e `POST /cross-ref/disparcheggia/{id}`. Nuovo tab "Parcheggiati 🅿️", toolbar bulk estesa a senza/suggerimenti/parcheggiati, "❓ Flagga senza match" bulk (client-side che estende il Set `dismissed`), riga parcheggiata con timestamp + bottone "↩ Disparcheggia" individuale.
- **S40-13 Flussi iPad descrizione** (stesso file) — tap-to-expand: state `expandedDesc: Set<movId>` + handler `toggleDesc`, cella `truncate` ↔ `whitespace-normal break-words`, `cursor-pointer select-none` per chiarezza touch.

### Rimangono in indagine

- **S40-14 Duplicati Sogegros €597,08** — servono ID `banca_movimenti` da Marco per decidere regola dedup.
- **S40-15 Acquisti FIC righe mancanti** — serve fattura di riferimento.
- **S40-16 "Import iPratico sparito" Statistiche** — serve chiarimento da Marco se intendeva l'iPratico Vini (spostato in Vini → Impostazioni sessione 39) o davvero quello delle Statistiche (tab esiste ancora).
- **S40-17 "menu con più opzioni sparito"** — serve sapere quale menu esattamente.

### Versioni bump sessione 40

- `dipendenti` 2.23 → 2.25 (Wave 1 + Wave 2: trailing slash, soft-delete colore, auto-ID, nickname)
- `fatture` 2.5 → 2.6 (Wave 3: escluso_acquisti default)
- `controlloGestione` 2.5 → 2.7 (Wave 2: filtri default + somma selezione — Wave 3: nav uniformato)
- `flussiCassa` 1.9 → 1.11 (Wave 2: cutoff finestra _score_match — Wave 3: parcheggia + tap-to-expand)
- `sistema` 5.8 → 5.11 (Wave 1: Tooltip disableOnTouch — Wave 2: migrazione 081 — Wave 3: migrazione 082)

---

## SESSIONE 39 — Navigazione diretta ai moduli (CHIUSA ✅)

### Cosa è stato fatto
- **Eliminazione hub `*Menu.jsx`**: cliccando un modulo dall'header o dalla Home si entra direttamente nella vista principale (Dashboard o equivalente), niente più pagina intermedia.
- **Redirect role-aware**: nuovo componente `ModuleRedirect.jsx` sceglie la prima rotta accessibile in base a ruolo/permessi `useModuleAccess`. Se nessuna rotta è accessibile → pagina "non hai privilegi" coerente col tema del modulo.
- **Default per modulo**: Vini→Dashboard, Ricette→Archivio, Vendite→Dashboard, Acquisti→Dashboard, Flussi Cassa→Dashboard, Controllo Gestione→Dashboard, Statistiche→Cucina, Clienti→Anagrafica, Dipendenti→Dashboard (NUOVA), Prenotazioni→Planning (data odierna).
- **`DashboardDipendenti.jsx` nuova**: placeholder viola con KPI reali (headcount attivo, scadenze documenti, buste paga mese corrente) + 4 shortcut (anagrafica, turni, buste paga, scadenze). Nessun nuovo endpoint, riusa quelli esistenti.
- **Vini — Impostazioni unificate**: sotto-menu riordinato `Dashboard → Cantina → Carta → Vendite → Impostazioni`. Il sync iPratico è stato integrato dentro `ViniImpostazioni` (via `IPraticoSync embedded=true`) invece di una voce separata "iPratico".
- **DipendentiNav**: voce "Dashboard" aggiunta come prima tab.
- **12 hub `*Menu.jsx` eliminati**: vini, ricette, corrispettivi, fatture, dipendenti, admin, flussi-cassa, controllo-gestione, statistiche, prenotazioni, clienti (+ AdminMenu).
- **`modulesMenu.js`**: aggiunta voce "Dashboard" nel sotto-menu Dipendenti.
- **Versioni bump** (in `versions.jsx`): vini 3.11, ricette 3.4, corrispettivi 4.4, fatture 2.5, flussi-cassa 1.9, dipendenti 2.23, statistiche 1.1, controllo-gestione 2.5, clienti 2.9, prenotazioni 2.1, sistema 5.8.
- **iPad tooltip fix**: bell (🔔) e key (🔑) nell'Header ora usano `placement="bottom"` → si aprono verso il basso su iPad senza essere tagliati dalla statusbar.

### Decisioni tecniche da ricordare
- **`IPraticoSync` accetta prop `embedded`**: evita di duplicare 673 righe di workflow unificato. Deviazione consapevole dalla richiesta "due voci separate Import/Export".
- **Redirect "nessun privilegio"**: pagina standard colorata con palette del modulo, call-to-action verso Home.
- **Archivio diario**: mini-sessioni 39/36/35/34/32 spostate in `sessione_archivio_39.md` per tenere `sessione.md` leggibile. Le sezioni stabili (priorità, rules, storico rilasci) restano qui sotto.

### Follow-up emersi dalla sessione
1. **Dashboard Cucina** — rivedere (era "Ricette Menu" / "Home Cucina"?): oggi è Ricette→Archivio di default, valutare se promuovere una vera Dashboard Cucina.
2. **Link "← Home"** — valutare se aggiungere un link consistente in tutti i `*Nav.jsx` per tornare alla Home rapidamente (oggi si passa dal logo header).
3. **`DashboardDipendenti` v2** — estendere il placeholder con grafici (costo mensile, storico ore, trend scadenze) e widget su presenze/assenze del giorno.
4. **`IPraticoSync` refactor** — valutare estrazione di una versione davvero "embeddable" più snella (oggi è solo un flag, la UI resta la stessa).
5. **Pulsante "reset to seed"** — UX-level, non solo via API.
6. **`useModuleAccess` auto-refresh** — se un admin cambia i permessi, gli utenti devono vedere l'update senza logout (oggi servirebbe reload).

---

## PIANO PROSSIMI PASSI (ordine consigliato)

> Ordinato per valore/urgenza. Numeri ID rimandano a [`roadmap.md`](./roadmap.md).

### 🔴 Urgenze (fix concreti)
- **D1 — Storni flussi di cassa difettosi** (`problemi.md`) — serve caso concreto riproducibile da Marco. Bloccato finché non arriva.

### 🟠 Evoluzioni strategiche (prossimi 2-3 blocchi di sessioni)
1. **Prenotazioni Fase 1 — Agenda (§2.1)** — modulo nuovo L, obiettivo strategico **eliminare TheFork Manager**. Docs pronti: `docs/modulo_prenotazioni.md` + `docs/prenotazioni_todo.md`. Wave start: backend CRUD + planning giorno + form con CRM + stati + mini-calendario. Usa M.E calendar + M.G permessi.
2. **Preventivi 10.3 PDF + 10.4 versioning (§10)** — 10.1/10.2 chiusi sessione 32, 10.3 PDF brand chiuso sessione 34, v1.1 revisioni sessione 35. Prossimo: 10.4 (versioning PDF + link prenotazione + badge "N in attesa") e 10.5 (menu strutturato nel template `preventivo.html`).
3. **Home v3 — F.1→F.6** — Fase 0 completata sessioni 29-30. Prossimo: F.1 endpoint backend `/dashboard/home`, poi F.2 infrastruttura frontend.

### 🟡 Evoluzioni modulo per modulo
4. **Dipendenti v2 (§6)** — 6.1 template WA buste paga + 6.4 calendario turni drag&drop + 6.5 scadenze con alert. Completare anche `DashboardDipendenti` con grafici reali.
5. **Flussi di Cassa (§3)** — 3.2 riconciliazione smarter, 3.4 carta di credito (usa M.H), 3.7 scadenziario calendario (M.E + M.A + M.F), 3.8 cash flow previsionale.
6. **CG / FoodCost (§4)** — 4.1 note di credito XML, 4.5 P&L mensile, 4.7 margine per piatto.
7. **Cantina / Vini (§7)** — 7.1 flag DISCONTINUATO UI (DB già pronto), 7.6 alert sottoscorta, 7.8 inventario rapido iPad.
8. **Clienti / CRM (§5)** — 5.1 Mailchimp sync, 5.2/5.3 compleanni con WA (M.C pronto), 5.5 merge side-by-side, 5.9 segmentazione RFM, 5.10 timeline cliente.

### 🟢 Infrastruttura & brand
9. **Notifiche & Comunicazioni (§9)** — 9.3 hook su preventivi (M.A pronto). 9.4-9.6 bloccati da altri moduli.
10. **Brand / UX (§8)** — 8.7 permessi centralizzati (hook `usePermissions`), 8.8 Command Palette Cmd+K, 8.12 deep search globale dal dropdown header, 8.14 tool di personalizzazione stampe M.B.
11. **Infra (§1)** — 1.4 migrazioni dipendenti.sqlite3, 1.6 snapshot Aruba, 1.8 Web Push, 1.9 health check + uptime monitor, 1.10 banner nuova versione.

### ⚪ Debito tecnico da sessione 39
- Refactor `IPraticoSync` per renderlo davvero modulare.
- `useModuleAccess` auto-refresh sui cambi permessi.
- Pulsante UI "reset to seed" (non solo API).
- `DashboardCucina` dedicata (oggi Ricette→Archivio).
- Link "← Home" consistente in tutti i `*Nav.jsx`.

---

---

## PRIORITÀ — Leggere SUBITO insieme a `docs/problemi.md` e `docs/roadmap.md`

> Questa sezione è il punto di partenza di ogni sessione. Non serve che Marco la ripeta.
> Roadmap completa con 76 punti su 10 sezioni: **`docs/roadmap.md`**. Bug e anomalie: **`docs/problemi.md`**.

### Urgenze / Bugfix
1. **D1 — Storni flussi di cassa difettosi** (problemi.md) — serve caso concreto da Marco per riprodurre
2. ~~D4 — PWA service worker~~ ✅ già in produzione (commit f194870, sessione 28). Nessun crash segnalato
3. ~~C.3 — useAppHeight~~ → declassato a debito tecnico bassa priorità (sessione 31). Il problema `100vh` su iOS è risolto con `100dvh` (sessione 28). L'hook resta sul disco come orfano per uso futuro (banner dinamici, header variabile), ma oggi il beneficio (eliminare magic number altezze) non giustifica il rischio (crash sessione 26 mai debuggato)

### Evoluzioni — prossimi passi attivi
1. **Home v3 — F.1→F.6** — Fase 0 completata (sessione 29/30). Prossimo: F.1 endpoint backend `/dashboard/home`, poi F.2 frontend infrastruttura
2. **Prenotazioni — 2.1→2.8** (roadmap §2) — modulo nuovo, 5 fasi, obiettivo eliminare TheFork Manager. Docs pronti: `docs/modulo_prenotazioni.md`, `docs/prenotazioni_todo.md`
3. **Flussi di Cassa — 3.2→3.9** (roadmap §3) — riconciliazione smarter, multi-conto, carta di credito, scadenziario calendario, cash flow previsionale
4. **CG / FoodCost — 4.1→4.7** (roadmap §4) — note di credito XML, P&L mensile, margine per piatto
5. **CRM — 5.1→5.11** (roadmap §5) — Mailchimp sync, WA compleanni, merge side-by-side, segmentazione RFM, timeline cliente
6. **Dipendenti — 6.1→6.6** (roadmap §6) — calendario turni, scadenze documenti, costo orario
7. **Cantina — 7.1→7.8** (roadmap §7) — flag discontinuato UI, carta vini pubblica, inventario iPad
8. **Brand/UX — 8.1→8.11** (roadmap §8) — permessi centralizzati, Command Palette, dark mode (futuro)
9. **Infra — 1.4→1.10** (roadmap §1) — notifiche push, health check, banner aggiornamento, snapshot Aruba
10. **Notifiche & Comunicazioni — 9.1→9.7** (roadmap §9) — infrastruttura notifiche, bacheca staff broadcast, hook su tutti i moduli. Pre-requisito per preventivi e alert
11. **Preventivi — ~~10.1~~ ~~10.2~~ ~~10.3~~ 10.4→10.5** (roadmap §10) — 10.1+10.2 (sessione 32), 10.3 PDF brand (sessione 34), v1.1 revisioni cliente inline + luoghi + menu ristorante (sessione 35). Prossimo: 10.4 versioning + link prenotazioni, 10.5 PDF preventivo con menu strutturato (rendering `menu_nome` + `menu_descrizione` nel template `preventivo.html`)

---

## HOME v3 REDESIGN — Piano implementazione (sessione 29)

> Redesign approvato da Marco il 2026-04-12. Mockup interattivo: `mockup-home-v3.html` nella root.

### Concept
- **Due pagine con swipe** (dot indicator, touch gesture): pagina 1 = widget, pagina 2 = moduli
- **Widget programmabili**: al lancio fissi, futura configurabilità per ruolo (admin sceglie)
- **Tile moduli senza emoji**: icone SVG stroke 1.5 monocromatiche su tintina, colori smorzati, linea gobbetta R/G/B in alto
- **Estetica raffinata**: Playfair Display per titoli, palette muted (non più colori sparati), card bianche su cream, ombre minime, respiro generoso

### Widget al lancio (v1 — fissi per tutti i ruoli)
1. **Attenzione** — alert aggregati: fatture da registrare, scadenze imminenti, vini sotto scorta. Icona SVG modulo + testo + chevron. Dati da: `fe_fatture`, `dipendenti_scadenze`, stock vini
2. **Prenotazioni oggi** — lista compatta orario/nome/pax/stato + totale pax header. Dati da: `clienti_prenotazioni` filtrate per data odierna
3. **Incasso ieri** — cifra grande + delta % vs media. Dati da: `shift_closures` giorno precedente
4. **Coperti mese** — cifra + confronto anno precedente. Dati da: `shift_closures` aggregati mese corrente
5. **Azioni rapide** — griglia 2×2: Chiusura Turno, Nuova Prenotazione, Cerca Vino, Food Cost. Link diretti, configurabili in futuro

### Widget futuri (v2 — dopo il lancio)
- Turni dipendenti oggi
- Meteo (per prenotazioni outdoor)
- Obiettivo incasso settimanale con progress bar
- Widget personalizzabili per ruolo (cuoco vede ordini, sala vede prenotazioni)

### Fasi implementazione
- **Fase 0** ✅ Docs + specifiche + regole design (questa sessione Cowork)
- **Fase 1** — Backend: endpoint `GET /dashboard/home` aggregatore (query su prenotazioni, shift_closures, fe_fatture)
- **Fase 2** — Frontend infrastruttura: hook `useHomeWidgets()`, componente `WidgetCard`, file `icons.jsx` con set SVG moduli
- **Fase 3** — Frontend pagina widget (pagina 1): riscrittura Home.jsx con swipe container + 5 widget
- **Fase 4** — Frontend pagina moduli (pagina 2): componente `ModuleTile`, griglia 3col iPad / 2col iPhone
- **Fase 5** — Navigazione: adattamento Header, aggiornamento DashboardSala con stile v3
- **Fase 6** — Polish: aggiornamento styleguide.md, test iPad/iPhone viewport, versioning

### Regole design Home v3 (per tutti gli agenti)
- **Sfondo**: `bg-brand-cream` (#F4F1EC) — invariato
- **Card/Widget**: bg bianco, border-radius 14px, `box-shadow: 0 1px 3px rgba(0,0,0,.04)`, NO bordi visibili pesanti
- **Icone moduli**: SVG stroke 1.5, monocromatiche nel colore accent del modulo, su fondo tintina chiaro (accent + 08 opacity)
- **Colori moduli**: palette SMORZATA (es. Vini #B8860B non #F59E0B, Acquisti #2D8F7B non #14B8A6). Tinte: bianco sporco, non pastelli saturi
- **Gobbetta brand**: linea sottile 2px in alto su ogni tile, cicla R/G/B (#E8402B/#2EB872/#2E7BE8), opacity .5
- **Titoli**: Playfair Display 700 per titoli pagina (saluto, "Moduli"), font sistema per tutto il resto
- **Label widget**: 10px uppercase letter-spacing 1.2px, colore `#a8a49e` (warm gray)
- **NO emoji** nei moduli — solo icone SVG. Emoji ammesse SOLO in contesti testuali (note, alert)
- **Touch target**: minimo 44pt, bottoni 48pt, righe lista ≥ 44pt
- **Proporzioni iPad**: padding 32px, griglia widget 1.5fr + .5fr per prenotazioni+stats
- **Proporzioni iPhone**: padding 18px, widget impilati 1 colonna, tile moduli 2 colonne

---

## PROBLEMI APERTI — LEGGERE SUBITO

> 📋 Lista bug/anomalie segnalati da Marco in attesa di intervento: **`docs/problemi.md`**
> Da leggere a inizio sessione insieme a questo file. Se Marco chiede "cosa c'è da fare?", la priorità è quella lista.

---

## REGOLE OPERATIVE — LEGGERE PRIMA DI TUTTO

### Git & Deploy
- **NON fare `git commit`**. Le modifiche le fai nei file, ma il commit lo gestisce `push.sh` che lancia Marco dal suo terminale. Se committi tu, push.sh non chiede piu' il messaggio e Marco si confonde.
- **NON fare `git push`**. L'ambiente Cowork non ha accesso alla rete (SSH/internet). Il push fallira' sempre.
- **NON fare `git add -A`**. Rischi di includere file sensibili. Lascia che push.sh faccia tutto.
- **Workflow corretto**: tu modifichi i file → scrivi a Marco il testo suggerito per il commit → lui lancia `./push.sh "testo"` dal suo terminale.
- **Suggerisci SEMPRE il testo del commit** quando dici a Marco di fare il push. Formato: una riga breve in italiano/inglese che descrive cosa cambia.
- Se devi annullare le tue modifiche a un file: `git checkout -- <file>` (ma chiedi prima).

### Ambiente Cowork
- Non hai accesso alla rete. Niente curl, wget, npm install da remoto, pip install da remoto, push, fetch.
- I database `.sqlite3` e `.db` sono nella cartella `app/data/`. Puoi leggerli con sqlite3 per debug.
- push.sh scarica i DB dal VPS prima di committare, quindi i DB locali sono aggiornati solo dopo un push.

### Comunicazione con Marco
- Marco parla in italiano. Rispondi in italiano.
- Marco usa spesso CAPS LOCK per enfasi, non si sta arrabbiando.
- Quando Marco dice "caricato" significa che ha fatto il push e il VPS e' aggiornato.
- Se qualcosa non funziona dopo il push, chiedi a Marco di refreshare la pagina (Ctrl+Shift+R).

### Stile codice
- Frontend: React + Tailwind CSS, no CSS separati. Componenti funzionali con hooks.
- Backend: FastAPI + SQLite. Migrazioni numerate in `app/migrations/`.
- Pattern UI consolidati: `SortTh`/`sortRows` per colonne ordinabili, toast per feedback, sidebar filtri a sinistra.
- Colori: palette TRGB-02 in `tailwind.config.js` sotto `brand.*`. Sfondo pagine: `bg-brand-cream`. Azioni primarie: `brand-blue`. Errori: `brand-red`. Successo: `brand-green`. Testo: `brand-ink`. Colori ruolo invariati (amber/cyan/purple/rose/emerald/slate).

### Migrazioni DB
- Le migrazioni sono in `app/migrations/NNN_nome.py` e vengono tracciate in `schema_migrations`.
- Una migrazione gia' eseguita NON verra' rieseguita. Se serve correggere, crea una nuova migrazione.
- Controlla sempre se la colonna esiste prima di ALTER TABLE (try/except).

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nella sessione 28 (2026-04-12) — Brand TRGB-02 integrazione completa

### P0 — Fondamenta
- **Asset copiati**: favicon/icone PWA in `public/icons/`, 10 SVG brand in `src/assets/brand/`, OG image
- **Palette Tailwind**: `brand-red/green/blue/ink/cream/night` in `tailwind.config.js`
- **index.html**: theme-color cream, OG image, body `bg-brand-cream`
- **manifest.webmanifest**: colori aggiornati a cream
- **index.css**: variabili CSS aggiornate alla palette TRGB-02, link da amber a blue
- **Header.jsx v5.0**: icona SVG gobbette+T, sfondo cream, testo ink
- **LoginForm.jsx**: wordmark composto (gobbette SVG inline + testo HTML)

### P1 — Coerenza visiva
- **Home.jsx v4.0**: wordmark composto centrato flexbox, gobbette strip decorativa, TrgbLoader, card con bordo sinistro RGB a rotazione, sfondo cream
- **TrgbLoader.jsx** (nuovo): tre gobbette animate pulse sfalsato, props size/label/className
- **Grafici Recharts** (3 dashboard): colori serie da indigo/teal a brand-blue, CAT_COLORS con brand
- **TrgbLoader inserito** in 6 loading principali (Home, Vendite, Acquisti, Statistiche, CG, Annuale)
- **Sfondo cream globale**: 90 pagine `bg-neutral-100`/`bg-gray-50` → `bg-brand-cream` via sed

### Fix intermedi
- viewBox gobbette strip SVG (era 600x60, contenuto solo a sinistra → croppato a 155x28)
- Wordmark da SVG con `<text>` (non centrato per variabilità font) → composizione HTML flex

### TODO brand residuo (P2-P3)
- **P2.9** Pattern gobbette in empty state / watermark decorativo
- **P2.13** Editor tavoli: colori zone mappati su brand (verde=libero, blue=prenotato, rosso=occupato)
- **P2.14** Sezione About/version panel con logo
- **P3.8** Dark mode (asset dark pronti, serve switch `dark:` su tutto il FE)
- **P3.10** Widget pubblico prenotazioni (bloccato da Fase 3)
- **P3.11** PDF/export con header brand (backend Python)
- **P3.12** Email template Brevo (bloccato da Fase 4 SMTP)

---

## Cosa abbiamo fatto nella sessione 27 (2026-04-11 pomeriggio → 2026-04-12 notte) — **B.1 + B.3 + B.2 Block 1 CG completo + fix Tooltip iPad ✓✓✓**

Sessione lunga, partita come "solo B.1" e finita con sette commit isolati. **Il protocollo post-mortem cap. 10 funziona**: sette push consecutivi, zero rollback, ogni singolo file testato su Mac + iPad reale prima del successivo.

### Cosa è stato fatto e lasciato in produzione (ordine cronologico dei push)

**1. B.1 — Header touch-compatibile** (`frontend/src/components/Header.jsx` da v4.2 → v4.3):
- Detection touch via `matchMedia("(hover: none) and (pointer: coarse)")` con listener `change` (regge anche il toggle Device Mode di Chrome DevTools)
- Tap-toggle sul row del modulo: su touch + modulo con sotto-voci, primo tap apre il flyout (`activateHover(key)`), secondo tap sullo stesso row naviga al path principale (`goTo(cfg.go)`). Moduli senza sotto-voci navigano al primo tap
- Click-outside esteso a `touchstart` oltre `mousedown` → tap fuori dal dropdown lo chiude su iPad
- `onMouseEnter`/`onMouseLeave` di row, container lista, flyout sub-menu e "ponte invisibile" condizionali su `!isTouch` → evita che gli eventi mouse sintetici post-touch dei browser mobile inneschino l'intent-detection desktop
- Desktop completamente invariato (intent-detection, hover safe-zone, intent timer 80ms tutti preservati)

**2. B.3 — Input font-size 16px su touch** (`frontend/src/index.css`):
- Media query `@media (pointer: coarse) { input, textarea, select { font-size: 16px; } }` aggiunta in coda al file.
- Risolve il saltello zoom automatico di iOS Safari al focus di un input con font-size < 16px. Mac invariato, iPad reale conferma che tap su sidebar filtri (Anno, Mese, Cerca fornitore) non zooma più. 5 minuti netti.

**3. B.2 componente `Tooltip.jsx` v1.0 + integrazione Header** (`frontend/src/components/Tooltip.jsx` NUOVO, `frontend/src/components/Header.jsx`):
- Componente wrapper touch-compatible che sostituisce l'attributo `title=` nativo HTML.
- Desktop: hover con delay 400ms → popup.
- Touch: primo tap mostra il tooltip MA blocca il click del child via `onClickCapture` con `preventDefault` + `stopPropagation` in fase capture. Secondo tap lascia passare l'azione. Auto-close 2.5s su touch, click/touch fuori chiude.
- Prima integrazione in Header: span "Modalità gestione" amber dot + bottone "🔑 Cambia PIN".
- Testato e verde Mac + iPad.

**4. B.2 fix Tooltip v1.0 → v1.1 iPad** (`frontend/src/components/Tooltip.jsx`):
- Dopo i primi test su CG Uscite su iPad, Marco ha scoperto che i KPI "Da riconciliare" / "Riconciliate" aprivano direttamente al primo tap invece di mostrare il tooltip. **Causa**: iPadOS 13+ di default è in modalità "Desktop Website", che fa riportare a Safari `hover: hover` e `pointer: fine`. La detection v1.0 basata su `matchMedia("(hover: none) and (pointer: coarse)")` tornava `false`, `isTouch` restava `false`, `handleClickCapture` faceva return, il click passava al child button.
- **Fix 1 (detection):** `navigator.maxTouchPoints > 0` come rilevatore primario (iPad restituisce 5 anche in desktop mode) + `(any-pointer: coarse)` come fallback + vecchia query mantenuta.
- **Fix 2 (long-press zoom):** aggiunto `style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}` sullo span wrapper del Tooltip → blocca menu callout iOS e selezione testo che causavano lo zoom su long-press.
- Testato e verde su iPad reale dopo il push.

**5. B.2 KPI ControlloGestioneUscite → Tooltip** (`frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx`):
- **Fix vero del bug iPad sui KPI** (il punto 4 era necessario ma non sufficiente). Il componente `function KPI` interno al file usava `<button title={title}>` nativo HTML. Il fix Tooltip v1.1 non poteva toccarlo perché il KPI non passava dal componente Tooltip. Riscritta la funzione: se viene passato `title`, il bottone interno viene wrappato in `<Tooltip label={title}>`; se no, resta nudo (nessuna regressione sui KPI Programmato/Scaduto/Pagato che non hanno title).
- Aggiunto `import Tooltip from "../../components/Tooltip";`
- Testato iPad: primo tap su "Da riconciliare"/"Riconciliate" mostra il tooltip, secondo tap apre il workbench / crossref.

**6. B.2 Block 1 CG — ControlloGestioneUscite.jsx title= → Tooltip** (9 wrapping totali):
- Sidebar filtri: ✕ "Azzera selezione stato", ✕ "Rimuovi periodo", bottone "Mostra escluse" con spiegazione lunga FIC (`className="w-full"` passato al Tooltip per preservare larghezza).
- Barra bulk: bottone "Stampa / Metti in pagamento".
- Dettaglio fattura inline: frecce `‹` `›` navigazione prev/next con label dinamico (nome fornitore).
- Tabella righe: badge "In pagamento" con label dinamico `Batch: ...`, icone banca per riga Riconciliata/Collega (scollega/apri riconciliazione).
- **Esclusi per regole B.2**: `<input type="checkbox">` "seleziona tutte non pagate", `<th>` banca, `<tr>` con title dinamico (struttura tabella).
- Test critico superato: icone banca per riga dentro `<td onClick={e => e.stopPropagation()}>` → il capture del Tooltip intercetta il click PRIMA del button.onClick e il td.stopPropagation non interferisce.

**7. B.2 Block 1 CG — ControlloGestioneSpeseFisse.jsx title= → Tooltip** (4 wrapping):
- `↻ Ricarica fatture` nel wizard rateizzazione.
- `Piano` / `Storico` / `Adegua` nella tabella spese fisse attive (label dinamici condizionali sul tipo spesa).
- **Esclusi**: 5 `WizardPanel title=...` (prop component, non HTML), 1 `<input title={...}>` in cella rata, **2 span informativi** della tabella storico rate con `title={banca_descrizione}` lasciati deliberatamente con `title=` nativo perché non hanno onClick e il label può essere stringa vuota.

**8. B.2 Block 1 CG — ControlloGestioneRiconciliazione.jsx title= → Tooltip** (1 wrapping):
- Solo bottone `↻ Ricarica` in alto a destra. Unico `title=` nel file, nessun residuo dopo.

### Cosa NON è stato toccato (di proposito, per rispettare il protocollo)
- `useAppHeight` → resta orfano, C.3 ancora da bisezionare
- I 6 file pagina responsive → restano `calc(100vh - Npx)` originali
- Service Worker / `main.jsx` → resta il blocco difensivo unregister
- Nessun file di Acquisti, Cantina, Dipendenti, Clienti, Contanti, Prenotazioni, Ricette, Banca, FlussiCassa (rimandati a Block 2-6 sessione 28)

### Casino worktree Claude Code — lezione importante
Durante il lavoro sul Block 1 CG avevo inizialmente provato a far eseguire le migrazioni a Claude Code in un worktree `.claude/worktrees/gracious-liskov/`. Code ha lavorato bene, io ho "verificato" le sue modifiche dentro al worktree con grep, e ho detto "ok Block 1 integro" — ma **il worktree non è mai stato mergiato in main**. Siamo passati a parlare dei bug iPad Tooltip credendo che Block 1 fosse in main, ho fixato il Tooltip component v1.0 → v1.1, Marco ha pushato e testato → bug ancora presente. Motivo: il KPI in main usava ancora `title=` nativo, Block 1 viveva solo nel worktree. Dopo aver capito l'errore ho fatto il fix KPI direttamente in main e siamo ripartiti con la disciplina "sempre in main, mai più worktree".

**Aggravante**: il worktree è registrato con path host (`/Users/underline83/trgb/.claude/worktrees/gracious-liskov`) e dalla sandbox `/sessions/...` i comandi git dentro al worktree falliscono con "not a git repository" perché il path non esiste sulla sandbox. Quindi anche a voler recuperare le modifiche di Code dopo, non posso nemmeno usare `git log`/`git diff` sul worktree — devo leggere i file raw dal mount e fare diff a mano, fragile.

**Regola ferrea aggiornata in memoria** (`feedback_worktree_no_trust.md`): un worktree NON è in main finché non faccio merge esplicito verificato con `git log --oneline` sul branch main. Mai più dire "Block X verificato" basandomi solo su grep nel worktree. Per i refactoring massivi meglio lavorare direttamente in main un file alla volta — più lento ma zero confusione, e visto che comunque ora testiamo ogni singolo push il rischio è basso.

### Test eseguiti in sessione
- **Mac desktop** Chrome/Safari: tutti i tooltip hover invariati vs `title=` nativo (popup più pulito di Tooltip.jsx, estetica OK)
- **iPad reale Marco**: tap-toggle funzionante su tutti gli 8 elementi della sezione Header + 14 wrapping CG (KPI + 9 Uscite + 4 SpeseFisse + 1 Riconciliazione)
- **iPad reale Marco**: long-press niente più zoom/callout iOS
- Zero regressioni segnalate, zero rollback

### Stato scaletta B/C/D/E dopo sessione 27
Vedi "Scaletta lavori" più sotto nella sezione sessione 26 (master list aggiornata inline: B.1 ✓, B.2 parziale (Block 1 CG), B.3 ✓).

### Lezione di sessione
Il protocollo cap. 10 funziona anche su sessioni lunghe con tante sigle. Sette file diversi, sette push, sette test, zero regressioni. Il pattern da replicare in sessione 28 e per tutte le prossime migrazioni è: **un file per commit, testo di commit preciso, Marco testa tra un push e l'altro**. Per sessione 28 si riprende da Block 2 di B.2 (Acquisti) con stessa disciplina.

---

## Cosa abbiamo fatto nella sessione 26 (2026-04-11) — **App Apple roadmap + tentativo PWA Fase 0 + tentativo Punto 1 useAppHeight (entrambi rollback)**

Sessione "ambiziosa che è esplosa". Aperta con l'analisi sull'evoluzione di TRGB in app Apple, finita con due rollback in produzione e una lezione operativa importante sul commit a blocchi accoppiati. Stato finale: codice in produzione **identico a fine sessione 25** + qualche file di docs/scaffold mai attivato + un blocco difensivo in `main.jsx` per ripulire eventuali service worker registrati.

### Cosa è stato lavorato e LASCIATO IN PRODUZIONE
- **`docs/analisi_app_apple.md`** (NUOVO, 331 righe) — analisi completa dello sforzo per portare TRGB su Apple. 5 scenari (A-E), pitfall Apple Review Guidelines 4.2 e 2.5.2, stime costi/tempi
- **`docs/roadmap.md` §33 "App Apple standalone"** (NUOVO) — Fase 0 PWA + Fase 1 Capacitor + Fase 2 SwiftUI. Vedi nota più sotto: la checklist Fase 0 è da rivedere perché contrassegnata "x" su cose poi rollbackate
- **`docs/piano_responsive_3target.md`** (NUOVO, riscritto due volte) — piano in 7 punti per ottimizzare Mac+iPad. Marco ha messo iPhone esplicitamente FUORI SCOPE: "la voglio vedere a progetto quasi finito, pensarci ora e poi cambiare architettura non ha senso". Il piano è ancora valido come riferimento futuro per **B.1-B.6**, ma il **Punto 1 va rivisto** (vedi sotto)
- **`frontend/src/main.jsx`** — blocco difensivo `serviceWorker.getRegistrations().then(unregister)` + `caches.delete()`. Lasciato attivo perché ripulisce automaticamente client (Mac/iPad) dove era stato registrato il sw.js durante il tentativo PWA. Si può togliere quando saremo sicuri che nessun client ha più SW vecchio (qualche giorno)
- **`frontend/src/hooks/useAppHeight.js`** (NUOVO) — file presente sul disco ma **non importato da nessuna parte**. Lasciato per riutilizzo dopo debug. Non è in produzione, non viene compilato nel bundle perché orfano

### Cosa è stato fatto e poi ROLLBACKATO

**Tentativo 1 — PWA Fase 0** (manifest, sw.js, icone, meta iOS):
- Implementato in pieno: 19 icone Apple/PWA generate da `logo_tregobbi.png` 5000x5000 in `frontend/public/icons/`, `manifest.webmanifest`, `sw.js` con strategia stale-while-revalidate per app shell + bypass per cross-origin API, meta tag Apple in `index.html`, fix `.gitignore` per il pattern `Icon?` che match-ava silenziosamente `/icons/`
- Caricato sul VPS (push #1)
- Sintomo: su iPad crash aprendo Cantina (MagazzinoVini) e Nuova Ricetta (RicetteNuova). Su Mac inizialmente OK
- Diagnosi sospetta: cache stale-while-revalidate del sw.js servita male da iOS Safari al primo deploy, oppure incoerenza tra index.html nuovo e chunk Vite vecchi
- **Rollback (push #3):** registrazione SW disabilitata in `main.jsx`, sostituita con blocco unregister difensivo. **Manifest, icone, meta tag iOS, .gitignore fix RIMASTI sul disco** ma inerti senza il SW

**Tentativo 2 — Punto 1 piano responsive (`useAppHeight` hook)**:
- Hook creato in `src/hooks/useAppHeight.js`: misura `window.innerHeight - <header>.offsetHeight`, setta `--app-h` su `<html>`, ricalcola su resize/orientationchange/ResizeObserver del banner viewer
- Importato + chiamato in `App.jsx` prima del return condizionale (per rispettare regole hook React)
- 6 file pagina convertiti da `calc(100vh - Npx)` a `var(--app-h, 100dvh)` con eventuali sottrazioni per sub-nav locali (FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, DipendentiAnagrafica, MagazzinoVini, ControlloGestioneRiconciliazione)
- Caricato sul VPS (push #1, insieme alla PWA)
- Sintomo dopo rollback PWA: Cantina **continuava a crashare anche su Mac**, anche dopo rollback puntuale di MagazzinoVini al `calc(100vh - 88px)` originale. RicetteNuova (che non era stata toccata dal Punto 1!) crashava lo stesso → la causa era l'hook globale, non il CSS pagina-per-pagina
- Ipotesi mai verificata: ResizeObserver loop sul `<header>` o interazione con tabelle `position: sticky` di MagazzinoVini su iOS WebKit
- **Rollback (push #4):** import + chiamata `useAppHeight` rimossi da `App.jsx`, tutti i 6 file pagina ripristinati ai valori originali `calc(100vh - Npx)`. Il file `useAppHeight.js` rimane sul disco come orfano per riutilizzo dopo debug

### Lezione di sessione — workflow per tentativi futuri di useAppHeight e PWA
**Mai più commit a blocchi accoppiati su modifiche infrastrutturali rischiose.** Il tentativo di oggi mescolava 3 cambiamenti incrociati (PWA SW + hook globale + 6 file CSS) in un push solo. Quando è esploso non c'era modo di bisezionare la causa senza rollback completo. Strategia per la prossima volta (vedi C.3 e D.4 nella scaletta più sotto):

**Per il `useAppHeight`** (C.3):
1. Commit isolato 1 — solo `useAppHeight.js` + chiamata in `App.jsx`. NESSUN file pagina toccato. L'hook setta `--app-h` ma nessuno lo usa. Marco testa: tutte le pagine devono andare come prima. Se crasha qui → bug nell'hook stesso (sospetto: ResizeObserver loop, fallback iOS Safari < 15.4 senza dvh, race header non ancora montato)
2. Commit isolato 2 — UNA pagina sostituita, la più semplice (DipendentiAnagrafica, struttura piatta senza sub-nav)
3. Commit 3-7 — una pagina alla volta nell'ordine: FattureElenco → FattureFornitoriElenco → ControlloGestioneUscite → ControlloGestioneRiconciliazione → MagazzinoVini (la più complessa per ultima)

**Per la PWA Fase 0** (D.4):
- Riprogettare `sw.js` con strategia diversa: `CACHE_NAME` legato a `BUILD_VERSION` (cache buster automatico a ogni deploy), strategia network-first per app shell (no SWR), nessun precache di chunk Vite
- Testare prima in dev tools desktop con throttling network e modalità "Offline" prima di toccare il VPS
- Su iPad: testare con Safari devtools collegato (Mac → Safari → Develop → iPad) per vedere errori console reali

### Stato file dopo questa sessione

| File | Stato | Note |
|---|---|---|
| `docs/analisi_app_apple.md` | ✅ in produzione | Riferimento Fase 0/1/2 Apple |
| `docs/piano_responsive_3target.md` | ✅ in produzione | Piano 7 punti, valido per B.1-B.6, **Punto 1 da rifare con bisezione** |
| `docs/roadmap.md §33` | ⚠️ da rivedere | Checklist Fase 0 marca [x] cose poi rollbackate |
| `frontend/public/manifest.webmanifest` | 🟡 sul disco ma inerte | Nessuno lo carica perché meta link manifest in index.html è ancora attivo ma il SW è disabilitato |
| `frontend/public/icons/` (19 file) | 🟡 sul disco ma non usati | Verranno usati quando rifaremo la PWA |
| `frontend/public/sw.js` | 🟡 sul disco ma non registrato | Lasciato come riferimento, ma il file ha il bug originale, da riscrivere |
| `frontend/src/main.jsx` | ⚠️ con blocco difensivo unregister SW | Tenere finché non si è certi che nessun client ha SW vecchio (qualche giorno), poi semplificare |
| `frontend/src/hooks/useAppHeight.js` | 🟡 orfano sul disco | Da reinvestigare con C.3 prima di reimportare |
| `frontend/src/App.jsx` | ⚠️ ha import commentato `// import useAppHeight ...` | Riga 12, riga 130 |
| 6 file pagina (FattureElenco, FattureFornitoriElenco, CGUscite, DipendentiAnagrafica, MagazzinoVini, CGRiconciliazione) | ✅ identici a sessione 25 | Tutti tornati a `calc(100vh - Npx)` originale |

### Scaletta lavori per le prossime sessioni (master list)

**B — Piano responsive Mac+iPad (resto, dopo aver risolto C.3)**
- ~~B.1~~ ✅ **FATTA SESSIONE 27** — Header touch-compatibile: `matchMedia("(hover: none) and (pointer: coarse)")`, tap-toggle flyout, click-outside esteso a touchstart, handler mouse condizionali su `!isTouch`. File toccato: `Header.jsx` v4.2 → v4.3. Testato Mac + iPad reale, tutto verde
- **B.2 Punto 3 — Tooltip popover componente — PARZIALE (sessione 27)**:
  - ✅ Componente `Tooltip.jsx` v1.1 creato (con fix iPad Desktop-mode via `navigator.maxTouchPoints` + no long-press callout)
  - ✅ Header.jsx integrato (2 wrapping)
  - ✅ Block 1 CG completo: `ControlloGestioneUscite.jsx` (KPI fix + 9 wrapping), `ControlloGestioneSpeseFisse.jsx` (4 wrapping), `ControlloGestioneRiconciliazione.jsx` (1 wrapping)
  - ⏳ **Block 2-6 da fare sessione 28**, sempre un file per commit direttamente in main:
    - **B.2.B2 Acquisti** (`pages/acquisti/*` — fatture elenco, dettaglio, fornitori elenco, dettaglio fornitore, ecc.)
    - **B.2.B3 Cantina** (`pages/cantina/*` — MagazzinoVini, SchedaVino, stocks, movimenti)
    - **B.2.B4 Dipendenti** (`pages/dipendenti/*` — anagrafica, cedolini, contratti)
    - **B.2.B5 Clienti + GestioneContanti**
    - **B.2.B6 Prenotazioni + Ricette + Banca + FlussiCassa**
  - ⚠️ **Regola operativa sessione 28**: sempre direttamente in main, mai più worktree `.claude/worktrees/*`. Un file per commit, Marco testa tra un push e l'altro. Regole di esclusione costanti: NO `<input>`, NO `<th>`/`<tr>` struct tabella, NO `<label>`, NO prop `title` di component custom (WizardPanel, SectionHeader, Section, ecc.). Span informativi con label dinamico eventualmente vuoto possono essere lasciati con `title=` nativo (come fatto in SpeseFisse storico)
- ~~B.3~~ ✅ **FATTA SESSIONE 27** — Input font-size 16px su touch (`@media (pointer: coarse)` in `index.css`). File toccato: `frontend/src/index.css`. Testato iPad reale, no zoom al focus
- B.4 Punto 5 — Tap target 40-44px su sidebar filtri (~30-40 sostituzioni Tailwind). ⏱ ~45 min, rischio basso
- B.5 Punto 6 (opzionale) — Sidebar width → variabile `w-sidebar` in `tailwind.config.js`. ⏱ 15 min
- B.6 Punto 7 (CONDIZIONALE) — Tabelle critiche `hidden xl:table-cell` su colonne secondarie. SOLO se test iPad reale conferma scroll orizzontale dopo B.1-B.4. Approvazione tabella per tabella

**C — Debito tecnico**
- C.1 `FattureDettaglio.jsx:253` `inline ? "78vh" : "88vh"` — viewer dentro dialog. Da migrare a `var(--app-h)` quando avremo certezza che è sicuro
- C.2 `SchedaVino.jsx:523` — gemello di C.1, stesso pattern
- **C.3 (NUOVO) Reinvestigare `useAppHeight`**: bisezione step-by-step come descritto sopra. Pre-requisito per qualunque uso di `var(--app-h)`. Probabili sospetti: ResizeObserver loop, race header non montato, fallback iOS < 15.4 senza dvh, interazione con tabelle sticky di MagazzinoVini

**D — App Apple roadmap §33**
- D.1 Test PWA Fase 0 su iPad reale — **bloccato fino a D.4**
- D.2 Decisione Fase 1 Capacitor (richiede iscrizione Apple Developer $99/anno)
- D.3 Versione iPhone lite — **bloccato fino a "progetto quasi finito"** per decisione esplicita di Marco (sessione 26)
- **D.4 (NUOVO) Re-implementare PWA Fase 0** con strategia cache safe per iOS: CACHE_NAME legato a BUILD_VERSION, network-first per app shell, no precache di chunk Vite, test in dev tools prima di pushare. Pre-requisito di D.1

**E — Backlog generale (preesistente)**
- E.1 Mailchimp sync (vedi `project_backlog.md` in memoria)
- E.2 Google Contacts API
- E.3 Modulo Prenotazioni — 5 fasi, obiettivo eliminare TF Manager (`docs/modulo_prenotazioni.md`, `docs/prenotazioni_todo.md`)

**F — Home v3 Redesign (NUOVO sessione 29)**
- ✅ F.0 Docs + specifiche + regole design + mockup approvato
- ⏳ F.1 Backend endpoint `GET /dashboard/home` aggregatore widget
- ⏳ F.2 Frontend infrastruttura: `useHomeWidgets()` hook, `WidgetCard` component, `icons.jsx` set SVG
- ⏳ F.3 Frontend pagina 1 (widget): riscrittura Home.jsx con swipe + 5 widget
- ⏳ F.4 Frontend pagina 2 (moduli): `ModuleTile` component, griglia responsive
- ⏳ F.5 Navigazione: adattamento Header + DashboardSala stile v3
- ⏳ F.6 Polish: styleguide.md aggiornato, test viewport iPad/iPhone, versions.jsx

---

## Cosa abbiamo fatto nella sessione 23 (2026-04-10 notte) — **Incident backup + refactor FattureDettaglio + Scadenzario sidebar**

Sessione di "pulizia e cleanup" dopo la chiusura della v2.0 CG aggregatore. Partita come piccolo giro di refactor, finita come sessione lunga con un incident backup critico risolto + 3 refactor UX importanti + fix infrastrutturale permanente.

### Incident backup — fermo da 12 giorni, risolto e blindato
- **Scoperta** — `scripts/backup_db.sh` aveva perso il bit `+x` (quasi certamente dopo un push.sh precedente: git non sempre preserva la mode bit quando il file viene riscritto). Il cron hourly+daily falliva con `Permission denied` senza entrare nello script. Ultimo backup hourly riuscito: 2026-03-29 22:33. La cartella `daily/` era completamente vuota
- **Fix immediato** — `chmod +x` sul VPS, test con `--daily`: tutti i DB backuppati, rotazione OK, sync Google Drive OK
- **Architettura — `backup_router.py` v2** — scoperto che il router leggeva da `/home/marco/trgb/backups/*.tar.gz` (Sistema B, residuo morto) mentre il cron vero scrive in `/home/marco/trgb/trgb/app/data/backups/daily/YYYYMMDD_HHMMSS/` (Sistema A). Riscritto per puntare al sistema reale, nuova helper `_list_daily_snapshots()`, download on-the-fly via tarfile in memoria, nuovo campo `last_backup_age_hours`
- **UX — banner warning 3 livelli** in `TabBackup`: verde ≤30h, amber 30-48h, red >48h. Se il bit `+x` sparisce di nuovo Marco lo vede subito invece di accorgersene settimane dopo
- **Bug fix — `clienti.sqlite3` escluso dal backup da sempre** — trovato durante la verifica UI. Né `backup_db.sh` né `backup_router.py` lo elencavano. Aggiunto in entrambi
- **Cleanup** — rimosso `backup.sh` orfano dalla root, riscritto `setup-backup-and-security.sh` con le crontab corrette, aggiornati `docs/deploy.md` + `docs/GUIDA-RAPIDA.md` + questo file
- **Fix permanente idempotente** — aggiunto step "Verifica bit +x script critici" dentro `push.sh` che itera un array `EXEC_SCRIPTS=("scripts/backup_db.sh" "push.sh")` e se il mode letto da `git ls-files --stage` non è `100755` esegue `git update-index --chmod=+x`. Idempotente: quando tutto è ok non fa nulla. Così è impossibile rilasciare una versione con gli script critici non eseguibili

### Acquisti v2.2 → v2.3 — Unificazione FattureDettaglio (Fase H)
- **Fine dei "due moduli fatture"** — prima di oggi il dettaglio fattura aveva due implementazioni parallele: il componente riutilizzabile `FattureDettaglio` (usato in `/acquisti/dettaglio/:id` e nello split-pane dello Scadenzario) e un `DetailView` locale dentro `FattureElenco.jsx` (~130 righe) con stile suo proprio. La nuova grafica "sidebar colorata + SectionHeader" di v2.1b non appariva in Acquisti → Fatture perché quella vista continuava a usare la vecchia DetailView
- **`FattureElenco.jsx` riscritto** — `DetailView` locale eliminato. Il ramo "dettaglio aperto" ora renderizza `<FattureDettaglio fatturaId={openId} inline={true} onClose={...} onSegnaPagata={...} onFatturaUpdated={...}>`. State locale semplificato: rimossi `dettaglio` e `detLoading`, resta solo `openId`
- **Nuova prop `onSegnaPagata`** in `FattureDettaglio` — se passata, la sidebar colorata mostra il bottone "✓ Segna pagata" in ambra (solo se non pagata/non rateizzata/stato ≠ PAGATA). Il componente chiama la callback del parent e poi esegue `refetch()` automaticamente. Funzionalità "segna pagata manuale" preservata dal vecchio DetailView ma ora disponibile ovunque

### Dettaglio Fornitore v3.2 — Sidebar colorata + FattureDettaglio inline (Acquisti v2.3)
- **Refactor grafico `FornitoreDetailView`** — allineato a `FattureDettaglio`/`SchedaVino`. Nuovo layout due colonne `grid-cols-1 lg:grid-cols-[300px_1fr]` con sidebar colorata a sinistra. Top bar ("Torna alla lista", "Nascondi da acquisti / Ripristina") sopra, fuori dalla griglia
- **Sidebar colorata con stato semantico** — gradiente teal (ATTIVO), amber (IN SOSPESO se `nDaPagare > 0`), slate (ESCLUSO se `fornitore_escluso = 1`). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar()`. Contenuti: header (nome+P.IVA+CF+badge), box totale spesa grande, 4 KPI compatti, box "Da pagare" (rosso se scadute), info list primo/ultimo acquisto, sede, distribuzione categorie, ID tecnico
- **`SectionHeader` uniforme** — helper locale per delimitare "Categoria generica fornitore" e "Condizioni di pagamento" nell'area principale
- **Unificazione — dettaglio fattura inline usa FattureDettaglio** — eliminato il subcomponente `FatturaInlineDetail` (~130 righe) che duplicava il rendering. Sostituito da `<FattureDettaglio fatturaId={openFatturaId} inline={true} ... />`. Cleanup state (`fatturaDetail`/`fatturaDetLoading` rimossi), `openFattura(id)` ora è un semplice toggle. `onSegnaPagata`/`onFatturaUpdated` triggerano `reloadFatture()` + `handleFatturaUpdatedInline()` per sync sidebar+tabella

### Controllo Gestione v2.1c — Rewrite sidebar Scadenzario
- **Problemi identificati** — 7 palette diverse nei blocchi filtro (white/sky/indigo/purple/amber/violet/neutral) = rumore visivo; filtri impilati verticalmente sprecavano spazio (Stato: 4 bottoni × ~28px = 112px); pulsanti Pulisci/Aggiorna dentro il flusso scrollabile, sparivano appena scorrevi
- **Nuova struttura flat 240px** — outer `flex flex-col` con body `flex-1 overflow-y-auto` + footer sticky `flex-shrink-0`. Una sola palette neutra con accenti semantici solo dove servono. Sezioni separate da `border-b border-neutral-100`, header `text-[10px] uppercase tracking-wider`
- **Stato come griglia 2×2** — `grid-cols-2 gap-1.5`, ogni stato assume il suo colore semantico quando attivo (Tutti neutral-800, Da pagare amber-100, Scadute red-100, Pagate emerald-100)
- **Tipo come segment control** — pill group orizzontale `flex rounded-md bg-neutral-50 p-0.5`, pill attivo `bg-white shadow-sm`. Molto più compatto
- **Periodo preset in 3 colonne** + Da/A date inline nella riga sotto
- **Filtri speciali fusi** — Rateizzate + Solo in pagamento come toggle con dot-indicator, "Gestisci batch" come dashed-border nello stesso blocco, Riconciliazione come badge violet condizionale
- **Footer sticky** con Pulisci (disabled quando nessun filtro attivo) + Aggiorna sempre visibili

### Versioning
- **`versions.jsx`** — `fatture` v2.2 → v2.3 (unificazione + dettaglio fornitore v3.2), `controlloGestione` v2.1b → v2.1c (sidebar Scadenzario)

### Workflow lessons apprese
- **Bit +x è un single point of failure infrastrutturale** — perdere il bit eseguibile su uno script cron significa zero allerta e zero backup finché qualcuno non guarda manualmente. Soluzione: fix idempotente dentro `push.sh` + banner warning nella UI
- **"Due implementazioni parallele di X" è un debito da estinguere subito** — appena ci si rende conto che un componente locale e un componente riutilizzabile fanno la stessa cosa con stile diverso, bisogna eliminare il locale. Altrimenti ogni miglioria fatta sul riutilizzabile non arriva mai all'altra vista
- **Sidebar con 7 colori diversi è peggio di una con 1 colore** — il colore deve veicolare informazione (stato semantico), non "fare carino". Flat + spazio bianco + accenti mirati batte sempre il carnevale

---

## Cosa abbiamo fatto nella sessione 22 (2026-04-10) — **v2.0 CG aggregatore completata**

Sessione lunga (mattina → notte). Divisa in due tempi: backfill sospeso al pomeriggio, poi ripreso e completato con tutta la parte backend + frontend v2.0.

### v2.0 CG aggregatore — Fase A (schema + backfill)

1. **Mig 055** `fe_fatture.rateizzata_in_spesa_fissa_id` + indice parziale — APPLICATA
2. **Mig 056** `fe_fatture.data_prevista_pagamento`, `data_effettiva_pagamento`, `iban_beneficiario`, `modalita_pagamento_override` + 4 indici — APPLICATA
3. **Mig 057** dry-run CSV del backfill rateizzazioni — APPLICATA
4. **`scripts/apply_backfill_057.py`** — backup automatico + transazione atomica. **Backfill applicato: 43/43 fatture flaggate** (compreso Metro Italia risolto con `find_metro.py`)
5. **`docs/v2.0-decisioni.md`** — consolidate le decisioni architetturali (F4 insight: analitico vs finanziario, 3 campi data)

### v2.0 CG aggregatore — Fase B (backend)

- **B.1** — `GET /controllo-gestione/uscite` riscritto come vista JOIN su `fe_fatture`. COALESCE chain per `data_scadenza_effettiva`, `modalita_pagamento_effettiva`, `iban_beneficiario_effettivo`. CASE per normalizzare stato → `RATEIZZATA`/`PAGATA`. Query param `includi_rateizzate` (default OFF) che nasconde le 43 righe rateizzate. Retrocompat piena sul payload JSON
- **B.1.1** — toggle sidebar "Mostra rateizzate" nello Scadenzario + sfondo viola righe RATEIZZATA + badge permanente `STATO_STYLE.RATEIZZATA`
- **B.2** — `PUT /uscite/{id}/scadenza` riscritto come **smart dispatcher 2-rami**: FATTURA con `fattura_id` → `fe_fatture.data_prevista_pagamento`; altro → `cg_uscite.data_scadenza` (legacy). Delta calcolato da `fe_fatture.data_scadenza` XML per fatture v2. **Nota**: `cg_piano_rate` non ha `data_scadenza`, quindi dispatcher 2-rami (non 3 come in roadmap originaria). Frontend `apriModaleScadenza` inietta `data_scadenza_originale` semantica (XML per fatture, cg_uscite per il resto)
- **B.3** — nuovi endpoint `PUT /uscite/{id}/iban` e `PUT /uscite/{id}/modalita-pagamento` (dispatcher). FATTURA → `fe_fatture.iban_beneficiario` / `fe_fatture.modalita_pagamento_override`; SPESA_FISSA → `cg_spese_fisse.iban`; altri → 422. Helper `_normalize_iban` (upper+strip), `_normalize_mp_code`. Risposta con `fonte_modifica` per tracciamento

### v2.0 CG aggregatore — Fase D (FattureDettaglio arricchito)

- **`GET /contabilita/fe/fatture/{id}` esteso** con tutti i campi v2.0 (scadenze, IBAN, mp override, rateizzata flag, sub-oggetto `uscita` con batch) + COALESCE chain Python-side
- **`FattureDettaglio.jsx`** — nuova card "Pagamenti & Scadenze" tra header e righe con:
  - Badge stato uscita + badge rateizzata/batch
  - Banner viola + link alla spesa fissa se rateizzata
  - 3 tile editabili (Scadenza / Modalità / IBAN) con flag "override", edit inline → endpoint B.2/B.3
  - Modifica bloccata se PAGATA o RATEIZZATA
  - Breadcrumb `?from=scadenzario` → "Torna allo Scadenzario"
  - Toast feedback emerald/red

### v2.0 CG aggregatore — Fase E (Scadenzario click-through)

- **`handleRowClick` intelligente** nello Scadenzario: FATTURA → FattureDettaglio; SPESA_FISSA → SpeseFisse con highlight; altri → modale legacy. Tooltip dinamico
- **`ControlloGestioneSpeseFisse.jsx`** supporta `?highlight=<id>&from=scadenzario`: scrollIntoView + `animate-pulse ring-amber`, param rimosso dopo 4s, bottone "← Torna allo Scadenzario" teal in header

### Workflow lessons apprese

- **push.sh SOLO dal main working dir** (`/Users/underline83/trgb`). MAI dai worktree `.claude/worktrees/*` — committa sul branch sbagliato e il push non arriva in main (salvato come memory `feedback_push_sh_cwd.md`)
- **VPS git status sporco è cosmetico**: il post-receive hook usa `--git-dir=$BARE --work-tree=$WORKING_DIR checkout -f` che scrive i file ma non aggiorna il `.git/` locale. L'indicatore vero del deploy è `deploy.log` sul VPS (salvato come memory `project_vps_cosmetic_git.md`)
- **Non fidarsi del titolo del commit**: quando B.1 era "già pushato" secondo il messaggio, in realtà il commit conteneva solo i docs. Il router era in un worktree non committato. Lezione: sempre `git show --stat <hash>` per verificare

---

## Cosa abbiamo fatto nella sessione 21 (2026-04-06)

### Gestione Clienti v1.1: Merge duplicati, protezione dati, export
1. **Merge duplicati** — UI 3-step (principale → secondari → conferma), batch merge, trasferimento prenotazioni/note/tag/alias
2. **Filtri duplicati** — 3 modalità: telefono, email, nome+cognome; esclusione "non sono duplicati"
3. **Protezione dati CRM** — campo `protetto`, tag `auto/manual`, alias merge per import sicuro
4. **Import intelligente** — protetti: riempimento campi vuoti + aggiornamento rank/spending; non protetti: sovrascrittura completa
5. **Export Google Contacts** — CSV per Gmail con nome, email, telefoni, compleanno, allergie, tag come gruppi
6. **push.sh refactoring** — flag -f/-m/-d, aggiunto clienti.sqlite3 a sync DB

### Sessione 20: Gestione Clienti v1.0 (CRM completo)
1. **DB dedicato** `clienti.sqlite3` — 7 tabelle con trigger e indici
2. **Backend completo** `clienti_router.py` (~1200 righe) — tutti gli endpoint CRM
3. **Import TheFork** — clienti (30 colonne XLSX) + prenotazioni (37 colonne XLSX)
4. **Anagrafica (Lista)** — tabella ordinabile, sidebar filtri, paginazione
5. **Scheda cliente** — layout 3 colonne, edit inline, tag toggle, diario note, storico prenotazioni
6. **Dashboard CRM** — KPI, compleanni, top clienti, distribuzione, andamento mensile
7. **Dashboard CRM** — 8 KPI card, compleanni 7gg, top 20 clienti, rank/tag/canale distribution, andamento mensile 12 mesi, copertura contatti
8. **Vista Prenotazioni** — tabella globale con filtri (stato, canale, date), badge colorati, paginazione
9. **Import UI** — due sezioni (clienti + prenotazioni) con istruzioni step-by-step, drag & drop XLSX

### Sessione 19 (2026-04-05)
10. Vendite v4.2: turni chiusi parziali, fix DELETE chiusura
11. Sistema v5.3: logging strutturato, centralizzazione DB, error handler globale

### Sessione 18 (2026-04-01/02)
12. Vendite v4.1, Controllo Gestione v1.4, Flussi di Cassa v1.3-1.4, Dipendenti v2.1

---

## Cosa abbiamo fatto nella sessione 17 (2026-03-29)

### Controllo Gestione v1.0: Nuovo modulo, dashboard, tabellone uscite

#### Nuovo modulo Controllo Gestione
1. **Modulo top-level** integra Finanza (rimosso) — colore sky/cyan, icona 🎯
2. **Dashboard unificata** — KPI vendite/acquisti/banca/margine, andamento annuale, top fornitori, categorie acquisti
3. **Tabellone Uscite** — importa fatture da Acquisti, calcola scadenze, gestisce stati (DA_PAGARE, SCADUTA, PAGATA, PARZIALE)
4. **Confronto Periodi** — placeholder per confronto mesi/anni

#### Estrazione DatiPagamento da XML FatturaPA
5. **fe_import.py** — aggiunta funzione `_extract_dati_pagamento()` che estrae DatiPagamento/DettaglioPagamento (condizioni, modalità, scadenza, importo) dall'XML
6. **Migration 031** — aggiunge `condizioni_pagamento`, `modalita_pagamento`, `data_scadenza`, `importo_pagamento` a `fe_fatture` + `modalita_pagamento_default`, `giorni_pagamento`, `note_pagamento` a `suppliers`

#### Tabelle Controllo Gestione
7. **Migration 032** — crea `cg_uscite` (fatture importate con stato pagamento), `cg_spese_fisse` (affitti, tasse, stipendi), `cg_uscite_log`

#### Import uscite e logica scadenze
8. **POST /controllo-gestione/uscite/import** — importa fatture da fe_fatture → cg_uscite, calcola scadenza (XML > default fornitore > NULL), aggiorna stati
9. **GET /controllo-gestione/uscite** — tabellone con filtri (stato, fornitore, range date, ordinamento)
10. **GET /controllo-gestione/uscite/senza-scadenza** — fatture senza scadenza (da configurare)

#### Condizioni pagamento fornitore
11. **FattureFornitoriElenco.jsx** — aggiunta sezione "Condizioni di pagamento" nella scheda fornitore (modalità, giorni, note)
12. **PUT /controllo-gestione/fornitore/{piva}/pagamento** — salva condizioni pagamento default per fornitore

#### Ancora da fare (prossime sessioni)
- **Punto 5**: Cross-ref pagamenti con Banca (matching uscite ↔ movimenti)
- **Spese Fisse**: sezione per affitti, tasse, stipendi, prestiti, rateizzazioni
- **Gestione contanti**: matching pagamenti cash
- Finanza: RIMOSSO in sessione 18

---

## Cosa abbiamo fatto nella sessione 15 (2026-03-28)

### Acquisti v2.2: Filtro categoria sidebar, fix fornitori mancanti, dettaglio migliorato

#### Fix fornitori mancanti (sessione 14+15)
1. **stats_fornitori query riscritta** — il vecchio LEFT JOIN con `escluso` filter nel WHERE nascondeva fornitori legittimi. Ora usa NOT EXISTS subquery per esclusione + JOIN separato per categoria
2. **forn_key fix** — COALESCE non gestiva fornitore_piva="" (empty string vs NULL). Ora usa CASE WHEN

#### Filtro categoria sidebar
3. **FattureFornitoriElenco.jsx** — aggiunto dropdown "Categoria fornitore" nella sidebar sinistra (filtra per categoria assegnata al fornitore, oppure "Senza categoria")
4. **stats_fornitori** — ora ritorna `categoria_id` e `categoria_nome` dal JOIN con fe_fornitore_categoria + fe_categorie

#### Dettaglio fornitore migliorato
5. **KPI arricchiti** — aggiunto "Media fattura" e "Da pagare" (importo rosso, solo se ci sono fatture non pagate)
6. **Layout header** — P.IVA e C.F. su stessa riga, piu' compatto
7. **Pulsante "Escludi" ridisegnato** — grigio discreto, diventa rosso solo al hover

#### Sessione 14 (2026-03-25/27) — riepilogo
8. **Toast feedback** per azioni massive in MagazzinoVini.jsx
9. **Categoria fornitore propagata** ai prodotti (con flag `categoria_auto`)
10. **Righe descrittive nascoste** (prezzo_totale=0 filtrate da prodotti e cat_status)
11. **Colonne ordinabili** sia nella tabella fornitori che nella tab fatture del dettaglio
12. **Esclusione fornitori** (Cattaneo/Bana come affitti) con filtro in stats_fornitori
13. **Migrazione 027** (fe_righe.categoria_auto) + **028** (reset valori errati)

---

## Cosa abbiamo fatto nella sessione 13 (2026-03-23)

### Gestione Vendite v4.0: Dashboard unificata 3 modalita', chiusure configurabili, cleanup fiscale
- Fix home page vuota per superadmin (modules.json + Home.jsx)
- Pre-conti nascosti in Impostazioni (solo superadmin)
- Dashboard fiscale pulita: contanti come residuo, rimossi alert/differenze
- Confronto YoY con smart cutoff (giorno corrente se mese in corso)
- Chiusure configurabili: closures_config.json + CalendarioChiusure.jsx
- Dashboard unificata 3 modalita' (Mensile/Trimestrale/Annuale) in una pagina

---

## Cosa abbiamo fatto nella sessione 12 (2026-03-22)

### Gestione Acquisti v2.1: FIC API v2 enrichment, SyncResult tracking, fix UI escluso

#### Backend — fe_import.py (fatture list/import)
1. **Rimosso `escluso` field da query `/fatture`** — il flag e' solo per product matching module, non per acquisti
2. **Rimosso LEFT JOIN con `fe_fornitore_categoria`** dalla list endpoint e stats (fornitori, mensili)
3. **Import XML arricchisce fatture FIC** — quando import XML matcha una fattura FIC esistente, aggiunge le righe XML se FIC ritorna `is_detailed: false`
4. **Import XML aggiorna importi** — da XML SdI: imponibile, IVA, totale quando arricchisce

#### Backend — fattureincloud_router.py (FIC sync)
5. **SyncResult tracking v2.0** — include `items` list e `senza_dettaglio` list
6. **Debug endpoint** — `GET /fic/debug-detail/{fic_id}`
7. **Phase 2 XML preservation** — se FIC `items_list` vuoto, righe da XML non vengono cancellate

#### Frontend
8. **FattureElenco.jsx** — rimosso badge/filtro "Escluse", anno default = current year
9. **FattureImpostazioni.jsx** — sync result table + warning box + 10-min timeout
10. **FattureDashboard.jsx** — anno default = current year

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-20, sessione 11)

### Infrastruttura: backup, sicurezza, multi-PC, Google Drive

1. **ChiusuraTurno.jsx** — autosave localStorage completo
2. **ChiusureTurnoLista.jsx** — fix formula quadratura
3. **VPS Recovery** — fail2ban whitelist, backup automatico notturno
4. **Git ibrido** — origin=VPS + github=GitHub, push.sh
5. **Windows configurato** — SSH + Git + VS Code
6. **backup_router.py** — download backup on-demand dall'app
7. **rclone + Google Drive** — upload automatico backup

---

## Sessioni precedenti (3-11)

| # | Data | Tema |
|---|------|------|
| 10 | 2026-03-16 | Cantina & Vini v4.0 — filtro unificato, stampa selezionati, SchedaVino sidebar |
| 9 | 2026-03-15c | Modulo Statistiche v1.0 — import iPratico + analytics vendite |
| 8 | 2026-03-15b | Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti |
| 7 | 2026-03-15 | Eliminazione vecchio DB vini.sqlite3 + fix carta PDF/HTML |
| 6 | 2026-03-14 | Chiusure Turno — modulo completo + Cambio PIN |
| 5c | 2026-03-14a | Cantina & Vini v3.7 — filtri locazione gerarchici |
| 5b | 2026-03-13 | Modulo Banca v1.0 + Conversioni unita' + Smart Create UX |

---

## Stato attuale del codice — cose critiche da sapere

### Backup & Sicurezza (CONFIGURATO)
- **Backup notturno** alle 3:00 → `/home/marco/trgb/backups/` + upload Google Drive (`TRGB-Backup/`)
- **Download dall'app**: Admin → Impostazioni → tab Backup
- **fail2ban**: whitelist reti private, bantime 10 minuti
- **Snapshot Aruba**: da configurare settimanalmente dal pannello

### Git & Deploy (CONFIGURATO)
- **Mac** (`~/trgb`): origin=VPS, github=GitHub, push.sh
- **Windows** (`C:\Users\mcarm\trgb`): origin=VPS, github=GitHub
- **VPS**: bare repo + post-receive hook per deploy automatico
- **Flusso**: `./push.sh "msg"` oppure `git push origin main && git push github main`

### Modulo Chiusure Turno
- **Backend**: `chiusure_turno.py` con endpoint POST/GET per chiusure + pre-conti + spese
- **Frontend**: `ChiusuraTurno.jsx` (form con autosave localStorage), `ChiusureTurnoLista.jsx` (lista admin con quadratura corretta)
- **DB**: `admin_finance.sqlite3` con tabelle shift_closures, shift_preconti, shift_spese

### Dashboard Vendite v4.0
- **3 modalita'**: Mensile / Trimestrale / Annuale in un'unica pagina
- **Confronto YoY smart**: cutoff al giorno corrente se periodo in corso
- **Dati fiscali puliti**: solo corrispettivi, contanti come residuo
- **Chiusure configurabili**: giorno settimanale + festivi in closures_config.json

### Cambio PIN
- **Frontend**: `CambioPIN.jsx` a `/cambio-pin`
- **Backend**: usa endpoint esistente `PUT /auth/users/{username}/password`

### Modulo Acquisti — Fornitori (v2.2)
- **Categorizzazione a 3 livelli**: prodotto manuale > fornitore manuale > import automatico
- **`auto_categorize_righe()`** in `fe_categorie_router.py`: shared helper usato da import XML e FIC sync
- **`categoria_auto` flag** su `fe_righe`: 0=manuale, 1=ereditata da import
- **Badge cat_status**: ok (tutte manuali), auto (ha ereditate), partial, none, empty
- **Filtri sidebar**: ricerca testo, anno, categoria fornitore, stato prodotti
- **Pattern UI**: SortTh/sortRows su tutte le tabelle, toast per feedback

### REGOLA CRITICA: campi `escluso` e `escluso_acquisti` in fe_fornitore_categoria
- `escluso` → usato SOLO dal modulo **Ricette/Matching** (RicetteMatching.jsx). Nasconde fornitori irrilevanti dal matching fatture-ingredienti.
- `escluso_acquisti` → usato SOLO dal modulo **Acquisti**. Nasconde fornitori da dashboard/KPI/grafici (es. affitti Cattaneo/Bana).
- **NON mescolare mai i due campi**. Ogni modulo usa il suo.
- Le query acquisti (`_EXCL_WHERE`) filtrano: `is_autofattura = 0 AND escluso_acquisti = 0`
- Toggle nel dettaglio fornitore: "Nascondi da acquisti" / "Ripristina"
- Nell'elenco fornitori: esclusi nascosti di default, checkbox "Mostra esclusi" nella sidebar

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.8 | stabile |
| Gestione Acquisti | v2.3 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v4.2 | stabile |
| Statistiche | v1.0 | beta |
| Flussi di Cassa | v1.5 | beta |
| Controllo Gestione | v2.1c | beta |
| Gestione Clienti | v2.0 | beta |
| Prenotazioni | v2.0 | beta |
| Dipendenti | v2.1 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v5.3 | stabile |

---

## Task aperti prioritizzati

Vai su `docs/roadmap.md` per la lista completa.

| # | Task | Stato |
|---|------|-------|
| 26 | Checklist fine turno configurabile | Da fare |
| 20 | Carta Vini pagina web pubblica | Da fare |
| 25 | Sistema permessi centralizzato | TODO |
| 28 | Riconciliazione banca migliorata | Da fare |
| 17 | Flag DISCONTINUATO UI per vini | Da fare |
| 29 | DNS dinamico rete casa (DDNS) | In standby |
| 30 | Snapshot Aruba settimanale | Da configurare |

---

## Prossima sessione — TODO

1. **Completare refactoring DB** — Code ha saltato ipratico_products_router (2 conn), corrispettivi_export (1 conn), dipendenti (1 conn)
2. **Testare wizard rateizzazione** — creare una rateizzazione di prova con spese legali e rate variabili
3. **Configurare snapshot Aruba settimanale** dal pannello
4. **DNS dinamico casa** (DDNS) — rimandato
5. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
6. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt
app/data/users.json                    — store utenti (marco/iryna/paolo/ospite)

# --- BACKUP ---
app/routers/backup_router.py           — download backup on-demand, lista, info, age warning
scripts/backup_db.sh                   — backup orario + giornaliero (cron) + sync Google Drive
setup-backup-and-security.sh           — setup cron + fail2ban (one-time)

# --- CHIUSURE TURNO ---
app/routers/chiusure_turno.py          — backend, prefix /chiusure-turno
frontend/src/pages/admin/ChiusuraTurno.jsx  — form fine servizio (con autosave)
frontend/src/pages/admin/ChiusureTurnoLista.jsx — lista chiusure admin (quadratura corretta)

# --- VENDITE ---
app/routers/admin_finance.py              — corrispettivi legacy + stats + chiusure configurabili
app/routers/closures_config_router.py     — GET/PUT config chiusure
app/data/closures_config.json             — config giorno settimanale + giorni chiusi
frontend/src/pages/admin/VenditeNav.jsx   — navigazione (senza tab Annuale)
frontend/src/pages/admin/CorrispettiviDashboard.jsx — dashboard unificata 3 modalita'
frontend/src/pages/admin/CorrispettiviImport.jsx    — impostazioni sidebar (chiusure + import)
frontend/src/pages/admin/CalendarioChiusure.jsx     — UI calendario chiusure

# --- VINI ---
app/routers/vini_router.py               — carta vini + movimenti (v3.0, solo magazzino)
app/routers/vini_magazzino_router.py     — magazzino vini CRUD
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.1, loader unificato)
app/models/vini_magazzino_db.py          — DB unico vini + fix delete_movimento
app/services/carta_vini_service.py       — builder HTML/PDF/DOCX carta vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino (usato da tutti)

# --- ACQUISTI (FATTURE ELETTRONICHE) ---
app/routers/fe_import.py                    — import XML/ZIP, stats fornitori, dashboard, drill
app/routers/fe_categorie_router.py          — categorie, assegnazione prodotti/fornitori, auto_categorize
app/routers/fattureincloud_router.py        — sync FIC API v2
frontend/src/pages/admin/FattureFornitoriElenco.jsx — lista fornitori con sidebar filtri + dettaglio inline
frontend/src/pages/admin/FattureDashboard.jsx       — dashboard acquisti
frontend/src/pages/admin/FattureElenco.jsx          — lista fatture
frontend/src/pages/admin/FattureCategorie.jsx       — gestione categorie
frontend/src/pages/admin/FattureImpostazioni.jsx    — import + sync settings

# --- RICETTE & FOOD COST ---
app/routers/foodcost_recipes_router.py    — ricette + calcolo food cost
app/routers/foodcost_matching_router.py   — matching fatture → ingredienti
app/routers/foodcost_ingredients_router.py — ingredienti + conversioni

# --- STATISTICHE ---
app/routers/statistiche_router.py        — import iPratico + analytics (v1.0)
app/services/ipratico_parser.py          — parser export .xls (HTML)
frontend/src/pages/statistiche/          — Menu, Nav, Dashboard, Prodotti, Import

# --- BANCA ---
app/routers/banca_router.py              — movimenti, dashboard, categorie, cross-ref

# --- IMPOSTAZIONI ---
frontend/src/pages/admin/ImpostazioniSistema.jsx — tab Utenti + Moduli + Backup (standalone, /impostazioni)

# --- CLIENTI CRM ---
app/models/clienti_db.py                 — init DB clienti.sqlite3 (5 tabelle, trigger, indici)
app/routers/clienti_router.py            — CRUD + import TheFork + dashboard + prenotazioni (~900 righe)
frontend/src/pages/clienti/              — Menu, Nav, Lista, Scheda, Dashboard, Import, Prenotazioni

# --- FRONTEND ---
frontend/src/App.jsx                   — tutte le route (50+), /admin redirect a /impostazioni
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.jsx       — versioni moduli
frontend/src/config/modulesMenu.js     — config moduli/sotto-menu (usata da Home + Header)
frontend/src/components/Header.jsx     — header flyout v4.1 + cambio PIN
frontend/src/pages/Home.jsx            — home con card moduli (usa modulesMenu.js)
frontend/src/pages/CambioPIN.jsx       — self-service + admin reset
```

---

## DB — mappa rapida

| Database | Moduli |
|----------|--------|
| ~~`vini.sqlite3`~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina moderna |
| `vini_settings.sqlite3` | Settings carta |
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Statistiche + CG (migraz. 001-049, include cg_entrate, cg_piano_rate) |
| `admin_finance.sqlite3` | Vendite + Chiusure turno |
| `clienti.sqlite3` | Clienti CRM (anagrafica, tag, note, prenotazioni) |
| `dipendenti.sqlite3` | Dipendenti (runtime) |

### Backup database
- **Automatico orario**: ogni ora al minuto 0 → `app/data/backups/hourly/YYYYMMDD_HHMMSS/` (retention 48h)
- **Automatico giornaliero**: ore 03:30 → `app/data/backups/daily/YYYYMMDD_HHMMSS/` + sync Google Drive `TRGB-Backup/db-daily` (retention 7gg)
- **Script**: `scripts/backup_db.sh --hourly | --daily` — usa `sqlite3 .backup` (copia atomica)
- **Manuale da app**: Admin → Impostazioni → tab Backup (banner rosso se ultimo backup > 48h)
- **Manuale da CLI**: `ssh trgb "/home/marco/trgb/trgb/scripts/backup_db.sh --daily"`
- ⚠️ **Attenzione**: il bit `+x` sullo script può sparire dopo un push.sh. Fix: `chmod +x scripts/backup_db.sh`.

---

## Deploy — PROCEDURA OBBLIGATORIA

> **IMPORTANTE PER CLAUDE:** Dopo ogni commit, ricorda SEMPRE a Marco di fare il deploy
> con `push.sh`. Lo script nella root del progetto fa TUTTO automaticamente.

```bash
./push.sh "messaggio commit"       # deploy rapido
./push.sh "messaggio commit" -f    # deploy completo (pip + npm)
```

### NOTA: Claude NON puo' eseguire push.sh
Lo script richiede accesso SSH al VPS. Marco deve lanciarlo dal terminale del Mac o Windows.

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione "Cosa abbiamo fatto" con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
