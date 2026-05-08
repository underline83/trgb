# Database — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08
**Path canonico:** `locali/tregobbi/data/` (post R6.5 push 2+3, vedi `architettura_locale.md`).
**Path legacy:** `app/data/` — mantenuto per dev locale, NON in produzione (R6.5 push 3 ha rimosso il fallback runtime).
**Migrazioni:** solo `foodcost.db` ha migrazioni tracciate via `migration_runner.py` + `schema_migrations` (001-107). Gli altri 9 DB hanno schema runtime via `init_*_db()` (debt aperto T.5 in `roadmap.md`).
**Pattern WAL:** attivo su `vini_magazzino`, `notifiche`, `foodcost`, `vini`, `vini_settings`. Da estendere ai restanti 5 DB (T.4 in `roadmap.md`).

---

## 1. Database attivi (10 file)

| File | Modulo | DB pattern | Versione/migrazioni |
|------|--------|-----------|---------------------|
| `foodcost.db` | Ricette/FoodCost + Acquisti (XML/FIC) + Banca/CG + iPratico + Statistiche | migrazioni tracciate | mig 001-107 (vedi §11) |
| `vini_magazzino.sqlite3` | Vini — magazzino + movimenti + ordini + storico prezzi | runtime | v3.x |
| `vini_settings.sqlite3` | Vini — settings Carta (tipologie/nazioni/regioni/filtri) | runtime | v1.x |
| `vini.sqlite3` | Vini — DB ponte Carta Cliente pubblica (`/vini/carta-cliente/data`) | runtime | v3.0+ (post-recovery 2026-05) |
| `admin_finance.sqlite3` | Vendite/Selezioni — chiusure turno + corrispettivi giornalieri | runtime | v2.x |
| `dipendenti.sqlite3` | Dipendenti + turni + (futuro: buste paga, presenze, scadenze, contratti) | runtime | v1.x → v2.x in roadmap |
| `clienti.sqlite3` | CRM + Prenotazioni + Preventivi (3 sub-moduli, stesso DB) | runtime | v1.x |
| `bevande.sqlite3` | Carta Bevande — sezioni + voci editoriali (7 sezioni extra-vini) | runtime | v1.0 (mig 089 nel codice ma DB separato) |
| `tasks.sqlite3` | Cucina — checklist HACCP + task singoli + livelli/brigata | runtime | v1.x (mig 084-088 nel codice, DB separato dopo R6.5) |
| `notifiche.sqlite3` | M.A Notifiche — alert system-wide | runtime | v1.x |

> ⚠️ **Note path:**
> - In **produzione**: tutti e 10 in `/home/marco/trgb/trgb/locali/tregobbi/data/`.
> - In **dev locale Mac**: `app/data/` (non locale-aware, è il path legacy pre-R6.5).
> - `users.json`, `modules.json`, `modules.runtime.json`, `modules.runtime.meta.json`, `closures_config.json` vivono nello stesso path (sono config, non DB).

---

## 2. `foodcost.db` — DB monolitico cross-modulo

DB principale, gestito da `migration_runner.py` con tabella `schema_migrations`. Contiene tabelle di **6 moduli** (cluster monolitico):
- Ricette/FoodCost (anagrafica, ricette, matching)
- Acquisti (fatture XML, FIC, fornitori, categorie)
- Banca (movimenti, link fatture)
- Controllo Gestione (uscite, spese fisse, batch pagamenti)
- iPratico Products (mapping vini ↔ prodotti)
- Statistiche (import iPratico)
- Cucina (Pranzo + Menu Carta + Selezioni — con alias `cucina_db.py` post 2026-04-27 in vista split fisico Fase 1)

> **Debt:** lo split DB Cucina è in roadmap (vedi `inventario_pulizia.md` §"Split DB cucina"). Fase 0 fatta (alias), Fase 1 (mig + connessione vera) da fare.

### 2.1 Tabelle Ricette/FoodCost (vedi `modulo_ricette_foodcost.md` §4)
- `ingredient_categories`, `ingredients`, `ingredient_prices`
- `ingredient_supplier_map` ⭐ (chiave matching)
- `ingredient_unit_conversions`
- `recipe_categories`, `recipes`, `recipe_items`
- `matching_description_exclusions`, `matching_ignored_righe`

### 2.2 Tabelle Acquisti / Fatture XML (vedi `modulo_acquisti.md` §9)
- `suppliers` (anagrafica fornitori, auto-creati da XML)
- `fe_fatture` (testata fatture + flag pagato denormalizzato + iban + modalità + stato pagamento)
- `fe_righe` (righe fatture)
- `fe_categorie`, `fe_fornitore_categoria` (con `escluso` per Ricette + `escluso_acquisti` per Acquisti, **mai mescolare**), `fe_prodotto_categoria`
- `fe_proforme` (mig 065, **in pausa** — vedi `modulo_acquisti.md` §11)

