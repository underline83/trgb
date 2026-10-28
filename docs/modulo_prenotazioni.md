# Modulo Prenotazioni — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_preventivi.md](modulo_preventivi.md), [modulo_clienti_crm.md](modulo_clienti_crm.md), [architettura_mattoni.md](architettura_mattoni.md)

**Versione modulo (`versions.jsx`):** prenotazioni v2.8
**Sezione top-level:** `/prenotazioni` (menu moduli: 📅 Prenotazioni)
**Backend:** router `app/routers/prenotazioni_router.py`, prefix `/prenotazioni/*`; integrazione TheFork in `app/routers/prenotazioni_thefork_router.py` + `app/services/thefork_service.py` (§12)
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
| C-P-005 | Modifica prenotazione (ricalcola turno se cambia ora): dal 2.23 «✏️ Modifica» nel Planning (PrenotazioniForm con prop `prenotazione`), cambio cliente, avviso per le TheFork | `PUT /prenotazioni/{id}` | sala, sommelier, admin | ✅ |
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
| C-P-019 | Webhook TheFork: riceve gli avvisi (prenotazione/cliente creato o modificato), li registra e li elabora in background | `POST /prenotazioni/thefork/webhook?token=` — `prenotazioni_thefork_router.py:webhook_thefork` | TheFork (pubblico, token) | 🆕 |
| C-P-020 | Stato integrazione (webhook, credenziali, ristorante, ultimo avviso) | `GET /prenotazioni/thefork/stato` | admin | 🆕 |
| C-P-021 | Registro avvisi TheFork con filtro per stato | `GET /prenotazioni/thefork/eventi` | admin | 🆕 |
| C-P-022 | Riprova un avviso / rielabora tutti quelli in sospeso | `POST /prenotazioni/thefork/eventi/{id}/riprova`, `POST /prenotazioni/thefork/elabora` | admin | 🆕 |
| C-P-023 | Prova connessione API TheFork (token + permessi) | `POST /prenotazioni/thefork/prova-connessione` | admin | 🆕 |
| C-P-024 | Recupera un periodo da TheFork (per data modifica o data pasto) | `POST /prenotazioni/thefork/sincronizza` | admin | 🆕 |
| C-P-025 | Bollino cliente nel Planning (Prima visita / Occasionale / Frequente, soglia `cliente_frequente_visite`) | `GET /prenotazioni/planning/{data}` → `bollino`, `visite_precedenti` | sala | 🆕 |
| C-P-026 | Timeline sala: coperti e tavoli in sala per orario (arrivo + durata media del turno) | `GET /prenotazioni/planning/{data}` → `timeline.pranzo/cena` | sala | 🆕 |
| C-P-027 | Possibili doppioni TheFork ↔ inserite a mano (nome, telefono, email) | `GET /prenotazioni/planning/{data}` → `possibili_doppioni` | sala | 🆕 |
| C-P-028 | Piantina per sale (schede Osteria / Dehor / Veranda), tavoli rettangolo / cerchio / rombo | `GET /prenotazioni/tavoli` → `sale`, `elementi`; `TavoliEditor`, `TavoliMappa` | admin / sala | 🆕 |
| C-P-029 | Elementi non prenotabili (bancone, colonne, scale, fioriere): crea, modifica, elimina | `POST/PUT/DELETE /prenotazioni/tavoli/elementi[/{id}]` | admin | 🆕 |
| C-P-030 | Importa piantina da file JSON (tavoli per nome + elementi, «sostituisci» disattiva i vecchi) | `POST /prenotazioni/tavoli/importa` | admin | 🆕 |
| C-P-031 | Affidabilità cliente nel Planning: no-show e cancellazioni passate (badge «N no-show», dettaglio nella riga) | `GET /prenotazioni/planning/{data}` → `no_show_totali`, `cancellate_totali` | sala | 🆕 |
| C-P-032 | Riconferma WhatsApp dal Planning (template «reminder»), segnata come inviata; contatore «da riconfermare» per turno | `GET /prenotazioni/{id}/wa-link?tipo=reminder` + `POST /prenotazioni/{id}/inviato?tipo=reminder` | sala | 🆕 |
| C-P-033 | Doppione TheFork / a mano: «Tieni quella TheFork, elimina questa» (copia nota staff, allergie, tavolo, cliente mancanti; elimina senza contarla come cancellazione) | `POST /prenotazioni/{id}/unisci-in/{altra_id}` | sala | 🆕 |
| C-P-034 | Mappa serale: clic su un tavolo libero → «Aggiungi una prenotazione» (form con tavolo e turno già scelti) / «Blocca questo tavolo» per giorno e turno (motivo facoltativo, sblocco dallo stesso menu); i tavoli bloccati non si assegnano | `POST /prenotazioni/tavoli/blocchi`, `DELETE /prenotazioni/tavoli/blocchi/{id}`; `bloccato`/`blocco` in `tavoli/disponibili` e `tavoli/mappa` | sala, sommelier, admin | 🆕 |
| C-P-035 | Fasce orarie del servizio per giorno (copia di «Andamento per fascia oraria» di TheFork Manager): fascia aperta/chiusa, coperti max, vendita online (scritta su TheFork con override availability), online max, «cosa vede il cliente su TheFork», registro; default dei limiti in Impostazioni; avviso nel form su fascia chiusa/piena | `GET/PUT /prenotazioni/fasce/{data}/{turno}`, `GET /prenotazioni/fasce/{data}/{turno}/thefork`; `fasce` nel planning | sala, admin (lettura: tutti) | 🆕 |
| C-P-036 | Tavoli dividibili: flag nell'Editor; dalla mappa «✂️ Dividi in due» spezza il tavolo per quel turno in «<nome>A» e «<nome>B» (metà posti e metà sagoma), assegnabili a due prenotazioni; «🔗 Riunisci» se le metà sono libere. Solo TRGB | `POST /prenotazioni/tavoli/divisioni`, `DELETE /prenotazioni/tavoli/divisioni/{id}`; metà in `tavoli/mappa` e `tavoli/disponibili` | sala, sommelier, admin | 🆕 |
| C-P-037 | Recensioni TheFork: scaricate (webhook entityType review, giro orario ultimi 14 giorni, storico a mano), collegate a cliente e prenotazione, medie 30/90 giorni, filtri (da rispondere, nuove, voto basso), risposta pubblica da TRGB, avviso admin sotto soglia, tab nella scheda cliente | `GET /prenotazioni/recensioni/`, `PUT /prenotazioni/recensioni/{uuid}/risposta`, `POST …/{uuid}/letta`, `POST …/letta-tutte`, `POST …/sincronizza` | lettura sala/admin, risposta e storico admin | 🆕 |
| C-P-038 | Prenotazioni dal sito: pagina pubblica `/prenota` (IT/EN, anche in iframe), calendario dei giorni liberi, orari dalle fasce, conferma automatica fino a N persone e richiesta oltre, email al cliente (conferma, richiesta, accettata/rifiutata, promemoria, annullamento), annullamento dal link, avvisi a sala/admin | `GET /public/prenota/{info,calendario,orari}`, `POST /public/prenota`, `GET/POST /public/prenota/annulla/{token}` (pubblici) | cliente | 🆕 |
| C-P-038 | «📋 Preventivo» nella riga aperta del Planning: crea il preventivo già impostato dalla prenotazione (o apre quello già collegato). Visibile solo a chi vede Clienti › Preventivi ed è admin/superadmin (le scritture dei preventivi sono admin) | `PrenotazioniPlanning.jsx` → `/clienti/preventivi/nuovo` con state `prenotazione`; `GET /preventivi?prenotazione_id=` | admin | 🆕 2026-10-20 |
| C-P-039 | Menù dell'evento confermato: quando un preventivo è confermato la prenotazione riceve `menu_evento` (menù scelto, prezzo, portate) e `preventivo_id` (mig 204; campi propri perché `menu_preset`/`nota_ristorante` li riscrive la sincronizzazione TheFork). Nel Planning 🍽️ nella riga e il menù in verde nella riga aperta | `GET /prenotazioni/planning/{data}` (campi `menu_evento`, `preventivo_id`); scritti da `app/services/evento_confermato_service.py` | tutti (lettura) | 🆕 2026-10-20 |
| C-P-040 | Widget prenotazioni incorporabile in un'altra pagina pubblica, con «Note per noi» precompilate (prima uso: pagina della gift card `/regalo`, nota «Gift card <codice>») | `Prenota.jsx:PrenotaIncorporata`, `widgetAttivo()` | cliente (pubblico) | 🆕 2026-10-25 |
| C-P-MCP1 | Strumenti MCP `prenotazioni_giorno`, `prenotazioni_periodo` (max 31 giorni, anche solo totali): ora, coperti, nome, stato, tavolo, note, allergie (niente telefono/email/preferenze) | `app/connettore/server.py` `_strumenti_prenotazioni` → `get_planning` | admin/sala/sommelier/contabile (Q / claude.ai) | 🆕 2026-10-16 |
| C-P-MCP2 | Strumento MCP `prenotazione_crea`: come «+ Nuova» (fonte manuale, `creato_da`/`prenotato_da` = «Q» o «claude (utente)»), cliente per id o ritrovato dal telefono, altrimenti errore con i possibili; non manda niente al cliente | `server.py` → `crea_prenotazione` + `search_clienti` | admin/sala/sommelier/contabile (Q / claude.ai) | 🆕 2026-10-16 |

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

