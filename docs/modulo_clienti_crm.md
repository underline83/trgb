# Modulo Clienti / CRM — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_prenotazioni.md](modulo_prenotazioni.md), [modulo_preventivi.md](modulo_preventivi.md), [modulo_statistiche.md](modulo_statistiche.md), [roadmap.md](roadmap.md) §CL

**Stato:** operativo. Sincronizzazione Mailchimp ✅ FATTA (CL.1). Altre voci CL in roadmap.
**Versione modulo (`versions.jsx`):** clienti **v3.0** · label "Gestione Clienti" · status beta (`frontend/src/config/versions.jsx:170`). Non esiste una voce `mailchimp_sync` separata: il sync Mailchimp è parte del modulo clienti.
**Sezione top-level:** `/clienti/*` · **Backend prefix:** `/clienti/*` (`app/routers/clienti_router.py`, montato in `main.py:701`)
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
| `clienti_import_diff` | Coda revisione: differenze campo-per-campo tra CRM (cliente `protetto`) e TheFork trovate all'import; `stato` pending/applica/ignora |
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
| GET | `/clienti/import/diff` | Coda revisione differenze (raggruppate per cliente), filtro `stato` | :1274 |
| GET | `/clienti/import/diff/count` | Conteggio diff pending (badge sulla tab Impostazioni) | :1328 |
| POST | `/clienti/import/diff/risolvi` | Applica o ignora una o più diff (`azione: applica|ignora`, whitelist campi anti-injection) | :1348 |
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
| `ClientiImport.jsx` (v2.0-mattoni) | — (embedded in Impostazioni → Import/Export) | Upload XLSX clienti + prenotazioni, revisione diff, export Google CSV |
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

- **Sidebar** colorata per rank TheFork (Gold/Silver/Bronze/Caution, default teal) con dati principali, tag toggle, stats visite.
- **Tab**: `anagrafica` | `preferenze` | `note` (conteggio) | `prenotazioni` (conteggio) | `preventivi` (`ClientiScheda.jsx:274-280`).
- **Tab Preventivi**: fetch `GET /preventivi?cliente_id=` (router preventivi) + CTA "Nuovo preventivo" → `/clienti/preventivi/nuovo` (`ClientiScheda.jsx:782,807`).
- **Merge manuale** dal pannello scheda: ricerca del duplicato, preview, opzione **"merge come coppia"** che salva nome/cognome del secondario come `nome2`/`cognome2` del principale (`ClientiScheda.jsx:92-247`).
- Tipi nota: nota 📝, telefonata 📞, evento 🎉, reclamo ⚠️, preferenza 🍽️.

## 5.4 Dashboard (`ClientiDashboard.jsx`)

KPI reali (da `/clienti/dashboard/stats` + `/clienti/prenotazioni/stats`):
- Card clienti: totale, VIP, con email, nuovi ultimi 30gg
- Card prenotazioni: totale, pax medio, no-show (con %), cancellazioni (con %)
- **Compleanni prossimi 7 giorni** con CTA WhatsApp (template `WA_TEMPLATES.compleanno`, mattone M.C) ed email `mailto:` di auguri
- Top 20 clienti per visite, distribuzione per rank, prenotazioni per canale, andamento mensile 12 mesi, distribuzione per tag, copertura contatti

---

# 6. Segmentazione marketing

**Non esiste un campo `segmento_marketing` sul DB**: il segmento è **calcolato runtime** a ogni richiesta (lista clienti, conteggi, sync Mailchimp) dallo storico `clienti_prenotazioni` con stati completati `SEATED/ARRIVED/BILL/LEFT`.

## 6.1 Segmenti (6)

| Segmento | Regola (con soglie default) |
|---|---|
| `nuovo` | prima visita ≤ 90 giorni fa e ≤ 2 visite totali |
| `abituale` | ≥ 5 visite nella finestra di 12 mesi |
| `occasionale` | 1–4 visite nella finestra di 12 mesi |
| `in_calo` | ≥ 3 visite tra 18 e 6 mesi fa e ≤ 1 negli ultimi 6 mesi (finestre 6/18 mesi hardcoded nel router) |
| `perso` | ultima visita > 365 giorni fa |
| `mai_venuto` | nessuna prenotazione completata collegata |

## 6.2 Soglie configurabili

Le soglie vivono in `clienti_impostazioni` (`seg_abituale_min`, `seg_occasionale_min`, `seg_nuovo_giorni`, `seg_nuovo_max_visite`, `seg_perso_giorni`, `seg_finestra_mesi`) e si modificano dalla UI **Impostazioni → Segmenti** (`ClientiImpostazioni.jsx:25-32`). Lettura backend in `_get_soglie_segmenti()` (`clienti_router.py:1693`).

## 6.3 Dove si usano

- **Lista clienti**: filtro `segmento` + badge colorato per riga (config UI in `ClientiLista.jsx:22-29`), conteggi per segmento in sidebar da `/clienti/segmenti/conteggi`.
- **Mailchimp**: il segmento va nel merge field `SEGMENTO` e nel tag `segmento:<nome>` (§11).
- **RFM**: Recency e Frequency sì; Monetary non disponibile (iPratico non esporta vendite per cliente; `importo_conto` TheFork è parziale). Segmentazione RFM automatica = CL.10 in roadmap, ⏳ da fare.

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
3. **Revisione diff**: per i clienti `protetto`, i campi che differiscono tra CRM e TheFork (confronto case-insensitive) finiscono in `clienti_import_diff`. La UI li mostra raggruppati per cliente; Marco sceglie **Applica** (vince TheFork) o **Ignora** (vince il CRM) → `POST /clienti/import/diff/risolvi`. Il conteggio pending appare come badge amber sulla tab Impostazioni (`ClientiNav.jsx:27-31,69-73`).
4. **Export Google CSV** (§10).

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
