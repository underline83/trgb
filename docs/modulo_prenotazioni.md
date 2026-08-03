# Modulo Prenotazioni — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_preventivi.md](modulo_preventivi.md), [modulo_clienti_crm.md](modulo_clienti_crm.md), [architettura_mattoni.md](architettura_mattoni.md)

**Versione modulo (`versions.jsx`):** prenotazioni v2.2
**Sezione top-level:** `/prenotazioni` (menu moduli: 📅 Prenotazioni)
**Backend:** router `app/routers/prenotazioni_router.py`, prefix `/prenotazioni/*`
**DB:** `clienti.sqlite3` (condiviso col CRM, path live `locali/tregobbi/data/`)
**Roadmap:** sezione `PR.` di [roadmap.md](roadmap.md)

---

# 1. Panoramica

Agenda prenotazioni interna dell'osteria: planning giornaliero pranzo/cena, vista settimanale, mini-calendario mensile, mappa tavoli serale con assegnazione, editor piantina, impostazioni (capienze, slot, template WhatsApp). Le **Fasi 1 (Agenda) e 2 (Mappa Tavoli)** della spec originale sono implementate e live; le **Fasi 3 (widget pubblico), 4 (email transazionali) e 5 (distacco TheFork Manager)** no — vedi §10 e roadmap §PR.

Il modulo NON duplica dati: usa la tabella `clienti_prenotazioni` del CRM, la stessa popolata dall'import TheFork XLSX (che resta una funzione del modulo Clienti, vedi [modulo_clienti_crm.md](modulo_clienti_crm.md)). Prenotazioni importate e manuali convivono, distinte dal campo `fonte`.

**Stato d'uso (dati DB al 2026-08):** ~32.500 prenotazioni, tutte da import TheFork (`fonte='thefork'` ~30.200, `fonte='widget'` = storico Booking Module TF ~2.300, `fonte='manuale'` 0). L'inserimento manuale è disponibile ma TFM è ancora il canale d'inserimento primario; il distacco (Fase 5) non è iniziato. Tavoli censiti: 3; nessun layout né combinazione salvati.

# 2. Capability

Codici dall'audit 2026-05-19 (`docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`).

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-P-001 | Planning giornaliero pranzo/cena con dati cliente CRM | `GET /prenotazioni/planning/{data}` — `prenotazioni_router.py:172` | sala | ✅ |
| C-P-002 | Riepilogo settimanale (7 giorni, count+pax per turno) | `GET /prenotazioni/settimana/{data}` — `:273` | sala | ✅ |
| C-P-003 | Conteggi mensili per mini-calendario (con saturazione) | `GET /prenotazioni/calendario/{anno}/{mese}` — `:337` | sala | ✅ |
| C-P-004 | Crea prenotazione manuale (+ cliente CRM al volo) | `POST /prenotazioni/` — `:379` | sala | ✅ |
| C-P-005 | Modifica prenotazione (ricalcola turno se cambia ora) | `PUT /prenotazioni/{id}` — `:1055` | sala | ✅ |
| C-P-006 | Cambio stato rapido con transizioni validate | `PATCH /prenotazioni/{id}/stato` — `:1124` | sala | ✅ |
| C-P-007 | Cancella (soft: stato → CANCELED) | `DELETE /prenotazioni/{id}` — `:1171` | sala | ✅ |
| C-P-008 | Config modulo (capienze, slot, soglia, template WA…) | `GET/PUT /prenotazioni/config` — `:454, :467` | admin (solo UI, vedi §9) | ✅ |
| C-P-009 | Autocomplete clienti CRM per il form | `GET /prenotazioni/clienti/search?q=` — `:491` | sala | ✅ |
| C-P-010 | Link WhatsApp precompilato conferma/reminder (M.C) | `GET /prenotazioni/{id}/wa-link?tipo=` — `:1200` | sala | ✅ |
| C-P-011 | Lista tavoli attivi + combinazioni | `GET /prenotazioni/tavoli` — `:529` | sala | ✅ |
| C-P-012 | Occupazione tavoli per data/turno (dropdown form) | `GET /prenotazioni/tavoli/disponibili/{data}/{turno}` — `:559` | sala | ✅ |
| C-P-013 | CRUD tavoli (crea, modifica, disattiva) | `POST/PUT/DELETE /prenotazioni/tavoli[/{id}]` — `:659, :687, :752` | admin (solo UI) | ✅ |
| C-P-014 | Salvataggio posizioni in blocco (drag & drop editor) | `PUT /prenotazioni/tavoli/batch/posizioni` — `:721` | admin (solo UI) | ✅ |
| C-P-015 | Layout sala salvabili + attivazione | `GET/POST/PUT/DELETE /tavoli/layout[/{id}]` + `PUT /{id}/attiva` — `:771-:871` | admin (solo UI) | ✅ |
| C-P-016 | Combinazioni tavoli (API senza UI, vedi §9) | `GET/POST/DELETE /tavoli/combinazioni[/{id}]` — `:890, :903, :921` | — | ⚠️ |
| C-P-017 | Mappa serale: stato tavoli + prenotazioni senza tavolo | `GET /prenotazioni/tavoli/mappa/{data}/{turno}` — `:940` | sala | ✅ |
| C-P-018 | Assegna/rimuovi tavolo a una prenotazione | `PUT /prenotazioni/tavoli/assegna/{pren_id}` — `:1029` | sala | ✅ |

