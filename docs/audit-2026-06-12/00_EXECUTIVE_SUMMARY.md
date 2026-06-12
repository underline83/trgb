# Audit totale TRGB — Executive Summary

**Data:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione:** 5.24 (VPS allineato, verificato live)
**Perimetro:** sistema completo — sicurezza, dati, backend, frontend, architettura, infra VPS, performance, docs, readiness prodotto (10 aree, 9 subagenti + verifica live orchestratore + verifica avversaria indipendente).
**Predecessore:** audit 2026-05-19 (solo docs: health 73/100, giudizio 87/100). **Il perimetro è diverso**: quel giudizio copriva solo l'allineamento documentazione; questo audit copre tutto il sistema. L'unica parte direttamente confrontabile è il health score docs.

---

## Voto complessivo: **63/100**

| Area | Voto | Peso | Contributo |
|---|---|---|---|
| A1+A6sec Sicurezza | **48** | 25% | 12,0 |
| A2 Dati | **72** | 15% | 10,8 |
| A6 Infra/Operatività | **58** | 15% | 8,7 |
| A3 Backend | **74** | 10% | 7,4 |
| A4 Frontend | **78** | 10% | 7,8 |
| A5 Architettura | **70** | 10% | 7,0 |
| A7 Performance | **68** | 5% | 3,4 |
| A8 Docs | **72** | 5% | 3,6 |
| A9 Prodotto | **55** | 5% | 2,75 |
| **Totale pesato** | | | **63,45 → 63** |

**Lettura corretta del voto:** il 63 NON dice "sistema mediocre" — dice "sistema operativamente sano con un buco di sicurezza grave e un gap di readiness prodotto". Il codice applicativo è sopra la media (74-78), i dati sono integri (integrity check 10/10 ok), il sistema di backup post-incidente è esemplare e verificato vivo. A pesare sono: 1 modulo esposto senza autenticazione su internet, hardening VPS incompleto, e i 3 blocchi che impedirebbero oggi di consegnare l'installazione a un cliente pagante.

**Finding totali: ~110** — **3 CRIT · 18 HIGH · 46 MED · 43 LOW** (dopo verifica avversaria: 22 campionati, 82% confermati pieni, 1 smentito e rimosso, 3 ridimensionati — dettaglio in `99_VERIFICA_AVVERSARIA.md`).

---

## Top 10 finding

| # | ID | Sev | Cosa | Verifica |
|---|---|---|---|---|
| 1 | A1-01 | **CRIT** | **Modulo Banca senza autenticazione**: `GET /banca/movimenti` da internet, senza token → 200 OK con 929 movimenti bancari reali (164 KB). 28 endpoint, anche di scrittura/cancellazione. | **Confermato LIVE** |
| 2 | A9-01 | **CRIT** | Migrazioni 047/048 (prestiti BPM personali di Marco, importi reali) NON flaggate `TRGB_SPECIFIC`: ogni installazione nuova (demo trgb.it inclusa) nascerebbe con i suoi dati finanziari. | Confermato |
| 3 | A9-02 | **CRIT** | `SECRET_KEY` JWT con fallback hardcoded nel repo: ogni **nuova installazione da runbook** firmerebbe token con chiave pubblica nota → token superadmin forgiabili. (Tregobbi è coperta: `.env` presente sul VPS.) | Confermato + live |
| 4 | A1-04 | HIGH | Login a PIN 4-6 cifre senza rate limit né lockout, utenti enumerabili via `/auth/tiles`; il manuale promette un "blocco 60s dopo 3 errori" che non esiste. | Confermato |
| 5 | A6-13 | HIGH | SSH: `PermitRootLogin yes` + `PasswordAuthentication yes` su host internet-facing (fail2ban attivo mitiga, non risolve). | **Live** |
| 6 | A6-12 | HIGH | Porte **3389** (gnome-remote-desktop) e **9000/9443** (probabile Portainer, docker attivo) esposte su 0.0.0.0. | **Live** |
| 7 | A1-02 | HIGH | Router iPratico products (`/vini/ipratico/*`: upload file, export) senza autenticazione. | Confermato |
| 8 | A2-01 | HIGH | ~40 migrazioni cross-DB "skip se DB mancante" vengono comunque registrate in `schema_migrations` → su installazione fresca o disaster recovery le colonne mancano per sempre (endpoint a rischio 500). | Confermato |
| 9 | A6-03/A7-01 | HIGH | Frontend di produzione ancora sul **dev server Vite** (noto, T.2b roadmap; processo node:5173 visto vivo sul VPS). | Noto + live |
| 10 | A3-01 / A7-02 | HIGH | SSoT stati pagamento (`stati_pagamento.py`, G.8 "FATTO") importato da nessuno — tuple hardcoded ovunque nel CG · `fe_righe` (11.392 righe, tabella più grande) senza alcun indice. | Confermati |

