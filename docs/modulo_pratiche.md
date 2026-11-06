# Modulo Pratiche — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — implementato il 2026-10-08 (pratiche 1.0, sistema 5.45); sezioni, debito e «in attesa di mezzi» il 2026-11-02 (pratiche 1.2, sistema 5.91, §8) · **Ultima verifica:** 2026-11-02
> **Vedi anche:** [architettura_mattoni.md](architettura_mattoni.md) (M.A notifiche, M.F alert, M.G permessi, M.I UI), [modulo_preventivi.md](modulo_preventivi.md), [modulo_controllo_gestione.md](modulo_controllo_gestione.md), [pec_archivio_spec.md](pec_archivio_spec.md), [refactor_monorepo.md](refactor_monorepo.md)

**Classificazione:** `[core]`. Ogni ristorante ha pratiche aperte con enti, fornitori, studi e creditori. I contenuti di Tre Gobbi sono dati del locale, non codice.
**Modulo:** `pratiche`, nuovo e vendibile. Manifesto in `core/moduli/pratiche/module.json`.
**Origine:** le pratiche aperte del second brain dell'osteria (`12-SecondBrain/wiki/liste/pratiche-aperte.md`) erano tabelle markdown senza avvisi: la pratica Col d'Orcia è rimasta «in attesa» per settimane dopo il termine dell'11/09/2026. Analisi completa: `01_osteria_tre_gobbi/Claude outputs/analisi-sb-trgb_2026-10-08.md`.
**Dopo:** il connettore MCP di TRGB (deciso da Marco il 2026-10-08: prima le pratiche, poi il connettore) leggerà e scriverà le pratiche dalla chat.

---

## 1. Decisioni di Marco (2026-10-08)

Sono decisioni prese: non si rimettono in discussione senza di lui.

1. **Modulo nuovo `pratiche`.** Non un'estensione di `task_singolo`: una pratica non è un compito dello staff.
2. **Il confine.** Una pratica è uno scambio formale con qualcuno di esterno (ente, fornitore, studio, creditore) che aspetta un esito. Il resto ha già una sua casa e non si duplica:
   - un evento con un cliente è un **preventivo**;
   - un lavoro interno è un **task**;
   - un pagamento è un'**uscita** del controllo di gestione.
3. **Tre stati:**
   - `tocca_a_me`: la prossima mossa è mia;
   - `tocca_a_loro`: aspetto la loro;
   - `chiusa`: con **esito obbligatorio**.
4. **Un termine per pratica, facoltativo.** Il suo senso segue lo stato:
   - se tocca a me, è «entro quando devo agire»;
   - se tocca a loro, è «fino a quando aspetto».
5. **Il tempo non cambia lo stato.** Una pratica oltre il termine si mostra «scaduta» e fa partire l'avviso, ma resta nel suo stato finché non la sposta qualcuno. È la stessa separazione fra stato e tempo delle fatture: [stato_pagamento_unificato.md](stato_pagamento_unificato.md), dove D1 e D3 sono indipendenti.
6. **Pratica ferma.** Una pratica aperta **senza termine** e senza passi da **30 giorni** fa partire l'avviso lo stesso.
7. **La storia non si cancella.** Ogni cambio di stato lascia un passo datato con una riga di testo.
8. **La controparte** si scrive sulla pratica: nome più contatto (email, PEC o telefono). Niente rubrica.
9. **Gli allegati si caricano in TRGB**, su un passo. L'archivio OneDrive resta com'è. Quando esisterà l'archivio PEC ([pec_archivio_spec.md](pec_archivio_spec.md)) un passo potrà puntare alla PEC invece di tenerne una copia.
10. **Collegamenti ad altri moduli** come modulo, id ed etichetta, scritti quando si crea il collegamento. La pratica non legge l'altro modulo (regola 4 di `CLAUDE.md`). Se il nome dell'oggetto cambia, l'etichetta resta quella vecchia: va bene così.
11. **Chi vede:** solo admin e superadmin. Contengono pignoramenti, creditori e contenziosi. Il ruolo `contabile` è escluso; si può aggiungere in seguito cambiando una sola riga.

---

## 2. Dati