Chiavi seed (da `init_clienti_db()` + migr. 050): `capienza_pranzo` (35), `capienza_cena` (50), `slot_pranzo` / `slot_cena` (JSON array orari), `soglia_pranzo_cena` (15:00 — prima = pranzo, dopo = cena), `giorni_anticipo_max` (60), `giorni_anticipo_min_ore` (2), `giorno_chiusura` (3), `durata_media_tavolo_min` (90, legacy), `durata_pranzo` (90) e `durata_cena` (120) (migr. 050), `widget_attivo` (0), `widget_messaggio_pieno`, `template_wa_conferma`, `template_wa_reminder`. Dalla mig 192: `cliente_frequente_visite` (5) — soglia del bollino «Frequente» (Impostazioni → Capienza & Turni → Bollino cliente).

UI: `/prenotazioni/impostazioni`, sidebar a 4 sezioni — **Capienza & Turni** (capienze, soglia, giorno chiusura, durate medie), **Slot Orari** (chips add/remove con anteprima), **Template Messaggi** (WA conferma/reminder con variabili e anteprima), **Widget Pubblico** (placeholder "In arrivo — Fase 3", checkbox disabilitata).

# 7. Schema DB (clienti.sqlite3)

Tabelle create idempotentemente da `init_clienti_db()` in `app/models/clienti_db.py` (non da migrazioni numerate, salvo 050 e 068):