### 2.3 Tabelle Banca (vedi `modulo_banca.md`)
- `banca_movimenti` (mig 014 + 059 `riconciliazione_chiusa` + 082 `parcheggiato`)
- `banca_fatture_link` (N:M movimento ↔ fattura, da estendere con `importo_applicato` per split — vedi `spec_riconciliazione.md`)
- `banca_categorie_map`
- `banca_import_log`

### 2.4 Tabelle Controllo Gestione (vedi `modulo_controllo_gestione.md`)
- `cg_uscite` — scadenzario unificato (FATTURA/PROFORMA/STIPENDIO/SPESA_RICORRENTE)
- `cg_spese_fisse` (predisposta, modulo non ancora implementato — voce G.1 roadmap)
- `cg_piano_rate` (mig 048 — rateizzazioni formali)
- `cg_pagamenti_batch` (batch pagamenti multipli)

### 2.5 Tabelle iPratico
- `ipratico_product_map` — mapping prodotti iPratico ↔ vini (codice 4 cifre = `vini_magazzino.id`)
- `ipratico_sync_log`
- `ipratico_export_defaults`

### 2.6 Tabelle Statistiche (vendite iPratico, vedi `modulo_statistiche.md`)
- `ipratico_imports` (log import mensile)
- `ipratico_categorie` (riepilogo per categoria)
- `ipratico_prodotti` (dettaglio per prodotto)

### 2.7 Tabelle Cucina (alias da split — vedi `modulo_cucina.md`)
- `service_types`, `recipe_service_types` (dish kind = "Alla carta"/"Banchetto"/"Pranzo di lavoro"/"Aperitivo")
- `pranzo_*` (mig 102, modulo Pranzo lavoro — vedi `modulo_pranzo.md`)
- `menu_carta_*` (mig 098, edizioni + sezioni + pubblicazioni — vedi `modulo_menu_carta.md`)
- `lista_spesa_*` (mig 105)
- `home_actions` (mig 090, configurazione pulsanti rapidi Home per ruolo — vedi `spec_home_per_ruolo.md`)
- `scelta_*` (mig 091/092/093/094, selezioni del giorno)
- `vini_ordini_pending`, `vini_prezzi_storico` (mig 095, widget riordini — vedi `modulo_vini_widget_dashboard.md`)

---

## 3. `vini_magazzino.sqlite3`

Vedi `modulo_vini.md` §3.5 per schema completo.

| Tabella | Contenuto |
|---------|-----------|
| `vini_magazzino` | Anagrafica + giacenze 4 locazioni + flag CARTA/IPRATICO/DISCONTINUATO + stati operativi |
| `vini_magazzino_movimenti` | Storico movimenti (CARICO/SCARICO/VENDITA/RETTIFICA) |
| `vini_magazzino_note` | Note operative per vino |
| `vini_ordini_pending` | Ordini pending widget riordini (UNIQUE su vino_id) |
| `vini_prezzi_storico` | Storico variazioni prezzo (CHECK su campo: EURO_LISTINO/PREZZO_CARTA/PREZZO_CALICE) |
| `locazioni_config` | Mappa locazione → spazi disponibili |

---

## 4. `vini_settings.sqlite3`

Settings ordinamento e filtri Carta Vini.

| Tabella | Contenuto |
|---------|-----------|
| `tipologia_order` | Ordine tipologie (BOLLICINE, BIANCHI, ...) |
| `nazioni_order` | Ordine nazioni |
| `regioni_order` | Ordine regioni per nazione |
| `filtri_carta` | Filtri attivi (`min_qta`, `mostra_negativi`, `mostra_senza_prezzo`) |

---

## 5. `vini.sqlite3`

DB ponte per Carta Cliente pubblica (endpoint `/vini/carta-cliente/data` no-auth). Contiene snapshot della carta servito al cliente al tavolo. **Resuscitato post-recovery 2026-05-04** (era stato eliminato in v3.0 ma rientrato come ponte).

> **Note:** schema esatto da rivedere — al momento è una proiezione runtime di `vini_magazzino` filtrata per `CARTA='SI'` + sezioni bevande. Vedi `analisi_hardening_vps.md` §1 per i dettagli.

---

## 6. `admin_finance.sqlite3` (Vendite/Selezioni)

Vedi `modulo_selezioni.md` §8 per dettaglio operativo.

| Tabella | Contenuto |
|---------|-----------|
| `daily_closures` | Chiusure giornaliere (legacy, da import Excel) |
| `shift_closures` | Chiusure turno (pranzo/cena) con logica cumulativa + fondo cassa + coperti |
| `shift_preconti` | Pre-conti (tavoli non battuti, tavolo + importo) |
| `shift_spese` | Spese turno (scontrino/fattura/personale/altro) |
| `shift_checklist_config` | Config checklist (predisposta, da popolare in K.3 roadmap) |
| `shift_checklist_responses` | Risposte checklist |

