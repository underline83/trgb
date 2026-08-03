# Modulo Intermittenti — comunicazione UNI all'Ispettorato

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_dipendenti.md](modulo_dipendenti.md), [modulo_dipendenti_turni.md](modulo_dipendenti_turni.md)

> **Modulo:** `dipendenti` (sotto-area Intermittenti) · **Versione:** 1.0 · **Stato:** implementato, mai usato in produzione
> **Prima release:** sessione 2026-07-30 · **Migrazione:** 156
> **Frontend:** `/dipendenti/intermittenti` — `frontend/src/pages/dipendenti/Intermittenti.jsx`
> **Backend:** `app/routers/intermittenti_router.py` (prefix `/intermittenti`), `app/services/uni_intermittenti_service.py`
> **Mattoni:** M.D email (versione minima, nata qui) · M.F alert engine · M.A notifiche · M.I UI primitives

## 1. A cosa serve

Ogni volta che un lavoratore con **contratto intermittente** viene chiamato a lavorare, il
datore deve comunicarlo all'Ispettorato del Lavoro **prima che il turno inizi**
(art. 15 D.Lgs 81/2015). Sanzione per omessa comunicazione: **400-2.400 € per ogni giornata**,
raddoppio in recidiva. Una giornata passata **non è sanabile**: la comunicazione è per
definizione preventiva.

Il modulo prende i turni già decisi nel Foglio Settimana, li trasforma nel modello
ministeriale **UNI-Intermittenti**, lo manda via email e conserva la prova.

**Attenzione a non confondere due cose diverse:**

| Campo anagrafica | Significato | Obbligo di comunicazione |
|---|---|---|
| `dipendenti.intermittente` | contratto intermittente ex art. 15 | **sì** |
| `dipendenti.a_chiamata` | extra del turismo, pagato a ore | no |

**Un solo flag** (migrazione 161, 2026-08-03): il vecchio `trasmissione_telematica`
in anagrafica significava già "contratto intermittente" nella testa di Marco. Due caselle
per la stessa cosa divergono e qualcuno sparisce dalle comunicazioni senza accorgersene:
i dati sono stati travasati su `intermittente` e la casella vecchia non compare più in
anagrafica. La colonna resta nel DB, non letta da nessuno (niente DDL distruttivo).

## 2. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-D-201 | Elenca le giornate di intermittenti da comunicare in un periodo, già spezzate in moduli da 10 | `intermittenti_router.py` `GET /intermittenti/da-comunicare/` | admin | ✅ |
| C-D-202 | Genera e invia il modulo (una email per modulo), con `dry_run` per l'anteprima XML | `POST /intermittenti/comunica/` | admin | ✅ |
| C-D-203 | Registro degli invii con esito ed errore | `GET /intermittenti/comunicazioni/` | admin | ✅ |
| C-D-204 | Scarica l'allegato archiviato (prova dell'adempimento) | `GET /intermittenti/comunicazioni/{id}/allegato` | admin | ✅ |
| C-D-205 | Annulla una comunicazione inviata (modulo con flag annullamento) | `POST /intermittenti/comunicazioni/{id}/annulla` | admin | ✅ |
| C-D-206 | Configura CF datore, email, destinatario, formato data | `GET/PUT /intermittenti/settings/` — UI in **Impostazioni → Intermittenti** | admin | ✅ |
| C-D-207 | Segna chi è intermittente, con CF e codice comunicazione | **Anagrafica dipendente** (`PUT /dipendenti/{id}`). `GET /intermittenti/lavoratori/` è di sola lettura, per conteggio e diagnostica | admin | ✅ |
| C-D-208 | Email di prova per validare le credenziali SMTP | `POST /intermittenti/test-email/` | admin | ✅ |
| C-D-209 | Alert: turni di intermittenti entro 48h non comunicati | `alert_engine.py` checker `intermittenti_non_comunicati` | admin | ✅ |

## 2-bis. Dove si configura

| Cosa | Dove |
|---|---|
| Chi è intermittente, suo CF, suo codice comunicazione | **Dipendenti → Anagrafica**, sulla scheda del singolo |
| CF e email del datore, destinatario, oggetto, formato data, stato SMTP | **Dipendenti → Impostazioni → Intermittenti** |
| Preparare e inviare le comunicazioni, registro, annullamenti | **Dipendenti → Intermittenti** |

I campi del lavoratore hanno **un solo scrittore**, l'anagrafica (`PUT /dipendenti/{id}`):
niente secondo form che scrive le stesse colonne e ci diverge. Su `codice_fiscale` e
`codice_comunicazione` l'update usa `COALESCE(?, colonna)`, così un salvataggio che non porta
quei campi non cancella il CF che il parser dei cedolini (`parse_lul.py`) ha già popolato.

## 3. Il tracciato XML (reverse-engineering, non documentazione ufficiale)

**Del file XML non esiste alcuna specifica pubblica**: né XSD, né tracciato, né una riga di
documentazione ministeriale. Nemmeno la circolare INL 8716/2019 la tocca. La specifica è il
modulo PDF stesso, che è un XFA statico Adobe LiveCycle: il suo bottone "Genera XML e invia
via email" fa `<submit format="xml">`, quindi **l'allegato che parte è il packet `datasets`
dell'XFA**. Struttura ricavata con pikepdf da un modulo reale:

