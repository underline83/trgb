# Modulo Clienti / CRM — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (creato in consolidamento docs Batch 6)
**Stato:** Operativo. Sincronizzazione Mailchimp ✅ FATTA (CL.1). Altre voci CL in roadmap.
**Versione modulo (`versions.jsx`):** clienti v1.x · mailchimp_sync v1.0
**Sezione top-level:** `/clienti/*`
**Backend prefix:** `/clienti/*`
**DB:** `app/data/clienti.sqlite3` (tabelle `clienti`, `clienti_prenotazioni`, `clienti_preventivi*`)
**Roadmap:** sezione `CL.` di `docs/roadmap.md`
**Documenti correlati:**
- `modulo_prenotazioni.md` — gestione operativa prenotazioni (cross-modulo)
- `modulo_preventivi.md` — preventivi eventi/banchetti (cross-modulo)
- `modulo_statistiche.md` — analisi vendite iPratico (separato)

---

# 0. Indice

1. Panoramica
2. Tabelle DB principali (`clienti.sqlite3`)
3. Pagine frontend
4. CRM — funzioni base (anagrafica, ricerca, scheda)
5. Segmentazione e RFM
6. Tag CRM (VIP, Habitué, Nuovo, ...)
7. Sincronizzazione Mailchimp ✅ FATTA (CL.1)
8. Cross-modulo Preventivi
9. Cross-modulo Prenotazioni
10. Roadmap CL (riferimento `roadmap.md` §CL)

---

# 1. Panoramica

Il modulo **Clienti / CRM** centralizza l'anagrafica clienti dell'osteria, lo storico delle visite, le preferenze, le allergie, le segmentazioni di marketing.

**Numeri attuali:**
- 24.445 clienti con storico completo
- 31.279 prenotazioni storiche (importate principalmente da TheFork)
- Database popolato a marzo 2026 dall'import iniziale TFM

Il CRM lavora in tandem con:
- **Prenotazioni** — ogni prenotazione ha `cliente_id` FK; lo storico visite alimenta il segmento marketing
- **Preventivi** — `cliente_id` FK opzionale; storico preventivi per cliente in tab dedicato della scheda
- **Mailchimp** — sync automatico clienti con email + newsletter attiva (vedi §7)

---

# 2. Tabelle DB principali (`clienti.sqlite3`)

## 2.1 `clienti`

Anagrafica completa: `id`, `nome`, `cognome`, `email`, `telefono`, `data_nascita`, `compleanno_giorno`, `compleanno_mese` (campi separati per query "compleanno questo mese"), `citta`, `indirizzo`, `note`, `tags` (JSON o stringa CSV), `allergie` (testo libero), `preferenze_cibo` (testo libero), `rank` (1-5 stars), `segmento_marketing` (stringa: nuovo/abituale/in_calo/perso/VIP/...), `newsletter_attiva` (0/1), `created_at`, `updated_at`.

## 2.2 `clienti_prenotazioni`

Storico prenotazioni: `id`, `cliente_id` (FK), `data_pasto`, `ora_pasto`, `pax`, `tavolo`, `stato` (RECORDED/ARRIVED/SEATED/LEFT/NO_SHOW/CANCELED/REFUSED/REQUESTED), `canale` (Offline/TheFork/Walk-in/Widget/TripAdvisor/Michelin), `prenotato_da`, `data_prenotazione`, `note_ristorante`, `note_cliente`, `occasione`, `seggioloni`, `esterno`, `turno`, `fonte`, `creato_da`, `conferma_inviata`, `reminder_inviato`, `token_cancellazione`, `updated_at`. Vedi `modulo_prenotazioni.md` per dettaglio.

## 2.3 `clienti_preventivi*`

Tabelle preventivi (testata, righe, template). Vedi `modulo_preventivi.md` per schema completo.

## 2.4 `clienti_menu_template*`

Menu di banchetto riutilizzabili nei preventivi. Indipendenti dal modulo Menu Carta (`menu_carta.sqlite3`/`bevande.sqlite3` o foodcost.db).

---

# 3. Pagine frontend

Tutte in `frontend/src/pages/clienti/`:

