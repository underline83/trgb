# 🛠️ TRGB Gestionale — Roadmap & TO-DO  
**Ultimo aggiornamento:** 2025-12-05

Roadmap ufficiale per lo sviluppo progressivo del gestionale.

---

# 🚀 PRIORITÀ ALTA (Q4 2025 – Q1 2026)

## 1. Modulo Fatture Elettroniche (Fase 2)
- [ ] Collegamento riga ↔ ingrediente
- [ ] Algoritmo fuzzy per matching automatico
- [ ] Aggiornamento prezzo ingrediente automatico
- [ ] Creazione tabella `fe_righe_match`
- [ ] Carichi magazzino da fatture
- [ ] Gestione Note di Credito XML
- [ ] Dashboard acquisti con grafici

---

## 2. Modulo Magazzino Vini
- [ ] Pagina Movimenti Cantina (carichi/scarichi)
- [ ] Filtri lato server
- [ ] Sincronizzazione storico prezzi
- [ ] Import Excel con diff interattivo
- [ ] Backup automatico magazzino

---

## 3. Modulo Vini (Carta)
- [ ] Ordinamento drag&drop tipologie
- [ ] Anteprima carta con filtri dinamici
- [ ] Versioning della carta vini (storico PDF)
- [ ] Template multipli carta (eventi, degustazioni)

---

# 🧩 PRIORITÀ MEDIA (Q2 2026)

## 4. Modulo FoodCost
- [ ] UI nuova ingredienti
- [ ] Dashboard diversi reparti (cucina → pasticceria → cocktail)
- [ ] Esportazione PDF ricette
- [ ] Calcolo foodcost in tempo reale
- [ ] Collegamento consumi ↔ magazzino
- [ ] Storico variazione costi ricette

---

## 5. Backend & Architettura
- [ ] Migrazioni DB standardizzate (`schema_migrations`)
- [ ] Refactor completo repository pattern
- [ ] API per reportistica avanzata
- [ ] Pulizia logica Business Layer

---

# 📊 PRIORITÀ BASSA / FUTURE IDEAS

- [ ] Dashboard Finanziaria mensile (ricavi/costi)
- [ ] Integrazione gestionale corrispettivi
- [ ] Modalità offline (cache PWA)
- [ ] Microservizi dedicati su Docker
- [ ] Sincronizzazione con Google Sheets
- [ ] Report automatici via email/Telegram

---

# 📅 Rilasci previsti

| Versione | Contenuto | Stato |
|---------|-----------|--------|
| **2025.12** | FE XML — import + stats + dashboard | ✔ Completed |
| **2026.01** | Magazzino — movimenti + filtri server-side | 🔄 In pianificazione |
| **2026.02** | FE XML — matching ingredienti | Programmata |
| **2026.03** | Carta vini drag&drop + storico | Programmata |
| **2026.04** | Nuovo FoodCost UI | Programmata |

---

# 🧭 Note operative

- Aggiornare **ROADMAP.md** a ogni milestone
- Inserire i completamenti nel **CHANGELOG.md**
- Mantenere coerenza con il README principale