---

## 7. `dipendenti.sqlite3`

Vedi `modulo_dipendenti.md` §4 per schema completo (corrente + nuove tabelle v2.x in roadmap).

**Schema corrente (v1.x):**
| Tabella | Contenuto |
|---------|-----------|
| `dipendenti` | Anagrafica completa (codice, nome, cognome, ruolo, IBAN, indirizzo, data_nascita, data_assunzione, is_active, costo_orario, giorno_paga) |
| `turni_tipi` | Tipologie turno legacy (nome, ora_inizio/fine, ore_lavoro, colore) |
| `turni_calendario` | Assegnazioni turno legacy (dipendente_id, turno_tipo_id, data, note) |
| `dipendenti_allegati` | Schema esiste, **endpoint non implementato** (D-DEBT2 problemi.md) |
| `reparti` | Reparti di prima classe (SALA, CUCINA, estendibili) — Turni v2.0 |
| `dipendenti_costi` | Costi storici dipendente |

**Nuove tabelle previste v2.x** (vedi `modulo_dipendenti.md` §4.3):
- `buste_paga` (v2.1) — cedolini importati da PDF + scadenza netto in `cg_uscite`
- `dipendenti_contratti` (v2.5)
- `dipendenti_scadenze` (v2.2) — HACCP/sicurezza/visite/permessi con alert
- `dipendenti_presenze` (v2.3) — registro giornaliero

---

## 8. `clienti.sqlite3` (CRM + Prenotazioni + Preventivi)

DB condiviso tra 3 sub-moduli. Vedi `modulo_clienti_crm.md`, `modulo_prenotazioni.md`, `modulo_preventivi.md`.

| Tabella | Sub-modulo | Contenuto |
|---------|-----------|-----------|
| `clienti` | CRM | Anagrafica (24.445 record), tag, segmento marketing, allergie, preferenze, rank, newsletter_attiva |
| `clienti_prenotazioni` | Prenotazioni | Storico prenotazioni (31.279 record da TheFork import), stato, canale, tavolo, pax, turno |
| `clienti_preventivi` | Preventivi | Testata preventivi (numero progressivo annuale `PRE-{anno}-{NNN}`, stato, transizioni) |
| `clienti_preventivi_righe` | Preventivi | Righe editabili con totale live |
| `clienti_preventivi_template` | Preventivi | Template menu riutilizzabili |
| `clienti_menu_template` | Banchetti | Menu di banchetto (separati da Menu Carta) |
| `prenotazioni_config` | Prenotazioni | Config slot orari, capienze, soglie (predisposta) |
| `tavoli` | Prenotazioni | 14 interni + 20 esterni (predisposta, Fase 2) |
| `tavoli_combinazioni` | Prenotazioni | Combinazioni multi-tavolo (predisposta) |

---

## 9. `bevande.sqlite3` (Carta Bevande)

Vedi `modulo_vini.md` §6.3 per schema completo.

| Tabella | Contenuto |
|---------|-----------|
| `bevande_sezioni` | 8 sezioni (vini + 7 extra: aperitivi, birre, amari_casa, amari_liquori, distillati, tisane, tè) con `layout` enum + `schema_form` JSON |
| `bevande_voci` | Tabella piatta voci (campi non pertinenti = NULL, dettagli specifici in `extra` JSON) |

---

## 10. `tasks.sqlite3` (Cucina checklist + task singoli)

Vedi `modulo_cucina.md` §2 per schema completo.

| Tabella | Contenuto |
|---------|-----------|
| `checklist_template` | Definizioni ricorrenti (nome, reparto, turno, `ora_scadenza_entro`, `livello_cucina`) |
| `checklist_item` | Voci template (CHECKBOX/NUMERICO/TEMPERATURA/TESTO) |
| `checklist_instance` | Istanze giornaliere generate (UNIQUE su template+data+turno, `livello_cucina`) |
| `checklist_execution` | Esiti voci (OK/FAIL/SKIPPED/PENDING) |
| `task_singolo` | Task non ricorrenti (priorità, scadenza, `livello_cucina`, anti-escalation) |
| `cucina_alert_log` | Scaffold V1 (vuoto in MVP) |

> ⚠️ Phase A.2 (livelli cucina) + Phase A.3 (brigata cucina) hanno aggiunto `livello_cucina` con vincolo: NOT NULL solo se `reparto='cucina'`.

---

## 11. `notifiche.sqlite3` (M.A)

Mattone Notifiche cross-modulo. Vedi `architettura_mattoni.md` §M.A.

