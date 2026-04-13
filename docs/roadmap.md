# TRGB Gestionale — Roadmap
**Ultimo aggiornamento:** 2026-04-13 (sessione 31)
**Legenda effort:** S = mezza sessione (~1h), M = 1 sessione (~2-3h), L = 2+ sessioni

> Roadmap concordata tra Marco e Claude. Ogni punto ha un ID stabile (sezione.numero).
> Quando un punto viene completato, spostarlo in "Completati" in fondo con data.
> **Architettura a mattoni:** vedi `docs/architettura_mattoni.md` per dipendenze e ordine sviluppo a Wave.
> Mattoni condivisi: ✅ M.A Notifiche, M.B PDF brand, ✅ M.C WA composer, M.D Email, M.E Calendar, M.F Alert engine, M.G Permessi, M.H Import engine

---

## 1 — Infrastruttura / App

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 1.1 | PWA Fase 0: riscrivere sw.js network-first | S | DA FARE | Asset gia' pronti, serve solo SW + registrazione |
| 1.2 | Test PWA su iPad reale | S | BLOCCATO | Bloccato da 1.1 |
| 1.3 | Fase 1 Capacitor wrapper nativo | L | BLOCCATO | Bloccato da Apple Developer $99/anno |
| 1.4 | Migrazioni DB per dipendenti.sqlite3 | S | DA FARE | Pulizia tecnica |
| 1.5 | Riorganizzazione foodcost.db in DB separati | L | FUTURO | Solo se diventa collo di bottiglia |
| 1.6 | Snapshot Aruba settimanale | S | DA FARE | Da configurare dal pannello |
| 1.7 | DNS dinamico rete casa | S | IN STANDBY | |
| 1.8 | Notifiche push browser (scadenze, prenotazioni, backup) | M | DA FARE | Web Push API, Safari 16.4+ |
| 1.9 | Health check endpoint + uptime monitor | S | DA FARE | /health + UptimeRobot/Betterstack gratis |
| 1.10 | Aggiornamento automatico frontend (banner nuova versione) | S | DA FARE | Polling BUILD_VERSION ogni 5 min |

---

## 2 — Prenotazioni (modulo nuovo)

> Specifica completa: `docs/modulo_prenotazioni.md`
> Checklist operativa: `docs/prenotazioni_todo.md`
> Obiettivo strategico: eliminare TheFork Manager, commissioni zero sulle dirette.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 2.1 | Fase 1: Agenda prenotazioni | L | DA FARE | Planning giorno, form con CRM, stati, mini-calendario. Usa **M.E** calendar, **M.G** permessi |
| 2.2 | Fase 2: Mappa tavoli | L | DA FARE | Editor drag&drop, layout salvabili, responsive iPad |
| 2.3 | Fase 3: Widget pubblico tregobbi.it/prenota | M | DA FARE | Slot cena, CAPTCHA Turnstile, conferma |
| 2.4 | Fase 4: Conferme e notifiche | M | DA FARE | Usa **M.C** WA + **M.D** email. Email transazionali + link WA |
| 2.5 | Fase 5: Distacco TheFork Manager | M | DA FARE | Usa **M.H** import engine. Import TF, periodo parallelo |
| 2.6 | No-show tracking + alert scheda CRM | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Contatore no-show, alert quando prenota |
| 2.7 | Lista d'attesa con notifica | S | DA FARE | Usa **M.A** notifiche + **M.C** WA. Serata piena → coda → WA se si libera |
| 2.8 | Report coperti previsti (prenotati + stima walk-in) | S | DA FARE | Utile per la cucina |

---

