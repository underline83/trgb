# Modulo: cucina
"""
Migrazione 171 — Scorte & Frigoriferi cucina a ripiani: infrastruttura (2026-09-07).

Doc canonico: docs/modulo_scorte_cucina.md
Mockup validato: docs/mockups/cucina_mobile_scorte_frigo.html (9 schermate)

CONTESTO
--------
Lato cucina il gestionale sapeva fare due cose: checklist/task (Task Manager,
`tasks.sqlite3`) e lista della spesa testuale (`lista_spesa_items`). Non sapeva
dire che cosa c'e' in casa, dove sta, quando scade, quanto vale, ne' che storia
ha un frigorifero. Questa migrazione crea le fondamenta di quel pezzo mancante
senza toccare nulla di cio' che gia' funziona.

Il seguito e' la sotto-app mobile Cucina (4 tab: Oggi / Scorte / Frigo / Spesa),
gemella della Cantina mobile dei vini. Due dei quattro tab girano gia' su
endpoint esistenti: questo lavoro serve ai due centrali.

COSA FA
-------
1. Crea 11 tabelle `cucina_*` in foodcost.db (schema in
   `app/models/cucina_scorte_db.py`, single source of truth):

      cucina_ubicazioni      i posti fisici, frigoriferi compresi (soglie HACCP,
                             scheda macchina, ordine del giro)
      cucina_ripiani         il livello dove sta davvero la roba. Codice LOCALE
                             all'ubicazione ('1','2','3'), destinazione d'uso
                             crudo/cotto/semilavorati/pronti
      cucina_articoli        anagrafica ibrida: `ingredient_id` FK NULLABLE verso
                             `ingredients`, fornitore doppio (partita IVA + libero)
      cucina_giacenze        verita' corrente per (articolo, RIPIANO) E dotazione:
                             `in_dotazione` tiene viva la riga anche a zero
      cucina_movimenti       timeline con `qta_precedente` esplicita
      cucina_conte           sessione di inventario
      cucina_conte_ripiani   avanzamento: dove sei rimasto
      cucina_conte_righe     il contato, riga per riga
      cucina_lotti           scadenze e rotazione FIFO, opzionali per articolo
      cucina_manutenzioni    guasti e interventi sui frigo
      cucina_scorte_config   chiave/valore, come macellaio_config & co.

2. Semina la config (INSERT OR IGNORE, non sovrascrive scelte gia' fatte):
      freschezza_fresco_gg = 5     carne, pesce, latticini, verdura
      freschezza_secco_gg  = 21    dispensa, scatolame, non-food
      blocca_incompatibilita_ripiano = 0   il crudo sul ripiano del cotto si
                             SEGNALA, non si blocca (un blocco in servizio fa
                             smettere la gente di usare l'app)

3. Aggiunge `checklist_item.ubicazione_id` (INTEGER NULL) in tasks.sqlite3.
   E' il ponte con l'HACCP: lega l'item di tipo TEMPERATURA al frigo vero.

COSA NON FA, DI PROPOSITO
-------------------------
NON crea una tabella di letture temperatura. Le temperature si registrano gia'
oggi come `checklist_execution`, e da li' esce il report HACCP mensile: una
seconda sede significherebbe due registri che prima o poi divergono, e quello
sbagliato lo scopri davanti all'ASL. Il frigo porta le soglie, la lettura resta
dov'e' sempre stata, il ponte e' `checklist_item.ubicazione_id`.

NON inserisce dati. Frigoriferi e articoli reali dell'osteria sono seed
`[locale:tregobbi]`, commit separato — e la dotazione («cosa sta su questo
ripiano») si popola dalla UI a incolla-testo, non da una migrazione.

SICUREZZA
---------
- Solo CREATE TABLE/INDEX IF NOT EXISTS, INSERT OR IGNORE e un ADD COLUMN
  nullable. Nessun DROP, nessun RENAME, nessuna riscrittura di tabelle vive.
- La colonna aggiunta e' nullable e senza DEFAULT: niente violazioni di
  integrity_check su righe esistenti (lezione CC.5.a 2026-06-02).
- Rieseguibile a vuoto. Se tasks.sqlite3 non esiste (locale fresco), lo step 3
  fa skip e l'init difensivo di boot ci ripassera'.
- A schema creato ma senza dati l'osteria non vede alcun cambiamento:
  deployabile in qualunque momento, anche di sabato sera.

DB: locali/<locale>/data/foodcost.db + locali/<locale>/data/tasks.sqlite3
"""

import sqlite3

from app.models.cucina_scorte_db import TABELLE, apply_schema
from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")


def _has_column(cur: sqlite3.Cursor, table: str, col: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    # ── 1+2. Le 11 tabelle e il seed della config, in foodcost.db ──
    apply_schema(conn)

    cur = conn.cursor()
    presenti = [t for t in TABELLE if _table_exists(cur, t)]
    print(f"  [171] foodcost.db: {len(presenti)}/{len(TABELLE)} tabelle cucina_* presenti")

    try:
        n_cfg = cur.execute("SELECT COUNT(*) FROM cucina_scorte_config").fetchone()[0]
        print(f"  [171] config: {n_cfg} chiavi (freschezza 5 gg fresco / 21 gg secco)")
    except sqlite3.Error:
        pass

    # ── 3. Il ponte con l'HACCP, in tasks.sqlite3 ──
    if not TASKS_DB.exists():
        print("  [171] tasks.sqlite3 non esiste, skip ponte HACCP (ci pensa l'init di boot)")
        return

    tk = sqlite3.connect(TASKS_DB, timeout=30)
    try:
        tk.execute("PRAGMA busy_timeout=30000")
        tcur = tk.cursor()
        if not _table_exists(tcur, "checklist_item"):
            print("  [171] checklist_item assente, skip ponte HACCP")
            return
        if _has_column(tcur, "checklist_item", "ubicazione_id"):
            print("  [171] checklist_item.ubicazione_id gia' presente")
            return
        tcur.execute("ALTER TABLE checklist_item ADD COLUMN ubicazione_id INTEGER")
        tk.commit()
        print("  [171] checklist_item.ubicazione_id aggiunta (ponte frigo ↔ HACCP)")
    finally:
        tk.close()