Gli altri 8 HIGH: A5-01 (4 router fuori dai module.json → sempre montati anche a modulo spento), A6-02 (nessun monitoring esterno di uptime — critico vista la storia del backend zombie), A6-04 (nessun test di restore mai eseguito), A8-02 (giornata Ricette 23/05, 16 commit, completamente non documentata), A9-03/04/05/06 (build FE hardcoded su dominio osteria; runbook con chiave config sbagliata `modules` vs `moduli`; backup script e push.sh hardcoded marco/tregobbi).

---

## Confronto col precedente audit e trend

- **Health docs: 73 → 72** (stabile; stima incrementale). Il debito "non documentato" è crollato dal 9% al 3% (FIC e Selezioni del Giorno ora hanno stub), ma è cresciuta la quota "parziale" e la giornata Ricette del 23/05 è un buco netto di disciplina.
- **Gap del 19/05:** CRIT-1/2/5 chiusi (stub + NOMEN-1 disambiguato), CRIT-3/4 declassati a MED da decisione PO. MED 0/20 chiusi, MIN 2/10 — coerente con le priorità dichiarate.
- **Trend struttura:** R6.5+R8 completati bene; la verifica live mostra il sistema backup post-incidente S60-INC1 **funzionante al 100%** (cron 4 job attivi, 15/15 OK, last_known_good fresco di giornata, health "SANO") — la lezione dell'incidente è stata davvero implementata, manca solo il test di restore.

## 3 cose che funzionano sorprendentemente bene

1. **Il sistema di backup post-incidente**: verificato vivo sul VPS — hourly+daily 03:00+18:00+watchdog 30', integrity check obbligatorio, last_known_good mai rotato, status JSON verdi di giornata. Da incidente catastrofico a best practice in un mese.
2. **Disciplina del codice applicativo**: zero SQL injection da input utente (query tutte parametrizzate), zero violazioni di import tra router di moduli diversi (11/11 hit intra-modulo), mattoni M.A/M.C/M.F rispettati ovunque, modello 3-dimensioni stato pagamento implementato conforme al canone, 51/51 router montati senza dead router.
3. **Architettura locale/modulare reale**: `locali/trgb/` e `_template/` davvero puliti (zero residui Tre Gobbi nei valori), versioning single-source allineato (VERSION = VPS = frontend), commit etichettati con disciplina.

## 5 cose da fare subito (Sessione 1, ~una sera — dettaglio in `10_PIANO_AZIONE.md`)

1. **Auth sul modulo Banca** (`banca_router.py`: 1 riga di `dependencies=[Depends(get_current_user)]` a livello router) — chiude il CRIT live.
2. **Auth sul router iPratico** (stessa riga su `ipratico_products_router.py`).
3. **SSH**: `PermitRootLogin no` + `PasswordAuthentication no` (le chiavi sono già in uso).
4. **Firewall sulle porte 3389/9000/9443** (bind localhost o ufw deny; accesso via tunnel SSH).
5. **Flag `TRGB_SPECIFIC` su mig 047/048** + SECRET_KEY esplicita nel runbook/template (fail-loud se assente).

---

*Report per area: `01_SICUREZZA.md` … `09_PRODOTTO.md`. Piano completo: `10_PIANO_AZIONE.md`. Verifica indipendente: `99_VERIFICA_AVVERSARIA.md`. Grezzi subagenti: `raw_A*.md`.*
