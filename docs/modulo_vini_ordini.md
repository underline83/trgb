# Modulo Vini — Ordini ai fornitori (piano O0–O7)

> **Tipo:** 📄 pagina wiki · **Stato:** **O1, O3, O4, O5, O6 FATTI** (2026-08-02, vini 3.75) · **RD.1 FATTO** (2026-08-08, vini 3.81, mig 165). O2 assorbito in O6. Resta O7. · **Ultima verifica:** 2026-08-08 (vs codice + DB `vini_magazzino.sqlite3` scaricato dal VPS)
> **Vedi anche:** [modulo_vini.md](modulo_vini.md) (stato corrente del modulo) · [modulo_vini_widget_dashboard.md](modulo_vini_widget_dashboard.md) (storia dei due widget esistenti) · [roadmap.md](roadmap.md) §V

**Doc canonico** del lavoro sui riordini vini. Nasce dalla sessione 2026-08-02: Marco chiede "devo avere un modo per lavorarci meglio".

---

## 1. Come lavora Marco davvero (il vincolo che decide tutto)

Marco ordina in due situazioni, entrambe **centrate sul fornitore, non sul vino**:

1. **Rappresentante davanti**, in osteria. Serve una schermata per quel singolo fornitore: cosa gli devo ordinare, cosa gli ho ordinato l'ultima volta, quanto spendo.
2. **Messaggio WhatsApp** al rappresentante. Serve comporre la lista e mandarla senza riscriverla a mano nel telefono.

Da qui la regola di progetto: **tutto è fornitore-centrico e WhatsApp-first**. Il vino è una riga dentro un ordine, non l'unità di lavoro.

---

## 2. Diagnosi dell'esistente (2026-08-02, verificata sul codice)

Cosa c'è oggi:

- Widget **📦 Riordini per fornitore** in `DashboardVini.jsx` (v4.15): raggruppa per `DISTRIBUTORE|RAPPRESENTANTE`, tabella sortabile, listino inline, duplica annata, ordine pending.
- Widget **🚨 Vini in carta senza giacenza**, sempre in `DashboardVini.jsx`: `+ ordina` inline, qta suggerita, ritmo di vendita, picker stato riordino, filtro tipologia, raggruppamento distributore, `✅ Arrivato` inline.
- Tabella `vini_ordini_pending`: `UNIQUE(vino_id)`, quindi **1 solo ordine aperto per vino**.
- `vini_prezzi_storico` con hook sul PATCH di `EURO_LISTINO`.
- Anagrafica `vini_fornitori` (mig 125) con `rappresentante_nome`, `rappresentante_telefono`, `rappresentante_email`.
- Mattone M.C WhatsApp pronto: `frontend/src/utils/whatsapp.js` (`normalizePhone`, `fillTemplate`, `buildWaLink`, `openWhatsApp`, `buildBroadcastLinks`).

### I quattro buchi

| # | Buco | Evidenza |
|---|------|----------|
| **B1** | **Non esiste il concetto di ordine.** Esiste solo "riga pending per vino". Nessuna testata, nessuno stato, nessuna data di invio. | `vini_ordini_pending` ha `UNIQUE(vino_id)` |
| **B2** | **Nessuno storico.** `conferma_arrivo_ordine_pending()` **cancella** il record quando la merce arriva. Impossibile sapere cosa si è ordinato a un fornitore, quando, e quanto ci ha messo. | `vini_magazzino_db.py:3013` — punto 4 della transazione |
| **B3** | **Due widget sovrapposti.** Riordini-per-fornitore e Alert-senza-giacenza hanno entrambi `+ ordina` ed entrambi raggruppano per distributore. Il lavoro è spalmato su due liste. | `DashboardVini.jsx` righe ~560 e ~1308 |
| **B4** | **Nessun invio.** L'ordine si compone nel gestionale e poi si riscrive a mano su WhatsApp. Era il "punto 7 differito" del doc widget. | [modulo_vini_widget_dashboard.md](modulo_vini_widget_dashboard.md) §9 |

---

## 3. Ricognizione dati — cosa regge e cosa no

Query girate il 2026-08-02 su `locali/tregobbi/data/vini_magazzino.sqlite3` (copia dal VPS):