- **`clienti_prenotazioni`** — base storica TheFork (data/ora pasto, stato, pax, tavolo, canale, occasione, note, yums/imprint, thefork_booking_id UNIQUE, thefork_customer_id, allergie_segnalate, tavolo_esterno, seggioloni, waiting_list…) + colonne del modulo: `turno` (pranzo/cena), `fonte` (manuale/thefork/widget), `creato_da`, `conferma_inviata`, `reminder_inviato`, `token_cancellazione`, `updated_at`, `nome_ospite`/`cognome_ospite` (snapshot migr. 068 per prenotazioni senza `cliente_id`). Indici su cliente, data, stato, thefork_*, turno, fonte, token.
- **`tavoli`** — nome UNIQUE, zona, posti_min/max, combinabile, posizione_x/y, larghezza/altezza, forma, attivo, note, ordine.
- **`tavoli_combinazioni`** — nome, `tavoli_ids` JSON, posti, uso_frequente, note.
- **`tavoli_layout`** — nome UNIQUE, `tavoli_attivi` JSON, `posizioni` JSON, attivo.
- **`prenotazioni_config`** — chiave/valore/descrizione (§6).
- **`prenotazioni_email_log`** — predisposta per la Fase 4, **mai scritta da nessun codice** (0 righe).
- **`prenotazioni_thefork_eventi`** (mig 189) — registro degli avvisi TheFork: tipo, uuid, payload grezzo, `stato` (ricevuto/fatto/ignorato/in_attesa/errore), tentativi, esito, ultimo errore (§12).

Migrazioni dedicate: `050_prenotazioni_durata_turni.py` (chiavi durata_pranzo/durata_cena), `068_prenotazioni_nome_ospite.py` (snapshot nome ospite, ~22% delle righe import senza Customer ID).

# 8. Integrazioni e mattoni

- **M.C WhatsApp composer** — usato: `from app.utils.whatsapp import build_wa_link, fill_template` nell'endpoint wa-link (C-P-010). I template sono in config, editabili da Impostazioni.
- **M.A Notifiche** — NON usato dal modulo (nessuna `crea_notifica`).
- **M.B PDF / M.D Email / M.F Alert** — non usati (niente PDF, niente email, nessun checker prenotazioni in `alert_engine`).
- **Widget Home / DashboardSala** — `GET /dashboard/home` include `prenotazioni` (count+pax pranzo/cena, lista con ora/nome/pax/nota/stato/turno, stati attivi RECORDED/SEATED/LEFT/ARRIVED/BILL) e la card modulo (line1 "N pax oggi", badge = n. prenotazioni). `DashboardSala.jsx` mostra la stessa lista filtrata per turno. Nota: il turno nel widget usa soglia fissa "15:00", non legge la config.
- **Import TheFork** — vive nel modulo Clienti (import XLSX `tfm-search-results`); il planning si limita a leggerne i dati e a backfillare `turno`/`fonte`.
- **Webhook TheFork (B2B API)** — §12. Scrive con le stesse funzioni dell'import XLSX (`app/services/clienti_thefork_service.py`), stessi id (uuid): niente doppioni con lo storico.