| Tabella | Contenuto |
|---------|-----------|
| `notifiche` | Notifiche con `livello`, `categoria`, `letta`, `utente_destinatario`, `dato_collegato` (FK polimorfa) |
| `alert_config` | Config M.F Alert Engine (mig dedicate, vedi `architettura_mattoni.md` §M.F) |
| `alert_log` | Log alert generati con anti-duplicato 12-24h |

---

## 12. Migrazioni significative `foodcost.db` (ordine cronologico)

- **001-013** Schema iniziale Ricette/FoodCost v2 (post-rebuild marzo 2026)
- **014** Banca `banca_movimenti` + `banca_fatture_link`
- **018** Statistiche iPratico
- **020-022** iPratico Products mapping
- **029-030** Acquisti — reset `categoria_auto`, `escluso_acquisti`
- **048** CG `cg_piano_rate` (rateizzazioni formali)
- **055-057** v2.0 CG aggregatore — fe_fatture come fonte di verità pianificazione (vedi `query_cg_uscite_aggregatore.sql`)
- **059** `banca_movimenti.riconciliazione_chiusa` (workaround pre-spec_riconciliazione)
- **065** `fe_proforme` (in pausa)
- **082** `banca_movimenti.parcheggiato`
- **084** Cucina MVP (DDL 6 tabelle + 3 seed)
- **088** `livello_cucina` (Phase A.2)
- **089** Carta Bevande
- **090** `home_actions` (vedi `spec_home_per_ruolo.md`)
- **091-094** `scelta_*` (selezioni del giorno cucina)
- **095** `vini_ordini_pending` + `vini_prezzi_storico`
- **096** repair scadenze stipendio orfane
- **097** import MEP templates
- **098** Menu Carta init
- **099-100** Seed food cost test + Menu Primavera 2026
- **101** `vini_bottiglia_aperta`
- **102** Pranzo init
- **103** Fatture stato pagamento
- **104** Cleanup `in_pagamento_at` stuck
- **105** Lista spesa
- **106** Birre — abbinamenti gluten-free
- **107** Piatti del giorno + formaggi paese

---

## 13. Convenzioni

- **Prezzi mai sovrascritti**, sempre storicizzati (tabelle `_prices`, `_prezzi_storico`)
- **Categorie in tabella**, non testo libero
- **Soft delete**: usare `is_active=0`, non DELETE (per audit/recovery)
- **WAL mode obbligatorio**: pattern `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=30000;` in ogni `get_xxx_connection()`. Vedi `architettura_pattern.md` §2.
- **Path locale-aware**: usare `locale_data_path("nome_file")` da `app/utils/locale_data.py` (post R6.5 push 3 — fail-loud, niente fallback).
- **Naming tabelle**: prefisso modulo (`vini_*`, `dipendenti_*`, `cg_*`, `pranzo_*`, `menu_carta_*`, `cucina_*`, `lista_spesa_*`, `tasks_*`). Tabelle generiche cross-modulo (`audit_log`, `notifiche`, `users`) in platform.

---

## 14. File config (non DB)

In `locali/tregobbi/data/`:
- `users.json` — utenti con ruolo + PIN hash (non SQLite)
- `modules.json` — moduli abilitati per locale (sorgente)
- `modules.runtime.json` — moduli auto-generati (NON modificare a mano, runtime)
- `modules.runtime.meta.json` — meta runtime
- `closures_config.json` — giorno chiusura settimanale + giorni chiusi (vedi `modulo_selezioni.md` §10)

---

## 15. Backup

Sistema completo post-incidente 4 maggio 2026. Vedi `sicurezza_backup.md` per architettura.

- **Hourly:** ogni ora, retention 48h
- **Daily:** alle 03:30 + 18:00, retention 7gg + sync Drive (`gdrive:TRGB-Backup/db-daily`)
- **Last Known Good:** 10 DB integri preservati + 5 JSON
- **Sanity check:** `sqlite3 PRAGMA integrity_check` su ogni DB post-restart (in `push.sh` v2)
- **Watchdog:** `check_backup_health.sh` ogni 30min con alert M.A se `unhealthy`

---

## 16. Eliminati storici

| File | Motivo | Quando |
|------|--------|--------|
| `vini.sqlite3` (vecchio) | Sostituito da `vini_magazzino.sqlite3` v3.0 | 2026-03-15 |
| `ingredients.sqlite3` | Vuoto, mai usato | 2026-03-28 |
| `vini.db` | Residuo legacy | 2026-03-28 |
| `dipendenti.db` | DB orfano 0 byte | sessione 57 cont. (2026-04-25) |

> **Nota:** `vini.sqlite3` è stato **resuscitato** post-recovery del 4-5 maggio come DB ponte per la carta cliente pubblica (diverso scope dal vecchio `vini.sqlite3` v2 che era il magazzino).