DB separato `pratiche.sqlite3`, aperto con `locale_data_path("pratiche.sqlite3")`, con schema creato al boot (`CREATE TABLE IF NOT EXISTS`) come `tasks_db.py`. Non tocca `foodcost.db` e non ha migrazioni numerate. Modello: `app/models/pratiche_db.py`.

### `pratiche`

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `titolo` | TEXT NOT NULL | «Identificazione incaricato recupero crediti» |
| `controparte` | TEXT NOT NULL | «Col d'Orcia S.r.l. Società Agricola» |
| `controparte_contatto` | TEXT | «coldorcia@pec.coldorcia.it», testo libero |
| `stato` | TEXT NOT NULL | `tocca_a_me` · `tocca_a_loro` · `chiusa` (CHECK) |
| `termine` | TEXT NULL | `AAAA-MM-GG` |
| `esito` | TEXT NULL | obbligatorio se `stato = 'chiusa'`: lo controlla il service, non solo la UI |
| `aperta_il` | TEXT NOT NULL | data di inizio vera, che può essere passata: le pratiche importate da sb tengono la loro data |
| `chiusa_il` | TEXT NULL | |
| `ultimo_passo_il` | TEXT NOT NULL | aggiornato a ogni passo; serve alla regola dei 30 giorni |
| `creata_da` | TEXT | username |
| `creata_at`, `aggiornata_at` | TEXT | timestamp |

**Valori calcolati, non salvati:**
- `scaduta` vale `termine < oggi` e `stato != 'chiusa'`;
- `ferma` vale `termine IS NULL`, `stato != 'chiusa'` e `ultimo_passo_il <= oggi - 30`.

### `pratiche_passi` (solo aggiunte)

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `pratica_id` | INTEGER NOT NULL | FK |
| `data` | TEXT NOT NULL | quando è successo, che può essere passato («PEC inviata il 06/08») |
| `testo` | TEXT NOT NULL | una riga |
| `stato_da`, `stato_a` | TEXT NULL | valorizzati solo se il passo cambia stato |
| `termine_da`, `termine_a` | TEXT NULL | valorizzati solo se il passo sposta il termine |
| `automatico` | INTEGER 0/1 | 1 per i passi scritti dal sistema (spostamento del termine, collegamento tolto) |
| `allegato_path`, `allegato_nome` | TEXT NULL | file in `tenant_dir("pratiche")/<pratica_id>/` |
| `autore` | TEXT | username, più tardi «claude» dal connettore |
| `creato_at` | TEXT | |

Non ci sono endpoint per modificare o cancellare un passo. **Una correzione è un passo nuovo.**

### `pratiche_collegamenti`

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `pratica_id` | INTEGER NOT NULL | FK |
| `modulo` | TEXT NOT NULL | `controllo_gestione`, `acquisti`, `dipendenti`, `clienti`, `prenotazioni`… |
| `tipo` | TEXT NOT NULL | `uscita`, `fattura`, `fornitore`, `dipendente`, `cliente`, `preventivo` |
| `ref_id` | TEXT NOT NULL | id dell'oggetto, come testo |
| `etichetta` | TEXT NOT NULL | «Fattura Heres 0000916A — € 695,40» |
| `link` | TEXT NULL | route del frontend, per esempio `/controllo-gestione/uscite?id=2654` |
| `creato_at` | TEXT | |

Togliere un collegamento cancella la riga e lascia un passo automatico («scollegata: …»).

---

## 3. Backend

- **Service** `app/services/pratiche_service.py`: tutta la logica, in funzioni **senza `Request`**. Le funzioni sono `crea_pratica`, `aggiungi_passo`, `chiudi`, `riapri`, `sposta_termine`, `collega`, `scollega`, `elenco` e `leggi`. Il router e il futuro connettore MCP chiamano le stesse funzioni, senza copie: è la lezione del brain (`~/brain/STATO.md`, 2026-10-08).
- **Router** `app/routers/pratiche_router.py`, prefix `/pratiche`. Ogni endpoint ha `Depends(solo_admin("le pratiche"))` (superadmin incluso, M.G), e in testa al file il commento con il manifesto del modulo.

