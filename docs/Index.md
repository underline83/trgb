# 📚 TRGB Gestionale — Indice Documentazione
**Ultimo aggiornamento:** 2026-03-08
**Repository:** TRGB Gestionale – Osteria Tre Gobbi (Bergamo)

---

# 🧭 1. Architettura & Infrastruttura

| Documento | Contenuto |
|-----------|-----------|
| `architettura.md` | Stack tecnico, struttura backend/frontend, DB, routing |
| `deploy.md` | Deploy locale (Mac) + VPS Aruba, systemd, Nginx, HTTPS, UFW |
| `troubleshooting.md` | Problemi comuni e soluzioni rapide |
| `prompt_canvas.md` | Regole operative per sessioni AI (standard codice, naming, workflow) |

---

# 🍷 2. Modulo Vini

| Documento | Contenuto |
|-----------|-----------|
| `Modulo_Vini.md` | Carta dei Vini: import Excel, generazione HTML/PDF/DOCX |
| `Modulo_MagazzinoVini.md` | Giacenze, locazioni, import SAFE/FORCE, filtri avanzati |
| `Database_Vini.md` | Schema completo `vini.sqlite3` + `vini_settings.sqlite3` |

---

# 💰 3. Modulo Corrispettivi & Finanza

| Documento | Contenuto |
|-----------|-----------|
| `Modulo_Corrispettivi.md` | Import corrispettivi, chiusure giornaliere, statistiche, dashboard |

---

# 🧾 4. Modulo Fatture Elettroniche (XML)

| Documento | Contenuto |
|-----------|-----------|
| `Modulo_FattureXML.md` | Import FatturaPA XML, anti-duplicazione, statistiche acquisti |

---

# 🥘 5. Modulo FoodCost

| Documento | Contenuto |
|-----------|-----------|
| `Modulo_FoodCost.md` | Ingredienti, fornitori, ricette, storico prezzi |
| `Database_FoodCost.md` | Schema completo `foodcost.db` (tabelle: ingredients, recipes, fe_fatture, …) |

---

# 👥 6. Modulo Dipendenti

| Documento | Contenuto |
|-----------|-----------|
| `Modulo_Dipendenti.md` | Anagrafica, tipi turno, calendario turni, costi |

---

# 📈 7. Pianificazione & Versionamento

| Documento | Contenuto |
|-----------|-----------|
| `Roadmap.md` | Task aperti prioritizzati, nuove feature, rilasci pianificati |
| `changelog.md` | Storico modifiche per versione (formato Keep a Changelog) |
| `VersionMap.md` | Versioni correnti di backend, frontend, moduli e DB |

---

# 🗑️ File rimossi

I seguenti file sono stati eliminati perché obsoleti o duplicati:

- `sistema-vini.md` — duplicato di `Database_Vini.md` + `Modulo_Vini.md`
- `to-do.md` — superseded da `Roadmap.md`
- `version.json` — JSON malformato, superseded da `VersionMap.md`

---

# 🧭 Note operative

- Ogni modifica ai moduli va riportata in `changelog.md` e `VersionMap.md`
- I task pendenti vivono in `Roadmap.md` (non nei file di modulo)
- Per le sessioni AI: leggere `prompt_canvas.md` all'inizio di ogni sessione
