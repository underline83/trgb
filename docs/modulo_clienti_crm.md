# Modulo Clienti / CRM — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-08
> **Vedi anche:** [modulo_prenotazioni.md](modulo_prenotazioni.md), [modulo_preventivi.md](modulo_preventivi.md), [modulo_statistiche.md](modulo_statistiche.md), [roadmap.md](roadmap.md) §CL

**Stato:** operativo. Sincronizzazione Mailchimp ✅ FATTA (CL.1). Altre voci CL in roadmap.
**Versione modulo (`versions.jsx`):** clienti **v3.1** · label "Gestione Clienti" · status beta. Non esiste una voce `mailchimp_sync` separata: il sync Mailchimp è parte del modulo clienti.
**Sezione top-level:** `/clienti/*` · **Backend prefix:** `/clienti/*` (`app/routers/clienti_router.py` + `app/routers/clienti_giftcard_router.py` con prefix `/clienti/giftcard`, montati in `main.py`)
**DB:** `locali/tregobbi/data/clienti.sqlite3` — path tenant-aware via `locale_data_path` (`app/models/clienti_db.py:20`). Il DB è condiviso con i moduli Prenotazioni e Preventivi.
**Roadmap:** sezione `CL.` di `docs/roadmap.md` (righe CL.1–CL.14)
**Documenti correlati:**
- `modulo_prenotazioni.md` — gestione operativa prenotazioni (cross-modulo, stesso DB)
- `modulo_preventivi.md` — preventivi eventi/banchetti (cross-modulo, stesso DB)
- `modulo_statistiche.md` — analisi vendite iPratico (separato)

---

# 0. Indice

1. Panoramica
2. Tabelle DB (`clienti.sqlite3`)
3. Endpoint backend (`clienti_router.py`)
4. Pagine frontend e route
5. CRM — funzioni base (anagrafica, ricerca, scheda, dashboard)
6. Segmentazione marketing (calcolo runtime + soglie configurabili)
7. Tag CRM
8. Import TheFork + coda revisione diff
9. Duplicati, merge e pulizia dati
10. Export e azioni marketing
11. Sincronizzazione Mailchimp ✅ FATTA (CL.1)
12. Cross-modulo Preventivi
13. Cross-modulo Prenotazioni
14. Roadmap CL
15. Anomalie note / punti aperti
16. Gift Card (v3.1)
17. WhatsApp del locale in sola lettura (v3.23)
18. Rubrica dei clienti sul telefono (v3.39)

---

# 1. Panoramica

Il modulo **Clienti / CRM** centralizza l'anagrafica clienti dell'osteria, lo storico delle visite, le preferenze, le allergie e la segmentazione marketing.

**Numeri (DB locale sincronizzato, agosto 2026):**
- 25.008 clienti (tutti `attivo=1`, tutti `origine='thefork'`)
- 32.513 prenotazioni storiche
- 2.962 alias da merge duplicati (`clienti_alias`)
- Database popolato a marzo 2026 dall'import iniziale TheFork Manager, mantenuto con re-import periodici XLSX

Il CRM lavora in tandem con:
- **Prenotazioni** — ogni prenotazione ha `cliente_id` FK; lo storico visite alimenta i segmenti marketing
- **Preventivi** — `clienti_preventivi.cliente_id` FK opzionale; tab Preventivi nella scheda cliente
- **Mailchimp** — sync manuale dei clienti con email + newsletter attiva (vedi §11)

---

# 2. Tabelle DB (`clienti.sqlite3`)