| Metrica | Valore | Lettura |
|---|---|---|
| Bottiglie totali | 1313 | |
| Con `madre_id` | 1311 | il link all'anagrafica c'è |
| Con `DISTRIBUTORE` valorizzato | 1275 | |
| **Risolvibili `bottiglia → madre → fornitore_id`** | **1273 / 1275 (99,8%)** | ✅ il path FK regge |
| Distributori distinti (testo) | 40 | |
| **Che matchano `vini_fornitori.nome`** | **40 / 40 (100%)** | ✅ anche il fallback per nome è pulito |
| Fornitori in anagrafica | 40 | |
| **Con `rappresentante_telefono`** | **0 / 40** | 🔴 **il vero blocco** |
| **Con `rappresentante_email`** | **0 / 40** | 🔴 |
| Ordini pending aperti | 2 | migrazione dei pending esistenti banale |

**Conclusione operativa:** il "punto 7 differito" era bloccato dalla mancanza del campo telefono. Il campo ora **esiste ma è vuoto su tutti e 40 i fornitori**. Non è più un problema di schema: è **data entry**, ~40 record, ~20 minuti di Marco. Va reso indolore prima di tutto il resto → è la fase **O1**.

> ⚠️ Nota metodo (memoria `feedback_rename_semantica`): questi numeri vanno riverificati sul VPS prima di partire con O2, non dati per buoni da questa copia locale.

---

## 4. Il modello dati mancante

Oggi: `vini_ordini_pending(vino_id UNIQUE, qta, data_ordine, note, utente)`.

Target — testata + righe, in `vini_magazzino.sqlite3` (stesso DB → transazioni atomiche vere):

```sql
CREATE TABLE vini_ordini (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fornitore_id  INTEGER,                -- FK vini_fornitori; NULL = ordine orfano
  fornitore_nome TEXT NOT NULL,         -- denormalizzato: sopravvive a rinomine anagrafiche
  stato         TEXT NOT NULL DEFAULT 'bozza'
                CHECK (stato IN ('bozza','inviato','parziale','chiuso','annullato')),
  canale        TEXT,                   -- 'whatsapp' | 'email' | 'voce' | 'rappresentante'
  data_invio    TEXT,
  data_chiusura TEXT,
  note          TEXT,
  utente        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (fornitore_id) REFERENCES vini_fornitori(id) ON DELETE SET NULL
);

CREATE TABLE vini_ordini_righe (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ordine_id      INTEGER NOT NULL,
  vino_id        INTEGER NOT NULL,
  descrizione    TEXT NOT NULL,         -- snapshot: il vino può essere rinominato/cancellato
  qta_ordinata   INTEGER NOT NULL CHECK (qta_ordinata > 0),
  qta_ricevuta   INTEGER NOT NULL DEFAULT 0,
  prezzo_unit    REAL,                  -- snapshot EURO_LISTINO al momento dell'ordine
  note           TEXT,
  FOREIGN KEY (ordine_id) REFERENCES vini_ordini(id) ON DELETE CASCADE,
  FOREIGN KEY (vino_id)   REFERENCES vini_bottiglie(id) ON DELETE CASCADE
);

CREATE INDEX idx_vo_fornitore ON vini_ordini (fornitore_id, stato);
CREATE INDEX idx_vo_stato     ON vini_ordini (stato, data_invio DESC);
CREATE INDEX idx_vor_ordine   ON vini_ordini_righe (ordine_id);
CREATE INDEX idx_vor_vino     ON vini_ordini_righe (vino_id);
```

**Decisioni dietro lo schema:**

- **`fornitore_nome` denormalizzato** e **`descrizione` / `prezzo_unit` snapshot sulla riga.** Un ordine è un documento storico: deve restare leggibile anche se il vino viene cancellato o il listino cambia. Senza snapshot, lo storico prezzi non serve a niente perché l'ordine mostrerebbe sempre il prezzo di oggi.
- **`qta_ricevuta` sulla riga, non sulla testata.** È l'unico modo di gestire il parziale reale (ordini 6, ne arrivano 4).
- **Nessun `UNIQUE` sul vino.** Lo stesso vino può stare in un ordine chiuso di marzo e in una bozza di oggi. È esattamente ciò che oggi manca.
- **`vini_ordini_pending` non si tocca in O2.** Resta viva finché la nuova UI non è completa; si dismette in O4 con una migrazione che travasa i pending residui in bozze (oggi: 2 record).
- **Stato `annullato`** perché "ho ordinato e poi ho disdetto" oggi si risolve cancellando il record, cioè perdendo di nuovo l'informazione.

---

## 5. Le fasi