Capability collegate fuori router: widget "Prenotazioni oggi" in Home e DashboardSala via `GET /dashboard/home` (`dashboard_router.py:_prenotazioni_oggi`); storico prenotazioni per cliente in `/clienti/prenotazioni` e nella scheda cliente (modulo Clienti).

# 3. Frontend

## 3.1 Route (App.jsx)

| Route | Pagina | Note |
|---|---|---|
| `/prenotazioni` | redirect | `ModuleRedirect` → planning di oggi (fallback: mappa, settimana, impostazioni) |
| `/prenotazioni/planning/:data` | `PrenotazioniPlanning` | vista principale |
| `/prenotazioni/settimana/:data` | `PrenotazioniSettimana` | |
| `/prenotazioni/mappa` e `/prenotazioni/mappa/:data/:turno` | `TavoliMappa` | |
| `/prenotazioni/tavoli` | `TavoliEditor` | tab visibile solo admin/superadmin |
| `/prenotazioni/impostazioni` | `PrenotazioniImpostazioni` | tab visibile solo admin/superadmin |

File in `frontend/src/pages/prenotazioni/`: le 5 pagine sopra + `PrenotazioniForm.jsx` (modale) + `PrenotazioniNav.jsx` (tab bar) + `components/{MiniCalendario, StatoBadge, CanaleBadge}.jsx`. Colore tema: indigo. Voci in `modulesMenu.js`: Planning, Mappa Tavoli, Settimana, Editor Tavoli (admin), Impostazioni (admin).

## 3.2 Planning giornaliero (`PrenotazioniPlanning`)

- Due tabelle (🌤️ Pranzo / 🌙 Cena) con colonne Ora, Cliente, Pax, Tavolo, Note, Stato; cancellate/no-show raggruppate in coda alla tabella.
- Header turno con conteggio e `pax / capienza (%)` colorato (verde < 70%, amber 70-90%, rosso > 90%).
- Riga colorata per stato (verde seduto/arrivato, emerald conto/uscito, blu REQUESTED, amber ritardo > 15 min con ⏰, grigio cancellata, rosso tenue no-show).
- Cliente: badge canale (`CanaleBadge`: 🍴 TheFork, 📞 telefono, 💬 WA, 🚶 walk-in, 🌐 widget, ✉️ email), link alla scheda CRM se `cliente_id` presente, ⭐ VIP, ⚠️ allergie, badge "NUOVA" per REQUESTED. Nome via COALESCE CRM → snapshot `nome_ospite` (migr. 068).
- Click riga → espansione inline con contatti, visite totali, tag CRM, allergie/preferenze, note, e azioni rapide di stato (Seduto, No-show, Cancella, Conferma per REQUESTED, Andato via, Ripristina).
- Navigazione data ◀ ▶ + "Oggi" + toggle mini-calendario (badge count/pax e saturazione per giorno).
- "+ Nuova Prenotazione" apre il form modale.
- Footer: totale prenotazioni/coperti + avviso "N senza tavolo".

