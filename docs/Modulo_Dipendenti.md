# 👥 Modulo Dipendenti — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08
**Stato:** operativo (anagrafica + turni + costi; allegati non implementati)
**Router:** `app/routers/dipendenti.py` — prefix `/dipendenti`
**DB:** `app/data/dipendenti.sqlite3` (creato a runtime da `init_dipendenti_db()`)

---

# 1. Obiettivo del modulo

Il modulo Dipendenti gestisce:

- anagrafica dipendenti (dati personali, contratto, ruolo)
- tipologie di turno (es. mattina, pomeriggio, split)
- calendario turni (assegnazione turni per data e dipendente)
- visualizzazione costi dipendenti

---

# 2. Endpoint Backend

Tutti gli endpoint sono protetti da `Depends(get_current_user)`.

### Anagrafica

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| `GET` | `/dipendenti/` | Lista dipendenti (con filtri) |
| `POST` | `/dipendenti/` | Crea nuovo dipendente |
| `PUT` | `/dipendenti/{id}` | Aggiorna dipendente |
| `DELETE` | `/dipendenti/{id}` | Soft delete dipendente |

### Tipi Turno

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| `GET` | `/dipendenti/turni/tipi` | Lista tipologie turno |
| `POST` | `/dipendenti/turni/tipi` | Crea tipo turno |
| `PUT` | `/dipendenti/turni/tipi/{id}` | Aggiorna tipo turno |
| `DELETE` | `/dipendenti/turni/tipi/{id}` | Elimina tipo turno |

### Calendario Turni

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| `GET` | `/dipendenti/turni/calendario` | Lista turni (filtri per data/dipendente) |
| `POST` | `/dipendenti/turni/calendario` | Crea turno nel calendario |
| `PUT` | `/dipendenti/turni/calendario/{id}` | Aggiorna turno |
| `DELETE` | `/dipendenti/turni/calendario/{id}` | Elimina turno |

---

# 3. Database

Il DB è creato automaticamente alla prima esecuzione.

Tabelle principali:
- `dipendenti` — anagrafica (nome, cognome, ruolo, contratto, data_assunzione, is_active)
- `turni_tipi` — tipologie turno (nome, ora_inizio, ora_fine, ore_lavoro, colore)
- `turni_calendario` — assegnazioni turno (dipendente_id, turno_tipo_id, data, note)
- `dipendenti_allegati` — ⚠️ esiste nel DB ma senza endpoint né frontend (task #22 Roadmap)

---

# 4. Frontend

Pagine React in `src/pages/admin/`:

| File | Route | Funzione |
|------|-------|----------|
| `DipendentiMenu.jsx` | `/admin/dipendenti` | Menu modulo |
| `DipendentiAnagrafica.jsx` | `/admin/dipendenti/anagrafica` | CRUD dipendenti |
| `DipendentiTurni.jsx` | `/admin/dipendenti/turni` | Gestione calendario turni |
| `DipendentiCosti.jsx` | `/admin/dipendenti/costi` | Visualizzazione costi |

---

# 5. Roadmap modulo

- Decidere se implementare o rimuovere la gestione allegati (task #22)
- Creare migrazione dedicata per `dipendenti.sqlite3` (task #19)
- Vista mensile calendario turni (griglia)
- Export PDF/Excel del calendario