## 3 — Flussi di Cassa / Banca

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 3.1 | Bug storni difettoso | S | DA FARE | Serve caso concreto da Marco. Vedi docs/problemi.md D1 |
| 3.2 | Migliorare riconciliazione cross-ref | M | DA FARE | Match automatico piu' intelligente |
| 3.3 | Multi-conto corrente | M | DA FARE | Struttura predisposta, UI da implementare |
| 3.4 | Carta di credito: import + riconciliazione | M | DA FARE | Usa **M.H** import engine. Scheletro UI gia' pronto |
| 3.5 | Movimenti contanti: annullamento + filtri | S | DA FARE | |
| 3.6 | Dashboard grafici Recharts (banca) | S | DA FARE | Sostituire barre CSS |
| 3.7 | Scadenziario unificato con alert (calendario) | M | DA FARE | Usa **M.E** calendar + **M.A** notifiche + **M.F** alert. Vista calendario: fatture, rate, stipendi, F24 |
| 3.8 | Cash flow previsionale 30/60/90 giorni | M | DA FARE | Usa **M.B** PDF per export. Proiezione saldo banca basata su scadenze + storico |
| 3.9 | Import automatico movimenti banca | M-L | FUTURO | Usa **M.H** import engine. PSD2/aggregatori o watch cartella CSV |

---

## 4 — Controllo Gestione / FoodCost

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 4.1 | Note di credito XML | M | DA FARE | Unico punto aperto del matching fatture |
| 4.2 | Esportazione PDF ricette con costi | S | DA FARE | Usa **M.B** PDF brand |
| 4.3 | Dashboard food cost per reparto | M | DA FARE | Cucina / pasticceria / cocktail |
| 4.4 | Storico variazione costi ricette | M | DA FARE | |
| 4.5 | Conto economico mensile P&L automatico | M | DA FARE | Usa **M.B** PDF per export. Ricavi - costi = margine, mese per mese, confronto YoY |
| 4.6 | Alert food cost fuori soglia | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Badge rosso se ricetta supera soglia % |
| 4.7 | Margine per piatto su menu (ranking) | S | DA FARE | Food cost x prezzo vendita, top/bottom 5. Serve prezzo in DB |

---

## 5 — Clienti / CRM

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 5.1 | Mailchimp sync | M | DA FARE | API key in .env, batch sync bidirectional, UI in Import/Export |
| 5.2 | WhatsApp link rapido (scheda + compleanni) | S | DA FARE | Usa **M.C** WA composer. wa.me gratis |
| 5.3 | Compleanni con azione rapida WA/email | S | DA FARE | Usa **M.C** WA + **M.D** email. Template personalizzabile |
| 5.4 | Note rapide dalla lista clienti | S | DA FARE | Popup inline senza aprire scheda |
| 5.5 | Preview merge side-by-side | M | DA FARE | Affiancamento + scelta campo per campo |
| 5.6 | Filtri combinati avanzati (campagne) | M | DA FARE | Dopo 5.1. Query builder per segmenti marketing |
| 5.7 | Audit log modifiche CRM | S | DA FARE | Tabella clienti_audit_log |
| 5.8 | Google Contacts API | M | FUTURO | Bassa priorita', CSV funziona bene |
| 5.9 | Segmentazione RFM automatica | M | DA FARE | Recency/Frequency/Monetary da storico |
| 5.10 | Timeline cliente unificata | S | DA FARE | Cronologia: prenotazioni, note, email, no-show |
| 5.11 | Import clienti da TheFork | S | DA FARE | Usa **M.H** import engine. Dopo 2.5. CSV export da TF |

---

## 6 — Dipendenti

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 6.1 | Template WA personalizzabile buste paga | S | DA FARE | Usa **M.C** WA composer (migrare codice esistente). Textarea in Impostazioni con preview live |
| 6.2 | Allegato PDF reale via URL firmato | M | DA FARE | Usa **M.B** PDF brand. Link temporaneo 7gg nel testo WA |
| 6.3 | Checklist fine turno configurabile | M | DA FARE | Seed dati default pranzo/cena |
| 6.4 | Calendario turni visuale drag&drop | M | DA FARE | Usa **M.E** calendar. Vista mensile/settimanale |
| 6.5 | Scadenze documenti con alert | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. HACCP, contratti, permessi, visite mediche. Alert 30/15/7 gg |
| 6.6 | Costo orario e analisi produttivita' | S | DA FARE | Stipendio / ore = costo orario, costo per coperto |