## 8.1 Piantina (prenotazioni 2.7, mig 193)

La **sala** è `tavoli.zona` (testo libero; le sale si ordinano col minimo `ordine` dei loro tavoli). `tavoli.forma`: `rect` | `circle` | `diamond`. Gli elementi che non si prenotano stanno in **`tavoli_elementi`** (zona, forma rect/circle, posizione, misure, colore, etichetta) e non compaiono mai nei menu di assegnazione. Componenti condivisi in `frontend/src/pages/prenotazioni/components/Piantina.jsx` (`FormaTavolo`, `FormaElemento`, `SchedeSale`, tela 1000×600). La piantina dell'osteria (31 tavoli, 23 elementi, copiata dagli screenshot di TheFork Manager il 16/10/2026) è in `locali/tregobbi/seeds/piantina_tavoli.json` e si carica da Editor Tavoli → «Importa piantina». Fix collegato: `GET /prenotazioni/tavoli` non restituiva posizione/misure/forma, quindi l'Editor non poteva disegnare i tavoli esistenti.

## 8.2 Tavoli bloccati (prenotazioni 2.10, mig 194)

`tavoli_blocchi` (data_pasto, turno, tavolo_id, motivo, creato_da; UNIQUE per giorno+turno+tavolo). Il tavolo resta sulla mappa, grigio tratteggiato con «🚫 bloccato», e non si assegna né compare come scelta nel form. Vale solo in TRGB: l'API TheFork non blocca i singoli tavoli, quindi la disponibilità online si governa con la chiusura delle fasce (vedi §12).

## 8.2b Tavoli dividibili (prenotazioni 2.12, mig 196)