| Metodo | Endpoint | Cosa fa |
|---|---|---|
| GET | `/pratiche/` | elenco; filtri `stato`, `scadute`, `ferme`, `q` (titolo e controparte), `chiuse` (default no) |
| POST | `/pratiche/` | nuova pratica: titolo, controparte, contatto, stato iniziale, termine, `aperta_il`, testo del primo passo e allegato facoltativo |
| GET | `/pratiche/{id}` | pratica con i passi (dal più recente) e i collegamenti |
| PATCH | `/pratiche/{id}` | corregge titolo, controparte e contatto. Il termine non si cambia qui, ma con un passo, così resta nella storia (campi in più nel corpo sono ignorati) |
| POST | `/pratiche/{id}/passi` | il gesto di tutti i giorni (multipart): `testo`, `data`, `stato_a` facoltativo, `termine_a` facoltativo, `togli_termine=true` per «nessun termine», `esito` (obbligatorio se `stato_a = chiusa`), `allegato` facoltativo. Chiudere e riaprire passano da qui |
| GET | `/pratiche/{id}/passi/{passo_id}/allegato` | scarica l'allegato |
| POST | `/pratiche/{id}/collegamenti` | aggiunge un collegamento |
| DELETE | `/pratiche/{id}/collegamenti/{cid}` | lo toglie e lascia un passo automatico |

**Contatori per la Home** (`GET /dashboard/home`, campo `moduli[]`): «N aperte · M scadute», con badge rosso se ci sono scadute.

### Avviso: checker `pratiche_termini` (M.F)