---

## 7 — Cantina / Vini

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 7.1 | Flag DISCONTINUATO UI + filtro | S | DA FARE | Colonna DB gia' aggiunta, serve solo UI |
| 7.2 | Carta Vini pagina web pubblica | M | DA FARE | tregobbi.it/carta-vini |
| 7.3 | PDF carta con TOC cliccabile | S | DA FARE | Usa **M.B** PDF brand |
| 7.4 | iPratico test end-to-end completo | S | DA FARE | Import → verifica → export → reimport |
| 7.5 | Import Excel con diff interattivo | M | DA FARE | Usa **M.H** import engine |
| 7.6 | Alert sottoscorta | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Soglia minima configurabile per vino |
| 7.7 | Storico prezzi fornitore (grafico) | S | DA FARE | Dati gia' in fe_righe |
| 7.8 | Inventario rapido da iPad | M | DA FARE | Lista per locazione, +/- giacenza, conferma batch |

---

## 8 — Brand / UX

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 8.1 | Pattern gobbette in empty state | S | DA FARE | Watermark decorativo |
| 8.2 | Colori tavoli editor → brand | S | BLOCCATO | Bloccato da 2.2 |
| 8.3 | About/version panel con logo | S | DA FARE | |
| 8.4 | Dark mode | L | FUTURO | Switch dark: su tutto il FE |
| 8.5 | PDF/export con header brand | M | DA FARE | Backend Python |
| 8.6 | Email template brand | S | BLOCCATO | Bloccato da 2.4 |
| 8.7 | Sistema permessi centralizzato | M | DA FARE | Matrice ruolo/azione, hook usePermissions |
| 8.8 | Shortcut tastiera + Command Palette Cmd+K | M | DA FARE | useKeyNav + palette fuzzy |
| 8.9 | Onboarding guidato nuovo utente | S | DA FARE | Wizard primo login per ruolo |
| 8.10 | Dashboard Home personalizzata per ruolo | S | DA FARE | Card filtrate per ruolo utente |
| 8.11 | Tema stagionale / branding eventi | S | FUTURO | Nice-to-have cosmetico |

---

## 9 — Notifiche & Comunicazioni (nuovo)

> Infrastruttura trasversale: notifiche automatiche dal sistema + bacheca comunicazioni staff.
> Pre-requisito per preventivi, alert prenotazioni, scadenze dipendenti, e qualsiasi modulo che debba avvisare lo staff.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 9.1 | Infrastruttura notifiche: tabella + badge header + pannello | M | ✅ FATTO | Sessione 31. DB `notifiche.sqlite3`, servizio `notifiche_service.py`, campanello Header con badge, pannello dropdown |
| 9.2 | Comunicazioni fissate (bacheca admin → staff) | S | ✅ FATTO | Sessione 31. Pagina `/comunicazioni`, CRUD admin, lettura per ruolo, urgenze, scadenze, archiviazione |
| 9.3 | Hook notifiche su Preventivi | S | BLOCCATO | Bloccato da 9.1 + 10.1. Notifica automatica quando preventivo cambia stato |
| 9.4 | Hook notifiche su Prenotazioni | S | BLOCCATO | Bloccato da 9.1 + 2.1. Nuova prenotazione, no-show, cancellazione |
| 9.5 | Hook notifiche su Scadenze dipendenti | S | BLOCCATO | Bloccato da 9.1 + 6.5. Alert documenti in scadenza |
| 9.6 | Hook notifiche su Cantina (sottoscorta) | S | BLOCCATO | Bloccato da 9.1 + 7.6 |
| 9.7 | Notifiche push browser (Web Push API) | M | FUTURO | Evoluzione di 1.8, usa infrastruttura 9.1 |

---

## 10 — Preventivi (nuovo, sotto Clienti/CRM)