Ogni fase è auto-contenuta e pushabile da sola (memoria `feedback_no_blocchi_accoppiati`: mai tre cambiamenti infrastrutturali insieme).

| Fase | Cosa | Taglia | Dipende da | Tocca |
|------|------|--------|-----------|-------|
| **O1** | Contatti fornitori — schermata edit rapido | S | — | ✅ **FATTO 2026-08-02** — FE + 1 fix BE |
| **O2** | Quick wins sul widget attuale | S | — | ⤵️ **ASSORBITO IN O6** — vedi sotto |
| **O3** | Schema ordini (testata + righe) | M | — | ✅ **FATTO** — mig 158 |
| **O4** | Composizione ordine + ricezione | M | O3 | ✅ **FATTO** — + mig 159 (travaso pending) |
| **O5** | Invio WhatsApp / email | S | O1, O4 | ✅ **FATTO** — template configurabile |
| **O6** | Pagina `/vini/ordini` fornitore-centrica | M | O4 | ✅ **FATTO** — `OrdiniVini.jsx` |
| **O7** | Condizioni fornitore + intelligenza | S | O4, O6 | ⏳ da fare. Fatto solo il flag `attivo` (mig 160, 2026-08-02) |

### O1 — Contatti fornitori (prerequisito di tutto il WhatsApp)

**Perché prima:** 0 fornitori su 40 hanno un telefono. Senza questo, O5 non parte.

- In `AnagraficheVini.jsx`, tab **🚚 Distributori** (`key: "fornitori"` — nome backend storico): colonne `rappresentante_nome`, `📱 telefono`, `✉️ email` editabili **inline**, senza aprire modali. 40 righe, una schermata, tab per passare al campo dopo.
- Badge di completezza in testa: "12/40 fornitori hanno il telefono".
- Validazione con `normalizePhone()` di `whatsapp.js`. **Mai `.replace` a mano sul telefono** — memoria `feedback_codice_convenzioni`.
- **Nessun endpoint nuovo, nessuna migrazione:** `PATCH /vini/anagrafiche/fornitori/{fid}` esiste già (`vini_anagrafiche_router.py`, gated admin/sommelier) e i campi contatto esistono dalla mig 125.

**Fatto quando:** Marco riempie i 40 contatti in una seduta senza bestemmiare.

#### Esito (2026-08-02, vini 3.74)

Implementato in `frontend/src/pages/vini/anagrafiche/DistributoriPanel.jsx` come **toggle "📱 Contatti"** sul pannello Distributori esistente, non come pagina nuova: la lista dei distributori era già lì, con ricerca e ordinamento.

- Tre colonne editabili inline. `Invio` salva e apre la stessa colonna sulla riga sotto, `Esc` annulla, `Tab` e click fuori salvano. Salvataggio ottimistico con rollback se il PATCH fallisce.
- Barra di completezza (`N/M distributori attivi hanno il telefono`) + filtro "Solo senza telefono". Il denominatore conta solo i distributori con almeno un vino: un orfano senza telefono non è un buco da riempire.
- Toggle persistito in `localStorage.vini_distributori_contatti`.

**Tre decisioni prese in corso d'opera, diverse da come erano scritte qui sopra:**

1. **Il telefono si salva come lo si scrive, non normalizzato.** `buildWaLink()` chiama già `normalizePhone()` al momento dell'uso, quindi normalizzare anche in scrittura non serve e rende il numero meno leggibile per un umano (`393481234567` invece di `348 1234567`). In compenso la cella mostra `⚠️` quando `normalizePhone()` non riesce a interpretare il numero: l'errore si vede subito, non il giorno dell'ordine.
2. **Le colonne contatto NON sono ordinabili** in modalità contatti. Ordinare su una colonna che si sta compilando fa saltare la riga al suo nuovo posto a ogni `Invio` e la lista scappa sotto le dita. Per isolare i buchi c'è il filtro, che è la stessa cosa senza l'effetto collaterale.
3. **Un fix backend fuori piano** — `PATCH /fornitori/{id}` lanciava `sync_bottiglie_from_fornitore()` a ogni chiamata, cioè riscriveva tutte le bottiglie di tutti i vini madre del distributore. Su questa schermata sarebbero ~120 cascate consecutive che non cambiano un solo valore, perché del fornitore solo `nome` e `rappresentante_nome` sono denormalizzati sulle bottiglie. Ora il cascade parte solo se il PATCH tocca uno di quei due campi; la whitelist sta in `app/services/vini_anagrafiche_sync.py` (`FORNITORE_CAMPI_DENORMALIZZATI`) accanto a `_compute_synced_values()` che la determina, non copiata nel router. Guarda le chiavi *inviate*, non quelle *cambiate*: al massimo un cascade in più, mai uno in meno.

