# AUDIT STATE — Audit totale TRGB v5.24 (2026-06-12)

## 🔄 RICOGNIZIONE DELTA — 2026-07-10 (v5.32, commit `ead338ad`)

- Ri-verifica dei 110 finding contro il codice attuale: **chiusi 4** (A1-01 CRIT + A1-02/A6-12/A6-13 HIGH), **aperti ~106**. Report in `11_DELTA_2026-07-10.md`.
- I 22 commit dal 13/06 sono tutti feature (vini, RC/BP CG, Statistiche 1.2, backup hotfix, turni): nessuno tocca l'audit.
- Live 10/07 (mattina): Banca/iPratico → 401 ✅; Swagger /docs → 200; header assenti.
- **Sera 10/07: A6-12/A6-13 RICONFERMATI live** (sshd: PermitRootLogin no + PasswordAuthentication no; porte 9000/9443 su 127.0.0.1, 3389 assente).

### ✅ Chiusi il 2026-07-10 (sera) — A6-06 + A6-09, direttamente sul VPS (config nginx, non nel repo)
- **A6-06** → Swagger `/docs`, `/redoc`, `/openapi.json` dietro HTTP Basic Auth (scelta PO Marco: "tenerlo ma dietro login"). `location ~ ^/(docs|redoc|openapi\.json)$` con `auth_basic` su `/etc/nginx/.htpasswd_trgb_docs` (utente marco). Verificato: anonimo → 401, app → 200.
- **A6-09** → 4 header di sicurezza (HSTS, XCTO, XFO, Referrer-Policy) su trgb.tregobbi.it e app.tregobbi.it + `server_tokens off` (versione nginx non più esposta). Verificato live con curl.
- Config replicate nel runbook §6.0/6.1 per i clienti nuovi. Backup pre-modifica in `/etc/nginx/backups/` e `sites-available/*.bak-2026-07-10`. File sorgente usati: `claude/nginx/*.conf` (scratch, gitignored).

### ✅ Chiusi il 2026-07-10 — i 2 CRIT residui (DEPLOYATI, commit `054d1460`)
- **A9-01** → `047_prestiti_bpm.py` ora `TRGB_SPECIFIC = True`: i prestiti BPM reali non entrano nei DB dei locali nuovi. La **048 NON** flaggata di proposito (crea solo lo schema `cg_piano_rate`, universale; si popola solo dai dati di 047 → resta vuota senza 047; flaggarla = schema drift A2-01). Doc `MIGRATIONS_TRGB.md` aggiornata. Zero effetto su tregobbi (047 già applicata).
- **A9-02** → `app/core/config.py` fail-loud: in produzione (`TRGB_ENV=production` o path `/home/marco/trgb`) se `SECRET_KEY` non è nell'ambiente il backend **non parte** invece di firmare JWT con la chiave default pubblica. Runbook §5.1 aggiornato. Testato (dev boota / prod-senza-chiave solleva / prod-con-chiave boota). Push 10/07: backend UP post-deploy, nessun errore SECRET_KEY (tregobbi ha `.env`).
- **➜ 0 CRIT rimasti.** Con A6-06/A6-09 chiusi in serata: **Sessione 1 completata al 100% + 2 MED extra**. Prossimo passo consigliato: indice `fe_righe` (A7-02, 1 riga) e Sessione 3 "Igiene DB", oppure Sessione 2 "Login robusto" (A1-04+A6-07).

## ✅ AUDIT COMPLETATO — 2026-06-12

- Commit di riferimento: `1f5f9c17` · VERSION 5.24 (VPS allineato, verificato live)
- **Voto complessivo: 63/100** · Finding: **3 CRIT · 18 HIGH · 46 MED · 43 LOW (110)**
- Verifica avversaria: 22 campionati, 82% confermati, 1 smentito (A3-12), 3 ridimensionati

## Stato aree (finale)
| Area | Report | Finding (C/H/M/L) | Voto |
|---|---|---|---|
| A1 Sicurezza app | 01_SICUREZZA.md | 1/4/8/4 (con A6 sec) | 48 |
| A2 Integrità DB | 02_DATI.md | 0/1/4/9 | 72 |
| A3 Backend | 03_BACKEND.md | 0/1/9/4 | 74 |
| A4 Frontend | 04_FRONTEND.md | 0/1/3/7 | 78 |
| A5 Architettura | 05_ARCHITETTURA.md | 0/1/6/4 | 70 |
| A6 Infra VPS | 06_INFRA_OPERATIVITA.md | 0/5/5/2 | 58 |
| A7 Performance | 07_PERFORMANCE.md | 0/2/3/5 | 68 |
| A8 Docs delta | 08_DOCS_DELTA.md | 0/1/5/5 | 72 (health docs 72/100) |
| A9 Readiness prodotto | 09_PRODOTTO.md | 2/4/6/4 | 55 |
| A10 Verifica avversaria | 99_VERIFICA_AVVERSARIA.md | — | tasso conferma 82% |

## Note
- Verifiche live (ssh + curl) eseguite dall'orchestratore: supplementi in raw_A6_live.md e raw_A2_live.md.
- Deliverable completi: 00_EXECUTIVE_SUMMARY → 10_PIANO_AZIONE + 99. Grezzi: raw_A1..A9 (+2 live).
- File scratch `AUDIT_STATE_FULL.md` nella root del repo = tentativo precedente abortito, non fa parte di questo audit (Marco può cancellarlo).