Schema definito in `app/models/clienti_db.py` (`init_clienti_db()`, eseguito all'import del router). Tabelle del modulo Clienti:

## 2.1 `clienti` (anagrafica)

Colonne reali (`app/models/clienti_db.py:43-91` + ALTER successivi):

| Gruppo | Colonne |
|---|---|
| Identità | `id`, `thefork_id` (UNIQUE), `titolo`, `nome`, `cognome`, `nome2`, `cognome2` (secondo intestatario per coppie) |
| Contatti | `email`, `telefono`, `telefono2`, `data_nascita` (TEXT, formato TheFork `dd/mm/yyyy`), `lingua` |
| Indirizzo | `indirizzo`, `cap`, `citta`, `paese` |
| CRM TheFork | `vip` (0/1), `rank` (TEXT: Gold/Silver/Bronze/Caution), `promoter`, `newsletter` (0/1), `risk_level`, `spending_behaviour` |
| Preferenze | `pref_cibo`, `pref_bevande`, `pref_posto`, `restrizioni_dietetiche`, `allergie`, `note_thefork` |
| Stato | `attivo` (soft delete), `origine` (`thefork`/`manuale`), `protetto` (se 1 l'import TheFork non sovrascrive: le differenze finiscono in coda diff §8) |
| Date | `thefork_created`, `thefork_updated`, `created_at`, `updated_at` (trigger) |

> ⚠ **Non esistono** le colonne `compleanno_giorno`/`compleanno_mese`, `tags`, `segmento_marketing`, `newsletter_attiva`, né un rank numerico 1-5 (erano descritte in una versione precedente di questa pagina, mai implementate così). Il compleanno si interroga con `substr(data_nascita,1,5)`; i tag stanno in tabelle dedicate (§7); il segmento è calcolato runtime (§6).

## 2.2 `clienti_prenotazioni` (storico visite)

Colonne reali (`app/models/clienti_db.py:151-197` + ALTER `:289-308`): `id`, `cliente_id` FK, `thefork_customer_id`, `thefork_booking_id` (UNIQUE), `data_pasto`, `ora_pasto`, `stato`, `pax`, `tavolo`, `canale`, `occasione`, `nota_ristorante`, `nota_cliente` (singolare), `data_prenotazione`, `prenotato_da`, `importo_conto`, `sconto`, `menu_preset`, `offerta_speciale`, `yums`, `imprint`, `importo_imprint`, `degustazione`, `allergie_segnalate`, `tavolo_esterno`, `seggioloni`, `waiting_list`, `created_at` + colonne del modulo Prenotazioni: `turno`, `fonte`, `creato_da`, `conferma_inviata`, `reminder_inviato`, `token_cancellazione`, `updated_at`, `nome_ospite`, `cognome_ospite` (snapshot da migrazione 068).

- **Stati presenti nel DB** (10): `SEATED`, `CANCELED`, `RECORDED`, `ARRIVED`, `LEFT`, `NO_SHOW`, `REFUSED`, `REQUESTED`, `BILL`, `PARTIALLY_ARRIVED`. Le query "visita completata" usano `('SEATED','ARRIVED','BILL','LEFT')`.
- **Canali presenti nel DB**: `Offline`, `TheFork`, `Walk-in`, `Booking Module`, `TripAdvisor`, `Michelin`.
- Dettaglio operativo prenotazioni: vedi [modulo_prenotazioni.md](modulo_prenotazioni.md).

## 2.3 Tabelle di supporto CRM

| Tabella | Scopo |
|---|---|
| `clienti_tag` | Tag configurabili: `nome` UNIQUE, `colore`, `ordine`. Default seed: VIP, Abituale, Occasionale, Aziendale, Turista, Stampa, Amico |
| `clienti_tag_assoc` | M:N cliente↔tag con flag `auto` (0=manuale dal CRM, 1=assegnato dall'import) |
| `clienti_note` | Diario interazioni: `tipo` (nota/telefonata/evento/reclamo/preferenza), `testo`, `data`, `autore` |
| `clienti_alias` | Merge duplicati: mappa i `thefork_id` dei clienti assorbiti verso il cliente principale, così i re-import li riconoscono |
| `clienti_no_duplicato` | Coppie marcate "non è un duplicato" (es. coniugi con stesso telefono), escluse dai suggerimenti |
| `clienti_profilo` | Segmento e stelle calcolati, uno per cliente attivo (mig 236, §6) — scritto da `clienti_profilo_service` |
| `clienti_rubrica_accessi` | Accessi alla rubrica del telefono, uno per telefono: `nome`, `utente` UNIQUE, `password_hash` (pbkdf2), `creato_da/il`, `ultimo_accesso`, `revocato_il` (mig 238, §18) |
| `clienti_import_diff` | Coda revisione: differenze campo-per-campo tra CRM (cliente `protetto`) e TheFork trovate all'import o dal webhook; `stato` pending / applica / ignora (scelte di Marco) / auto_applica / auto_ignora (chiuse dalle regole, §8). UNIQUE(cliente, campo, stato): una decisione nuova sostituisce la vecchia dello stesso campo |
| `clienti_impostazioni` | Chiave/valore: soglie segmenti `seg_*` (§6) + `preventivi_luoghi` |

## 2.4 Tabelle di altri moduli nello stesso DB

- `clienti_preventivi`, `clienti_preventivi_righe`, `clienti_preventivi_template`, `clienti_preventivi_menu`, `clienti_preventivi_menu_righe`, `clienti_menu_template`, `clienti_menu_template_righe` → vedi [modulo_preventivi.md](modulo_preventivi.md)
- `tavoli`, `tavoli_combinazioni`, `tavoli_layout`, `prenotazioni_config`, `prenotazioni_email_log` → vedi [modulo_prenotazioni.md](modulo_prenotazioni.md)

---

# 3. Endpoint backend (`app/routers/clienti_router.py`)

Router unico con prefix `/clienti`, tag "Clienti". **Tutti gli endpoint richiedono JWT** (`Depends(get_current_user)`). Trailing slash obbligatorio sugli endpoint root (`GET /clienti/`, `POST /clienti/`).

## 3.1 Anagrafica (CRUD + ricerca)

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| GET | `/clienti/` | Lista con filtri: `q` (full-text su 10 campi: nome, cognome, nome2, cognome2, email, telefono, note_thefork, allergie, pref_cibo, pref_bevande), `vip`, `tag_id`, `rank`, `segmento`, `attivo`, `compleanno_entro_giorni`, `con_email`, `con_telefono`, `ordine` (9 ordinamenti), paginazione `limit`/`offset`. Ogni riga esce con `tags`, `n_prenotazioni`, `ultima_visita`, `prima_visita`, `visite_periodo` e `segmento` calcolato | :1824 |
| GET | `/clienti/{cliente_id}/consumi` | 🆕 2026-10-18 — Cosa ha mangiato e speso: conti di cassa iPratico collegati al cliente (direttamente o tramite le sue prenotazioni), visite, spesa totale/media a visita/a coperto, piatti più presi, da bere per spesa. Via servizio platform `abbinamento_conti_service.consumi_cliente` (dati nel modulo cassa, `modulo_vendite.md` §12) | `clienti_router.py:get_cliente_consumi` |
| GET | `/clienti/{cliente_id}` | Dettaglio con tag, note, ultime 50 prenotazioni e `prenotazioni_stats` (totale, completate, no_show, cancellate, pax medio, prima/ultima visita) | :2028 |
| POST | `/clienti/` | Crea cliente (default `origine='manuale'`) | :2099 |
| PUT | `/clienti/{cliente_id}` | Modifica cliente; imposta **sempre `protetto=1`** (i dati editati a mano non vengono più sovrascritti dall'import) | :2139 |
| DELETE | `/clienti/{cliente_id}` | Soft delete (`attivo=0`) | :2191 |

## 3.2 Tag

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| GET | `/clienti/tag/lista` | Lista tag | :175 |
| POST | `/clienti/tag` | Crea tag (nome, colore, ordine) | :185 |
| DELETE | `/clienti/tag/{tag_id}` | Elimina tag + associazioni | :202 |
| POST | `/clienti/{cliente_id}/tag/{tag_id}` | Associa tag al cliente (e lo converte in manuale, `auto=0`) | :2211 |
| DELETE | `/clienti/{cliente_id}/tag/{tag_id}` | Rimuove tag dal cliente | :2234 |

## 3.3 Note / diario

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| POST | `/clienti/{cliente_id}/note` | Aggiunge nota (tipo, testo, data, autore = utente loggato se assente) | :2255 |
| DELETE | `/clienti/{cliente_id}/note/{nota_id}` | Elimina nota | :2278 |

## 3.4 Dashboard e segmenti

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| GET | `/clienti/dashboard/stats` | KPI CRM: totale, vip, con email/telefono/allergie/preferenze/compleanno, distribuzione per rank/lingua/tag, nuovi 30gg, compleanni prossimi 7 giorni | :103 |
| GET | `/clienti/segmenti/conteggi` | Conteggio clienti per segmento (abituale, occasionale, nuovo, in_calo, perso, mai_venuto) + totale attivi, con email, con telefono | :1747 |
| GET | `/clienti/prenotazioni/lista` | Lista globale prenotazioni con filtri `q`, `stato`, `canale`, `data_da`/`data_a`, `cliente_id`, paginazione | :1417 |
| GET | `/clienti/prenotazioni/stats` | Stats prenotazioni (per stato, canale, mese; pax medio; no-show; cancellazioni; top 20 clienti; anni disponibili; filtro `anno`) | :1499 |

## 3.5 Import / export

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| POST | `/clienti/import/thefork` | Import clienti da XLSX TheFork. Upsert su `thefork_id` (anche via `clienti_alias`). Cliente `protetto`: aggiorna solo campi TheFork-specifici + riempie i vuoti + salva le differenze in `clienti_import_diff`. Cliente non protetto: sovrascrive. Auto-tag VIP (`auto=1`) | :324 |
| POST | `/clienti/import/prenotazioni` | Import prenotazioni da XLSX TheFork. Upsert su `thefork_booking_id`, collega `cliente_id` via `thefork_id`/alias, salva snapshot `nome_ospite`/`cognome_ospite` | :566 |
| GET | `/clienti/import/diff` | Coda revisione differenze (raggruppate per cliente), filtri `stato` e `cliente_id` (scheda cliente); `totale` = quante in tutto | `lista_import_diff` |
| GET | `/clienti/import/diff/count` | Conteggio diff pending (badge sulla tab Impostazioni) | :1328 |
| POST | `/clienti/import/diff/risolvi` | Applica o ignora una o più diff (`azione: applica|ignora`, whitelist campi anti-injection). Logica in `clienti_thefork_service.risolvi_differenze` | `risolvi_import_diff` |
| POST | `/clienti/import/diff/riordina` | **admin**. Riapplica le regole (§8) alla coda: `prova=true` conta soltanto, `false` chiude e applica. Ritorna chiuse / applicate / restano, anche per campo | `riordina_import_diff` |
| GET | `/clienti/export/google-csv` | Export CSV formato Google Contacts (tag → gruppi `* TRGB`, note combinate, birthday convertito in `yyyy-mm-dd`); query `solo_attivi`, `solo_con_contatto` | :217 |

## 3.6 Duplicati, merge, pulizia

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| POST | `/clienti/merge` | Merge manuale: il secondario è assorbito dal principale (prenotazioni, note, tag, alias, campi complementari vuoti); secondario eliminato, principale marcato `protetto=1` | :792 |
| GET | `/clienti/merge/auto-preview` | Preview dei duplicati "ovvi" (stesso telefono+cognome o stessa email+cognome; principale = più prenotazioni > protetto > id più basso) | :1015 |
| POST | `/clienti/merge/auto` | Esegue l'auto-merge di tutti i gruppi ovvi | :1049 |
| GET | `/clienti/duplicati/suggerimenti` | Suggerimenti duplicati per `tipo` telefono / email / nome (o tutti), rispetta le esclusioni | :1124 |
| POST | `/clienti/duplicati/escludi` | Marca un gruppo di ID come "non duplicati" (`clienti_no_duplicato`) | :1243 |
| POST | `/clienti/pulizia/telefoni-placeholder` | Svuota i telefoni finti TheFork (+39 e soli zeri, numeri < 10 cifre) | :1597 |
| POST | `/clienti/pulizia/normalizza-testi` | Title Case intelligente su nome/cognome/nome2/cognome2/città (gestisce D'Amico, De Luca; non tocca mixed case) | :1648 |

## 3.7 Impostazioni e Mailchimp

| Metodo | Path | Cosa fa | Riga |
|---|---|---|---|
| GET | `/clienti/impostazioni` | Legge `clienti_impostazioni` (chiave, valore, descrizione) | :1706 |
| PUT | `/clienti/impostazioni` | Aggiorna una o più chiavi (body `{chiave: valore}`) | :1720 |
| GET | `/clienti/mailchimp/status` | Stato connessione Mailchimp (vedi §11) | :2299 |
| POST | `/clienti/mailchimp/sync` | Sync clienti → Mailchimp (vedi §11) | :2311 |

## 3.8 Ricerca autocomplete (cross-modulo)

Non esiste `GET /clienti/search`. L'autocomplete cliente usato dal form prenotazioni e dalla scheda preventivo è **`GET /prenotazioni/clienti/search?q=`** (`app/routers/prenotazioni_router.py:491`, min 2 caratteri). La ricerca interna al CRM usa `GET /clienti/?q=`.

---

# 4. Pagine frontend e route

File in `frontend/src/pages/clienti/`. Route in `frontend/src/App.jsx:458-475`. Voce menu in `modulesMenu.js:129-139` ("Gestione Clienti", icona 🤝, palette teal).

| File (@version) | Route | Funzione |
|---|---|---|
| — (ModuleRedirect) | `/clienti` | Redirect al primo target permesso: dashboard → lista → prenotazioni → preventivi → impostazioni (`App.jsx:459-467`) |
| `ClientiLista.jsx` (v3.4-mattoni) | `/clienti/lista` (sub `lista`) | Anagrafica: sidebar filtri, dettaglio inline, nota rapida, barra marketing (§10) |
| `ClientiScheda.jsx` (v2.2-mattoni) | `/clienti/:id` (sub `lista`) | Scheda cliente completa (§5.3), anche in modalità embedded dentro la lista |
| `ClientiPrenotazioni.jsx` (v1.1-mattoni) | `/clienti/prenotazioni` | Vista globale prenotazioni storiche con filtri, ricerca, paginazione |
| `ClientiPreventivi.jsx`, `ClientiPreventivoScheda.jsx` | `/clienti/preventivi`, `/clienti/preventivi/:id` | Modulo Preventivi — vedi [modulo_preventivi.md](modulo_preventivi.md) |
| `ClientiDashboard.jsx` (v1.3-mattoni) | `/clienti/dashboard` (sub `dashboard`) | Dashboard CRM (§5.4) |
| `ClientiImpostazioni.jsx` (v2.1-mattoni) | `/clienti/impostazioni[/:section]` (sub `import`, tab visibile solo admin/superadmin) | Layout sidebar con 7 sezioni: segmenti, template_preventivi, menu_templates, luoghi_preventivi, import, duplicati, mailchimp |
| `ClientiImport.jsx` (v2.0-mattoni) | — (embedded in Impostazioni → Import/Export) | Upload XLSX clienti + prenotazioni, revisione diff (con «Riordina la coda con le regole»), export Google CSV |
| `DiffTheFork.jsx` | componente | Righe differenze CRM ↔ TheFork con Applica/Ignora (`DiffRighe`), riquadro scheda cliente (`DiffTheForkCliente`), `CAMPO_LABELS` — usato da `ClientiImport` e `ClientiScheda` |
| `ClientiDuplicati.jsx` (v1.3-mattoni) | — (embedded in Impostazioni → Duplicati) | Suggerimenti duplicati, merge guidato, auto-merge, pulizia telefoni |
| `ClientiMailchimp.jsx` (v1.1-mattoni) | — (embedded in Impostazioni → Mailchimp) | Stato connessione + sync (§11) |
| `ClientiMenuTemplates.jsx` | — (embedded in Impostazioni → Menu Template) | Libreria menu per preventivi — vedi [modulo_preventivi.md](modulo_preventivi.md) |
| `ClientiNav.jsx` (v1.2) | componente | Tab bar: Anagrafica, Prenotazioni, Preventivi, Dashboard, Impostazioni (con badge amber = diff import pending) |

> Nota: `ClientiMenu.jsx`, `ClientiAnagrafica.jsx`, `ClientiNuovo.jsx`, `ClientiSegmenti.jsx` e le route `/clienti/anagrafica`, `/clienti/segmenti`, `/clienti/mailchimp` **non esistono** (comparivano in una versione precedente di questa pagina). Import, Duplicati e Mailchimp sono sezioni della pagina Impostazioni, non pagine standalone.

---

# 5. CRM — funzioni base

## 5.1 Anagrafica

- CRUD via API (§3.1). L'edit dalla scheda (PUT) marca il cliente `protetto=1`: da quel momento l'import TheFork non sovrascrive più i suoi campi ma mette le differenze in coda revisione (§8).
- Delete = soft delete (`attivo=0`); il filtro lista "mostra inattivi" li fa riemergere.
- `nome2`/`cognome2`: secondo intestatario per coppie che prenotano con lo stesso contatto (riempiti dal "merge come coppia", §9).

## 5.2 Ricerca

`GET /clienti/?q=` fa match LIKE su 10 campi (nomi, contatti, note, allergie, preferenze). L'autocomplete dei form Prenotazioni/Preventivi usa invece `/prenotazioni/clienti/search` (§3.8).

## 5.3 Scheda cliente (`ClientiScheda.jsx`)

- 🆕 **v3.7 (2026-10-19, redesign bozzetto A — `redesign_clienti_prenotazioni.md`)**: fascia verde petrolio con iniziali, nome, rank, 2 etichette, «dal anno»; 3 numeri (visite = prenotazioni completate, spesa media a visita e a coperto dai conti di cassa, ultima volta); azioni Chiama (`tel:`), WhatsApp (M.C `openWhatsApp`), Prenota (apre `PrenotazioniForm` con `defaultCliente`); «Da sapere in sala» (allergie+restrizioni in rosso se presenti, prossima prenotazione, piatti/vino che prende, preferenze, ultima nota).
- **Linguette**: `visite` (linea del tempo: prenotazioni passate + conti di cassa collegati per `prenotazione_id`, piatti del conto, «conto da confermare») | `note` | `preventivi` | `altro` (anagrafica e preferenze con modifica, etichette, spesa e piatti, recensioni TheFork, unione doppioni).
- «Modifica» in testata porta su Altro in modalità modifica; Salva/Annulla in testata.
- **Merge**: sposta anche i conti di cassa collegati (`abbinamento_conti_service.sposta_cliente`).
- **Tab Preventivi**: fetch `GET /preventivi?cliente_id=` (router preventivi) + CTA "Nuovo preventivo" → `/clienti/preventivi/nuovo` (`ClientiScheda.jsx:782,807`).
- **Merge manuale** dal pannello scheda: ricerca del duplicato, preview, opzione **"merge come coppia"** che salva nome/cognome del secondario come `nome2`/`cognome2` del principale (`ClientiScheda.jsx:92-247`).
- Tipi nota: nota 📝, telefonata 📞, evento 🎉, reclamo ⚠️, preferenza 🍽️.
- 🆕 **v3.34 (2026-11-14)**: in testa alla linguetta Anagrafica, riquadro ambra **«TheFork dice»** con le differenze pending di quel cliente (Applica / Ignora, anche tutte insieme); compare solo se ce ne sono e solo ad admin (§8).

## 5.4 Dashboard (`ClientiDashboard.jsx`)

KPI reali (da `/clienti/dashboard/stats` + `/clienti/prenotazioni/stats`):
- Card clienti: totale, VIP, con email, nuovi ultimi 30gg
- Card prenotazioni: totale, pax medio, no-show (con %), cancellazioni (con %)
- **Compleanni prossimi 7 giorni** con CTA WhatsApp (template `WA_TEMPLATES.compleanno`, mattone M.C) ed email `mailto:` di auguri
- Top 20 clienti per visite, distribuzione per rank, prenotazioni per canale, andamento mensile 12 mesi, distribuzione per tag, copertura contatti

---

# 6. Segmenti e stelle (rank TRGB)

> **Dal 2026-11-16 (clienti 3.36, mig 236, sistema 6.2).** Decisione di Marco: il rank di TheFork (Gold/Silver/Bronze/Caution) **resta in scheda come informazione ma non conta più**; TRGB ha un rank suo a **stelle** e **segmenti ritarati** sui dati veri (prima gli «abituali» erano 12 con la soglia di 5 visite in 12 mesi). Le due cose sono indipendenti: il segmento dice **a che punto è il rapporto**, le stelle **quanto vale il cliente per noi**.

**Dove vive il calcolo.** `app/services/clienti_profilo_service.py` (servizio platform del modulo clienti) scrive la tabella `clienti_profilo` (una riga per cliente attivo: segmento, punti, stelle nere/argento, scontrino medio, visite, prima/ultima visita, no-show, eventi, attenzione). Ricalcolo completo una volta al giorno (thread `clienti-profilo`, dopo le 4; al primo avvio subito; ~0,2 s per 26.000 clienti; la fine dell'ultimo giro completo sta in `clienti_impostazioni.profilo_ultimo_ricalcolo` — dal 3.38, prima si deduceva dalla tabella e le righe calcolate al volo bloccavano il primo giro), quando si salvano le soglie e con «Ricalcola adesso»; il singolo cliente si ricalcola quando si apre la sua scheda, e quelli senza riga (nuovi da oggi) al volo in lista e nel Planning. Visite = **giorni distinti** con una prenotazione in uno stato «venuto» (`prenotazioni_stati.gruppo("venuto")`), solo passati. Prima le stesse regole erano copiate in 4 punti di `clienti_router.py` (conteggi, filtro lista, riga lista, Mailchimp): ora leggono tutti `clienti_profilo`.

## 6.1 Segmenti (8, uno per cliente, in quest'ordine)

| Segmento | Regola (soglie default) | Colore |
|---|---|---|
| `nuovo` | prima e unica visita negli ultimi 90 giorni (`seg_nuovo_giorni`) | viola |
| `di_casa` | almeno 3 visite negli ultimi 12 mesi (`seg_dicasa_visite`, `seg_dicasa_mesi`) | verde scuro |
| `affezionato` | almeno 2 visite negli ultimi 24 mesi e l'ultima entro 12 (`seg_affezionato_visite`, `seg_affezionato_mesi`, `seg_attivo_mesi`) | verde chiaro |
| `in_calo` | tornava (2+ visite) ma l'ultima è di 12-24 mesi fa (`seg_attivo_mesi`, `seg_recente_mesi`) | ambra — l'unico che chiede di fare qualcosa |
| `una_volta` | una visita sola negli ultimi 24 mesi (`seg_recente_mesi`) | azzurro |
| `dormiente` | ultima visita tra 2 e 5 anni fa (`seg_perso_anni`) | grigio |
| `perso` | ultima visita oltre 5 anni fa | grigio chiaro |
| `mai_venuto` | nessuna visita registrata (solo annullate/no-show, o solo anagrafica) | bordo tratteggiato |

Al 2026-11-16 (copia del 13/11): Di casa 34, Affezionato 215, Nuovo 388, Una volta 3.760, In calo 302, Dormiente 5.021, Perso 5.420, Mai venuto 10.998. Da noi tornare è raro: negli ultimi 12 mesi 2.397 clienti su 2.540 sono venuti una volta sola; per chi torna, la mediana tra due visite è ~4 mesi.

## 6.2 Stelle (massimo 6)

- **★ nere (0-3) — quanto viene.** Punti: 10 per visita negli ultimi 24 mesi (tetto 60) + 3 per visita più vecchia (tetto 15) + 15 per evento confermato da preventivo (`clienti_preventivi.stato` confermato/prenotato) − 15 per no-show. ★ da 10, ★★ da 20, ★★★ da 40 punti. La spesa NON entra nelle nere (sarebbe contata due volte). Le gift card no: `clienti_giftcard.cliente_id` è chi la riceve, non chi la compra. Oggi: 4.473 / 292 / 54.
- **★ argento (0-2) — quanto spende.** Scontrino medio **a coperto** (non a conto: un tavolo da 8 non vale più di una coppia) dai conti di cassa abbinati al cliente o a una sua prenotazione (`abbinamento_conti_service.spesa_per_cliente`, stessa regola della scheda), da settembre 2024: ★ da 75 €, ★★ da 90 €. Senza conti abbinati niente argento: il dato non c'è, non «spende poco». Oggi: 882 / 412.
- **★ oro (0-1) — la mette solo Marco.** `clienti.stella_oro` (+ `stella_oro_da`, `stella_oro_il`), dal riquadro «Stelle e segmento» della scheda; `PUT /clienti/{id}/stella-oro` con `solo_superadmin` (l'admin no). **I VIP di TheFork ce l'hanno in automatico** (Marco 16/11, mig 237, clienti 3.37): oro effettivo = `stella_oro = 1` oppure `vip = 1` e non `stella_oro_tolta`. Toglierla a un VIP segna `stella_oro_tolta = 1` (non torna anche se TheFork lo tiene VIP); rimetterla la segna a mano. Espressione unica `clienti_profilo_service.ORO_SQL` / `oro_effettivo()`, usata da lista, filtri, ordine, conteggi, Planning; la scheda dice da dove viene («automatica: è VIP su TheFork», «messa da…», «tolta da…»). Al 16/11: 37 VIP.
- **«Attenzione»** (etichetta rossa, indipendente dalle stelle): dai 2 no-show in su (`attenzione_noshow`).

Colori: nere `text-neutral-900`, argento `text-slate-400`, oro `text-amber-400`; i segmenti hanno solo colore (niente emoji), il rosso è riservato ad «Attenzione». Componenti condivisi in `frontend/src/pages/clienti/ProfiloCliente.jsx` (`Stelle`, `SegmentoPill` anche compatta a pallino, `Attenzione`, `SchedaStelle`).

## 6.3 Soglie configurabili

Tutte in `clienti_impostazioni` (mig 236), da **Clienti › Impostazioni › Segmenti e stelle**: `seg_*` (8) e `stelle_*`, `argento_soglia_1/2`, `attenzione_noshow` (13). «Salva e ricalcola» controlla che le soglie crescano e ricalcola subito. Le chiavi vecchie (`seg_abituale_min`, `seg_occasionale_min`, `seg_finestra_mesi`, `seg_nuovo_max_visite`, `seg_perso_giorni`) restano nel DB ma non si usano più.

## 6.4 Dove si vedono

- **Lista clienti**: stelle + pillola del segmento + «Attenzione» sulla seconda riga; chip Tutti / Di casa / Affezionati / Nuovi / In calo / ★ Oro; in «Altri filtri» segmento, stelle nere, stelle argento; ordine «Stelle, più alte prima». Via il rank TheFork (pillola, filo colorato, filtro) e la ★ VIP davanti al nome.
- **Scheda**: stelle su fondo bianco e segmento in testata (avatar ambra se c'è la stella oro); riquadro «Stelle e segmento» in Anagrafica col perché (punti voce per voce, scontrino medio, soglie), bottone stella oro per il superadmin, rank TheFork come riga informativa. Il VIP di TheFork diventa la pillola grigia «VIP TheFork».
- **Planning** (prenotazioni 2.36): stelle e pallino del segmento accanto al nome, al posto della ⭐ VIP.
- **Newsletter** (Mailchimp): merge field `SEGMENTO` e tag `segmento:<nome>` coi nomi nuovi.

## 6.5 Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CL-S01 | Calcolo di segmenti e stelle (tutti / un cliente), ricalcolo notturno | `clienti_profilo_service.py:ricalcola`, `avvia_periodico` | sistema | 🆕 |
| C-CL-S02 | Conteggi per segmento, stelle, oro, attenzione | `GET /clienti/segmenti/conteggi` | admin, sala | 🆕 |
| C-CL-S03 | Filtri e ordine per stelle e segmento nella lista | `GET /clienti/?segmento=&stelle_min=&argento_min=&oro=&attenzione=&ordine=stelle_desc`, `ClientiLista.jsx` | admin, sala | 🆕 |
| C-CL-S04 | Stella oro (solo superadmin) | `PUT /clienti/{id}/stella-oro`, `ProfiloCliente.jsx:SchedaStelle` | superadmin | 🆕 |
| C-CL-S05 | Perché delle stelle nella scheda | `GET /clienti/{id}` → `profilo`, `SchedaStelle` | admin, sala | 🆕 |
| C-CL-S06 | Soglie e «Ricalcola adesso» | `POST /clienti/profilo/ricalcola` (admin), `ClientiImpostazioni.jsx:SegmentiSection` | admin | 🆕 |

---

# 7. Tag CRM

- Tabelle `clienti_tag` + `clienti_tag_assoc` (§2.3), **non** una colonna JSON/CSV sul cliente.
- Tag seed: **VIP, Abituale, Occasionale, Aziendale, Turista, Stampa, Amico** (`clienti_db.py:117-126`), ognuno con colore hex e ordine.
- Flag `auto` sull'associazione: l'import TheFork assegna/rimuove il tag VIP in automatico (`auto=1`) seguendo il flag VIP TheFork, ma **non tocca mai i tag messi a mano** (`auto=0`). Associare un tag dalla scheda lo converte in manuale.
- UI: toggle chip nella scheda cliente; filtro per tag nella lista; distribuzione per tag in dashboard.
- Creazione/eliminazione tag: solo via API (`POST /clienti/tag`, `DELETE /clienti/tag/{id}`) — non c'è una UI di gestione tag (vedi §15).

---

# 8. Import TheFork + coda revisione diff

Flusso in **Impostazioni → Import / Export** (`ClientiImport.jsx`):

1. **Import clienti** (XLSX export TheFork) → `POST /clienti/import/thefork`. Upsert per `thefork_id`, riconosce anche gli ID assorbiti nei merge via `clienti_alias`. Telefoni placeholder scartati. Esito: inseriti / aggiornati / errori / diff trovati.
2. **Import prenotazioni** (XLSX) → `POST /clienti/import/prenotazioni`. Upsert per `thefork_booking_id`, collega il cliente, salva snapshot nome ospite.
3. **Revisione diff**: per i clienti `protetto`, un campo diverso tra CRM e TheFork passa dalle **regole** (`clienti_thefork_service.valuta_differenza`, 2026-11-14 — Marco: «le cose descrittive sul nostro programma devono avere la priorità»). Vale per l'import XLSX e per il webhook TheFork:
   - vuoto nel CRM → si riempie con TheFork;
   - uguali a meno di maiuscole, accenti, spazi e punteggiatura → niente;
   - **nome, cognome, titolo** → resta il CRM, niente in coda (quasi sempre è un'altra persona che ha prenotato con lo stesso telefono);
   - **lingua** → TheFork vale solo se nel CRM c'è ancora quella di partenza (default della colonna `clienti.lingua`, oggi `it_IT`), altrimenti resta la nostra;
   - **telefono** → stesso numero con prefisso diverso: si corregge da solo solo il refuso a cifre invertite (`+93…` nel CRM, `+39…` in TheFork, prefisso preso da `normalize_phone`); prefisso aggiunto/tolto o refuso di TheFork → resta il nostro; numero TheFork non valido → niente;
   - **email** → alias Apple (`@privaterelay.appleid.com`) in TheFork → resta la nostra; alias nel CRM e indirizzo vero in TheFork → si prende quello vero;
   - tutto il resto diverso davvero → **coda** (`clienti_import_diff`, pending).
   Un **Ignora** di Marco viene ricordato: la stessa coppia (campo, valore TheFork) non torna in coda. La UI (Impostazioni › Import) mostra la coda raggruppata per cliente con **Applica** / **Ignora** e **«Riordina la coda con le regole»** (anteprima, poi Procedi → `POST /clienti/import/diff/riordina`), utile dopo un cambio di regole. Le stesse righe compaiono nella **scheda cliente** (riquadro «TheFork dice», solo admin, componente condiviso `DiffTheFork.jsx`). Il conteggio pending è il badge amber sulla tab Impostazioni (`ClientiNav.jsx`).
   Al 2026-11-14 la coda era 3043, quasi tutta arretrata: ~1970 di sole maiuscole dall'import di luglio (prima del confronto case-insensitive), il resto dall'import completo del 3 ottobre. Con le regole: 2772 chiuse, 144 applicate, 127 da guardare (telefoni ed email cambiati davvero).
4. **Export Google CSV** (§10).

## 8.1 Capability (coda differenze TheFork)

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CL-T01 | Regole sulle differenze di un cliente protetto (applica / ignora / in coda), «Ignora» ricordato | `clienti_thefork_service.py:valuta_differenza`, `upsert_cliente` | sistema (import XLSX, webhook TheFork) | 🆕 |
| C-CL-T02 | Riordino della coda con le regole, con anteprima | `clienti_router.py:riordina_import_diff` (`POST /clienti/import/diff/riordina`), `ClientiImport.jsx:DiffReviewSection` | admin | 🆕 |
| C-CL-T03 | Differenze del singolo cliente nella scheda («TheFork dice») | `GET /clienti/import/diff?cliente_id=`, `DiffTheFork.jsx:DiffTheForkCliente` in `ClientiScheda.jsx` | admin | 🆕 |
| C-CL-T04 | Applica / Ignora differenze (una, per cliente, tutte) | `clienti_router.py:risolvi_import_diff` → `risolvi_differenze` | admin | ✅ |

---

# 9. Duplicati, merge e pulizia dati

UI in **Impostazioni → Duplicati** (`ClientiDuplicati.jsx`) + pannello merge nella scheda cliente.

- **Suggerimenti** per telefono / email / nome+cognome (default telefono, il più affidabile). I telefoni placeholder TheFork sono filtrati.
- **Merge guidato**: si sceglie il principale (radio), si spuntano i secondari, conferma → `POST /clienti/merge` per ciascuno. Il merge sposta prenotazioni/note/tag/alias, riempie i campi vuoti del principale coi valori del secondario, elimina il secondario e protegge il principale.
- **"Non è un duplicato"** → `POST /clienti/duplicati/escludi` (il gruppo sparisce dai suggerimenti).
- **Auto-merge**: preview + esecuzione per i casi ovvi (stesso telefono+cognome o stessa email+cognome); principale scelto per numero prenotazioni, poi protetto, poi id.
- **Pulizie**: telefoni placeholder (`POST /clienti/pulizia/telefoni-placeholder`) e normalizzazione Title Case dei testi (`POST /clienti/pulizia/normalizza-testi`).

---

# 10. Export e azioni marketing

**Barra azioni in cima alla lista clienti** (`ClientiLista.jsx:270-290`) — opera sempre sui risultati **filtrati** correnti (fino a 5.000):

- **Copia email** / **Copia telefoni** negli appunti (una per riga)
- **Esporta CSV** client-side (separatore `;`, BOM UTF-8, 16 colonne incluse tags/segmento/n_prenotazioni/ultima_visita)
- **WhatsApp lista**: pannello broadcast con template editabile (placeholder `{nome}`, `{cognome}`; default `WA_TEMPLATES.broadcast_clienti`, link via `buildWaLink` — mattone M.C), un link `wa.me` per cliente con telefono
- **Nota rapida** inline per riga (POST nota senza aprire la scheda)

**Export Google Contacts** (server-side): `GET /clienti/export/google-csv` da Impostazioni → Import/Export (`ClientiImport.jsx:304`) — colonne compatibili Gmail, tag → gruppi (`* TRGB ::: VIP ...`), note combinate (allergie, cibo, bevande, dieta).

---

# 11. Sincronizzazione Mailchimp ✅ FATTA (CL.1)

> **Stato:** operativo. UI: Impostazioni → Mailchimp (`ClientiMailchimp.jsx`). Backend: `app/services/mailchimp_service.py` (v1.0) + endpoint §3.7.

## 11.1 Configurazione

Variabili env (`.env` sul VPS):
```
MAILCHIMP_API_KEY=la-tua-api-key-usXX
MAILCHIMP_LIST_ID=il-tuo-audience-id
```

Il server prefix (`usXX`) è estratto automaticamente dalla API key. API Key da Mailchimp → Account → Extras → API Keys; Audience ID da Audience → Settings. Restart backend dopo modifica: `sudo systemctl restart trgb-backend`.

## 11.2 Comportamento del sync

- **Candidati**: clienti con `email` valorizzata + `newsletter=1` + `attivo=1`.
- **Idempotente**: upsert `PUT /lists/{id}/members/{md5(email)}` con `status_if_new=subscribed` — nessun duplicato, gli esistenti vengono aggiornati.
- I merge fields custom vengono creati su Mailchimp al primo sync se mancanti (`ensure_merge_fields`, `mailchimp_service.py:96`).
- Dopo 20 errori il sync si interrompe; gli errori sono elencati nel risultato.

## 11.3 Dati sincronizzati

**Merge fields** (`mailchimp_service.py:107-115,157-206`):
- `FNAME` nome · `LNAME` cognome · `PHONE` telefono
- `BIRTHDAY` compleanno convertito in `MM/DD` (per automazione auguri Mailchimp)
- `CITTA` città · `RANK` rank TheFork · `SEGMENTO` segmento calcolato (§6)
- `ALLERGIE` (troncato a 255) · `PREFCIBO` preferenze cibo (troncato a 255 — tag Mailchimp `PREFCIBO`, senza underscore)

**Tags Mailchimp** (`mailchimp_service.py:186-195`):
- Tag CRM del cliente (VIP, Abituale, ecc.)
- `segmento:<nome>` — es. `segmento:abituale`, `segmento:in_calo`, `segmento:perso`, `segmento:nuovo`, `segmento:occasionale`, `segmento:mai_venuto`
- `VIP` se flag vip attivo
- `rank:<Rank>` — es. `rank:Gold`

## 11.4 UI — `ClientiMailchimp.jsx`

- **Stato connessione**: badge connected/non connesso, account, email, audience, member_count (da `GET /clienti/mailchimp/status`)
- **Pulsante "Sincronizza ora"** (Btn M.I) → `POST /clienti/mailchimp/sync`
- **Risultati sync**: 4 mini-stats (Candidati, Sincronizzati, Saltati, Errori) + dettaglio errori
- **Box "Dati sincronizzati"** + sezione **"Come usare i segmenti in Mailchimp"** con esempi campagne (riconquista `segmento:in_calo`+`segmento:perso`, newsletter VIP, benvenuto `segmento:nuovo`, auguri via `BIRTHDAY`)

## 11.5 Account Mailchimp

Account legato: **osteriatregobbi@gmail.com** (NON personale di Marco).

---

# 12. Cross-modulo Preventivi

- `clienti_preventivi.cliente_id` FK opzionale a `clienti.id` (preventivi senza cliente CRM ammessi)
- Tab "Preventivi" nella scheda cliente: fetch `GET /preventivi?cliente_id=` + CTA "Nuovo preventivo" (`ClientiScheda.jsx:777-810`)
- Impostazioni CRM ospitano le sezioni Template Preventivi, Menu Template e Luoghi Preventivi (chiave `preventivi_luoghi` in `clienti_impostazioni`)
- Dettagli: [modulo_preventivi.md](modulo_preventivi.md)

---

# 13. Cross-modulo Prenotazioni

- `clienti_prenotazioni.cliente_id` FK a `clienti.id`; stesso DB, stessa tabella usata dal modulo Prenotazioni operativo
- Autocomplete cliente nel form prenotazione: `GET /prenotazioni/clienti/search?q=` (`PrenotazioniForm.jsx:69`)
- Tab "Prenotazioni" nella scheda cliente CRM con storico + stats
- Dal planning prenotazioni si salta alla scheda cliente (`PrenotazioniPlanning.jsx:83`)
- Dettagli (turni, tavoli, widget, conferme): [modulo_prenotazioni.md](modulo_prenotazioni.md)

---

# 14. Roadmap CL (fonte: [roadmap.md](roadmap.md), righe 594-607)

| ID | Cosa | Stato |
|----|------|-------|
| CL.1 | Mailchimp sync MVP | ✅ FATTO (vedi §11) |
| CL.2 | Mailchimp v2 (sync bidirezionale + webhook + filtri pre-sync + log audit) | MEDIA — da valutare se serve |
| CL.3 | Compleanni WA/email automatici (M.C + M.D) | ALTA — M.D blocca |
| CL.4 | Preventivi Fase C — invio email + WA (M.C + M.D) | ALTA — M.D blocca |
| CL.5 | Preventivi Fase D — versioning + collegamento prenotazione | ALTA |
| CL.6 | WA link rapido scheda cliente (migrare a M.C) | MEDIA |
| CL.7 | Note rapide inline da lista clienti | MEDIA in roadmap, ma risulta già implementata in `ClientiLista.jsx` v3.4 (§10) — roadmap da aggiornare |
| CL.8 | Preview merge side-by-side | MEDIA |
| CL.9 | Audit log modifiche CRM | MEDIA |
| CL.10 | Segmentazione RFM automatica | MEDIA |
| CL.11 | Timeline cliente unificata (prenotazioni + note + email + no-show) | MEDIA |
| CL.12 | Import clienti da TheFork via M.H | MEDIA — M.H blocca |
| CL.13 | Filtri combinati avanzati per campagne | BASSA |
| CL.14 | Google Contacts API | BASSA |

> La tabella CL presente in una versione precedente di questa pagina (ricalcolo batch, cron bozze, export CSV, ecc.) non corrispondeva alla roadmap reale ed è stata sostituita. (storico, superato dalla tabella sopra)

---

# 15. Anomalie note / punti aperti

Fatti verificati sul codice al 2026-08-03, da confermare con Marco prima di intervenire:

1. **"+ Nuovo Cliente" rotto**: il bottone in `ClientiLista.jsx:267` naviga a `/clienti/nuovo`, ma non esiste una route dedicata — il path matcha `/clienti/:id` e `ClientiScheda` fa `GET /clienti/nuovo` che fallisce (l'endpoint vuole un id numerico). `POST /clienti/` esiste nel backend ma nessuna pagina lo chiama: la creazione manuale da UI oggi non funziona. **DA CHIEDERE A MARCO** se serve una modalità creazione nella scheda o se i clienti nascono solo da import/prenotazioni.
2. **Lazy import morte in `App.jsx:102-104`**: `ClientiImport`, `ClientiDuplicati`, `ClientiMailchimp` sono lazy-importate in App.jsx ma non usate in alcuna route (vivono embedded dentro `ClientiImpostazioni`, che le importa direttamente).
3. **Gestione tag senza UI**: `POST /clienti/tag` e `DELETE /clienti/tag/{id}` non hanno interfaccia (i tag si creano solo via API); la UI permette solo di associare/rimuovere tag esistenti.
4. **`compleanno_entro_giorni`**: parametro di `GET /clienti/` mai usato dal frontend (la dashboard usa `compleanni_prossimi` di `/clienti/dashboard/stats`).
5. **Soglie `in_calo` hardcoded**: le finestre 6/18 mesi del segmento in_calo sono nel codice (`clienti_router.py:1798-1805,1912-1922`), non in `clienti_impostazioni` come le altre soglie.
6. **Seed `modules.json` in un path che non esiste in locale**: `modules_router.MODULES_SEED_FILE` punta a `locali/<id>/data/modules.json`, ma in git è tracciato solo `app/data/modules.json`. Se il file non c'è nemmeno sul VPS, il router cade sul fallback `DEFAULT_MODULES` hardcoded e il seed tracciato non viene mai letto. Rilevato aggiungendo il sub `giftcard` (2026-08-08): per sicurezza è stato aggiunto in **entrambi**. **DA VERIFICARE CON MARCO** quale dei due è realmente in uso in produzione.

---

# 16. Gift Card (v3.1, 2026-08-08)

**Cosa fa:** emissione e gestione dei buoni regalo dell'osteria, sostituisce il file Excel usato finora.

## 16.1 Modello — uso unico, due dimensioni separate

**Uso unico** (decisione Marco): una card si emette, si scarica in un colpo solo, o si annulla. **Nessun saldo residuo parziale.** Se in futuro servisse il multi-uso, la tabella `clienti_giftcard_movimenti` è già il posto giusto dove appoggiare gli scarichi parziali.

**Due dimensioni ortogonali** (stessa disciplina di `stato_pagamento_unificato.md` §15, per gli stessi motivi):

| Dimensione | Campo | Valori |
|---|---|---|
| **Ciclo di vita** | `stato` | `attiva` / `usata` / `annullata` |
| **Scadenza** | `data_scadenza` | derivata a runtime in `scaduta` e `giorni_alla_scadenza` |

**Non esiste `stato='scaduta'`.** Una card scaduta resta `attiva` con `scaduta=true`: così è prorogabile senza dover "resuscitare" uno stato, e i filtri sulla scadenza restano query sulla data. Il campo `spendibile` (= attiva AND non scaduta) è calcolato dal backend: la UI non deve rifare quel ragionamento.

**Due tipi:** `valore` (importo in €) e `esperienza` (descrizione, es. "Cena degustazione per due"). Sul buono esperienza l'importo **non compare**: chi lo riceve non deve leggere quanto è stato speso.

## 16.2 Contabilità — registro separato dalla cassa

**Decisione Marco (2026-08-08):** il modulo **non scrive nulla** nei corrispettivi né nelle chiusure turno, né all'emissione né allo scarico. È un registro informativo; i numeri di cassa li inserisce Marco dove servono.

Conseguenza tecnica: nessun import fra `clienti_giftcard_router` e i router del modulo `cassa` (regola 2 della disciplina modulare rispettata senza bisogno di un servizio ponte). Il dato "quanto valore è ancora in giro" sta in `GET /clienti/giftcard/stats` → `valore_spendibile`.

## 16.3 Codici — la serie storica Tre Gobbi

Formato **`<lettera>1<AA>-<progressivo>`**, es. `B126-354`:

- **lettera** = bollettario. `A` fino al 2025, `B` dal 2026. Impostazione `giftcard_prefisso`, la cambia Marco quando cambia bollettario: **il sistema non la tocca mai da solo**.
- **`1<AA>`** = anno di emissione (`126` = 2026).
- **progressivo** = contatore **continuo, non si azzera a Capodanno**: 281 nel 2024, 341 nel 2025, 353 nel 2026. Il prossimo è `MAX(progressivo) + 1` calcolato su **tutte** le card, incluse usate e annullate — un numero già stampato su un buono in mano a qualcuno non va mai riassegnato.

Se il codice calcolato risultasse occupato (progressivo scritto a mano fuori sequenza, due emissioni nello stesso istante) si avanza al primo libero. `GET /clienti/giftcard/impostazioni` espone `prossimo_codice`, che l'emissione mostra prima di confermare: se la serie è sfasata te ne accorgi subito.

> **Storia:** la v1 generava codici casuali `TG-4KMP-9XQD` con alfabeto senza caratteri ambigui. Sostituito il 2026-08-08 quando Marco ha spiegato lo schema reale (*«la logica della gift è A1 seguito dall'anno - numero progressivo»*). La mig **168** porta `giftcard_prefisso` da `TG` a `B`, solo se il valore non era già stato cambiato a mano.

Il lookup normalizza maiuscole, spazi e trattini: `b126354` trova `B126-354`. A DB c'è un `UNIQUE` sulla forma normalizzata, non solo sulla colonna.

Il codice è **inseribile a mano** in emissione: serve per registrare buoni fuori sequenza o già in circolazione.

## 16.4 Tabelle DB (`clienti.sqlite3`)

- **`clienti_giftcard`** — `codice` (UNIQUE + unique index normalizzato), `tipo`, `importo`, `descrizione`, `cliente_id` (FK nullable) + `intestatario_nome` (testo libero, per chi non è in anagrafica), `stato`, `data_emissione`, `data_scadenza`, `data_utilizzo`, `emessa_da`, `utilizzata_da`, `note`. Trigger `trg_giftcard_updated`.
- **`clienti_giftcard_movimenti`** — log append-only: `azione` (emissione/scarico/annullo/riattivazione/modifica/import), `stato_prima`, `stato_dopo`, `utente`, `note`. Risponde a "chi l'ha scaricata e quando" senza ambiguità.

Le tabelle nascono da `init_clienti_db()` (CREATE IF NOT EXISTS), non da migrazione. La mig **166** semina solo la config alert.

## 16.5 Impostazioni (`clienti_impostazioni`)

| Chiave | Default | Cosa |
|---|---|---|
| `giftcard_prefisso` | `B` | Lettera di serie dei codici (bollettario). Vedi §16.3 |
| `giftcard_validita_mesi` | `12` | Validità di default (0 = senza scadenza) |
| `giftcard_alert_giorni` | `30` | Preavviso scadenza (allineato ad `alert_config`) |
| `giftcard_importi_rapidi` | `[25,50,100,150,200]` | Bottoni rapidi in emissione |

## 16.6 Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CL-G01 | Elenco gift card con filtri (spendibili / in scadenza / usate / annullate / tutte) e ricerca | `clienti_giftcard_router.py:lista_giftcard` | admin, sala | ✅ |
| C-CL-G02 | Numeri di sintesi, incluso il valore ancora da onorare | `clienti_giftcard_router.py:stats_giftcard` | admin | ✅ |
| C-CL-G03 | Verifica al banco per codice, tollerante a maiuscole/spazi/trattini | `clienti_giftcard_router.py:lookup_codice` | sala | ✅ |
| C-CL-G04 | Emissione buono a valore o esperienza, codice generato o manuale | `clienti_giftcard_router.py:crea_giftcard` | admin, sala | ✅ |
| C-CL-G05 | Scarico a uso unico (rifiuta usate, annullate e scadute) | `clienti_giftcard_router.py:scarica_giftcard` | sala | ✅ |
| C-CL-G06 | Annullamento buono | `clienti_giftcard_router.py:annulla_giftcard` | admin, sala | ✅ |
| C-CL-G07 | Riattivazione dopo errore (solo admin), tracciata nei movimenti | `clienti_giftcard_router.py:riattiva_giftcard` | admin | ✅ |
| C-CL-G08 | Correzione dati card (il codice NON è modificabile: è già stampato) | `clienti_giftcard_router.py:modifica_giftcard` | admin | ✅ |
| C-CL-G09 | PDF A5 del buono con identità del locale | `giftcard_pdf_service.py:genera_pdf_giftcard` | admin, sala | ✅ |
| C-CL-G10 | Alert card in scadenza / scadute non usate | `alert_engine.py:_check_giftcard_scadenza` | admin | ✅ |
| C-CL-G11 | Pagina unica banco + ufficio | `frontend/src/pages/clienti/ClientiGiftCard.jsx` | admin, sala | ✅ |
| C-CL-G12 | Etichetta QR 90×29 (Brother QL-820NWB, rotolo 29×90) per il buono stampato, PDF della misura esatta | `clienti_giftcard_router.py:etichetta_giftcard`, `EtichettaGiftCard.jsx` | admin, sala | 🆕 |
| C-CL-G13 | Pagina del QR `/regalo/<chiave>` per il cliente: cosa gli hanno regalato, valido/usato/scaduto, scadenza. Mai importo né intestatario | `clienti_giftcard_router.py:regalo_pubblico` (`GET /public/regalo/{token}`), `pages/public/Regalo.jsx` | cliente (pubblico) | 🆕 |
| C-CL-G15 | «Prenota il tavolo» dalla pagina del regalo (widget TRGB con nota della card, o TheFork se spento) | `Regalo.jsx:PrenotaRegalo`, `Prenota.jsx:PrenotaIncorporata` | cliente (pubblico) | 🆕 |
| C-CL-G16 | Lotto di gift card «in bianco»: N codici di fila senza prezzo, scadenza fissa del lotto, etichette in un PDF solo | `clienti_giftcard_router.py:crea_in_bianco` (`POST /clienti/giftcard/in-bianco`), `ClientiGiftCard.jsx:ModaleInBianco` | admin, sala | 🆕 |
| C-CL-G17 | Vendita di una card in bianco: prezzo/esperienza e intestatario, diventa attiva | `clienti_giftcard_router.py:vendi_giftcard` (`POST /{id}/vendi`), `ModaleNuova` con `vendita` | sala, admin | 🆕 |
| C-CL-G14 | Lettura staff del QR **solo dall'app**: Gift Card › «📷 Scansiona» (QrScanner) → card nel riquadro banco con Scarica. Vale anche dall'app sulla schermata Home. Dal 2026-10-27 la pagina `/regalo` non ha più la vista staff | `ClientiGiftCard.jsx:daScansione`, `GET /clienti/giftcard/qr/{token}` | sala, admin | 🆕 |

## 16.6c Card «in bianco» (2026-10-29)

Per le scatoline di Natale: i codici si stampano prima, il prezzo si decide quando si vendono. Terzo valore del ciclo di vita prima di `attiva`: **`in_bianco`** (nessuna migrazione: `stato` è testo, `importo` era già nullable).

- **Creazione:** «+ Lotto in bianco» → `POST /clienti/giftcard/in-bianco {quantita, data_scadenza?, note?}`. Codici della serie normale, di seguito (`_genera_codice`), chiave del QR, `tipo='valore'`, `importo=NULL`. La scadenza del lotto è fissa (Marco: 25/12/2027 per Natale 2026) e va sull'etichetta; vuota = calcolata alla vendita.
- **Fuori dai conti:** stats, valore in circolazione, filtri spendibili/scadute e alert M.F guardano tutti `stato='attiva'`, quindi le card in bianco non ci sono. `stats.in_bianco` le conta a parte; `totali` («emesse in tutto») le esclude.
- **Etichette:** filtro «In bianco» → «🏷️ Stampa N etichette» = un PDF con una pagina per card (`pdfEtichetteQr`).
- **Vendita:** dal banco (Scansiona o codice → «Vendi») o dal dettaglio. Stesso modale dell'emissione senza validità e codice. `POST /{id}/vendi` vuole `stato='in_bianco'` (409 altrimenti), scrive tipo/importo/descrizione/intestatario, `data_emissione` = oggi, `emessa_da` = chi vende, movimento `vendita`.
- **Protezioni:** Scarica rifiuta una card in bianco; la pagina pubblica dice «non ancora attivato» (esito `non_attiva`, niente Prenota); annullata e poi riattivata torna `in_bianco` se non ha mai avuto prezzo né descrizione.

## 16.6b Etichetta QR sul buono stampato (2026-10-25, mig 213)

**Contesto:** dal 2026-10-22 il buono è stampato (bordeaux, `00_underline_studio/.../gift-card/`) con un riquadro 122×36 mm al posto del codice scritto a mano. Ci si incolla un'etichetta **90×29** stampata dalla Brother QL-820NWB (rotolo **29×90,3 mm**, misurato da Marco il 2026-10-26): QR 25 mm e testo (GIFT CARD, codice, «valida fino al …») centrati come un gruppo unico.

**Il QR non contiene il codice.** `B126-354` si indovina in sequenza; il QR porta `https://<dominio_app>/regalo/<token_pubblico>`, chiave casuale da 96 bit (`secrets.token_urlsafe(12)`). Colonna `clienti_giftcard.token_pubblico` (mig 213, indice UNIQUE parziale), assegnata all'emissione; le card vecchie l'hanno avuta dalla migrazione, e `GET /{id}/etichetta` la crea se mancasse.

**Stesso QR, due risposte** (`pages/public/Regalo.jsx`, rotta pubblica fuori dal login come `/carta`):
- **cliente** → `GET /public/regalo/{token}`: «Ti hanno regalato» + descrizione (solo per le esperienze; per i buoni a valore «Un buono regalo»), esito (valida / usata / scaduta / annullata), scadenza, codice. **Decisione Marco 2026-10-25: l'importo non compare mai**, nemmeno sui buoni a valore. Niente intestatario, note, chi l'ha emessa. Colori da `branding.json → giftcard`.
- **staff** → non da questa pagina (decisione Marco 2026-10-27: la vista staff legata al login del browser non funzionava dall'app sulla schermata Home e scadeva dopo 8 ore). Si legge dall'app: Gift Card › **«📷 Scansiona»** (`components/QrScanner.jsx`): il QR `…/regalo/<chiave>` va a `GET /clienti/giftcard/qr/{token}`, la card compare nel riquadro del banco con Scarica; se la fotocamera legge un testo che non è un link /regalo, si prova come codice.

**Stampa (v3.18, provata sulla Brother il 2026-10-26):** il PDF si disegna 90×29 ma la pagina esce **in piedi 29×90** (`ruota: true`), nel verso in cui scorre il rotolo: nel dialogo si sceglie la carta **29x90mm** e il driver non ruota né riduce niente. Prove fallite prima: 62×29 orizzontale e 29×62 verticale stampavano solo il QR, perché il rotolo montato non era il 29×62. Se si cambia rotolo, cambiano `wMm/hMm` in `EtichettaGiftCard.jsx`.

**Stampa (v3.17):** l'etichetta esce come **PDF della misura esatta** (`utils/pdfEtichetta.js`, PDF scritto a mano: QR in rettangoli vettoriali, Helvetica standard, nessuna libreria) e si apre in una scheda nuova: Stampa → Brother QL-820NWB. Motivo: Safari (Mac e iPad) ignora `@page size` e stampava la pagina in A4 sulla stampante predefinita con intestazioni e piè di pagina. Il PDF porta con sé la misura, quindi vale anche da iPad via AirPrint; resta da scegliere solo la stampante, che il dispositivo ricorda. La scheda si apre dentro il clic (`apriFinestraVuota`), altrimenti Safari la blocca dopo l'attesa della rete; se è bloccata il PDF si scarica. Dopo «Emetti» si apre la card appena emessa con «🏷️ Etichetta QR» (il PDF A5 resta per i buoni via mail).

**Prenota il tavolo (v3.17):** sulla pagina del cliente, se il buono è valido. Widget TRGB incorporato (`Prenota.jsx → PrenotaIncorporata`) con «Note per noi» già scritto `Gift card <codice>`; se il widget è spento (`widget_attivo = 0`, oggi così) si apre il widget esterno di `locale.json → prenota_esterno` (TheFork, lo stesso del sito) con l'invito a scrivere il codice nelle note.

## 16.7 PDF — perché non usa M.B

**Layout:** A5 orizzontale, cornice a filetto doppio dentro un margine di pagina di 7mm (così non viene mangiata dall'area non stampabile), contenuto centrato verticalmente. Nome del locale spaziato in alto, filetto, "Buono Regalo", intestatario in corsivo, poi l'importo grande (o la descrizione dell'esperienza), il codice in monospace, la scadenza e una riga di condizioni.

### Tre trappole trovate rendendo davvero il PDF (2026-08-08)

Il PDF era stato scritto senza poterlo vedere: alla prima generazione reale sono venuti fuori tre difetti, tutti già corretti. Da ricordare per i prossimi PDF:

1. **`@font-face` da `file://` viene ignorato in silenzio.** Il PDF usciva in Liberation Serif invece che in Cormorant, senza un warning. Rimedio: dichiarare **anche** il nome della famiglia installata a sistema (`font-family: 'Cormorant Garamond', 'CormorantG', …`), come fa il CSS del menu pranzo con Sabon. Verifica: `pdffonts file.pdf` deve mostrare il font atteso.
2. **`display:table` + `vertical-align:middle` NON centra** su WeasyPrint: mette tutto in cima (misurato: testo a y=22 su 350px invece di y=175). Usare **flexbox**.
3. **Cormorant ha le cifre old-style**: `€ 100` si leggeva `€ IOO`. Rimedio: `font-feature-settings: "lnum" 1` su importo, codice e date.

⚠️ **Il frontend scarica il PDF via `apiFetch` + blob, mai con `window.open`.** L'endpoint è autenticato (`Depends(get_current_user)`) e una scheda nuova non porta l'header Authorization → `{"detail":"Not authenticated"}`. Preso in produzione il 2026-08-08. Stesso pattern del PDF preventivi; l'alternativa `?token=` usata altrove nel repo mette il JWT nella cronologia del browser, qui evitata.

`pdf_brand` (M.B) produce documenti **interni** col brand del gestionale (wordmark TRGB, strip gobbette, "generato il..."). Il buono regalo è comunicazione **verso il cliente**: prende l'identità del locale da `locali/<id>/branding.json` → `client_pdf` (stessa logica per cui la carta vini ha un motore suo). Formato A5 orizzontale, leggibile anche fotocopiato in bianco e nero. Font Cormorant Garamond da `static/fonts/`, fallback serif di sistema se mancano.

## 16.8 Alert (M.F)

Checker `giftcard_scadenza`, seed in mig 166: soglia 30 giorni, `antidup_ore=168` (max una notifica a settimana). **Una sola notifica riepilogativa**, non una per card: sono soldi già incassati, l'azione utile è "chiama questa gente prima che scada", non leggere 12 notifiche. Soglia e destinatari da Impostazioni → Notifiche.

## 16.9 Lo storico Excel — travaso one-shot (mig 167)

**Non esiste una funzione di import nel prodotto**, per scelta di Marco (2026-08-08): era un travaso una tantum, non una feature. Lo storico è entrato con la **migrazione 167** (`TRGB_SPECIFIC`, dati embedded nel file), che gira al deploy e salta i codici già presenti. Un tentativo di import da UI era stato costruito e poi rimosso nello stesso giorno (commit `547f9761`, rimosso subito dopo).

Il foglio storico (`gift-card-lista.xlsx`, 174 righe dal dic 2021) era compilato a mano in cinque anni: date impossibili (`29/02/2023`), importi solo dentro la descrizione (`deg 130`), una data scritta `20/'5/2'23`, codici ripetuti, la colonna Utente che a volte è un nome, a volte un telefono, a volte una data.

**Le 5 regole (decise da Marco, 2026-08-08):**

1. **L'anno si legge dal codice.** Formato `<lettera>1<AA>-<progressivo>`: `A125-330` = serie 2025. L'anno del codice **vince sulla colonna Data**, perché la serie A124 è stata aperta a dicembre 2023 per i regali di Natale: 26 buoni hanno data 2023 ma appartengono alla stagione 2024. Sui codici delle serie vecchie (`N###`, `M###`, `A000-*`, `####-####`) si usa la data.
2. **Soglia 2024**: tutto ciò che è precedente resta nell'Excel.
3. **Importo obbligatorio**: dalla colonna, oppure dedotto dalla descrizione (`deg 130`, `VALORE 100€`). Se non si deduce la riga non entra — una card senza valore non è verificabile al banco e sporcherebbe il totale in circolazione.
4. **Codici doppi**: vince l'importo più alto (scelta prudente verso chi si presenta col buono), l'altra riga finisce nelle note e negli scarti.
5. **Senza scadenza**: le importate entrano con `data_scadenza = NULL`, come erano nell'Excel.

**Rieseguibile**: i codici già a sistema vengono saltati, non sovrascritti (nel frattempo possono essere stati scaricati o corretti a mano dalla UI). Ogni card importata ha un movimento `import` con gli avvisi (importo dedotto, data incoerente col codice, riga doppia), così il perché di ogni interpretazione resta leggibile nella scheda.

**Esito:** 90 card entrate — 74 attive e 16 già usate. Escluse 84 righe: 46 anteriori al 2024, 35 senza importo, 1 codice doppio, 1 senza codice, 1 (`N191`) senza anno determinabile.

**Scadenza retroattiva al 31/12/2024** (mig **169**) sulle attive emesse prima del 2025: **56 card per 10.540 €** risultano scadute, **18 per 2.285 €** restano spendibili. Nessuno stato inventato: è una `data_scadenza`, quindi restano `attiva` e prorogabili dalla scheda se Marco decide di onorarle. Le card già usate non ricevono scadenza. Ogni card toccata ha un movimento che lo dice.

> Migrazione separata dalla 167 perché quella era già stata deployata: una migrazione applicata non si rimette in moto, e modificarla è vietato dalle convenzioni.

⚠️ **Un caso da guardare:** `A125-330` ha serie 2025 ma data 08/12/2024 (la riga gemella scartata diceva 08/12/2025). Con la regola sulla data è finita fra le scadute — se è davvero un buono del dicembre 2025, va prorogato a mano.

**Se servisse rifarlo** (altro file, righe recuperate): la migrazione 167 è il modello — si genera un nuovo file con i record già normalizzati. Le regole sopra sono la specifica.

## 16.10 Punti aperti

1. **Nessun tab Gift Card nella scheda cliente.** Le card intestate a un cliente CRM si vedono solo dalla pagina Gift Card filtrando per nome. Da valutare se serve (CL.17).
2. **Le 35 righe senza importo restano fuori** per scelta: sono per lo più "BOX" o celle vuote. Se Marco ritrova gli scontrini, si inseriscono a mano.
3. **Scadenza calcolata a 30 giorni per mese** in emissione (`mesi × 30`): approssimazione voluta, la data è modificabile a mano.
4. **Le card importate non hanno intestatario**: l'Excel non lo registrava (la colonna Utente è chi ha venduto, non chi ha ricevuto). Al banco si riconoscono dal codice.

---

# 17. WhatsApp del locale in sola lettura (v3.23, 2026-11-02, mig 224)

**Perché.** Il giro del mattino legge mail, prenotazioni e agenda ma non WhatsApp, dove passano gruppi, eventi e proposte menù. Serve sapere chi aspetta una risposta e se una proposta è già partita. Decisione di Marco (2026-11-02, Q #295): **solo lettura**, numero sull'app WhatsApp Business del telefono come oggi, strada ufficiale Meta («coexistence»), prima prova senza provider a pagamento. Escluse le librerie non ufficiali (Baileys, whatsmeow): violano i termini WhatsApp, il numero del locale rischierebbe il blocco.

**Come funziona.** Con la coexistence lo stesso numero è anche sulla Cloud API. Meta manda al webhook di TRGB: `messages` (in arrivo), `smb_message_echoes` (scritti dall'app o da un dispositivo collegato), `history` (ultimi 6 mesi, una volta sola, entro 24 ore dal collegamento), `smb_app_state_sync` (rubrica dell'app), `account_update` (es. scollegato). Meta non fa pagare i messaggi ricevuti né quelli scritti dall'app. TRGB non usa l'API per scrivere.

**Cosa NON si vede** (limiti Meta): chat di gruppo; messaggi scritti da WhatsApp per Windows o WearOS; i media (si tiene solo la didascalia). Dopo il collegamento: messaggi effimeri e «visualizza una volta» spenti, liste broadcast in sola lettura, dispositivi collegati da ricollegare; l'app va aperta almeno ogni ~13-14 giorni, altrimenti Meta scollega (arriva una notifica M.A agli admin).

**Tabelle** (`clienti.sqlite3`): `clienti_wa_messaggi` (wamid unico, numero, direzione in/out, tipo, testo, ts, fonte webhook/eco/storico), `clienti_wa_contatti` (nome WhatsApp e nome in rubrica per numero), `clienti_wa_eventi` (registro webhook senza contenuto; il payload si tiene solo se l'elaborazione fallisce). Impostazioni `clienti_impostazioni.wa_*`: `wa_conservazione_giorni` (90, da 7 a 730, dalla pagina), collegamento (waba, phone_number_id, numero), stato storico, ultimo webhook. Nessun segreto nel DB: chiavi nel `.env` (`WA_APP_ID`, `WA_APP_SECRET`, `WA_CONFIG_ID`, `WA_VERIFY_TOKEN`, `WA_GRAPH_VERSION`); il token del business si usa al collegamento e non si salva.

**Conservazione e privacy.** I messaggi oltre la conservazione si cancellano da soli (al più una volta l'ora, al webhook o alla lettura); il registro eventi tiene al massimo 30 giorni. Finalità: rispondere a prenotazioni, eventi e preventivi — niente marketing né profilazione. Da fare lato Marco: informativa privacy del sito aggiornata (canale WhatsApp, Meta come fornitore), riga nel registro dei trattamenti.

**Chi è chi.** Il nome viene dal cliente TRGB col telefono uguale (`normalize_phone` su telefono/telefono2), poi dalla rubrica dell'app, poi dal nome WhatsApp. «Da rispondere» = l'ultimo messaggio (reazioni escluse) è del cliente.

**Provider: YCloud (v3.45, 2026-11-23).** La strada diretta non è passata: Meta risponde «Tre Gobbi SRL non può registrare clienti al momento», per collegare un numero all'app propria bisogna essere Tech Provider (verifica dell'azienda, App Review, Access Verification). Il numero è quindi collegato in coexistence a **YCloud** (BSP Meta, piano Free), Q #295/#373. Il collegamento è passato solo entrando col **profilo Facebook vero di Marco** e col **portfolio vecchio che possiede la Pagina** dell'osteria: il WhatsApp Business è legato a quella Pagina, e da altri portfolio Meta rifiuta («Account collegato alla Pagina su un altro Facebook Business»; dal login WhatsApp errore #2655099). Il pulsante WhatsApp della Pagina non si è toccato.
- YCloud manda gli eventi a `POST /clienti/whatsapp/ycloud`, firmati con `YCloud-Signature: t=<unix>,s=<hex>` (HMAC-SHA256 di «t.corpo grezzo» col segreto dell'endpoint, `YCLOUD_WEBHOOK_SECRET` nel `.env`; il segreto si prova com'è e senza `whsec_`). L'ora della firma non si controlla: YCloud ritenta per ore e un evento ripetuto non fa danni (messaggi unici per wamid). Risposta 204 subito.
- Traduzione nelle stesse tabelle (`clienti_whatsapp_service.elabora_evento_ycloud`): `whatsapp.inbound_message.received` → in/`webhook` (+ nome profilo); `whatsapp.smb.message.echoes` → out/`eco` (scritti dall'app sul telefono); `whatsapp.smb.history` → `storico` (+ avanzamento); `whatsapp.message.updated` → out/`ycloud` (scritti dalla casella di YCloud: **contano come risposta**, decisione di Marco 23/11; `failed` scartati); `whatsapp.smb.app.state.sync` → rubrica (forma non documentata da YCloud: si cercano oggetti `contact`; se non torna, il primo evento resta nel registro come `da_capire` col payload, per adattare); `whatsapp.business_account.deleted` (es. `PRIMARY_INACTIVITY`), `whatsapp.phone_number.deleted`, `whatsapp.business_account.updated` con `banState DISABLE` → scollegato + notifica M.A agli admin; `REINSTATE` o un messaggio nuovo → di nuovo collegato; `whatsapp.phone_number.quality_updated` → solo annotato.
- Il primo evento fissa l'account (`wa_waba_id`) e il numero del locale (`wa_numero`); eventi di un altro account si scartano. `wa_provider = ycloud`.
- **Storico:** YCloud l'ha mandato alle 22:19 del 23/11, prima che TRGB ascoltasse. Decisione di Marco: **si parte da zero**, lo storico c'è sul telefono se serve.
- Dalla casella di YCloud non si scrive: i messaggi API si pagano e fuori dalle 24 ore servono modelli approvati.
- Privacy: i messaggi passano anche da YCloud (Singapore, fuori UE) → nell'informativa del sito va nominato YCloud oltre a Meta (da fare lato Marco).

**Chat «chiuse dal cliente» (v3.45, decisione di Marco 2026-11-23).** Molte chat finiscono col cliente che scrive «Grazie!», «ok» o un'emoji: non sono da rispondere. Stato `chiusa_dal_cliente` quando **tutti** i messaggi del cliente dopo la nostra ultima risposta sono chiusure: senza «?», entro `wa_chiusura_max_caratteri` (40), fatti solo di parole/emoji dell'elenco `wa_chiusura_parole` (grazie, ok, perfetto, a presto, 👍, 🙏…; con «sticker» contano anche gli sticker). Le parole delle frasi dell'elenco valgono anche da sole («a presto» → «a», «presto»). Elenco e lunghezza si cambiano dalla pagina (`PUT /clienti/whatsapp/chiusura`). Nelle conversazioni vengono dopo le «da rispondere», con il conteggio `chiuse_dal_cliente`; `solo_da_rispondere` le esclude. Una chiusura seguita da una domanda torna «da rispondere».

**Pagina «💬 WhatsApp» (v3.47, 2026-11-24, mig 244).** Marco: «costruiamo una pagina come Posta per WhatsApp». Clienti › 💬 WhatsApp (`/clienti/whatsapp`, `ClientiWhatsAppChat.jsx`), stessa impostazione della Posta: elenco a sinistra con chip **Da rispondere · Chiuse dal cliente · Tutte** (coi numeri), periodo (oggi e ieri / 7 / 30 / 90 giorni), ricerca (`q`: cifre ≥ 4 nel numero, altrimenti parole nei nomi o nel testo dei messaggi del periodo); chat aperta a destra a fumetti (cliente a sinistra, locale a destra, separatori per giorno, etichetta della fonte: «dal telefono», «dalla casella YCloud», «storico»), testo solo come testo (niente link cliccabili). Si aggiorna da sola ogni minuto; sul telefono l'elenco sparisce quando si apre una chat («← Chat»). Il tab porta il numero delle chat da rispondere (ultimi 7 giorni).
- **«✓ Gestita»** (sulle chat da rispondere o chiuse dal cliente): la chat esce da «da rispondere» — risposto a voce, al telefono, di persona. Tabella `clienti_wa_gestite (numero, fino_ts, da, at)`: `fino_ts` = l'ultimo messaggio del cliente al momento del clic; **se il cliente riscrive** (un messaggio più nuovo, reazioni escluse) la chat torna da rispondere. Vale anche per il giro (stato `gestita` in `whatsapp_conversazioni`, connettore 1.21). «↩︎ Togli «gestita»» la riporta com'era. `POST /clienti/whatsapp/chat/{numero}/gestita {gestita: bool}`.
- **«💬 Apri in WhatsApp»**: `buildWaLink` (mattone M.C) apre la chat nell'app di chi guarda. Attenzione: dal telefono personale si risponderebbe col proprio numero, non con quello dell'osteria (tooltip sul tasto); per questo c'è la casella per scrivere.
- **«👤 Scheda cliente»** se il numero è di un cliente TRGB.
- Rotte della pagina (`pagina_router`): `GET /clienti/whatsapp/conversazioni`, `GET /clienti/whatsapp/cerca`, `GET /clienti/whatsapp/chat/{numero}` (ultimi 180 giorni, 404 se nessun messaggio), `POST …/gestita`. Collegamento, conservazione e chiusure restano solo admin (Impostazioni › WhatsApp).
- **Scrivere dalla pagina** (v3.49, mig 245; Marco 24/11: «possiamo inviare messaggi da lì?» → «procedi»). Casella sotto la chat: il testo parte **dal numero dell'osteria** via API YCloud (`POST /v2/whatsapp/messages/sendDirectly`, `X-API-Key` = `YCLOUD_API_KEY` nel `.env`, `externalId` «trgb-<id>») e compare anche nell'app sul telefono (coexistence). Regole:
  - solo **entro 24 ore** dall'ultimo messaggio del cliente (regola di WhatsApp; reazioni escluse per prudenza, nell'ultimo minuto non si prova): la pagina mostra quanto resta; fuori finestra la casella è spenta con «rispondi dal telefono». Niente modelli Meta, niente invii automatici o massivi;
  - ogni invio in `clienti_wa_invii` (chi, quando, testo, esito, errore, id YCloud, wamid, stato di consegna) e, se partito, in `clienti_wa_messaggi` con fonte `trgb` («da TRGB (utente)», spunte ✓ / ✓✓ / ✓✓ blu dal webhook `whatsapp.message.updated`). Risposta e webhook possono arrivare in qualsiasi ordine: resta una riga sola (segnaposto `trgb:<id>` finché non c'è il wamid). Non partito o non consegnato → fumetto rosso con l'errore, e la chat resta da rispondere;
  - costi: dal 01/10/2026 Meta fa pagare le risposte via API oltre le 1.000 gratuite al mese per numero; YCloud le scala dal suo credito senza ricarichi. Dal telefono restano gratis;
  - chi può: sotto-modulo **`clienti/whatsapp_scrivere`** («WhatsApp · scrivere», admin + capo sala), separato dalla lettura; il backend lo controlla (`richiede_sotto_modulo`) e la pagina lo legge da `chat.scrivere.permesso`. Q (connettore) non scrive su WhatsApp.
  - Errori: 409 finestra chiusa, 503 chiave mancante o numero del locale non ancora noto, 502 YCloud/WhatsApp rifiuta (credito finito, numero non valido…).
- **Chi la vede: la matrice Moduli** (decisione di Marco 24/11: «admin + capo sala (anche la posta)… flag per attivare e disattivare tutto a tutti»). Sotto-moduli `clienti/whatsapp` e `clienti/posta` in `modules.json` (admin, superadmin, capo_sala; aggiunti da soli al runtime del VPS con `SUB_DA_AGGIUNGERE`); il backend li segue con `permessi.richiede_sotto_modulo("clienti", "whatsapp")` (M.G), il frontend con `canAccessSub` (route, tab, menu). Si cambiano da Impostazioni Sistema › Moduli senza toccare codice.

**Collegamento diretto Meta (alternativa, non usata).** Impostazioni › WhatsApp › «Collega WhatsApp» (compare solo se YCloud non è configurato): Embedded Signup di Meta con `featureType: whatsapp_business_app_onboarding`; il codice (vale 30 s) va a `POST /clienti/whatsapp/collega`, che scambia il token, iscrive l'app al WABA (`subscribed_apps`), legge il numero (`is_on_biz_app`) e chiede rubrica e storico (`smb_app_data`). Guida passo-passo per il pannello Meta: [guida_whatsapp_meta.md](guida_whatsapp_meta.md). **Il webhook deve essere già in produzione prima di collegare**, altrimenti lo storico si perde.

## 17.1 Capability

| Codice | Cosa fa | Dove | Audience | Stato |
|---|---|---|---|---|
| C-CL-W01 | Webhook Meta: verifica (`hub.verify_token`) e ricezione firmata (`X-Hub-Signature-256`), salva messaggi/eco/storico/rubrica | `clienti_whatsapp_router.py:webhook_verifica/webhook_ricevi` (`GET/POST /clienti/whatsapp/webhook`), `clienti_whatsapp_service.elabora_webhook` | Meta (pubblico) | 🆕 |
| C-CL-W02 | Collega WhatsApp (Embedded Signup + iscrizione + sync storico) | `POST /clienti/whatsapp/collega`, `ClientiWhatsApp.jsx:collega` | admin | 🆕 |
| C-CL-W03 | Stato collegamento, archivio, conservazione | `GET /clienti/whatsapp/stato`, `PUT /clienti/whatsapp/conservazione`, `ClientiWhatsApp.jsx` | admin | 🆕 |
| C-CL-W04 | Chat recenti con «da rispondere» | `GET /clienti/whatsapp/conversazioni`, MCP `whatsapp_conversazioni` | matrice Moduli `clienti/whatsapp` (dal 24/11), giro | 🆕 |
| C-CL-W05 | Ricerca per persona/numero/parole | `GET /clienti/whatsapp/cerca`, MCP `whatsapp_cerca` | matrice Moduli `clienti/whatsapp` (dal 24/11), giro | 🆕 |
| C-CL-W06 | Preventivi recenti col registro invii | `preventivi_service.preventivi_con_invii`, MCP `preventivi_inviati` | admin, giro | 🆕 |
| C-CL-W07 | Webhook YCloud: firma `YCloud-Signature`, eventi messaggi/eco/storico/casella/rubrica/account nelle tabelle WhatsApp | `clienti_whatsapp_router.py:webhook_ycloud` (`POST /clienti/whatsapp/ycloud`), `clienti_whatsapp_service.elabora_evento_ycloud` | YCloud (pubblico) | 🆕 |
| C-CL-W08 | Chat «chiuse dal cliente» (grazie/ok/emoji) con parole e lunghezza modificabili | `clienti_whatsapp_service.regola_chiusura/e_chiusura`, `PUT /clienti/whatsapp/chiusura`, `ClientiWhatsApp.jsx` | admin, giro | 🆕 |
| C-CL-W09 | Pagina «💬 WhatsApp»: elenco chat (da rispondere / chiuse dal cliente / tutte, periodo, ricerca) e chat aperta, «Apri in WhatsApp», scheda cliente | `ClientiWhatsAppChat.jsx`, `clienti_whatsapp_router.py:pagina_router` (`GET /clienti/whatsapp/conversazioni`, `/cerca`, `/chat/{numero}`), `clienti_whatsapp_service.conversazioni/chat` | matrice Moduli `clienti/whatsapp` (admin, capo sala) | 🆕 |
| C-CL-W10 | «✓ Gestita» su una chat: fuori da «da rispondere» finché il cliente non riscrive (anche nel giro) | `POST /clienti/whatsapp/chat/{numero}/gestita`, `clienti_whatsapp_service.imposta_gestita/_stato_numero`, mig 244 `clienti_wa_gestite` | matrice Moduli `clienti/whatsapp`, giro (sola lettura) | 🆕 |
| C-CL-W11 | Scrivere al cliente dalla pagina (testo, entro 24 ore dal suo ultimo messaggio) via YCloud, con autore e stato di consegna | `POST /clienti/whatsapp/chat/{numero}/invia`, `clienti_whatsapp_service.invia_testo/_invio_trgb/_finestra`, `clienti_wa_invii` (mig 245), `ClientiWhatsAppChat.jsx` | matrice Moduli `clienti/whatsapp_scrivere` (admin, capo sala) | 🆕 |

## 17.2 Punti aperti

1. ~~Collegare il numero senza essere Tech Provider~~ → no (23/11): collegato tramite YCloud, vedi sopra. L'app Meta «TRGB Tre Gobbi» e il portfolio «Tre Gobbi SRL» del profilo fittizio restano ma non servono.
2. ~~Verificare che arrivino i messaggi e la rubrica~~ → verificato il 24/11 sera: collegato, 15 eventi senza errori, rubrica dell'app letta («rubrica: 5 contatti», «3 contatti»), «✓ Gestita» usata. Da provare ancora: il primo messaggio scritto da TRGB (3.49).
3. Informativa privacy del sito: aggiungere YCloud (fornitore extra UE) accanto a Meta.
4. Il capo sala con la Posta vede **tutte** le caselle lette da TRGB (info@, prenotazioni@, marco@, la PEC, trgb@) e può rispondere, mandare bozze e cestinare; configurare le caselle resta admin. Se una casella non deve vederla, oggi si toglie la Posta al ruolo dalla matrice: un filtro per casella non c'è.

---

# 18. Rubrica dei clienti sul telefono (v3.39, 2026-11-16, mig 238)

**Perché.** Prima Marco esportava ogni tanto i contatti di TheFork su un account Gmail, per riconoscere i clienti quando chiamano e averli su WhatsApp Business. Ora il telefono si **abbona** alla rubrica di TRGB e la rilegge da solo. Google Contacts scartato (tetto di 25.000 contatti).

**Chi entra.** I clienti attivi con un telefono valido (`telefono_valido`, su `telefono` e `telefono2`) e almeno `rubrica_stelle_min` stelle TRGB (nere + argento + oro effettiva, §6). Al 16/11/2026 circa 4.660.

**Il contatto** (vCard 3.0, `clienti_rubrica_service._vcard`):
- nome sul telefono = prefisso + nome + stelle: «TG Daniele Trentini ★★★★». Le stelle sono la somma (i colori non si vedono, il numero sì). In `N` il prefisso è titolo e le stelle suffisso, così l'ordine resta per cognome;
- telefoni (CELL/VOICE), email, `CATEGORIES` = etichette CRM;
- nota: stelle per colore, segmento, visite, ultima visita, allergie e restrizioni, preferenze (cibo, bevande, posto);
- link **«TRGB»** alla scheda del cliente nel gestionale (`item1.URL` = `<app>/clienti/<id>` + `item1.X-ABLabel:TRGB`; dalla v3.46, 24/11/2026). Decisione di Marco: niente scrittura dal telefono (cambiare il nome sull'iPhone resta solo sull'iPhone, TRGB risponde 403 e alla prima modifica del cliente in TRGB il telefono riprende la versione del server); si tocca il link, si corregge in TRGB dietro al login e la rubrica lo porta a tutti i telefoni. Indirizzo da `TRGB_APP_URL` o da `locale.json` «dominio_app» (come il connettore), vuoto = niente link;
- niente compleanni (4.000 compleanni nel calendario del telefono non servono).

**Server CardDAV in sola lettura** (`clienti_rubrica_router.public_router`, senza JWT, Basic auth con gli accessi):
- `/.well-known/carddav` → 301 `/rubrica/`; `PROPFIND /rubrica/` (principal e home), `PROPFIND /rubrica/clienti/` (rubrica, `getctag`, carte a depth 1), `REPORT` addressbook-multiget e addressbook-query, `GET /rubrica/clienti/trgb-cliente-<id>.vcf`;
- `sync-collection` risponde 403 valid-sync-token: il telefono ripiega su ctag + etag;
- `PUT`, `DELETE`, `MKCOL`, `PROPPATCH` → 403 (il telefono non scrive in TRGB);
- rubrica costruita in memoria e tenuta 2 minuti; password verificate tenute 10 minuti; `ultimo_accesso` scritto al più ogni pochi minuti.

**Accessi.** Uno per telefono, creato da **Clienti › Impostazioni › 📱 Rubrica telefono** (`ClientiRubrica.jsx`, solo admin): nome del telefono → utente e password (16 caratteri senza lettere ambigue) mostrati **una volta sola**. Revoca = quel telefono non legge più (401 alla sincronizzazione successiva). Password in pbkdf2-sha256, 200.000 giri.

**Impostazioni** (`clienti_impostazioni`, mig 238): `rubrica_prefisso` (default `TG`), `rubrica_stelle_min` (default `1`), modificabili dalla stessa pagina.

**Come si collega.** iPhone: Impostazioni › App › Contatti › Account contatti › Aggiungi account › Altro › Aggiungi account CardDAV → server `trgb.tregobbi.it`, utente e password. Android: DAVx5 con URL `https://trgb.tregobbi.it/rubrica/`. WhatsApp Business prende i nomi dai contatti del telefono, senza altro.

**Note.** nginx passa al backend tutti i metodi (PROPFIND/REPORT compresi). Il connettore MCP esclude `/rubrica` dalle letture (`_LETTORE_ESCLUSE`).

## 18.1 Capability

| Codice | Cosa fa | Dove | Audience | Stato |
|---|---|---|---|---|
| C-CL-R01 | Rubrica CardDAV in sola lettura per i telefoni | `clienti_rubrica_router.py:home/rubrica_clienti/contatto`, `well_known` | telefoni (accesso rubrica) | 🆕 |
| C-CL-R02 | Contatti dai clienti con stelle (nome, telefoni, email, nota) | `clienti_rubrica_service.py:_costruisci/_vcard` | sistema | 🆕 |
| C-CL-R03 | Stato della rubrica, prefisso e soglia | `GET /clienti/rubrica/stato`, `PUT /clienti/impostazioni`, `ClientiRubrica.jsx` | admin | 🆕 |
| C-CL-R04 | Accessi per telefono: crea (password una volta) e revoca | `POST /clienti/rubrica/accessi`, `POST /clienti/rubrica/accessi/{id}/revoca` | admin | 🆕 |
| C-CL-R05 | Link «TRGB» nel contatto che apre la scheda del cliente nel gestionale (per correggere dal telefono) | `clienti_rubrica_service.py:_vcard/_url_app` | telefoni → admin/sala con Clienti › Lista | 🆕 |

## 18.2 Punti aperti

1. **Telefono fisso** (Marco 16/11): da decidere, dipende dall'apparecchio. Un FRITZ!Box legge la stessa rubrica CardDAV; un centralino (FreePBX) chiederebbe il nome a TRGB a ogni chiamata.
2. Da provare dal vivo su iPhone dopo il push (sui test con copia del DB: 4.671 contatti, PROPFIND 1,2 MB, multiget, 401 senza credenziali e dopo la revoca).

---

# 19. Template di risposta ai clienti (2026-11-26, mig 246)

Marco, 25-26/11/2026: «creiamo dei template di risposta alle mail (poi in futuro anche per WhatsApp); il primo è per la richiesta sul menù / prenotazione di Natale: ringrazia, espone menù e prezzo, se ho disponibilità avvisa che è possibile prenotare dando il link diretto». Fra tre strade (testi salvati · testi con blocchi vivi · risposta preparata da sola) ha scelto la seconda.

**Cos'è.** Un template è un testo con dei blocchi fra graffe che TRGB riempie **nel momento in cui lo si usa**:

| Blocco | Cosa mette | Da dove |
|---|---|---|
| `{nome}` | nome del cliente; vuoto → sparisce («Buongiorno,») | chi compila |
| `{data}` | il giorno dell'occasione per esteso | il template |
| `{menu}` | i piatti, uno per riga (descrizione dopo i due punti) | libreria menù (`menu_templates_service.get_template`) |
| `{prezzo}` | «80 € a persona», come nei preventivi | `preventivi_service.etichetta_prezzo` |
| `{disponibilita}` | UNO dei due paragrafi del template: «Se c'è posto» / «Se siamo pieni» | `prenotazioni_posto_service.c_e_posto` |
| `{link_prenotazione}` | il link scritto in testa alla pagina | `clienti_impostazioni.risposte_link_prenotazione` |

**Occasione.** Giorno + turno + «c'è posto se entra un tavolo da N persone» (`pax_prova`, lo scrive Marco: nessuna soglia nel codice) + menù della libreria. Un template può non averla (es. «Gruppi: serve un menù»): quei blocchi escono vuoti, con un avviso.

**C'è posto?** `app/services/prenotazioni_posto_service.py` (platform, nuovo): la risposta della sala, non del sito — stesse fasce, limiti di coperti e motore per tavoli di `prenotazioni_sito_service.orari`, senza le regole di chi prenota online (anticipo, vendita online chiusa, tetto online, gruppi a richiesta). `posto = None` quando non si può dire: il paragrafo non viene messo e l'avviso lo dice, non si traveste da «pieno».

**Dove si scrivono.** Clienti › Impostazioni › ✉️ Template di risposta (`ClientiRisposteTemplate.jsx`): elenco, editor con due linguette (Mail · WhatsApp versione corta), pulsanti «Inserisci blocco» (in grigio quelli che oggi uscirebbero vuoti), i due paragrafi della disponibilità, anteprima «come esce adesso» con la frase sui tavoli («25/12 pranzo: 10 coperti su 40 · c'è posto») e gli avvisi.

**Dove si usano.** Clienti › Posta (`ClientiPosta.jsx` 1.7): aprendo una mail di una casella del locale, «↩️ Rispondi con un template» → scelta, nome nel saluto, «Compila» → testo ritoccabile → «Salva nelle Bozze» (`POST /email/bozze`, come le bozze di Q: poi «Invia da qui» o da Mail). Nel «Rispondi» della casella del gestionale riempie il testo. Dal connettore: `risposte_template` e `risposta_da_template`, poi `posta_bozza`. La pagina 💬 WhatsApp non li usa ancora (il testo corto c'è già: `canale=wa`).

**Non fa.** Non riconosce da sola la richiesta in arrivo e non prepara bozze senza che qualcuno lo chieda (era la strada C, rimandata). Compilare non scrive e non manda niente.

## 19.1 Capability

| Codice | Cosa fa | Riferimento | Audience | Docs |
|---|---|---|---|---|
| C-CL-RT01 | Elenco dei template, blocchi disponibili, link di prenotazione | `GET /clienti/risposte-template/` (`clienti_risposte_router.py:elenco_ep`) | chi ha Clienti › Posta | 🆕 |
| C-CL-RT02 | Crea, modifica, spegne, elimina un template (mail + WhatsApp corta, occasione, menù) | `POST/PUT/DELETE /clienti/risposte-template/…`, `ClientiRisposteTemplate.jsx` | admin | 🆕 |
| C-CL-RT03 | Anteprima «come esce adesso» del template che si sta scrivendo | `POST /clienti/risposte-template/anteprima` | admin | 🆕 |
| C-CL-RT04 | Compila un template: menù, prezzo, c'è posto / pieni, link, con la frase sui tavoli e gli avvisi | `GET /clienti/risposte-template/{id}/compila`, `clienti_risposte_service.py:compila` | chi ha Clienti › Posta | 🆕 |
| C-CL-RT05 | Link di prenotazione dei template | `PUT /clienti/risposte-template/impostazioni` | admin | 🆕 |
| C-CL-RT06 | «Rispondi con un template» da una mail: testo ritoccabile, bozza nelle Bozze della casella | `ClientiPosta.jsx:RispostaDaTemplate/TemplateRisposta` | chi ha Clienti › Posta | 🆕 |
| C-CL-RT07 | Q legge i template e li compila | connettore `risposte_template`, `risposta_da_template` | admin | 🆕 |

## 19.2 Punti aperti

1. **Link di prenotazione**: da scrivere (Marco non ha ancora detto quale: TheFork, pagina del sito, pagina TRGB). Finché è vuoto il blocco esce vuoto con l'avviso.
2. **Menù di Natale in libreria**: il primo template («Pranzo di Natale 2026») ha bisogno del menù in Impostazioni › Menu Template; oggi sta solo in Q.
3. **WhatsApp**: usare la versione corta dalla pagina 💬 WhatsApp.
4. **Strada C**: riconoscere la richiesta in arrivo e preparare la bozza nel giro.
5. Provato: `tests/test_risposte_template.py` (12 casi, DB temporaneo) e `c_e_posto` su una copia del DB (25/12 pranzo: 10 su 40, c'è posto). **Non provato nel browser** né con una mail vera.