| File | Route | Funzione |
|------|-------|----------|
| `ClientiMenu.jsx` | `/clienti` | Hub modulo con KPI e tile |
| `ClientiNav.jsx` | (componente condiviso) | — |
| `ClientiAnagrafica.jsx` | `/clienti/anagrafica` | Lista + ricerca + filtri segmenti |
| `ClientiScheda.jsx` | `/clienti/:id` | Scheda completa con tab (anagrafica, prenotazioni, preventivi, note) |
| `ClientiNuovo.jsx` | `/clienti/nuovo` | Form creazione |
| `ClientiSegmenti.jsx` | `/clienti/segmenti` | Vista segmentazione marketing |
| `ClientiMailchimp.jsx` | `/clienti/mailchimp` | Stato sync + sincronizza ora + dati sincronizzati (vedi §7) |
| `ClientiImpostazioni.jsx` | `/clienti/impostazioni` | Config: tag, segmenti, soglie RFM, template |

---

# 4. CRM — funzioni base

## 4.1 Anagrafica

CRUD completo. Form con validazione (email format, telefono internazionalizzato), gestione tag multipli (VIP, Habitué, ecc.), allergie/preferenze testo libero, compleanno con campi giorno/mese separati per query "compleanni questo mese".

## 4.2 Ricerca

Endpoint `GET /clienti/search?q=...` per autocomplete (riusato da Prenotazioni e Preventivi). Match su nome, cognome, telefono, email.

## 4.3 Scheda cliente

Layout sidebar + tab principale (pattern coerente con altri moduli):
- **Sidebar:** dati anagrafici principali, badge segmento + tag, contatori (n. visite, ultima visita, totale speso se disponibile)
- **Tab Prenotazioni:** storico cronologico prenotazioni, stato, pax, canale
- **Tab Preventivi:** storico preventivi (vedi `modulo_preventivi.md` §3 "Tab nella scheda cliente")
- **Tab Note:** note operative + storico interazioni
- **Tab Allergie/Preferenze:** evidenza visiva (banner rosso se allergie significative, banner amber se preferenze)

## 4.4 KPI hub

In `ClientiMenu.jsx`:
- Totale clienti attivi
- Nuovi questo mese
- Compleanni questa settimana
- Top frequentatori (segmento Habitué)
- Clienti in_calo (alert da riconquistare)

---

# 5. Segmentazione e RFM

## 5.1 Segmento marketing

Campo `clienti.segmento_marketing` ricalcolato periodicamente (cron o on-demand) in base a:
- **Recency** — giorni dall'ultima visita
- **Frequency** — n. visite ultimi 12 mesi
- **Monetary** — non disponibile (iPratico non esporta dati vendita per cliente)

Categorie:
- `nuovo` — prima visita < 30 giorni
- `abituale` — > 6 visite negli ultimi 12 mesi
- `in_calo` — abituale che non viene da > 90 giorni
- `perso` — > 365 giorni dall'ultima visita
- `VIP` — flag manuale + frequency alta
- `habitue` — alias di abituale (Marco usa entrambi)

## 5.2 Vista segmenti — `ClientiSegmenti.jsx`

Pagina con tile per segmento + lista clienti per ogni segmento. Click su tile → filtro lista. Permette campagne mirate (tag in massa, export per Mailchimp segment).

> ⚠ **Status:** ricalcolo segmento_marketing oggi è manuale (admin trigger) o batch nightly (da implementare?). Voce roadmap CL.x.

---

# 6. Tag CRM

Tag multipli per cliente, configurabili in Impostazioni:
- **VIP** — assegnato manualmente da Marco
- **Habitué** — alias abituale (per chi è cliente storico)
- **Nuovo** — primo arrivo recente
- **Compleanno_questo_mese** — tag dinamico (calcolato runtime, non salvato)
- Tag custom liberi (es. "Vegetariano", "Gluten-free", "Sommelier")

UI: chip colorati nella scheda + nel form anagrafica. Filtri lista per tag.

---

# 7. Sincronizzazione Mailchimp ✅ FATTA (CL.1)

> **Stato:** Operativo. Vedi `frontend/src/pages/clienti/ClientiMailchimp.jsx`.

## 7.1 Configurazione

Variabili env (`.env` sul VPS):
```
MAILCHIMP_API_KEY=la-tua-api-key-usXX
MAILCHIMP_LIST_ID=il-tuo-audience-id
```

API Key da Mailchimp → Account → Extras → API Keys.
Audience ID da Mailchimp → Audience → Settings → Audience name and defaults.

Restart backend dopo modifica: `sudo systemctl restart trgb-backend`.

