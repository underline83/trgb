# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-20 (sessione 11 — Infrastruttura: backup, sicurezza, multi-PC, Google Drive)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-20, sessione 11)

### Infrastruttura: backup, sicurezza, multi-PC, Google Drive

#### Autosave & fix frontend
1. **ChiusuraTurno.jsx** — completato autosave localStorage: restoreDraft() su 404, clearDraft() dopo save, banner info "Bozza ripristinata"
2. **ChiusureTurnoLista.jsx** — fix formula quadratura: ora calcola correttamente `entrate - giustificato` con tutti i campi (fondo cassa, preconti, spese, fatture). Label cambiata da "Diff" a "Quadr." con tooltip

#### VPS Recovery & Sicurezza
3. **Accesso VPS** — risolto blocco SSH (IP bannato da fail2ban), reset password via GRUB recovery, riconfigurazione chiavi SSH
4. **fail2ban** — configurato: whitelist reti private, bantime 10 minuti
5. **Backup automatico** — `backup.sh` + cron notturno alle 3:00, 5 database, retention 30 giorni

#### Git & Deploy
6. **Architettura Git ibrida** — `origin` → VPS bare repo (deploy automatico), `github` → GitHub (backup codice)
7. **push.sh** riscritto — commit + push VPS + push GitHub in un colpo, con alias SSH `trgb`
8. **Server working directory** — corretto remote da GitHub a bare repo locale
9. **setup-backup-and-security.sh** — script one-time per configurare cron + fail2ban

#### Multi-PC
10. **Windows configurato** — chiave SSH ed25519, alias `trgb` in SSH config, repo clonato con remote origin + github, VS Code funzionante con Git Bash

#### Backup download dall'app
11. **backup_router.py** (NUOVO) — endpoint API per download backup on-demand, lista backup giornalieri, info stato DB
12. **ImpostazioniSistema.jsx** — aggiunto tab "Backup" con download istantaneo, lista backup giornalieri scaricabili, stato database

#### Google Drive
13. **rclone** installato e configurato sul VPS (v1.73.2, OAuth con Google Drive)
14. **backup.sh aggiornato** — dopo compressione, upload automatico su `TRGB-Backup/` via rclone
15. **Copia completa app** su Google Drive in `TRGB-Backup/app-code/`
16. **Script** copiati in `TRGB-Backup/scripts/`

#### Documentazione
17. **deploy.md** — aggiornato con Google Drive, download dall'app, path Windows corretto
18. **GUIDA-RAPIDA.md** — aggiunta sezione Drive, sincronizzazione PC, tabella postazioni
19. **sessione.md** — aggiornamento completo (questo file)

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-16, sessione 10)

### Cantina & Vini v4.0 — filtro unificato, stampa selezionati, SchedaVino sidebar

#### Backend
1. **Nuovo endpoint** `POST /vini/cantina-tools/inventario/selezione/pdf` — accetta lista ID via Body, genera PDF con WeasyPrint e ritorna Response con bytes (autenticazione Bearer token)

#### Frontend
2. **MagazzinoVini.jsx** v4.0 — **filtro locazioni unificato**: 8 state vars e 6 select cascading sostituiti con 2 dropdown (Locazione + Spazio), logica di filtro cross-colonna su tutte e 4 le colonne DB
3. **handlePrintSelection()** — entrambi i pulsanti "Stampa selezionati" ora chiamano direttamente il nuovo endpoint POST (fetch+blob+createObjectURL), senza aprire StampaFiltrata
4. **SchedaVino.jsx** v5.0 — layout completamente riscritto da scroll verticale a **sidebar+main** con CSS grid `grid-cols-[260px_1fr]`
5. **Mappa `TIPOLOGIA_SIDEBAR`** — 8 gradients che corrispondono ai colori categoria della tabella MagazzinoVini

---

## Sessioni precedenti (3-9)

| # | Data | Tema |
|---|------|------|
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

### Cambio PIN
- **Frontend**: `CambioPIN.jsx` a `/cambio-pin`
- **Backend**: usa endpoint esistente `PUT /auth/users/{username}/password`

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v4.0 | stabile |
| Gestione Acquisti | v2.0 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v2.0 | stabile |
| Statistiche | v1.0 | beta |
| Banca | v1.0 | beta |
| Finanza | v1.0 | beta |
| Dipendenti | v1.0 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v4.4 | stabile |

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

1. **Configurare snapshot Aruba settimanale** dal pannello
2. **DNS dinamico casa** (DDNS) — rimandato, opzione "Personalizzare" su TIM Hub+ con endpoint VPS
3. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
4. **Test SchedaVino sidebar+main** — verificare rendering, colori tipologia, responsive
5. **Test filtro locazioni unificato** — verificare filtro cross-colonna
6. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt
app/data/users.json                    — store utenti (marco/iryna/paolo/ospite)

# --- BACKUP ---
app/routers/backup_router.py           — download backup on-demand, lista, info
backup.sh                              — backup notturno + upload Google Drive
setup-backup-and-security.sh           — setup cron + fail2ban (one-time)

# --- CHIUSURE TURNO ---
app/routers/chiusure_turno.py          — backend, prefix /chiusure-turno
frontend/src/pages/admin/ChiusuraTurno.jsx  — form fine servizio (con autosave)
frontend/src/pages/admin/ChiusureTurnoLista.jsx — lista chiusure admin (quadratura corretta)

# --- VINI ---
app/routers/vini_router.py               — carta vini + movimenti (v3.0, solo magazzino)
app/routers/vini_magazzino_router.py     — magazzino vini CRUD
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.1, loader unificato)
app/models/vini_magazzino_db.py          — DB unico vini + fix delete_movimento
app/services/carta_vini_service.py       — builder HTML/PDF/DOCX carta vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino (usato da tutti)

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

# --- VENDITE ---
app/routers/admin_finance.py              — corrispettivi legacy
frontend/src/pages/admin/VenditeNav.jsx   — navigazione

# --- IMPOSTAZIONI ---
frontend/src/pages/admin/ImpostazioniSistema.jsx — tab Utenti + Moduli + Backup

# --- FRONTEND ---
frontend/src/App.jsx                   — tutte le route (50+)
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.jsx       — versioni moduli
frontend/src/components/Header.jsx     — header + cambio PIN
frontend/src/pages/CambioPIN.jsx       — self-service + admin reset
```

---

## DB — mappa rapida

| Database | Moduli |
|----------|--------|
| ~~`vini.sqlite3`~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina moderna |
| `vini_settings.sqlite3` | Settings carta |
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Finanza + Statistiche (migraz. 001-018) |
| `admin_finance.sqlite3` | Vendite + Chiusure turno |
| `dipendenti.sqlite3` | Dipendenti (runtime) |

### Backup database
- **Automatico**: ogni notte alle 3:00 → `/home/marco/trgb/backups/` + Google Drive `TRGB-Backup/`
- **Manuale da app**: Admin → Impostazioni → tab Backup
- **Manuale da CLI**: `ssh trgb "/home/marco/trgb/trgb/backup.sh"`
- **Retention**: 30 giorni (locale + Drive)

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