```xml
<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data>
 <moduloIntermittenti><Campi>
  <CFdatorelavoro>04062640166</CFdatorelavoro>
  <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>   <!-- sì, due volte -->
  <BCbarcodeModello01>ML-15-01</BCbarcodeModello01>
  <EMmail>...</EMmail>
  <ANannullamento>0</ANannullamento>
  <CFlavoratore1>...</CFlavoratore1><CCcodcomunicazione1>...</CCcodcomunicazione1>
  <DTdatainizio1>03/08/2026</DTdatainizio1><DTdatafine1/>
  <!-- ... fino alla riga 10 -->
 </Campi></moduloIntermittenti></xfa:data></xfa:datasets>
```

**Formato date: `DD/MM/YYYY`.** Tutti e 20 i campi data del modulo hanno
`<bind><picture>DD/MM/YYYY</picture></bind>`, e in XFA è la picture del `bind` a decidere
come il valore viene scritto nei dati (`format` = visualizzazione, `validate` = controllo di
digitazione). Lo script interno del modulo confronta le date con `split("-")` perché legge
`rawValue`, che per un campo data è sempre ISO *in memoria*: non è una contraddizione.
Il formato resta un setting (`uni_formato_data`) e non una costante: su una cosa non
documentata non si scommette in hardcoded.

### Regole prese dal JavaScript interno del modulo

Più attendibili di qualunque guida, perché sono quelle che il modulo applica davvero:

- `CFdatorelavoro` obbligatorio; almeno un `CFlavoratore` compilato
- `EMmail` obbligatoria, regex del modulo `^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]{2,}[.][a-zA-Z]{2,3}$`
  → **niente `+` nell'indirizzo, TLD di 2-3 caratteri**
- `data_inizio >= data_fine` → errore "date incoerenti". Quindi **giornata singola = solo
  data inizio, data fine VUOTA**: mettere la stessa data due volte fa fallire il modulo
- `data_fine` senza `data_inizio` → errore
- massimo **10 lavoratori per modulo**
- **un solo modulo per email** (INL lettera circolare 8716 del 9/10/2019): con più allegati
  la trasmissione sembra riuscita ma i moduli non entrano a sistema
- annullamento: stessi dati con `ANannullamento = 1`

### Destinatario

`intermittenti@pec.lavoro.gov.it` (accetta email ordinarie, non serve una PEC nostra).
I moduli PDF in circolazione — incluso quello del commercialista — puntano ancora al vecchio
`intermittenti@mailcert.lavoro.gov.it`, **sostituito dal 1° giugno 2015**. Per questo il
destinatario è un setting e non una costante.

**Il Ministero non manda ricevute.** La prova dell'adempimento è la copia conservata: per
ogni invio si archiviano allegato XML e `.eml` completo in
`locali/<id>/data/uploads/intermittenti/<anno>/`, con hash SHA-256 in tabella.

## 4. Come si comportano i turni

- entrano solo i turni `stato = 'CONFERMATO'`. Gli `OPZIONALE` sono turni da confermare
  all'ultimo: comunicarli significherebbe dichiarare prestazioni che potrebbero non esserci
- doppio turno nello stesso giorno (pranzo + cena) = **una giornata**: al Ministero si
  comunica il giorno, non l'orario
- giorni di calendario **strettamente consecutivi** dello stesso lavoratore diventano un
  periodo (data inizio + data fine). Chi lavora lun-mer-ven ha **tre righe, non una**: un
  periodo dichiara prestazione in tutti i giorni che contiene, e dichiarare come lavorato un
  giorno di riposo sarebbe una dichiarazione falsa
- l'anti-doppione si basa sul registro righe, non su un flag sul turno. Un annullamento
  inviato riapre le giornate che copriva

## 5. Schema DB (dipendenti.sqlite3, migrazione 156)

```
dipendenti.intermittente          INTEGER DEFAULT 0   -- flag legale (NON a_chiamata)
dipendenti.codice_comunicazione   TEXT                -- codice UNILAV del contratto

dipendenti_uni_comunicazioni        una riga per email inviata (esito, allegato, hash, .eml)
dipendenti_uni_comunicazioni_righe  una riga per (lavoratore, periodo) — è l'indice del "già comunicato"
```

Settings in `dipendenti_settings`: `uni_cf_datore`, `uni_email_mittente`, `uni_destinatario`,
`uni_oggetto`, `uni_formato_data`.

## 6. Configurazione SMTP (mattone M.D minimo)

In `.env`: `SMTP_HOST`, `SMTP_PORT` (465 = SSL, 587 = STARTTLS), `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `SMTP_FROM_NAME`. Il pulsante "Manda email di prova" verifica le credenziali
senza effetti collaterali.

## 7. Aperto / da fare

- **Verifica col consulente del lavoro** del tipo di contratto reale delle persone segnate:
  se sono extra del turismo o part-time la comunicazione non è dovuta
- **Codice comunicazione** da chiedere al consulente per ogni intermittente
- **Primo mese in doppio binario**: il sistema invia, ma si fa confermare dal consulente che
  le comunicazioni risultino acquisite. Non arrivando ricevute, è l'unico riscontro possibile
- **Aggancio automatico a "Pubblica settimana"**: previsto, non fatto. Per scelta di Marco
  (2026-07-30) si parte con l'invio manuale dalla pagina
- Il formato data è stato dedotto, non letto in una specifica: se il consulente segnala
  comunicazioni non acquisite, il primo sospettato è `uni_formato_data`