## 7.2 Endpoint backend

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/clienti/mailchimp/status` | Stato connessione (connected, account_name, email, audience_name, member_count) |
| POST | `/clienti/mailchimp/sync` | Sincronizza tutti i clienti con email + newsletter attiva |

Il sync è idempotente: ri-eseguibile senza creare duplicati. Mailchimp usa l'email come chiave univoca; ogni cliente esistente viene aggiornato, nuovo creato.

## 7.3 Dati sincronizzati

Per ogni cliente vengono inviati a Mailchimp:

**Merge fields:**
- `FNAME` — nome
- `LNAME` — cognome
- `PHONE` — telefono
- `BIRTHDAY` — compleanno (formato `MM/DD` per automazione Mailchimp)
- `CITTA` — città
- `RANK` — rank 1-5
- `SEGMENTO` — segmento marketing
- `ALLERGIE` — allergie
- `PREF_CIBO` — preferenze cibo

**Tags Mailchimp:**
- Tag CRM (VIP, Habitué, ecc.)
- Tag automatici per segmento: `segmento:abituale`, `segmento:in_calo`, `segmento:perso`, `segmento:nuovo`, ecc.

## 7.4 UI — `ClientiMailchimp.jsx`

- **Stato connessione:** card con badge connected/non-connesso, account, email, audience, member_count Mailchimp
- **Pulsante "Sincronizza ora"** (Btn variant=success) — esegue POST /sync
- **Risultati sync:** card con 4 mini-stats (Candidati, Sincronizzati, Saltati, Errori) + lista dettagli errori se presenti
- **Box info "Dati sincronizzati"** — esplicita cosa viene inviato (merge fields, tags, segmenti)
- **Sezione "Come usare i segmenti in Mailchimp"** — esempi pratici di campagne:
  - Campagna riconquista: `segmento:in_calo` + `segmento:perso`
  - Newsletter VIP: `VIP` + `segmento:abituale`
  - Benvenuto nuovi: `segmento:nuovo`
  - Auguri compleanno: merge field `BIRTHDAY` (automazione Mailchimp)

## 7.5 Pattern Btn (M.I primitives)

Header file: `// @version: v1.1-mattoni — M.I primitives (Btn) su CTA Sincronizza + bg-brand-cream`. Esempio applicazione coerente del mattone M.I.

## 7.6 Account Mailchimp

Account legato: **osteriatregobbi@gmail.com** (NON personale di Marco).

---

# 8. Cross-modulo Preventivi

Il modulo Preventivi (`modulo_preventivi.md`) ha:
- `clienti_preventivi.cliente_id` FK opzionale a `clienti.id` (preventivi senza cliente CRM ammessi)
- Tab "Preventivi" nella scheda cliente CRM con storico
- Bottone "Nuovo preventivo" da scheda cliente con cliente_id pre-compilato

---

# 9. Cross-modulo Prenotazioni

Il modulo Prenotazioni (`modulo_prenotazioni.md`) ha:
- `clienti_prenotazioni.cliente_id` FK a `clienti.id`
- Form prenotazione con autocomplete cliente (riusa `/clienti/search`)
- Tab "Prenotazioni" nella scheda cliente CRM con storico
- Banner allergie/preferenze nel form prenotazione se cliente ha dati significativi

---

# 10. Roadmap CL (sintesi — dettaglio in `roadmap.md` §CL)

| ID | Cosa | Stato |
|----|------|-------|
| CL.1 | Sync Mailchimp completo | ✅ FATTO (vedi §7) |
| CL.2 | Ricalcolo segmento_marketing batch nightly | ⏳ da fare |
| CL.3 | Cron pulizia bozze auto preventivi (TTL 7gg) | ⏳ TODO (vedi `inventario_pulizia.md`) |
| CL.4 | Tab "Compleanni questo mese" nella Home | ⏳ TODO |
| CL.5 | Export CSV clienti per Mailchimp segment manuale | ⏳ TODO |
| CL.6 | Storico interazioni (chiamate, WA, email) | ⏳ TODO |
| CL.7 | Anagrafica preferenze vini per cliente (lista vini graditi/sgraditi) | ⏳ TODO |
| CL.8 | Importazione clienti da TheFork XLSX (oltre quelli iniziali 31k) | ⏳ TODO |
| CL.9 | Anti-duplicazione clienti su import (match per telefono+email) | ⏳ TODO |
| CL.10+ | altre voci CL — vedi `roadmap.md` §CL | ⏳ |

> **Note Marco (Batch 6):** voci CL.x specifiche da approfondire al prossimo passaggio. Lasciato segnaposto qui per non perderle.