`tavoli.dividibile` (0/1, dall'Editor) e `tavoli_divisioni` (data_pasto, turno, tavolo_id). Per quel turno mappa e disponibilità sostituiscono il tavolo con due metà virtuali: id `"<id>A"`/`"<id>B"`, nome `<nome>A`/`<nome>B`, posti_max divisi (A arrotonda per eccesso), sagoma tagliata sul lato lungo, `diviso_da`, `divisione_id`. Le prenotazioni si assegnano col nome della metà. Non si divide un tavolo assegnato o bloccato, né se esiste già un tavolo vero chiamato come una metà; non si riunisce se una metà ha una prenotazione. Le metà non si bloccano.

## 8.2c Sale aperte, capienza dai tavoli, combinazioni (prenotazioni 2.24, mig 214)

Verso la disponibilità per tavoli. `sale_config` (zona, aperta_default) e `sale_aperture` (data, turno, zona, aperta) → `prenotazioni_sale_service.py` (`elenco`, `aperte`, `capienza` = Σ posti_max dei tavoli attivi delle sale aperte meno i bloccati; None senza tavoli → `capienza_{turno}`). Endpoint `GET /prenotazioni/sale`, `PUT /sale/{zona}/default` (admin), `PUT /sale/{zona}/giorno` (admin, sala). Planning: `sale` per turno e capienza calcolata; mappa: `sale_stato`. Combinazioni: `tavoli_combinazioni` + `posti_min`, `zona`; `GET /tavoli/combinazioni/proposte` (coppie combinabili a ≤25 px), `PUT /tavoli/combinazioni/{id}` (posti/posti_min decisi a mano, es. capotavola: non è la somma). Durata: `durata_tavolo(config, turno, data)` — `durata_pranzo_lungo` nei `giorni_pranzo_lungo` (default sab, dom), e da `gruppo_turno_intero` coperti (10) occupato tutto il turno. Prolunghe (2.25, mig 215): `tavoli_combinazioni.prolunghe` (0 = nessuna); una combinazione è valida con ≥2 tavoli, oppure 1 tavolo con almeno una prolunga (400 altrimenti, anche in `PUT` che toglie la prolunga a un tavolo solo); il nome lo compone il frontend («0+1 + prolunga»). `prenotazioni_config.prolunghe_disponibili` (vuoto = non contare) sarà il limite del motore per turno. Config per il passo dopo: `soglia_online_tavolo` (6). Prossimi passi: motore di assegnazione per tavoli (sito, form, tavolo suggerito), chiusura automatica su TheFork.

## 8.3 Fasce orarie del servizio (prenotazioni 2.11, mig 195)

TRGB decide il servizio, TheFork è un canale. Le fasce sono gli slot di `slot_pranzo`/`slot_cena`; una prenotazione conta nella fascia dell'ultimo slot non successivo al suo orario (coperti = persone che arrivano). `prenotazioni_fasce` tiene solo le eccezioni del giorno (aperta, online_aperta, max_coperti, max_online, thefork_esito); default dei limiti in `prenotazioni_config.fascia_max_{coperti|online}_{pranzo|cena}` (vuoto = nessun limite). Ogni modifica va in `prenotazioni_fasce_log`. Service: `app/services/prenotazioni_fasce_service.py`.

Cosa arriva a TheFork: solo apri/chiudi online (`PUT /v1/restaurants/{id}/availabilities/override`, orari consecutivi a 15' in una chiamata). Chiudere la fascia in TRGB chiude anche l'online. I limiti per fascia valgono solo in TRGB (l'API non espone il pacing) e oggi **avvisano** nel form, non bloccano. Verifica: `GET /v1/restaurants/{id}/timeslots?date&partySize=2` (orari prenotabili online). Un errore TheFork resta scritto sulla fascia (⚠️) e nel registro.

## 8.4 Recensioni TheFork (prenotazioni 2.14, mig 197)

`thefork_recensioni` (una riga per `review_uuid`: voti globale/cibo/servizio/ambiente, prezzo/attesa/rumore, occasione, commento e stato di moderazione, risposta e suo stato, `letta`, json originale). Service `app/services/thefork_recensioni_service.py`; endpoint in `prenotazioni_thefork_router.recensioni_router` (`/prenotazioni/recensioni`). Arrivano: dal webhook se TheFork manda `entityType=review`; dal thread TheFork al massimo una volta l'ora (pasti degli ultimi 14 giorni: nuove + recenti + risposte ancora in moderazione); a mano dalla pagina (storico). `GET /v1/reviews` restituisce solo uuid → un `GET /v1/reviews/{id}` per recensione. Le date del filtro sono in UTC; `data_pasto` è convertita in ora locale. Collegamenti: `customerUuid` → cliente (alias compresi, il merge clienti sposta anche le recensioni), `reservationUuid` → prenotazione. Risposta: `PUT /v1/reviews/{id}/reply` nella lingua del cliente; torna in moderazione TheFork. Avviso M.A agli admin per una recensione nuova sotto `recensioni_soglia_avviso` (default 8/10).

## 8.5 Prenotazioni dal sito (prenotazioni 2.20, mig 205)

Service `app/services/prenotazioni_sito_service.py`, router pubblico `app/routers/prenotazioni_pubblico_router.py` (`/public/prenota`, nessun login), pagina `frontend/src/pages/public/Prenota.jsx` (rotte pubbliche `/prenota` e `/prenota/annulla/:token` in `App.jsx`, fuori dal login come `/carta`).

- **Disponibilità**: giorni da oggi a `giorni_anticipo_max`, almeno `giorni_anticipo_min_ore` prima; chiusure da `closures_config` (giorno fisso, giorni chiusi, turni chiusi) e da `giorno_chiusura`. Orari = fasce del turno; una fascia si vende se aperta e aperta online e se con la prenotazione non supera `max_coperti`, `max_online` (online = TheFork + sito) e `capienza_{turno}`. Le richieste (gruppi) guardano solo apertura.
- **Stati**: fino a `widget_max_automatica` → RECORDED; fino a `widget_max_richiesta` → REQUESTED (badge NUOVA nel Planning; accettare/rifiutare manda l'email al cliente via `dopo_cambio_stato` in `PATCH /{id}/stato`); oltre → «chiamaci». `fonte='sito'`, `canale='Sito'`, icona 🏠.
- **Cliente**: stesso telefono (ultime cifre) o email → cliente esistente (si completano solo campi vuoti); altrimenti nuovo (`origine='sito'`).
- **Email** (M.D `email_service`, testo semplice IT/EN): conferma, richiesta, accettata, rifiutata, promemoria (thread, ogni giorno dopo `widget_ora_promemoria`, per domani), annullata; in `prenotazioni_email_log`, una per tipo. Link di annullamento `{widget_url_pubblico}/prenota/annulla/{token_cancellazione}`.
- **Difese**: campo esca, tempo minimo 3 s, max 5 invii/10' per IP e 3/giorno per telefono, 240 letture/10' per IP; lock sul salvataggio (niente doppio ultimo posto). Con `widget_attivo=0` risponde solo a un admin loggato (anteprima).
- **Iframe**: la pagina manda `postMessage({type:'trgb-prenota-altezza'})`; codice da incollare in Impostazioni › Dal sito. Indirizzo pubblico dedicato **prenota.tregobbi.it** (2.21): su quell'host `App.jsx` apre solo la prenotazione e la pagina chiama `/api/public/prenota` sullo stesso indirizzo; nginx (`deploy/sites/prenota.tregobbi.it/nginx.conf`) inoltra solo quello, ogni altro `/api/` è 404, e permette l'iframe solo da tregobbi.it. Vedi deploy.md §«Prenotazioni dal sito». Le prenotazioni dal sito esistono solo in TRGB: TheFork non le vede.

# 9. Limiti noti e incoerenze

1. ~~**`giorno_chiusura`: mapping UI ≠ backend.**~~ Risolto in 2.13: la select usa la codifica del backend (0=domenica … 6=sabato, -1=nessuno); il valore in produzione era già corretto (3 = mercoledì).
2. ~~**Restrizione admin solo frontend.**~~ Risolto in 2.13: `PUT /config`, CRUD tavoli (`POST/PUT/DELETE /tavoli`, `PUT /tavoli/batch/posizioni`), layout e combinazioni richiedono admin lato server (M.G `solo_admin`). Le letture e l'assegnazione dei tavoli restano aperte a chi è loggato.
3. **Combinazioni tavoli senza UI.** Endpoint CRUD presenti (C-P-016) ma nessuna pagina li usa: `TavoliEditor` carica le combinazioni e non le mostra; si gestiscono solo via API. In compenso mappa e disponibilità spacchettano le combinazioni scritte a mano nel campo `tavolo` ("4+5").
4. **Campi Fase 4 inerti.** `token_cancellazione` viene generato a ogni POST ma mai consumato; `reminder_inviato` è usato dalla riconferma WhatsApp (2.8), `conferma_inviata` ancora no; `prenotazioni_email_log` mai scritta. Serviranno con widget + M.D Email.
5. **REQUESTED senza produttore.** La UI lo gestisce (badge NUOVA, conferma/rifiuta) ma oggi nessun flusso lo crea (widget assente).
6. Il widget Home calcola il turno con soglia hardcoded "15:00" invece della config (vedi §8).

# 10. Non implementato (dalla spec 2026-04) → roadmap §PR

- **Widget pubblico `/prenota`** (Fase 3): nessun endpoint `/public/prenotazioni/*`, pagina pubblica, CAPTCHA o rate limiting. → PR.1
- **Email transazionali** (Fase 4): conferma/reminder/cancellazione richiedono il mattone M.D. → PR.2 (il lato WA manuale c'è già: C-P-010)
- **Distacco TheFork Manager** (Fase 5). → PR.5. Dal 2026-10-16 le prenotazioni di TFM arrivano in tempo reale (§12): l'import XLSX non serve più per tenerle aggiornate, TFM resta il canale d'inserimento.
- No-show tracking su scheda CRM (PR.3), dashboard "stasera" (PR.4), lista d'attesa (PR.6), reminder automatico 24h (PR.9).

# 11. Storico — spec originale (2026-04-06), sintesi

La progettazione completa (721 righe) è nella history git di questo file (pre 2026-08). Punti che restano utili:

- **Obiettivo strategico:** eliminare la dipendenza da TheFork Manager (abbonamento + commissioni), tenendo TheFork solo come vetrina. TRGB come sistema unico per prenotazioni dirette, widget proprio sul sito, planning e conferme.
- **Dati del locale (analisi DB, aprile 2026):** ~450-540 prenotazioni/mese in alta stagione, 64% cena, 56% da 2 pax; canali storici: 60% offline, 24% portale TheFork, 7,5% walk-in, 7% widget TF; no-show 0,7%, cancellazioni 12,5% (niente anti-no-show aggressivo); 14 tavoli interni + 20 esterni stagionali + ~20 combinazioni; orari di punta 20:00-20:30 e 13:00.
- **Fasi:** 1 Agenda ✅ · 2 Mappa tavoli ✅ · 3 Widget pubblico ⏳ (slot precisi a cena, fascia libera a pranzo; disponibilità = capienza turno − coperti prenotati; stato `REQUESTED` da confermare; Cloudflare Turnstile + rate limiting; finestra min 2h / max 60gg) · 4 Conferme ⏳ (email via M.D con log in `prenotazioni_email_log`; WA prima manuale poi eventuale Business API) · 5 Distacco TFM ⏳ (import XLSX giornaliero, 2 settimane di parallelo, disdetta).
- **Decisioni prese (2026-04-06):** tutto in `clienti.sqlite3`, stessa tabella del CRM; tema indigo; conferme email + link WA manuale; layout salvabili obbligatori perché la sala cambia spesso.

# 12. Integrazione TheFork — webhook B2B API (2026-10-16)

TheFork ha dato all'osteria l'accesso alla B2B API (incluso nel piano Enterprise di TheFork Manager). TheFork avvisa TRGB a ogni prenotazione o cliente creato/modificato; TRGB rilegge i dettagli dall'API e aggiorna agenda e CRM.

**Flusso.** `POST https://trgb.tregobbi.it/prenotazioni/thefork/webhook?token=<THEFORK_WEBHOOK_TOKEN>` → controllo token (confronto a tempo costante) → riga in `prenotazioni_thefork_eventi` → risposta `{}` 200 subito → in background: token OAuth2 (client credentials, `https://auth.thefork.io/oauth/token`, audience `https://api.thefork.io`, valido 8600 s, in cache in memoria) → `GET /v1/reservations/{uuid}?include=tables,creditCardGuaranteeDetails` + `GET /v1/customers/{uuid}` su `https://api.thefork.io/manager` → `upsert_cliente` + `upsert_prenotazione`. Un'elaborazione alla volta (lock), per non avere doppi INSERT quando «creata» e «aggiornata» arrivano insieme.

**Sicurezza.** TheFork **non firma** i messaggi (niente HMAC nella documentazione): l'unica prova è il token nell'URL, scelto da noi e comunicato a TheFork una volta. Token sbagliato o assente → 401; token non configurato → 503 (webhook spento). Il payload contiene solo tipo e uuid: i dati veri arrivano sempre dall'API con le nostre credenziali, quindi un avviso falso non può scrivere dati inventati. Il token compare nei log di accesso di nginx (è nella query).

**Configurazione** (`.env` sul VPS, mai nel codice né nel DB): `THEFORK_WEBHOOK_TOKEN`, `THEFORK_CLIENT_ID`, `THEFORK_CLIENT_SECRET`; facoltativi `THEFORK_RESTAURANT_UUID` (scarta eventi di altri ristoranti del gruppo, serve al recupero periodo; se manca si usa l'ultimo visto), `THEFORK_API_URL`, `THEFORK_AUTH_URL`. Senza credenziali gli avvisi restano `in_attesa` e si rielaborano dopo con «Rielabora in sospeso».

**Mappatura** (stessi formati dell'import XLSX):

| TheFork API | TRGB |
|---|---|
| `reservationUuid` / `customerUuid` | `thefork_booking_id` / `thefork_customer_id` (gli stessi uuid dell'export XLSX) |
| `mealDate` | convertito nell'ora del locale (`locale.json` → `timezone`) → `data_pasto` `YYYY-MM-DD`, `ora_pasto` `HH:MM:SS`, `turno` dalla soglia in config. **Attenzione:** la documentazione dice «con l'offset del ristorante», ma in produzione arriva in UTC (16/10/2026: prima versione salvava le cene 2 ore prima; corretto in prenotazioni 2.4) |
| `status` + `mealStatus` | `stato`: CANCELED/NO_SHOW/REFUSED/REQUESTED da `status`, altrimenti l'avanzamento in sala (`mealStatus`) se c'è, altrimenti `status` — come la colonna unica «Status» dell'XLSX |
| `partySize`, `reservationChannel`, `restaurantNote`, `customerNote` | `pax`, `canale`, `nota_ristorante`, `nota_cliente` |
| `createdAt` | `data_prenotazione` nell'ora del locale (`locale.json` → `timezone`) |
| `tables[].name` | `tavolo` «4+5» — **solo se TheFork ne ha assegnati**: non cancella il tavolo dato in TRGB |
| `billAmount` | `importo_conto` «182.5 EUR» |
| `offerDetails` | `menu_preset` (menu preimpostato, nome it_IT) / `offerta_speciale` (promozione) |
| `creditCardGuaranteeDetails` | `imprint`, `importo_imprint` |
| `customFields` | `degustazione`, `allergie_segnalate`, `tavolo_esterno`, `seggioloni` (match sull'etichetta, come l'XLSX) |
| cliente | `clienti` con le regole dell'import: protetto → solo campi TheFork + vuoti + differenze in revisione; non protetto → sovrascrive. Tag VIP automatico. Data di nascita `dd/mm/yyyy`, paese per esteso, allergie/restrizioni unite con « \| » |

Solo all'inserimento: `fonte` (`widget` se canale «Booking Module», altrimenti `thefork`), `prenotato_da` (TheFork / Booking Module), `creato_da = 'thefork-api'`. Non toccati: `occasione`, `yums`, `waiting_list`, `sconto`, `spending_behaviour` (l'API non li dà o li dà in altra forma).

**Possibili doppioni** (prenotazioni 2.5, `app/services/prenotazioni_doppioni_service.py`). Una prenotazione TheFork e una senza id TheFork (inserita a mano), stesso giorno, entrambe attive, sono segnalate se coincide il **telefono** (anche il secondo numero), l'**email** o il **nome** (stesso primo nome + una parola del cognome in comune; se un nome manca, basta il cognome con gli stessi coperti). Calcolato al momento, niente stato salvato: badge «DOPPIONE?» nel Planning su tutte e due le righe (dettagli nella riga espansa), riga «⚠️ possibile doppione di #…» nell'esito dell'evento e notifica M.A agli admin quando la prenotazione TheFork è nuova. Non unisce niente: si cancella a mano quella in più. Sullo storico 2025-26 segnala una sola coppia (Petersen, 16/10/2026).

**Clienti inseriti a mano** (prenotazioni 2.5, `collega_cliente_esistente`). Se da TheFork arriva un cliente che TRGB non conosce per id, ma nel CRM c'è **un solo** cliente senza id TheFork con lo stesso telefono o la stessa email, gli si assegna l'id TheFork e viene aggiornato (regole dei protetti) invece di crearne un altro. Con più candidati non si collega niente. Telefoni dall'API: se arrivano già internazionali («+45…») si tengono così (prima `normalize_phone` metteva «39» davanti anche ai numeri esteri).

**Recupero automatico** (prenotazioni 2.6). Thread di sfondo nel backend (`avvia_recupero_periodico`, avviato da `main.py` se il modulo è attivo): ogni `THEFORK_RECUPERO_MINUTI` (default 15, `0` = spento; primo giro 5 minuti dopo l'avvio) rilegge le prenotazioni **modificate su TheFork ieri e oggi** e sistema solo quelle diverse da TRGB (`solo_se_cambia`: se i campi coincidono non chiede nemmeno il cliente). Nel registro finiscono solo quelle corrette, come `recupero_automatico`. Serve perché TheFork non rimanda un avviso perso (TRGB spento per push o riavvio). Stato e ultimo giro in Impostazioni → TheFork.

**Stati dell'evento.** `fatto` (con esito: «prenotazione inserita #id…»), `ignorato` (recensioni, altro ristorante, 404 su TheFork), `in_attesa` (credenziali mancanti), `errore` (API giù, 429…: TheFork non riprova dopo il nostro 200, si riprova dalle Impostazioni).

**UI.** Impostazioni Prenotazioni → **🍴 TheFork** (solo admin): stato collegamento, indirizzo webhook (token mascherato), «Prova connessione», «Rielabora in sospeso», «Recupera un periodo» (per data modifica o data pasto, max un anno / 2.000 prenotazioni), registro avvisi con «Riprova».

**Non fatto (di proposito).** Recensioni (gli avvisi arrivano e si ignorano); scrittura verso TheFork (creare/modificare prenotazioni da TRGB: l'API lo consente, scope `tfm-restaurant:reservations`); notifica M.A allo staff a ogni prenotazione nuova.

**Provato** su copia del DB con un finto server TheFork: token errato/assente 401, non configurato 503, JSON rotto 400; evento senza credenziali → in_attesa → rielaborato; prenotazione già importata da XLSX aggiornata senza doppioni (cliente collegato); prenotazione + cliente nuovi; cancellazione; recensione ignorata; 404; altro ristorante; recupero periodo; API irraggiungibile → errore → riprova; un solo token per tutta la prova; ruolo sala → 403; integrity_check ok. Import XLSX clienti e prenotazioni: risultati identici byte per byte fra codice vecchio e nuovo.
