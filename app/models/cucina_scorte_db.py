# Modulo: cucina
# @version: v1.0 — Scorte & Frigoriferi a ripiani, infrastruttura (2026-09-07)
# -*- coding: utf-8 -*-
"""
Schema Scorte & Frigoriferi cucina — TRGB Gestionale.

Doc canonico: docs/modulo_scorte_cucina.md
Mockup dei flussi: docs/mockups/cucina_mobile_scorte_frigo.html (9 schermate)

module.json (pre-R8, per la raccolta a R8):
    id                  cucina
    tabelle_db          cucina_ubicazioni, cucina_ripiani, cucina_articoli,
                        cucina_giacenze, cucina_movimenti, cucina_conte,
                        cucina_conte_ripiani, cucina_conte_righe, cucina_lotti,
                        cucina_manutenzioni, cucina_scorte_config
    endpoint_prefix     /cucina/scorte, /cucina/ubicazioni
    dipendenze_platform auth, permessi, notifiche
    dipendenze_opzion.  ricette (ingredients), acquisti (fornitori), task_manager
    frontend_route      /cucina/mobile

DB: `foodcost.db` (path tenant-aware `locali/<TRGB_LOCALE>/data/`), lo stesso di
Lista Spesa. Motivo: `cucina_articoli.ingredient_id` e' una FK REALE verso
`ingredients` e la valorizzazione della conta legge i prezzi d'acquisto — SQLite
non fa foreign key cross-database, quindi un DB dedicato le degraderebbe a
riferimenti logici non verificati.

NON usare mai il nome `cucina.sqlite3`: esisteva ed e' stato rinominato
`tasks.sqlite3` dalla mig 086 (riaprirebbe C-DEBT2).

Questo modulo e' la SINGLE SOURCE OF TRUTH dello schema: la migrazione 171 e
l'init difensivo al boot eseguono entrambi `SCHEMA_SQL`, che e' interamente
`CREATE ... IF NOT EXISTS` e quindi rieseguibile a vuoto.

═══════════════════════════════════════════════════════════════
LE TRE IDEE CHE REGGONO QUESTO SCHEMA (leggerle prima di toccarlo)
═══════════════════════════════════════════════════════════════

1. IL REGIME. Ogni articolo dichiara UN modo di essere gestito — `SEMAFORO`
   (solo ok/scarso/finito), `CONTA` (quantita' aggiornata solo quando si conta),
   `MOVIMENTI` (carico/scarico continuo). La conta periodica vale per tutti e
   tre. E' cio' che permette di avere tutti i metodi senza che il dato menta.

2. IL RIPIANO E' L'UNITA'. La giacenza ha per chiave (articolo, RIPIANO), non
   (articolo, ubicazione). Ogni ubicazione ha almeno un ripiano — anche la
   dispensa che "non ne ha" ne ha uno, si chiama '1'. Cosi' non esiste il caso
   nullable e la UI ha un modo solo di navigare.
   COROLLARIO: la giacenza di un articolo e' SEMPRE una somma su piu' righe,
   mai un valore letto da una riga sola.

3. LA DOTAZIONE. `cucina_giacenze.in_dotazione = 1` significa "questa roba sta
   qui di norma", anche a zero. La riga non muore quando l'articolo finisce:
   diventa una casella vuota nel giro di controllo. Senza questo, il giro del
   frigo nasconderebbe esattamente cio' che si sta cercando — il buco.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, Iterable, Optional

from app.models.foodcost_db import get_foodcost_connection

# ─────────────────────────────────────────────────────────────
# Liste chiuse
# ─────────────────────────────────────────────────────────────

# Regime di gestione dell'articolo — doc §3.
REGIMI = {"SEMAFORO", "CONTA", "MOVIMENTI"}

# Stato del semaforo (D1 «manca qualcosa?»).
STATI_SEMAFORO = {"OK", "ESAURIMENTO", "FINITO"}

TIPI_UBICAZIONE = {
    "FRIGO", "CELLA", "FREEZER", "ABBATTITORE",
    "DISPENSA", "SCAFFALE", "BANCO", "ALTRO",
}

# Refrigerati: per questi le soglie temp_min/temp_max hanno senso e il giro di
# controllo si aspetta una lettura HACCP.
TIPI_REFRIGERATI = {"FRIGO", "CELLA", "FREEZER", "ABBATTITORE"}

# Destinazione d'uso del ripiano: separazione crudo/cotto, che e' HACCP vera.
DESTINAZIONI_RIPIANO = {"CRUDO", "COTTO", "SEMILAVORATI", "PRONTI", "NON_FOOD", "MISTO"}

# Natura dell'articolo: si confronta con la destinazione del ripiano su cui sta.
NATURE_ARTICOLO = {"CRUDO", "COTTO", "SEMILAVORATO", "PRONTO", "NON_FOOD"}

# Quale natura e' compatibile con quale destinazione. `MISTO` accetta tutto, e
# una destinazione non dichiarata (NULL) non giudica: meglio nessun avviso che
# avvisi a caso.
COMPATIBILITA = {
    "CRUDO":        {"CRUDO"},
    "COTTO":        {"COTTO", "PRONTI"},
    "SEMILAVORATI": {"SEMILAVORATO"},
    "PRONTI":       {"PRONTO", "COTTO"},
    "NON_FOOD":     {"NON_FOOD"},
}

# Famiglia di conservazione: decide quale default di freschezza si applica
# quando l'articolo non ne dichiara uno suo (doc §3.1).
FAMIGLIE_FRESCHEZZA = {"FRESCO", "SECCO"}

# Unita' di misura: lista chiusa, perche' la conta va valorizzata. Il modo in cui
# la roba si dice davvero in cucina («una cassetta») vive nel campo libero
# `confezione`, che non entra mai in un calcolo.
UNITA_MISURA = {"KG", "G", "L", "ML", "PZ", "CF"}

# SCARTO e' un tipo a se' e non uno SCARICO: lo spreco e' un numero che deve
# potersi guardare da solo.
TIPI_MOVIMENTO = {"CARICO", "SCARICO", "RETTIFICA", "TRASFERIMENTO", "SCARTO"}

STATI_LOTTO = {"CHIUSO", "APERTO", "ESAURITO", "SCARTATO"}
STATI_CONTA = {"APERTA", "CHIUSA"}
STATI_CONTA_RIPIANO = {"DA_FARE", "IN_CORSO", "CONTATO"}
TIPI_MANUTENZIONE = {"ORDINARIA", "GUASTO", "RIPARAZIONE", "SANIFICAZIONE"}
STATI_MANUTENZIONE = {"APERTO", "CHIUSO"}

# Reparti: riuso della lista del Task Manager, NON un enum nuovo. Lo schema e'
# multi-reparto dal primo giorno (decisione Marco 2026-09-07): accendere il bar
# domani costa un filtro, non una migrazione su dati vivi.
try:  # pragma: no cover - import difensivo
    from app.schemas.tasks_schema import REPARTI  # type: ignore
except Exception:  # pragma: no cover
    REPARTI = {"cucina", "bar", "sala", "pulizia", "manutenzione"}

# ─────────────────────────────────────────────────────────────
# Config di modulo (pattern <modulo>_config chiave/valore, come
# macellaio_config / pescato_config / piatti_giorno_config)
# ─────────────────────────────────────────────────────────────

# Soglie di freschezza del dato — decise da Marco 2026-09-07.
# MAI hardcodate a valle: si leggono da qui, si cambiano da Impostazioni.
CONFIG_DEFAULT: Dict[str, str] = {
    # Oltre questa finestra senza movimenti, la giacenza di un articolo a regime
    # MOVIMENTI smette di essere un numero e diventa una stima (doc §3.1).
    "freschezza_fresco_gg": "5",    # carne, pesce, latticini, verdura
    "freschezza_secco_gg": "21",    # dispensa, scatolame, non-food
    # Il crudo su un ripiano del cotto viene SEGNALATO, non bloccato: un blocco
    # in servizio e' il modo piu' rapido per far smettere la gente di usare
    # l'app. Se un giorno l'ASL pretende il blocco, si gira questa chiave.
    "blocca_incompatibilita_ripiano": "0",
}


# ─────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────

SCHEMA_SQL: tuple[str, ...] = (
    # ── I posti fisici. Il frigorifero smette di essere una riga di testo
    #    dentro un template di checklist e diventa un'entita' con soglie,
    #    una storia e dei guasti.
    """
    CREATE TABLE IF NOT EXISTS cucina_ubicazioni (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        nome                TEXT    NOT NULL,
        tipo                TEXT    NOT NULL DEFAULT 'FRIGO',
        reparto             TEXT    NOT NULL DEFAULT 'cucina',
        temp_min            REAL,
        temp_max            REAL,
        marca               TEXT,
        modello             TEXT,
        matricola           TEXT,
        anno                INTEGER,
        ordine              INTEGER NOT NULL DEFAULT 0,
        attivo              INTEGER NOT NULL DEFAULT 1,
        note                TEXT,
        created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        created_by          TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_ubic_reparto ON cucina_ubicazioni(reparto, attivo, ordine)",

    # ── I RIPIANI. Ogni ubicazione ne ha almeno uno (il '1' nasce con lei, vedi
    #    `assicura_ripiano_default`). Il codice e' LOCALE all'ubicazione: '2' da
    #    solo non identifica niente, quindi ovunque si mostri un ripiano va
    #    mostrato anche il suo posto.
    """
    CREATE TABLE IF NOT EXISTS cucina_ripiani (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ubicazione_id   INTEGER NOT NULL,
        codice          TEXT    NOT NULL,
        nome            TEXT,
        destinazione    TEXT,
        ordine          INTEGER NOT NULL DEFAULT 0,
        attivo          INTEGER NOT NULL DEFAULT 1,
        note            TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE (ubicazione_id, codice),
        FOREIGN KEY (ubicazione_id) REFERENCES cucina_ubicazioni(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_rip_ubic ON cucina_ripiani(ubicazione_id, attivo, ordine)",

    # ── Anagrafica ibrida: `ingredient_id` e' il ponte col food cost, ed e'
    #    NULLABLE per scelta — la carta forno e il detersivo non sono
    #    ingredienti, ma stanno in dispensa e finiscono come tutto il resto.
    #    Il fornitore e' doppio: tabellato (partita IVA delle fatture) e libero
    #    (il pescatore che non fattura elettronicamente).
    """
    CREATE TABLE IF NOT EXISTS cucina_articoli (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        nome                    TEXT    NOT NULL,
        ingredient_id           INTEGER,
        categoria               TEXT,
        um                      TEXT    NOT NULL DEFAULT 'PZ',
        confezione              TEXT,
        reparto                 TEXT    NOT NULL DEFAULT 'cucina',
        regime                  TEXT    NOT NULL DEFAULT 'SEMAFORO',
        natura                  TEXT,
        famiglia_freschezza     TEXT    NOT NULL DEFAULT 'SECCO',
        giorni_dato_fresco      INTEGER,
        ripiano_casa_id         INTEGER,
        scorta_minima           REAL,
        giorni_copertura        INTEGER,
        fornitore_piva          TEXT,
        fornitore_freeform      TEXT,
        shelf_life_aperto_gg    INTEGER,
        attivo                  INTEGER NOT NULL DEFAULT 1,
        note                    TEXT,
        created_at              TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        created_by              TEXT,
        FOREIGN KEY (ingredient_id)   REFERENCES ingredients(id)     ON DELETE SET NULL,
        FOREIGN KEY (ripiano_casa_id) REFERENCES cucina_ripiani(id)  ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_art_attivo ON cucina_articoli(attivo, reparto, categoria)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_art_ingred ON cucina_articoli(ingredient_id)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_art_nome ON cucina_articoli(nome)",

    # ── La verita' corrente per (articolo, RIPIANO) — e la dotazione.
    #
    #    `ubicazione_id` e' DENORMALIZZATO dal ripiano: quasi ogni query filtra
    #    per posto, e senza questo campo ogni «cosa c'e' nel frigo carne»
    #    pagherebbe una join. Si scrive dal ripiano, non si tocca a mano.
    """
    CREATE TABLE IF NOT EXISTS cucina_giacenze (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        articolo_id     INTEGER NOT NULL,
        ripiano_id      INTEGER NOT NULL,
        ubicazione_id   INTEGER NOT NULL,
        qta             REAL,
        stato_semaforo  TEXT,
        in_dotazione    INTEGER NOT NULL DEFAULT 1,
        ordine          INTEGER NOT NULL DEFAULT 0,
        aggiornato_at   TEXT,
        aggiornato_da   TEXT,
        origine         TEXT,
        UNIQUE (articolo_id, ripiano_id),
        FOREIGN KEY (articolo_id)   REFERENCES cucina_articoli(id)   ON DELETE CASCADE,
        FOREIGN KEY (ripiano_id)    REFERENCES cucina_ripiani(id)    ON DELETE CASCADE,
        FOREIGN KEY (ubicazione_id) REFERENCES cucina_ubicazioni(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_giac_rip ON cucina_giacenze(ripiano_id, in_dotazione, ordine)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_giac_ubic ON cucina_giacenze(ubicazione_id, in_dotazione)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_giac_art ON cucina_giacenze(articolo_id)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_giac_stato ON cucina_giacenze(stato_semaforo)",

    # ── Timeline dei movimenti (regime MOVIMENTI + rettifiche da conta).
    #
    #    `qta_precedente` e' NOT NULL e va passata dal chiamante, mai dedotta a
    #    runtime: e' la lezione del bug RETTIFICA fantasma dei vini (2026-07-18),
    #    dove un delta calcolato su una giacenza gia' aggiornata veniva a zero e
    #    l'INSERT spariva in silenzio.
    """
    CREATE TABLE IF NOT EXISTS cucina_movimenti (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        articolo_id     INTEGER NOT NULL,
        ripiano_id      INTEGER,
        ubicazione_id   INTEGER,
        ripiano_dest_id INTEGER,
        tipo            TEXT    NOT NULL,
        qta_delta       REAL    NOT NULL DEFAULT 0,
        qta_precedente  REAL    NOT NULL DEFAULT 0,
        qta_risultante  REAL    NOT NULL DEFAULT 0,
        lotto_id        INTEGER,
        motivo          TEXT,
        origine         TEXT,
        ref_modulo      TEXT,
        ref_id          INTEGER,
        utente          TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        annullato_at    TEXT,
        annullato_da    TEXT,
        FOREIGN KEY (articolo_id)     REFERENCES cucina_articoli(id)   ON DELETE CASCADE,
        FOREIGN KEY (ripiano_id)      REFERENCES cucina_ripiani(id)    ON DELETE SET NULL,
        FOREIGN KEY (ripiano_dest_id) REFERENCES cucina_ripiani(id)    ON DELETE SET NULL,
        FOREIGN KEY (ubicazione_id)   REFERENCES cucina_ubicazioni(id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_mov_art ON cucina_movimenti(articolo_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_mov_data ON cucina_movimenti(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_mov_tipo ON cucina_movimenti(tipo, created_at DESC)",

    # ── L'inventario, UN RIPIANO ALLA VOLTA. Tre tabelle invece di due, perche'
    #    serve sapere dove si e' rimasti: e' la differenza fra 24 passi da due
    #    minuti, che si fanno, e 6 sessioni da mezz'ora, che si abbandonano.
    """
    CREATE TABLE IF NOT EXISTS cucina_conte (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        data            TEXT    NOT NULL,
        reparto         TEXT    NOT NULL DEFAULT 'cucina',
        stato           TEXT    NOT NULL DEFAULT 'APERTA',
        note            TEXT,
        valore_totale   REAL,
        aperta_da       TEXT,
        aperta_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        chiusa_da       TEXT,
        chiusa_at       TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_conte_data ON cucina_conte(data DESC, stato)",

    """
    CREATE TABLE IF NOT EXISTS cucina_conte_ripiani (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conta_id        INTEGER NOT NULL,
        ripiano_id      INTEGER NOT NULL,
        ubicazione_id   INTEGER NOT NULL,
        stato           TEXT    NOT NULL DEFAULT 'DA_FARE',
        contato_da      TEXT,
        contato_at      TEXT,
        UNIQUE (conta_id, ripiano_id),
        FOREIGN KEY (conta_id)   REFERENCES cucina_conte(id)   ON DELETE CASCADE,
        FOREIGN KEY (ripiano_id) REFERENCES cucina_ripiani(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_conte_rip ON cucina_conte_ripiani(conta_id, stato)",

    """
    CREATE TABLE IF NOT EXISTS cucina_conte_righe (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        conta_id            INTEGER NOT NULL,
        ripiano_id          INTEGER NOT NULL,
        articolo_id         INTEGER NOT NULL,
        qta_attesa          REAL,
        qta_contata         REAL,
        delta               REAL,
        prezzo_unitario     REAL,
        valore              REAL,
        note                TEXT,
        contata_da          TEXT,
        contata_at          TEXT,
        UNIQUE (conta_id, ripiano_id, articolo_id),
        FOREIGN KEY (conta_id)    REFERENCES cucina_conte(id)    ON DELETE CASCADE,
        FOREIGN KEY (ripiano_id)  REFERENCES cucina_ripiani(id)  ON DELETE CASCADE,
        FOREIGN KEY (articolo_id) REFERENCES cucina_articoli(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_conte_righe ON cucina_conte_righe(conta_id, ripiano_id)",

    # ── Lotti: OPZIONALI per articolo. Senza lotti il modulo funziona lo
    #    stesso (c'e' la giacenza, non la scadenza); si accendono dove servono
    #    davvero — fresco, sottovuoto, semilavorati.
    """
    CREATE TABLE IF NOT EXISTS cucina_lotti (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        articolo_id     INTEGER NOT NULL,
        ripiano_id      INTEGER,
        lotto_codice    TEXT,
        data_arrivo     TEXT,
        data_scadenza   TEXT,
        data_apertura   TEXT,
        qta_iniziale    REAL,
        qta_residua     REAL,
        stato           TEXT    NOT NULL DEFAULT 'CHIUSO',
        fornitore       TEXT,
        ddt_ref         TEXT,
        note            TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        created_by      TEXT,
        FOREIGN KEY (articolo_id) REFERENCES cucina_articoli(id) ON DELETE CASCADE,
        FOREIGN KEY (ripiano_id)  REFERENCES cucina_ripiani(id)  ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_lotti_scad ON cucina_lotti(stato, data_scadenza)",
    "CREATE INDEX IF NOT EXISTS idx_cuc_lotti_art ON cucina_lotti(articolo_id, stato)",

    # ── Storia dei frigo. Un guasto aperto crea un task singolo nel Task
    #    Manager e ne conserva l'id: non si apre una to-do parallela.
    """
    CREATE TABLE IF NOT EXISTS cucina_manutenzioni (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ubicazione_id   INTEGER NOT NULL,
        tipo            TEXT    NOT NULL DEFAULT 'ORDINARIA',
        data            TEXT    NOT NULL,
        descrizione     TEXT,
        ditta           TEXT,
        costo           REAL,
        stato           TEXT    NOT NULL DEFAULT 'APERTO',
        task_id         INTEGER,
        note            TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        created_by      TEXT,
        chiusa_at       TEXT,
        chiusa_da       TEXT,
        FOREIGN KEY (ubicazione_id) REFERENCES cucina_ubicazioni(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_manut_ubic ON cucina_manutenzioni(ubicazione_id, stato, data DESC)",

    # ── Config di modulo, stesso pattern di macellaio_config & co.
    """
    CREATE TABLE IF NOT EXISTS cucina_scorte_config (
        chiave      TEXT PRIMARY KEY,
        valore      TEXT NOT NULL,
        updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
)

TABELLE = (
    "cucina_ubicazioni",
    "cucina_ripiani",
    "cucina_articoli",
    "cucina_giacenze",
    "cucina_movimenti",
    "cucina_conte",
    "cucina_conte_ripiani",
    "cucina_conte_righe",
    "cucina_lotti",
    "cucina_manutenzioni",
    "cucina_scorte_config",
)


# ─────────────────────────────────────────────────────────────
# Applicazione dello schema
# ─────────────────────────────────────────────────────────────

def apply_schema(conn: sqlite3.Connection) -> None:
    """Esegue SCHEMA_SQL + seed della config su una connessione a foodcost.db.

    Interamente `IF NOT EXISTS`: rieseguibile a vuoto, nessun DROP, nessun
    RENAME. Non fa commit — decide il chiamante (la migrazione committa nel
    runner, l'init di boot committa da se').
    """
    cur = conn.cursor()
    for stmt in SCHEMA_SQL:
        cur.execute(stmt)
    # Seed non distruttivo: se Marco ha gia' cambiato una soglia da
    # Impostazioni, INSERT OR IGNORE non gliela riporta al default.
    for chiave, valore in CONFIG_DEFAULT.items():
        cur.execute(
            "INSERT OR IGNORE INTO cucina_scorte_config (chiave, valore) VALUES (?, ?)",
            (chiave, valore),
        )


def init_cucina_scorte_db() -> None:
    """Init difensivo al boot, come `init_tasks_db()`.

    La migrazione 171 fa la stessa cosa; questo e' il safety net per ambienti
    freschi e per il locale `trgb` (istanza demo), dove le migrazioni storiche
    potrebbero non essere passate tutte.
    """
    conn = get_foodcost_connection()
    try:
        apply_schema(conn)
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────

def leggi_config(conn: sqlite3.Connection) -> Dict[str, str]:
    """Tutta la config di modulo, con i default a coprire le chiavi mancanti."""
    out = dict(CONFIG_DEFAULT)
    try:
        for r in conn.execute("SELECT chiave, valore FROM cucina_scorte_config"):
            out[r[0]] = r[1]
    except sqlite3.Error:
        pass
    return out


def config_int(conn: sqlite3.Connection, chiave: str, fallback: int) -> int:
    try:
        return int(leggi_config(conn).get(chiave, fallback))
    except (TypeError, ValueError):
        return fallback


# ─────────────────────────────────────────────────────────────
# Invarianti dello schema
# ─────────────────────────────────────────────────────────────

def assicura_ripiano_default(conn: sqlite3.Connection, ubicazione_id: int) -> int:
    """Ogni ubicazione ha almeno un ripiano. Ritorna l'id del primo.

    E' l'invariante n.2 del modulo: senza di essa `cucina_giacenze.ripiano_id`
    dovrebbe essere nullable, la UI avrebbe due modi di navigare e ogni query
    pagherebbe un COALESCE. Va chiamata alla creazione di ogni ubicazione e
    ogni volta che si sta per scrivere una giacenza.
    """
    row = conn.execute(
        "SELECT id FROM cucina_ripiani WHERE ubicazione_id = ? ORDER BY ordine, id LIMIT 1",
        (ubicazione_id,),
    ).fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO cucina_ripiani (ubicazione_id, codice, ordine) VALUES (?, '1', 0)",
        (ubicazione_id,),
    )
    return cur.lastrowid


def ubicazione_di_ripiano(conn: sqlite3.Connection, ripiano_id: int) -> Optional[int]:
    """L'ubicazione a cui appartiene un ripiano — per tenere in sincrono il
    campo denormalizzato `cucina_giacenze.ubicazione_id`."""
    row = conn.execute(
        "SELECT ubicazione_id FROM cucina_ripiani WHERE id = ?", (ripiano_id,)
    ).fetchone()
    return row[0] if row else None


# ─────────────────────────────────────────────────────────────
# Validazione liste chiuse
# ─────────────────────────────────────────────────────────────

def valida(valore: Any, ammessi: Iterable[str], campo: str) -> Optional[str]:
    """Valida un valore contro una lista chiusa. `None` passa (campo opzionale).

    Solleva ValueError con i valori ammessi in chiaro — il router lo traduce in
    422, cosi' l'errore dice sempre cosa era lecito scrivere.
    """
    if valore is None:
        return None
    testo = str(valore).strip()
    if not testo:
        return None
    v = testo.lower() if campo == "reparto" else testo.upper()
    ammessi_set = set(ammessi)
    if v not in ammessi_set:
        raise ValueError(f"{campo} non valido: {valore!r}. Valori: {sorted(ammessi_set)}")
    return v


def incompatibile(natura: Optional[str], destinazione: Optional[str]) -> bool:
    """L'articolo e' fuori posto su quel ripiano?

    Falso se una delle due informazioni manca o se il ripiano e' MISTO: non si
    giudica su dati che non ci sono. Chi chiama SEGNALA e basta — il blocco e'
    dietro la chiave di config `blocca_incompatibilita_ripiano`, spenta.
    """
    if not natura or not destinazione or destinazione == "MISTO":
        return False
    return natura not in COMPATIBILITA.get(destinazione, set())