> Aggregatore preventivi per eventi privati, cene aziendali, gruppi.
> Collegato al CRM (cliente) e alle Prenotazioni (conferma → prenotazione).
> Specifica completa: `docs/modulo_preventivi.md` (da scrivere)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 10.1 | Fase A: DB + CRUD backend + lista/scheda frontend | M | DA FARE | Tabelle `clienti_preventivi` + `_righe` + `_versioni` in clienti.sqlite3. Lista con filtri stato/mese/cliente, scheda con form + righe |
| 10.2 | Fase B: Template riutilizzabili + righe editabili + totale live | S | DA FARE | Tabella `clienti_preventivi_template`, griglia righe drag&drop, calcolo totale |
| 10.3 | Fase C: Generazione PDF brandizzato + invio WA/email | M | DA FARE | Usa **M.B** PDF + **M.C** WA + **M.D** email. PDF server-side con logo TRGB |
| 10.4 | Fase D: Versioning + collegamento prenotazione + badge menu | S | DA FARE | Usa **M.A** notifiche. Storico versioni PDF, conferma → crea prenotazione, badge "N in attesa" |

---

## Completati — Piano Responsive Mac+iPad (sessioni 27-28)

| ID | Cosa | Sessione |
|----|------|----------|
| B.1 | Header touch tap-toggle | 27 |
| B.2 | Tooltip popover (88 wrapping, 38 file) | 27+28 |
| B.3 | Input 16px no-zoom iOS | 27 |
| B.4 | Tap target ~40px sidebar filtri | 28 |
| B.5 | Sidebar width variabile (w-sidebar) | 28 |
| B.6 | Colonne nascoste iPad (hidden xl:table-cell) | 28 |
| P.1 | 100vh → 100dvh (fix iOS Safari URL bar) | 28 |

## Completati — Brand TRGB-02 (sessione 28)

| Cosa | Note |
|------|------|
| Palette Tailwind brand.* | red/green/blue/ink/cream/night |
| Favicon + icone PWA | 19 file in public/icons/ |
| Header v5.0 con logo gobbette | |
| Login + Home wordmark composto | |
| TrgbLoader animato | 6 dashboard |
| Grafici Recharts brand colors | 3 dashboard |
| bg-brand-cream su 90 pagine | |

## Completati — Storico rilasci

| Versione | Contenuto |
|---------|-----------|
| 2025.12 | FE XML import + Magazzino base |
| 2026.03.09 | Fix sicurezza + Auth reale + Dashboard Vini |
| 2026.03.10 | Ricette v2 + Acquisti v2 + Vendite v2 |
| 2026.03.13 | Banca v1.0 + Smart Create + Conversioni unita' |
| 2026.03.14 | Cantina v3.7 + Chiusure Turno + Cambio PIN |
| 2026.03.15 | Statistiche v1.0 + unificazione loader |
| 2026.03.16 | Cantina v4.0: filtro unificato + stampa + SchedaVino sidebar |
| 2026.03.21 | iPratico Sync v2.0 |
| 2026.03.30 | Dipendenti v2.1, CG v1.2, Flussi di Cassa v1.1, Sistema v5.0 |
| 2026.04.06 | Clienti CRM v2.0 (coppie, duplicati, segmenti, impostazioni) |
| 2026.04.11 | Bug fix batch (A1 non-fatture FIC, A2 stipendi duplicati, D2 riconciliazione parziale, D3 doppioni banca) + Dipendenti WA cedolini + CG v2.0 aggregatore completo |
| 2026.04.12 | Brand TRGB-02 integrazione completa + Piano responsive 7/7 + Tooltip migration 88 wrapping |

---

## Note operative

- Aggiornare **roadmap.md** quando un punto cambia stato
- Inserire completamenti anche in **changelog.md**
- Aggiornare `versions.jsx` come fonte di verita' per le versioni dei moduli
- Per bug/anomalie usare **problemi.md**, non questo file