## 3.3 Form nuova prenotazione (`PrenotazioniForm`)

Data; slot orari da config (pranzo/cena in base alla soglia) + orario libero; pax con stepper (1-50); canale (Telefono, WhatsApp, Walk-in, Email, Altro); autocomplete cliente (min 2 caratteri, ordinato per visite) con "Crea nuovo cliente" inline (cognome obbligatorio → creato nel CRM con `origine='diretto'` e `protetto=1`); avvisi gialli allergie/restrizioni dal CRM; dropdown tavolo con occupati disabilitati (da C-P-012); checkbox esterno; seggioloni; note staff e cliente; occasione (lista fissa: Compleanno, Anniversario, Laurea, Cresima, Battesimo, Cena aziendale, Altro); allergie segnalate.

## 3.4 Vista settimanale, mappa, editor

- **Settimana**: 7 card lun-dom con count·pax per turno, card cliccabile → planning; giorno di chiusura in grigio "CHIUSO" (vedi incoerenza §9).
- **Mappa serale** (`TavoliMappa`): SVG 900×600 con tavoli colorati per stato prenotazione (grigio libero, indigo prenotato, amber arrivato, emerald seduto, blu conto, rosso no-show, viola REQUESTED), auto-refresh 30s, toggle pranzo/cena. Click su tavolo occupato → pannello dettaglio (contatti, allergie, note, cambio stato, libera tavolo). Flusso assegnazione: "Assegna" su una prenotazione senza tavolo → click sul tavolo libero. Riepilogo occupati/liberi/senza tavolo/totali. Le combinazioni scritte come stringa (`"4+5"` o `"4,5"`) vengono spacchettate: ogni tavolo componente risulta occupato.
- **Editor piantina** (`TavoliEditor`): drag & drop con snap a griglia 10px (mouse e touch), zoom 50-200%, crea tavolo (nome, zona sala/bottiglieria/esterno/privata, posti min-max, forma rect/circle), pannello proprietà con salvataggio immediato per campo, disattiva tavolo, "Salva posizioni" batch, layout salvabili/attivabili/eliminabili (l'attivazione riattiva solo i tavoli del layout e ne applica le posizioni).

# 4. Backend — endpoint

Tutti con JWT (`Depends(get_current_user)`); nessun controllo di ruolo nel router (vedi §9). Trailing slash solo su `POST /prenotazioni/` (root del router).

## 4.1 Agenda

| Metodo | Endpoint | Cosa fa |
|---|---|---|
| GET | `/prenotazioni/planning/{data}` | Prenotazioni del giorno divise pranzo/cena, JOIN clienti (COALESCE snapshot 068), tag CRM, visite totali, contatori (count/pax attivi, senza tavolo, capienze). Esegue il backfill lazy di `turno`/`fonte` sulle righe che non li hanno (max 5000 per chiamata) |
| GET | `/prenotazioni/settimana/{data}` | Count+pax per turno sui 7 giorni dal lunedì della settimana; flag `chiuso` da config `giorno_chiusura` |
| GET | `/prenotazioni/calendario/{anno}/{mese}` | Per ogni giorno: count, pax, saturazione = pax / (capienza pranzo + cena) |
| POST | `/prenotazioni/` | Crea manuale: stato `RECORDED`, `fonte='manuale'`, `turno` calcolato dalla soglia, `token_cancellazione` generato, `creato_da`/`prenotato_da` = username. Crea il cliente CRM al volo se `nuovo_cognome` presente |
| PUT | `/prenotazioni/{pren_id}` | Aggiorna campi passati; ricalcola `turno` se cambia `ora_pasto`; setta `updated_at` |
| PATCH | `/prenotazioni/{pren_id}/stato` | Cambio stato con validazione transizioni (§5); 400 se non permessa |
| DELETE | `/prenotazioni/{pren_id}` | Soft delete: stato → `CANCELED` |
| GET | `/prenotazioni/config` | Tutta `prenotazioni_config` (chiave, valore, descrizione) |
| PUT | `/prenotazioni/config` | UPDATE per ogni coppia chiave/valore del body |
| GET | `/prenotazioni/clienti/search?q=` | Autocomplete: nome/cognome/telefono/email/nome+cognome, `attivo=1`, max 15, ordinati per visite |
| GET | `/prenotazioni/{pren_id}/wa-link?tipo=conferma\|reminder` | Mattone **M.C**: `fill_template` sul template `template_wa_{tipo}` di config (variabili `{nome} {cognome} {pax} {data} {ora}`) + `build_wa_link` sul telefono CRM. 400 se cliente senza telefono o numero non valido |

## 4.2 Tavoli, layout, combinazioni, mappa

| Metodo | Endpoint | Cosa fa |
|---|---|---|
| GET | `/prenotazioni/tavoli` | Tavoli `attivo=1` + tutte le combinazioni |
| GET | `/prenotazioni/tavoli/disponibili/{data}/{turno}` | Tavoli con flag `occupato` (spacchetta combinazioni `+`/`,` nel campo `tavolo` delle prenotazioni attive) |
| POST | `/prenotazioni/tavoli` | Crea tavolo (400 se nome duplicato) |
| PUT | `/prenotazioni/tavoli/{tavolo_id}` | Aggiorna campi passati |
| PUT | `/prenotazioni/tavoli/batch/posizioni` | Posizioni/dimensioni di più tavoli in un colpo |
| DELETE | `/prenotazioni/tavoli/{tavolo_id}` | Disattiva (`attivo=0`), non cancella |
| GET | `/prenotazioni/tavoli/layout` | Lista layout (attivo primo) |
| POST | `/prenotazioni/tavoli/layout` | Salva layout (nome UNIQUE, `tavoli_attivi` + `posizioni` JSON) |
| PUT | `/prenotazioni/tavoli/layout/{layout_id}` | Aggiorna layout |
| PUT | `/prenotazioni/tavoli/layout/{layout_id}/attiva` | Attiva: disattiva gli altri, riattiva solo i tavoli del layout, applica posizioni salvate |
| DELETE | `/prenotazioni/tavoli/layout/{layout_id}` | Elimina layout |
| GET | `/prenotazioni/tavoli/combinazioni` | Lista combinazioni |
| POST | `/prenotazioni/tavoli/combinazioni` | Crea combinazione (`tavoli_ids` JSON, posti) |
| DELETE | `/prenotazioni/tavoli/combinazioni/{combo_id}` | Elimina combinazione |
| GET | `/prenotazioni/tavoli/mappa/{data}/{turno}` | Tavoli con prenotazione assegnata (`stato_tavolo`), prenotazioni senza tavolo, combinazioni, layout attivo |
| PUT | `/prenotazioni/tavoli/assegna/{pren_id}` | Scrive `tavolo` sulla prenotazione (stringa vuota = rimuovi) |

# 5. Stati e transizioni

10 stati, compatibili 1:1 con l'export TheFork: `RECORDED, ARRIVED, SEATED, LEFT, CANCELED, NO_SHOW, REFUSED, REQUESTED, BILL, PARTIALLY_ARRIVED`.

Transizioni permesse (`TRANSIZIONI` in `prenotazioni_router.py:59`):

| Da | A |
|---|---|
| RECORDED | ARRIVED, SEATED, CANCELED, NO_SHOW, REFUSED |
| REQUESTED | RECORDED, REFUSED, CANCELED |
| ARRIVED | SEATED, CANCELED, NO_SHOW |
| SEATED | LEFT, BILL |
| BILL | LEFT |
| PARTIALLY_ARRIVED | SEATED, LEFT |
| CANCELED / NO_SHOW / REFUSED | RECORDED (ripristino) |
| LEFT | — (terminale) |

Etichette UI (`StatoBadge`): RECORDED = "Confermata", REQUESTED = "Da confermare", BILL = "Al conto", LEFT = "Completata". Nota: `REQUESTED` è previsto per il futuro widget pubblico; oggi nessun flusso interno lo genera (può arrivare solo dall'import TheFork).

# 6. Configurazione (`prenotazioni_config`)

Chiavi seed (da `init_clienti_db()` + migr. 050): `capienza_pranzo` (35), `capienza_cena` (50), `slot_pranzo` / `slot_cena` (JSON array orari), `soglia_pranzo_cena` (15:00 — prima = pranzo, dopo = cena), `giorni_anticipo_max` (60), `giorni_anticipo_min_ore` (2), `giorno_chiusura` (3), `durata_media_tavolo_min` (90, legacy), `durata_pranzo` (90) e `durata_cena` (120) (migr. 050), `widget_attivo` (0), `widget_messaggio_pieno`, `template_wa_conferma`, `template_wa_reminder`.

UI: `/prenotazioni/impostazioni`, sidebar a 4 sezioni — **Capienza & Turni** (capienze, soglia, giorno chiusura, durate medie), **Slot Orari** (chips add/remove con anteprima), **Template Messaggi** (WA conferma/reminder con variabili e anteprima), **Widget Pubblico** (placeholder "In arrivo — Fase 3", checkbox disabilitata).

# 7. Schema DB (clienti.sqlite3)

Tabelle create idempotentemente da `init_clienti_db()` in `app/models/clienti_db.py` (non da migrazioni numerate, salvo 050 e 068):

- **`clienti_prenotazioni`** — base storica TheFork (data/ora pasto, stato, pax, tavolo, canale, occasione, note, yums/imprint, thefork_booking_id UNIQUE, thefork_customer_id, allergie_segnalate, tavolo_esterno, seggioloni, waiting_list…) + colonne del modulo: `turno` (pranzo/cena), `fonte` (manuale/thefork/widget), `creato_da`, `conferma_inviata`, `reminder_inviato`, `token_cancellazione`, `updated_at`, `nome_ospite`/`cognome_ospite` (snapshot migr. 068 per prenotazioni senza `cliente_id`). Indici su cliente, data, stato, thefork_*, turno, fonte, token.
- **`tavoli`** — nome UNIQUE, zona, posti_min/max, combinabile, posizione_x/y, larghezza/altezza, forma, attivo, note, ordine.
- **`tavoli_combinazioni`** — nome, `tavoli_ids` JSON, posti, uso_frequente, note.
- **`tavoli_layout`** — nome UNIQUE, `tavoli_attivi` JSON, `posizioni` JSON, attivo.
- **`prenotazioni_config`** — chiave/valore/descrizione (§6).
- **`prenotazioni_email_log`** — predisposta per la Fase 4, **mai scritta da nessun codice** (0 righe).

Migrazioni dedicate: `050_prenotazioni_durata_turni.py` (chiavi durata_pranzo/durata_cena), `068_prenotazioni_nome_ospite.py` (snapshot nome ospite, ~22% delle righe import senza Customer ID).

# 8. Integrazioni e mattoni

- **M.C WhatsApp composer** — usato: `from app.utils.whatsapp import build_wa_link, fill_template` nell'endpoint wa-link (C-P-010). I template sono in config, editabili da Impostazioni.
- **M.A Notifiche** — NON usato dal modulo (nessuna `crea_notifica`).
- **M.B PDF / M.D Email / M.F Alert** — non usati (niente PDF, niente email, nessun checker prenotazioni in `alert_engine`).
- **Widget Home / DashboardSala** — `GET /dashboard/home` include `prenotazioni` (count+pax pranzo/cena, lista con ora/nome/pax/nota/stato/turno, stati attivi RECORDED/SEATED/LEFT/ARRIVED/BILL) e la card modulo (line1 "N pax oggi", badge = n. prenotazioni). `DashboardSala.jsx` mostra la stessa lista filtrata per turno. Nota: il turno nel widget usa soglia fissa "15:00", non legge la config.
- **Import TheFork** — vive nel modulo Clienti (import XLSX `tfm-search-results`); il planning si limita a leggerne i dati e a backfillare `turno`/`fonte`.

# 9. Limiti noti e incoerenze

1. **`giorno_chiusura`: mapping UI ≠ backend.** La select in `PrenotazioniImpostazioni.jsx:17` usa 0=nessuno, 1=domenica … 7=sabato; il backend (`prenotazioni_router.py:283-287`) interpreta 0=dom … 6=sab (seed `'3'` = mercoledì, corretto per l'osteria). Con valore 3 la UI mostra "Martedì" ma la settimana marca chiuso il mercoledì; salvare "Mercoledì" dalla UI scriverebbe 4 = giovedì per il backend. Bug di visualizzazione/scrittura da fixare.
2. **Restrizione admin solo frontend.** Editor Tavoli e Impostazioni sono nascosti ai non-admin solo dalla UI (`PrenotazioniNav`); gli endpoint config/tavoli/layout accettano qualsiasi utente loggato.
3. **Combinazioni tavoli senza UI.** Endpoint CRUD presenti (C-P-016) ma nessuna pagina li usa: `TavoliEditor` carica le combinazioni e non le mostra; si gestiscono solo via API. In compenso mappa e disponibilità spacchettano le combinazioni scritte a mano nel campo `tavolo` ("4+5").
4. **Campi Fase 4 inerti.** `token_cancellazione` viene generato a ogni POST ma mai consumato; `conferma_inviata`/`reminder_inviato` mai aggiornati; `prenotazioni_email_log` mai scritta. Serviranno con widget + M.D Email.
5. **REQUESTED senza produttore.** La UI lo gestisce (badge NUOVA, conferma/rifiuta) ma oggi nessun flusso lo crea (widget assente).
6. Il widget Home calcola il turno con soglia hardcoded "15:00" invece della config (vedi §8).

# 10. Non implementato (dalla spec 2026-04) → roadmap §PR

- **Widget pubblico `/prenota`** (Fase 3): nessun endpoint `/public/prenotazioni/*`, pagina pubblica, CAPTCHA o rate limiting. → PR.1
- **Email transazionali** (Fase 4): conferma/reminder/cancellazione richiedono il mattone M.D. → PR.2 (il lato WA manuale c'è già: C-P-010)
- **Distacco TheFork Manager** (Fase 5). → PR.5
- No-show tracking su scheda CRM (PR.3), dashboard "stasera" (PR.4), lista d'attesa (PR.6), reminder automatico 24h (PR.9).

# 11. Storico — spec originale (2026-04-06), sintesi

La progettazione completa (721 righe) è nella history git di questo file (pre 2026-08). Punti che restano utili:

- **Obiettivo strategico:** eliminare la dipendenza da TheFork Manager (abbonamento + commissioni), tenendo TheFork solo come vetrina. TRGB come sistema unico per prenotazioni dirette, widget proprio sul sito, planning e conferme.
- **Dati del locale (analisi DB, aprile 2026):** ~450-540 prenotazioni/mese in alta stagione, 64% cena, 56% da 2 pax; canali storici: 60% offline, 24% portale TheFork, 7,5% walk-in, 7% widget TF; no-show 0,7%, cancellazioni 12,5% (niente anti-no-show aggressivo); 14 tavoli interni + 20 esterni stagionali + ~20 combinazioni; orari di punta 20:00-20:30 e 13:00.
- **Fasi:** 1 Agenda ✅ · 2 Mappa tavoli ✅ · 3 Widget pubblico ⏳ (slot precisi a cena, fascia libera a pranzo; disponibilità = capienza turno − coperti prenotati; stato `REQUESTED` da confermare; Cloudflare Turnstile + rate limiting; finestra min 2h / max 60gg) · 4 Conferme ⏳ (email via M.D con log in `prenotazioni_email_log`; WA prima manuale poi eventuale Business API) · 5 Distacco TFM ⏳ (import XLSX giornaliero, 2 settimane di parallelo, disdetta).
- **Decisioni prese (2026-04-06):** tutto in `clienti.sqlite3`, stessa tabella del CRM; tema indigo; conferme email + link WA manuale; layout salvabili obbligatori perché la sala cambia spesso.