Si registra con `@register_checker("pratiche_termini")` in `alert_engine.py` e gira con gli altri (oggi parte all'apertura della dashboard). Usa le impostazioni di `alert_config`:
- `soglia_giorni` default **3**: avvisa quando mancano 3 giorni al termine;
- destinatario `dest_ruolo = admin`;
- anti-doppione 24 ore.

Raccoglie tre gruppi:
1. **scadute**, con urgenza alta;
2. **in scadenza** entro la soglia;
3. **ferme** da 30 giorni senza termine.

Manda una notifica sola, con la stessa forma del checker `dipendenti_scadenze`. Esempio: «Pratiche: 1 scaduta + 1 ferma», nel messaggio i primi 5 titoli con la controparte, link `/pratiche`, icona 📂.

Per rispettare la regola 2 di `CLAUDE.md`, il checker legge `pratiche.sqlite3` attraverso una funzione del service del modulo (`termini_da_avvisare`), non importando il router. La riga di `alert_config` (soglia 3, anti-doppione 24 ore) la crea `init_notifiche_db` al boot, con `INSERT OR IGNORE`: niente migrazione numerata.

### Come è fatto il codice (2026-10-08)

- **Funzioni del service:** oltre alle nove del doc ci sono `aggiorna_testata` (PATCH), `percorso_allegato` (download), `contatori` (Home) e `termini_da_avvisare` (checker). Gli errori sono `PraticaErrore` (→ 400) e `PraticaNonTrovata` (→ 404). Ogni funzione accetta `oggi=` per i test.
- **Validazioni nel service, non nella UI:** una pratica nasce solo «tocca a me» o «tocca a loro»; date in `AAAA-MM-GG`; `aperta_il` e la data di un passo non possono essere nel futuro; chiudere senza esito è un errore; il link di un collegamento deve iniziare con `/`.
- **`ultimo_passo_il`** è la data più recente fra i passi, non quella dell'ultimo inserito: un passo retrodatato («PEC del 06/08») non sblocca una pratica ferma.
- **Allegati** in `tenant_dir("pratiche")/<pratica_id>/<8 caratteri>_<nome>`; il download controlla che il file stia dentro quella cartella.
- **Permessi frontend:** la voce `pratiche` di `modules.json` (solo admin e superadmin) entra nel runtime del VPS da sola: `modules_router._aggiungi_moduli_nuovi` aggiunge i moduli di `MODULI_DA_AGGIUNGERE` che mancano, senza toccare quelli presenti. Le route hanno anche `roles={["admin"]}`, così una modifica da Impostazioni non le apre a nessun altro: il backend resta comunque `solo_admin`.
- **Home:** la card arriva in `moduli[]` solo se chi chiede è admin; badge rosso = numero di scadute.

---

## 4. Frontend

Route `/pratiche` e `/pratiche/:id`, voce `pratiche` in `modulesMenu.js` (emoji 📂, `check: "admin"`) e card nella Home. Pagine nuove con le primitive M.I (`PageLayout`, `Btn`, `StatusBadge`, `EmptyState`). Pensata **prima per l'iPhone**: righe di almeno 44pt, bottoni da 48pt.

- **Elenco**, in tre gruppi:
  1. **Scadute** (in rosso);
  2. **Tocca a me**;
  3. **Tocca a loro**.

  Dentro ogni gruppo l'ordine è per termine, con le pratiche senza termine in fondo. Ogni riga mostra titolo, controparte, termine con i giorni mancanti o passati, e un segno «ferma» se ferma. Le chiuse stanno in una scheda a parte, con la ricerca.
- **Scheda della pratica:**
  - una testata con titolo, controparte, contatto (tappabile: mail e telefono), stato e termine;
  - i **passi** come linea del tempo, dal più recente;
  - in alto un riquadro **«Nuovo passo»**: testo, «cambia stato», «nuovo termine», allegato.

  Chiudere chiede l'esito.
- **Collegamenti:** chip con l'etichetta che portano al `link`. All'inizio il collegamento si crea a mano (modulo, tipo, id, etichetta). Un selettore per tipo (cerca un'uscita o un dipendente) si costruisce solo se serve.

---

## 5. Manifesto e versioni

- **`core/moduli/pratiche/module.json`:**
  - id `pratiche`, nome «Pratiche»;
  - dipendenze platform: `auth`, `notifiche`, `alert`, `permessi`, `ui_primitives`;
  - dipendenze opzionali: `controllo_gestione`, `dipendenti`, `clienti`, `acquisti` (solo per i link);
  - router `pratiche_router`, tabelle `pratiche*`, route `/pratiche`, menu key `pratiche`.
- **`locali/tregobbi/moduli_attivi.json`** è già `["*"]`: nessuna modifica.
- **Versione di sistema** da 5.44 a 5.45, perché nasce un modulo. Si aggiornano `VERSION`, `versions.jsx` → `sistema.version` e la voce `pratiche` 1.0.
- **Capability** in questa pagina (codici `C-P-NNN`) quando il codice esiste.

---

## 6. Dopo il codice

1. **Le pratiche aperte di sb entrano a mano, dalla UI.** Sono 6: Col d'Orcia, Comune di Milano (pignoramento), Fondo Est (contenzioso), Metro/Cerved, TIM (modem), Cordnet. Ognuna tiene la sua `aperta_il` e i suoi passi datati, e serve anche a provare la UI. Sono dati, quindi `[locale:tregobbi]`: nessun seed nel codice.
   - Le voci di sb che non sono pratiche vanno al loro posto:
     - Tenaris e Paola Poli diventano **preventivi**;
     - le tre voci della rete diventano **task**;
     - Heres e le rate Fondo Est sono **uscite**, già pagate (Marco, 08/10).
2. **Cambia la skill sb:** una pratica va in TRGB, e in sb resta una riga di diario. `pratiche-aperte.md` diventa un rimando.
3. **Poi il connettore MCP** — fatto il 2026-10-08, mattone M.K: [connettore_mcp.md](connettore_mcp.md). Strumenti `pratiche_elenco`, `pratica_leggi`, `pratica_passo`, `pratica_crea`, sopra `pratiche_service`; i passi scritti dalla chat hanno autore `claude (<utente>)`.

---

## 7. Punti decisi al momento del codice

Marco, 2026-10-08: «vai coi default».

- Il termine si sposta solo con un passo, mai dalla testata (PATCH).
- La soglia di preavviso è **3 giorni** (si cambia da Impostazioni → Notifiche, senza codice).
- È possibile riaprire una pratica chiusa: un passo con `stato_a` diverso da `chiusa` cancella `chiusa_il` ed `esito` dalla testata. La storia li conserva nei passi.
- Allegati: solo un file per passo (per più file, più passi), massimo 20 MB, solo PDF e immagini (jpg, png, heic, webp, gif).

---

## 8. Sezioni, campi del debito, «in attesa di mezzi» (2026-11-02)

Marco, 2026-11-02: tutto stava in un'unica lista; vuole **sezioni** (a partire da «Agenzia Entrate») dove archiviare e tenere sotto controllo anche i debiti che oggi non può pagare (es. comunicazione di incoerenza IVA II trim. 2026, € 5.008,07, ID CO275462467: senza termine sparirebbe dal radar, ma diventerà un avviso bonario e poi una cartella). Disegno approvato da Marco lo stesso giorno («sul resto sono d'accordo»).

**Decisioni**
- **Sezioni** in tabella `pratiche_sezioni`, le decide Marco dal modale «Sezioni» della pagina (niente valori fissi nel codice). Partenza: Agenzia Entrate, Riscossione (ADER), Enti e fondi, Tributi locali, Fornitori e recupero crediti, Legale. Non si cancellano: si disattivano (le pratiche le tengono; in elenco finiscono in «Senza sezione»).
- **Campi del debito** sulla testata: `tipo_atto_id` (tabella `pratiche_tipi_atto` con `gradino`), `rif_atto`, `periodo`, `importo_dovuto`, `importo_residuo`. Scala dell'erario: 1 comunicazione di irregolarità → 2 avviso bonario → 3 cartella → 4 avviso di intimazione → 5 pignoramento (i primi due in sezione Agenzia Entrate, gli altri in Riscossione; gradini e tipi si cambiano dalla pagina).
- **Primo valore e cambi.** Un campo vuoto si riempie e basta (è una classificazione, niente passo). Se cambia un valore già scritto resta la traccia: in un passo (colonna `pratiche_passi.modifiche`, JSON `[{campo, da, a}]`) o, dalla testata, in un passo automatico «Atto: A → B». Il passaggio di gradino è un passo. Il primo «dovuto» porta con sé il residuo uguale.
- **Da Agenzia Entrate a Riscossione:** lo decide Marco, quando l'Agenzia Riscossione arriva e «richiama gli stessi atti» (cartella o intimazione che cita la comunicazione). È un passo con cambio di sezione e di atto.
- **In attesa di mezzi** è un flag (`in_attesa_mezzi`, `revisione_il`), NON un quarto stato: lo `stato` ha un CHECK sui tre valori e cambiarlo vorrebbe dire ricostruire la tabella sul DB live (vietato in R). La pratica in attesa non è mai «scaduta» né «ferma»: ha il suo gruppo, col termine in rosso se passato (`termine_passato`). Torna **da rivedere** alla data di revisione = oggi + `giorni_revisione` (30, in `pratiche_config`, si cambia dal modale). «Rivista, ancora senza mezzi» (`POST /pratiche/{id}/rivedi`) e ogni passo scritto a mano spostano la revisione in avanti.
- **Scadenziario:** una pratica si collega a una rateizzazione con un collegamento `controllo_gestione / spesa_fissa / <id>`. La scheda (e `pratica_leggi` nell'MCP) legge il piano rate da `GET /controllo-gestione/spese-fisse/{id}/piano-rate` (che ora porta anche distinta e data originale) e mostra pagate, **in distinta non abbinate in banca**, scadute, da pagare. Il modulo pratiche non importa codice del Controllo Gestione: legge la pagina (FE) e il connettore (platform).

**Schema** (`pratiche_db.py` v1.1, al boot, idempotente): tabelle `pratiche_sezioni`, `pratiche_tipi_atto`, `pratiche_config`; colonne nullable su `pratiche` (`sezione_id`, `tipo_atto_id`, `rif_atto`, `periodo`, `importo_dovuto`, `importo_residuo`, `in_attesa_mezzi`, `revisione_il`) e su `pratiche_passi` (`modifiche`). Prima di aggiungere le colonne il boot fa una copia `pratiche.sqlite3.bak-v11-<data>` accanto al DB (API backup di SQLite). I valori di partenza si scrivono una volta (`pratiche_config.seed_v11`). Passi esistenti: non toccati.

**API nuove:** `GET /pratiche/riepilogo`, `GET|POST /pratiche/sezioni`, `PATCH /pratiche/sezioni/{id}`, `GET|POST /pratiche/tipi-atto`, `PATCH /pratiche/tipi-atto/{id}`, `GET|PUT /pratiche/config`, `POST /pratiche/{id}/rivedi`. `GET /pratiche/` accetta anche `sezione`, `in_attesa`, `da_rivedere` (e `q` cerca anche in `rif_atto`). Creazione e passo accettano i campi del debito (multipart: assente = non cambia, `svuota=campo1,campo2` per toglierli); `PATCH /pratiche/{id}` li accetta in JSON (null = svuota).

**MCP:** `pratiche_elenco` (+ `sezione`, `in_attesa`, `da_rivedere`), `pratiche_riepilogo` (conteggi per sezione, da rivedere, in attesa — per il giro del mattino), `pratica_leggi` (+ `rate`), `pratica_crea` e `pratica_passo` (+ campi del debito), `pratica_correggi` (testata). Le regole del connettore: [connettore_mcp.md](connettore_mcp.md).

**Avvisi:** il checker `pratiche_termini` ha un quarto gruppo «da rivedere»; la card Home dice «N da rivedere».

**Incidente di consegna (2026-11-02 20:43):** il backend v1.1 è andato in produzione dentro il commit d7530b53 di un'altra sessione (`push.sh` fa `git add -A`), prima del guardiano. Verificato via MCP: colonne create, dati intatti. La scheda v1.2 e la documentazione vanno col push successivo.

---

## 8bis. Il pagamento chiude la pratica (2026-11-06, Q #315 #319 #321)

Decisioni di Marco, una alla volta:
- **Come si accorge:** controllo a intervalli, non un aggancio nei ~37 punti che scrivono PAGATO (prende ogni strada, anche future e correzioni a mano, e le riaperture). Thread di sfondo avviato in `main.py` come lo scarico notturno di iPratico. Ogni `controllo_pagamenti_minuti` (pratiche_config, partenza **10**, 0 = spento), modale «Sezioni e atti» › Pagamenti collegati.
- **Cosa conta:** collegamenti `controllo_gestione` di tipo `uscita` (ref_id = `cg_uscite.id`) e `spesa_fissa` di tipo RATEIZZAZIONE / RATEIZZAZIONE_TASSE / PRESTITO con `data_fine`: tutte le rate di `cg_piano_rate`. Una spesa fissa senza fine (affitto) è solo un riferimento. Pagata = `PAGATO` o `PAGATO_MANUALE`.
- **Quando chiude:** quando sono pagate **tutte** le uscite contate. Passo automatico (autore «TRGB (controllo pagamenti)»), esito «Pagato € X il gg» o «Pagate tutte: N rate, € X in totale, ultima il gg».
- **Pagamento annullato:** chiusa dal controllo → passo e riapertura in «tocca a me»; chiusa a mano → resta chiusa, passo «… annullato … resta chiusa» e notifica (superadmin e admin); già riaperta → solo il passo.
- **Solo sui cambi:** lo stato visto sta in `pratiche_pagamenti_visti` (pratica_id, tutte_pagate, quante, pagate, totale, ultimo_pagamento, passo_chiusura_id). «Chiusa dal controllo» = l'ultimo passo di chiusura è quello scritto dal controllo. Al primo giro: se è già tutto pagato e la pratica è aperta si chiude; l'annullamento si riconosce solo dopo aver visto «tutto pagato».
- Codice: `app/services/pratiche_pagamenti.py`. Endpoint: `GET/POST /pratiche/controllo-pagamenti` (stato / un giro subito).
- Prova sui dati veri del 06/11 (copia in sola lettura): guarda solo la pratica 12 (Fondo Est, 8 rate pagate su 10), nessuna modifica.

---

## 9. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-P-001 | Elenco delle aperte in tre gruppi (Scadute / Tocca a me / Tocca a loro), per termine, con segno «ferma» | `pratiche_router.py:elenco_pratiche`, `PraticheElenco.jsx` | admin | ✅ |
| C-P-002 | Elenco delle chiuse con ricerca per titolo e controparte | `pratiche_router.py:elenco_pratiche` (`stato=chiusa&q=`), `PraticheElenco.jsx` | admin | ✅ |
| C-P-003 | Nuova pratica con primo passo, data di apertura anche passata, termine e allegato | `pratiche_router.py:nuova_pratica`, `pratiche_service.py:crea_pratica` | admin | ✅ |
| C-P-004 | Scheda: testata con contatto tappabile (mail/tel), storia dei passi dal più recente | `pratiche_router.py:leggi_pratica`, `PraticaScheda.jsx` | admin | ✅ |
| C-P-005 | Correzione di titolo, controparte e contatto (non stato né termine) | `pratiche_router.py:correggi_testata`, `pratiche_service.py:aggiorna_testata` | admin | ✅ |
| C-P-006 | Nuovo passo: testo, data, cambio stato, nuovo termine o nessun termine, allegato | `pratiche_router.py:nuovo_passo`, `pratiche_service.py:aggiungi_passo` | admin | ✅ |
| C-P-007 | Chiusura con esito obbligatorio e riapertura (testata pulita, storia intatta) | `pratiche_service.py:aggiungi_passo` / `chiudi` / `riapri` | admin | ✅ |
| C-P-008 | Download dell'allegato di un passo | `pratiche_router.py:scarica_allegato` | admin | ✅ |
| C-P-009 | Collegamento manuale a un oggetto di un altro modulo (modulo, tipo, id, etichetta, link) | `pratiche_router.py:nuovo_collegamento`, `pratiche_service.py:collega` | admin | ✅ |
| C-P-010 | Scollegamento con passo automatico «Scollegata: …» | `pratiche_router.py:togli_collegamento`, `pratiche_service.py:scollega` | admin | ✅ |
| C-P-011 | Avviso unico: scadute + in scadenza entro 3 giorni + ferme da 30 giorni senza termine | `alert_engine.py:_check_pratiche_termini` | admin | ✅ |
| C-P-012 | Card Home «N aperte · M scadute», badge rosso sulle scadute (+ «N da rivedere» dal 2026-11-02) | `dashboard_router.py:_pratiche_summary`, `Home.jsx` | admin | ✅ |
| C-P-013 | Sezioni come chip in /pratiche con conteggi (aperte, scadute, da rivedere), filtro e residuo della sezione | `pratiche_router.py:riepilogo_pratiche`, `pratiche_service.py:riepilogo`, `PraticheElenco.jsx` | admin | 🆕 |
| C-P-014 | Modale «Sezioni e atti»: sezioni e tipi d'atto (gradino) da aggiungere, rinominare, riordinare, disattivare; giorni di revisione | `pratiche_router.py` (`/sezioni`, `/tipi-atto`, `/config`), `PraticheCampi.jsx:GestioneSezioni` | admin | 🆕 |
| C-P-015 | Campi del debito (sezione, tipo d'atto, riferimento, periodo, dovuto, residuo) in creazione, testata e passo; il cambio di un valore già scritto resta nella storia «da → a» | `pratiche_service.py:_differenze`, `aggiorna_testata`, `aggiungi_passo`, `PraticaScheda.jsx` | admin | 🆕 |
| C-P-016 | «In attesa di mezzi»: fuori da scadute e ferme, gruppo proprio, da rivedere alla data di revisione; «Rivista, ancora senza mezzi» | `pratiche_service.py:_arricchisci`, `rivedi`, `pratiche_router.py:rivedi_pratica` | admin | 🆕 |
| C-P-017 | Rate della rateizzazione collegata (spesa fissa): pagate, in distinta non abbinate in banca, scadute, da pagare | `PraticaScheda.jsx:RateCollegate`, `controllo_gestione_router.py:get_piano_rate` | admin | 🆕 |
| C-P-018 | Avviso `pratiche_termini` col gruppo «da rivedere» | `alert_engine.py:_check_pratiche_termini` | admin | 🆕 |
| C-P-019 | MCP: `pratiche_riepilogo`, `pratica_correggi`, sezione e campi del debito in elenco/crea/passo, rate in `pratica_leggi` | `connettore/server.py:_strumenti_pratiche`, `_rate_collegate` | admin (Claude/Q) | 🆕 |
| C-P-020 | Il pagamento chiude la pratica: controllo ogni N minuti (default 10) delle uscite e delle rate collegate; tutte pagate → chiusa con passo automatico; annullato → riaperta se l'aveva chiusa il controllo, altrimenti passo + notifica | `pratiche_pagamenti.py`, `main.py` (avvio), `pratiche_router.py` (`/config`, `/controllo-pagamenti`), `PraticheCampi.jsx` | admin | 🆕 2026-11-06 |