### O2 — Quick wins sul widget attuale

Valore immediato, zero rischio strutturale, nessuna migrazione. Utile anche se O3–O7 slittano.

- **Totale € per fornitore** nell'header del gruppo (`Σ qta_pending × EURO_LISTINO`) + totale generale del widget. Serve a decidere mentre componi.
- **Qta suggerita anche qui.** Il calcolo esiste già in `get_dashboard_stats` ma alimenta solo il widget alert (`qta_suggerita_giorni_storico` / `qta_suggerita_divisore` in `vini_widget_settings`).
- **Ricerca** + **filtro tipologia** (le chip della Fase D esistono già nell'altro widget, si riusa il componente).
- **Badge "⏰ fermo da N gg"** sugli ordini pending vecchi. Soglia configurabile → nuova chiave `ordine_pending_alert_giorni` default 30. Era una "domanda aperta" mai chiusa del doc widget §Domande aperte.
- **`✅ Arrivato` inline**, come nel widget alert (Fase F). Oggi qui manca e costringe a passare dal modale.

### O3 — Schema ordini (BE-only)

- Migrazione **158** (verificato 2026-08-02: l'ultima è `157_bevande_analcolica.py`, la 158 è libera — ricontrollare comunque con `ls app/migrations/ | tail` prima di scrivere).
- Crea `vini_ordini` + `vini_ordini_righe` + indici. **Solo DDL, nessun travaso.** `vini_ordini_pending` resta intatta e in uso.
- Migrazione `[core]`: la struttura ordini serve a qualunque locale, non è specifica Tre Gobbi → **non** va in `MIGRATIONS_TRGB.md`.
- Endpoint CRUD in `vini_magazzino_router.py`, prefix `/vini/ordini`, ricordando la regola trailing slash.
- Nessuna UI. Push da solo, verificato che l'app parta e che i widget esistenti siano intatti.

### O4 — Composizione ordine + ricezione

**Composizione.** Il flusso passa da "segno il vino" a "riempio il carrello del fornitore":

- Dal widget o dalla pagina, `+ ordina` cerca la **bozza aperta di quel fornitore** e ci aggiunge una riga; se non esiste la crea. Un fornitore → al massimo una bozza aperta alla volta.
- Fornitore risolto via `bottiglia.madre_id → vini_madre.fornitore_id` (99,8% di copertura), fallback su match esatto di `DISTRIBUTORE` con `vini_fornitori.nome` (100% oggi), fallback finale su ordine con `fornitore_id = NULL` e `fornitore_nome` dal testo.

**Ricezione.** Nuovo endpoint `POST /vini/ordini/{id}/ricevi` con payload riga per riga:

- Per ogni riga aggiorna `qta_ricevuta`, somma la giacenza, registra un `CARICO` (`origine='ORDINE_ARRIVO'`, nota con il numero d'ordine) — tutto **in una transazione sola**, come già fa `conferma_arrivo_ordine_pending`.
- Stato testata ricalcolato: tutte le righe complete → `chiuso`, alcune → `parziale`.
- **Compat:** `POST /{id}/ordine-pending/conferma-arrivo` resta e continua a funzionare finché il vecchio widget è vivo.
- **Dismissione:** migrazione che travasa i pending residui in bozze (oggi 2 record) e poi droppa `vini_ordini_pending`. **Da fare solo quando la nuova UI è in produzione e verificata**, non insieme a O4.

### O5 — Invio WhatsApp / email

Il pezzo che chiude il loop, e quello che Marco usa di più.

- Sull'ordine bozza: pulsante **`💬 Invia al rappresentante`**.
- Il messaggio si costruisce con `fillTemplate` + `buildWaLink` di `whatsapp.js` — mattone M.C, nessuna libreria nuova.
- **Template configurabile** in Impostazioni Vini, nuova sezione "WhatsApp ordini" (memoria `feedback_no_hardcoded_config`: mai hardcodare il testo). Variabili: `{fornitore}`, `{rappresentante}`, `{righe}`, `{totale}`, `{data}`, `{locale}`.
- Bozza di default:

  ```
  Ciao {rappresentante}, ordine Osteria Tre Gobbi del {data}:

  {righe}

  Grazie!
  ```

  con `{righe}` renderizzato come `• 6 × Barbera d'Asti Sup. 2021 — Braida`.
- **Preview modificabile prima di aprire WhatsApp.** Marco deve poter aggiungere "e portami due bicchieri" senza tornare indietro.
- Al click: ordine `bozza → inviato`, `data_invio` e `canale='whatsapp'` stampati. Lo stato cambia **anche se poi il messaggio non parte**: meglio un falso "inviato" correggibile a mano che una bozza fantasma.
- **Fallback:** `📋 Copia testo` (rappresentante davanti, o telefono mancante) e `✉️ Email` se c'è `rappresentante_email` e manca il telefono.

### O6 — Pagina `/vini/ordini` fornitore-centrica

La dashboard torna a fare il **semaforo** ("12 vini da ordinare · 3 ordini in giro · 1 fermo da 40gg"), il lavoro si fa qui. Risolve **B3**: una lista sola al posto di due widget sovrapposti.

Layout master-detail:

- **Sinistra:** lista fornitori con contatore da-ordinare, totale € della bozza, badge stato ordini in giro. Ordinamento: chi ha più roba da ordinare in cima.
- **Destra, fornitore selezionato — questa è la "modalità rappresentante davanti":**
  1. **Da ordinare** — vini di quel fornitore con giacenza bassa/zero, qta suggerita, ritmo di vendita, listino editabile inline.
  2. **Bozza in corso** — carrello con totale € sempre visibile, `💬 Invia`.
  3. **Ordini recenti** — ultimi 5 ordini con data, righe, totale, stato. *Questo è ciò che serve quando il rappresentante è lì e chiede "l'ultima volta cosa ti avevo portato?"*
  4. **Contatto** — nome, telefono, condizioni (da O7).
- La pagina è **una schermata per fornitore**: proiettabile su iPad girato verso il rappresentante senza mostrare i dati degli altri.
- I due widget vecchi in dashboard si riducono a un riepilogo cliccabile che porta qui.

### O7 — Condizioni fornitore + intelligenza

Piccolo, ma è quello che fa sembrare il gestionale sveglio.

- **Condizioni** su `vini_fornitori` (migrazione ADD COLUMN): `minimo_ordine_eur`, `giorno_consegna`, `sconto_std_pct`, `note_condizioni`.
- Alert nel carrello: *"mancano 80 € al franco di 300 €"*, *"consegna prevista martedì"*.
- **Lead time medio** per fornitore, calcolato da `data_invio → data_chiusura` sugli ordini chiusi. Alimenta il badge "fermo da N gg" di O2 con una soglia vera per fornitore invece che con una costante globale.
- **Spesa per fornitore per periodo** — somma di `qta_ricevuta × prezzo_unit` sugli ordini chiusi. Aggancio naturale al Conto Economico (roadmap `G.3`), ma **non** in questa fase: qui solo il numero nella pagina fornitore.

---

## 6. Ordine consigliato e perché

1. **O1** — sblocca tutto il resto, costa poco, e il lavoro di data entry lo fa Marco in parallelo allo sviluppo.
2. **O2** — valore visibile subito sul widget che Marco già usa. Se il piano si fermasse qui, avrebbe comunque guadagnato.
3. **O3** — BE-only, safe, pushabile da solo.
4. **O4** — il cuore. Da qui in poi esiste lo storico.
5. **O5** — il momento in cui Marco smette di riscrivere gli ordini nel telefono.
6. **O6** — il contenitore. Dopo O4/O5, non prima: altrimenti la UI si rifà due volte.
7. **O7** — rifiniture.

**Antipattern da evitare:** fare O6 (pagina nuova) prima di O3/O4 (modello dati). La pagina andrebbe riscritta.

---

## 7. Fuori scope (dichiarato)

- **Ordini bevande/distillati.** Lo schema è generico ma la UI resta vini. Da valutare dopo, con [modulo_acquisti.md](modulo_acquisti.md).
- **Match automatico ordine ↔ fattura ricevuta.** Sarebbe potente (chiude il cerchio con il Conto Economico) ma è un modulo a sé.
- **PDF stampabile dell'ordine.** Dipende dal mattone M.B PDF brand, non ancora in piedi. `📋 Copia testo` copre il caso reale.
- **Più fornitori per lo stesso vino** (roadmap `V.5`). L'ordine punta a un fornitore alla volta; se un vino si compra da due, si fanno due ordini. Non è un problema finché V.5 non si decide.

---

## 8. Domande aperte per Marco

1. **Un fornitore, una bozza alla volta** — va bene, o capita di preparare due ordini distinti allo stesso fornitore?
2. **Chi può inviare un ordine?** Oggi gli endpoint ordini richiedono solo il login, nessun check di ruolo. Serve gate `is_vini_manager`?
3. **Ordine "a voce"** — quando il rappresentante è lì e si ordina parlando, si registra comunque come ordine (`canale='rappresentante'`, niente invio)? Direi di sì, altrimenti lo storico ha buchi proprio nel caso d'uso principale.
4. **Il totale € va sul listino o sul netto scontato?** Se i fornitori applicano sconti fissi, `sconto_std_pct` di O7 andrebbe anticipato a O4 per non mostrare totali gonfiati.

---

**Autori:** Marco + Claude
**Sessione di origine:** 2026-08-02
**File che verranno toccati:** `app/migrations/158_*.py`, `app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `app/services/vini_widget_settings_service.py`, `frontend/src/pages/vini/DashboardVini.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/pages/vini/ViniImpostazioni.jsx`, nuova `frontend/src/pages/vini/OrdiniVini.jsx`, `frontend/src/config/versions.jsx`, `frontend/src/config/modules.json`


---

# 9. Esito della sessione 2026-08-02 (O3–O6 in un colpo)

Marco: *"tutto, nell'ordine che ti è più semplice, iniziamo oggi finiamo oggi"*.

## O2 assorbito, non saltato
I quick wins di O2 (totali €, qta suggerita, ricerca, filtro tipologia, badge
"ordine fermo da N gg") erano un piano B nel caso non si arrivasse a O6. Andando
in fondo lo stesso giorno, costruirli sul widget vecchio E poi nella pagina nuova
avrebbe voluto dire fare due volte la stessa UI. Vivono tutti in `OrdiniVini.jsx`.

## Decisioni prese durante l'implementazione

1. **La chiave di raggruppamento è `DISTRIBUTORE` (il testo sulla bottiglia), non
   il nome dell'anagrafica.** L'anagrafica dà l'`id`, e quindi il contatto. Se si
   usasse il nome anagrafico, una bottiglia con `DISTRIBUTORE = "Emanuele Poloni"`
   la cui madre punta al fornitore `"Emanuele Polloni"` (doppione reale in
   anagrafica al 2026-08-02, 20 e 27 vini) finirebbe in una bozza intestata al
   secondo nome, invisibile dal gruppo in cui si è cliccato. **Da sanare in
   anagrafica:** i due "Poloni/Polloni" vanno fusi.
2. **La quantità nel carrello si sostituisce, non si somma.** "Di questo ne voglio
   N", non "aggiungine altri N": sommare renderebbe impossibile correggere un
   errore di battitura senza cancellare la riga.
3. **Le quantità in ricezione sono incrementi**, con un tetto al doppio
   dell'ordinato. Un arrivo in due tranche si registra due volte e si somma; `60`
   battuto al posto di `6` viene rifiutato invece di gonfiare la giacenza.
4. **Ricevere una bozza è vietato**: salterebbe lo stato `inviato` e con esso la
   data di partenza, cioè il lead time. Chi ordina a voce usa prima
   "🤝 Ordinato a voce".
5. **Il travaso dei pending (mig 159) è stato anticipato.** Il piano lo rimandava
   a UI verificata. La review ha mostrato che la convivenza era peggio: un vino
   con pending aperto ha `STATO_RIORDINO='0'` e ricompariva nella lista "da
   ordinare" senza segnalazione → doppio ordine, e confermando l'arrivo da
   entrambi i sistemi la giacenza veniva incrementata due volte. In più, da
   quando la dashboard rimanda alla pagina nuova, i pending residui non erano più
   chiudibili da nessuna schermata. Erano 2 righe: il momento giusto era subito.

## Cosa ha trovato la review avversariale (e che è stato corretto)

| Problema | Effetto concreto |
|---|---|
| Vino già ordinato riproposto come da ordinare | Appena l'ordine passa a `inviato` il vino tornava in lista pulito: si riordinava la stessa merce. Ora badge `📤 già ordinate N` + conferma esplicita |
| Convivenza col vecchio pending | Doppio ordine e doppio carico di giacenza. Risolto con la mig 159 |
| Vino cancellato in ricezione | La riga veniva marcata ricevuta senza caricare niente e senza movimento: l'ordine si chiudeva dichiarando arrivata merce sparita. Ora la riga resta scoperta |
| Modale ricezione chiudibile a salvataggio in corso | Chiudere con la POST in volo faceva ricliccare "È arrivato" → merce caricata due volte |
| Carrello non azzerato al cambio fornitore | Il carrello di A restava a schermo sotto il nome di B, con la ✕ attiva: si cancellava la riga sbagliata |
| Risposte fuori ordine | Cliccando A poi B in fretta, i dati di A restavano sotto l'intestazione di B in modo permanente |
| `in_viaggio` sovrascritto | Un fornitore con 2 inviati + 1 parziale mostrava "1 in arrivo" |
| Soglia "ordine fermo" ignorata | Il campo letto non esisteva: cambiare l'impostazione non aveva effetto |

## RD.1 — Il widget dashboard diventa il primo selettore del riordino (2026-08-08)

Marco: *«il widget "vini attivi in carta senza giacenza" deve diventare un primo
selettore sul riordino. Se flaggo da ordinare lo evidenzi, se flaggo ordinato
dovrebbe già metterlo in ordine che poi vado a riprendere, se flaggo annata
esaurita o non ricomprare non viene più proposto.»*

O6 aveva spostato il **lavoro** sulla pagina `/vini/ordini`, lasciando il widget
come vista. RD.1 gli dà un ruolo preciso: **il widget è dove si decide, la pagina
è dove si ordina.** Le due viste ora condividono la stessa condizione di ingresso.

### 1. Chi entra nel riordino: copertura, non bottiglie

Primo tentativo (scartato): soglia in bottiglie, `QTA_TOTALE <= N`. Marco:
*«la soglia numerica non mi serve a nulla, ci sono vini importanti che è normale
avere in una sola bottiglia. Il senso va ragionato sul consumo: se un vino si
consuma 3 bottiglie al mese e ne ho una è un alert; se ne ho una di un vino
fermo da mesi no.»*

Criterio adottato — **copertura in giorni**:

```
consumo_giornaliero = vendite_finestra / giorni_finestra      (finestra = qta_suggerita_giorni_storico, 60gg)
copertura_giorni    = giacenza * giorni_finestra / vendite_finestra
entra se: giacenza = 0  OPPURE  copertura_giorni < alert_carta_giorni_copertura
```

Implementato in aritmetica intera (`giacenza * finestra < copertura * vendite`)
per non dividere per zero: **chi non ha venduto nella finestra ha lato destro 0 e
non entra mai**, senza clausole speciali. È esattamente la distinzione che Marco
chiedeva fra scorta bassa e vino fermo.

**Fonte unica:** `app/services/vini_riordino_service.py` — `sql_da_riordinare()`
genera la condizione SQL (subquery inline, usabile dentro un `WHERE` senza
wrapping), `copertura_giorni()` la calcola in Python per l'interfaccia. Usata da
4 query che prima avevano `QTA_TOTALE = 0` copiato a mano: widget alert e
`riordini_per_fornitore` (`vini_magazzino_db.get_dashboard_stats`),
`fornitori_con_lavoro` e `da_ordinare` (`vini_ordini_db`).

**Misura su dati reali** (DB 2026-08-08, 1316 vini in carta, 423 bt vendute/60gg):

| `alert_carta_giorni_copertura` | Righe nel widget | di cui in esaurimento |
|---|---|---|
| 0 (solo esauriti) | 55 | — |
| 14 | 56 | 2 |
| **21 (default)** | **60** | **6** |
| 30 | 61 | 7 |
| 45 | 67 | 13 |

Con 21 giorni entrano p.es. *Alto Adige Pinot Nero 2024* (1 bt, 7 vendute/60gg →
~9gg di scorta) e restano fuori **116 vini con una sola bottiglia ma fermi**. Una
soglia in bottiglie a 1 li avrebbe portati dentro tutti (176 righe). Query 0-2 ms.

### 2. Cosa fa ogni flag del picker

| Flag | Effetto |
|---|---|
| 📝 **Da ordinare** (`D`) | Segnale visivo: riga arancione nel widget riordini per fornitore e chip «📝 da ordinare» in `/vini/ordini`. Nessuna scrittura sugli ordini |
| 📦 **Ordinato** (`0`) | `POST /vini/ordini/riga/` con `qta_suggerita` → il vino **entra nella bozza del suo fornitore**, pronto da riprendere in `/vini/ordini`. Toast col nome del fornitore |
| 🗓️ **Annata esaurita** (`A`) | Esce da widget, `riordini_per_fornitore`, `da_ordinare` (già così pre-RD.1) |
| ⛔ **Non ricomprare** (`X`) | Idem, e nel widget resta solo come contatore «+ N non da ricomprare» |

`preserva_qta` (nuovo campo di `RigaPayload`, default `false`): se il vino è già
in bozza l'automatismo **non sovrascrive** la quantità. Una qta in carrello è
stata scelta a mano guardando il listino; un flag premuto in dashboard non ha
titolo per cambiarla. L'aggiunta è non bloccante: se fallisce (utente senza
permesso di scrittura ordini, fornitore non risolvibile) lo stato `Ordinato`
resta salvato e il toast dice cosa non è successo.

### 3. Codice colore (unico su tutte le viste)

Colori presi da `viniConstants.STATO_RIORDINO`, non reinventati:

| Stato | Barra + sfondo riga |
|---|---|
| `D` da ordinare | arancione |
| `0` ordinato | sky |
| `A` annata esaurita | neutro chiaro, testo attenuato |
| `X` non ricomprare | neutro scuro, testo attenuato |
| nessuno stato, giacenza 0 | rosso |
| nessuno stato, in esaurimento | ambra |

Nel widget alert il tono del banner segue il contenuto: **rosso se c'è almeno un
esaurito, ambra se è solo riordino preventivo** — un banner rosso permanente si
smette di leggere. Ogni riga porta giacenza e copertura (`🍷 2 bt · ~9gg`): sono
i due numeri che servono per decidere se ordinare adesso.

### 4. Impostazioni

`alert_carta_giorni_copertura` (default 21) in **Impostazioni Vini → Widget e
soglie → 🛒 Widget riordino**. La migrazione 165 allinea `vini_widget_settings` a
`WIDGET_DEFAULTS` con `INSERT OR IGNORE`: recupera anche le 4 chiavi ordini di O5
(`ordine_fermo_alert_giorni`, i 3 `ordine_wa_*`) che erano nel service ma non in
tabella, quindi leggibili in codice e **non modificabili da UI**
(`set_widget_setting` rifiuta le chiavi assenti). `ordine_fermo_alert_giorni` ha
ora il suo gruppo in Impostazioni; i template WhatsApp restano fuori (sono `text`,
la UI ha solo input numerici).

## Cosa resta aperto

- **Codice morto in `DashboardVini.jsx`** — il modale ordine e i suoi handler
  (~145 righe) non sono più raggiungibili. Censiti in
  [inventario_pulizia.md](inventario_pulizia.md), da togliere in un push dedicato.
- **Endpoint pending ancora senza gate di ruolo** — `/{id}/ordine-pending/*` in
  `vini_magazzino_router.py` hanno solo `Depends(get_current_user)` e
  conferma-arrivo incrementa la giacenza. Ora la tabella è vuota, ma finché gli
  endpoint esistono sono l'unica scrittura non gated che tocca le giacenze.
- **O7** (condizioni fornitore: minimo d'ordine, giorno di consegna, sconti) —
  Marco 2026-08-02: "per ora non preoccupiamocene". Di O7 è stato fatto solo il
  flag `attivo` (mig 160), chiesto a parte: nasconde dalla pagina Ordini i
  distributori con cui non si lavora più, tranne quelli con un ordine aperto.
- **Doppione anagrafico Poloni/Polloni** da fondere.
- **Il widget filtra `STATO_VENDITA >= 2`, la pagina Ordini no** (disallineamento
  pre-esistente, non introdotto da RD.1, misurato il 2026-08-08): il widget
  segnala 60 vini, `fornitori_con_lavoro` ne conta **918** e
  `riordini_per_fornitore` 942, perché prendono qualunque vino in carta a
  giacenza zero — compresi quelli marcati "non vendere"/"controllare". Su
  «0,75 di Valentino Rossi» sono 332 righe. Decisione PO: allineare la pagina
  Ordini al filtro del widget (una riga in `sql_da_riordinare` o nei chiamanti)
  o tenere la lista larga di proposito? **Da chiedere a Marco.**
- **`riordini_per_fornitore` non espone `copertura_giorni`**: la sua query non
  calcola la finestra vendite, quindi la colonna Giac. resta un numero secco e
  il fallback colore usa solo "giacenza zero sì/no".
