# @version: v1.0-comunicazioni
# -*- coding: utf-8 -*-
# Modulo: comunicazioni
# Classificazione: [core]
"""
Database Comunicazioni — TRGB Gestionale (modulo `comunicazioni`)

MANIFESTO (pre-R8 → confluisce in core/moduli/comunicazioni/module.json)
-----------------------------------------------------------------------
    id                  : comunicazioni
    nome                : Comunicazioni
    versione            : 1.0
    dipendenze_platform : auth, notifiche, email (M.D), wa (M.C), permessi, ui_primitives
    dipendenze_opzionali: clienti
    endpoint_prefix     : /comunicazioni
    frontend_route      : /comunicazioni

PERCHÉ UN DB SEPARATO
---------------------
`comunicazioni` è vendibile da solo: un ristorante può comprare la newsletter
senza comprare il CRM. Se le tabelle vivessero in `clienti.sqlite3` il modulo
non sarebbe estraibile. Il collegamento all'anagrafica è quindi debole e
opzionale (`comm_contatti.cliente_id` nullable, nessuna FK cross-DB), e il
travaso dei dati passa da un servizio platform, mai da un import diretto del
router clienti (regola 2 della disciplina modulare).

DIVISIONE DI COMPETENZE CON IL MODULO CLIENTI
---------------------------------------------
    anagrafica (nome, cognome, email, telefono)  →  padrone: `clienti`
    stato di iscrizione + consenso               →  padrone: `comunicazioni`

`clienti.newsletter` diventa uno specchio in sola lettura di
`comm_contatti.stato_email`: lo scrive il servizio di sync, non la UI clienti.

REGOLA NON NEGOZIABILE — LA DISISCRIZIONE NON SI SOVRASCRIVE
-------------------------------------------------------------
Nessun import, nessuna sincronizzazione, nessun merge di duplicati può riportare
`stato_email` da 'disiscritto'/'soppresso' a 'iscritto'. Solo un'azione esplicita
della persona (doppio opt-in registrato in `comm_consensi_log`) riapre il canale.

Motivo, dai dati reali del 2026-08-14: incrociando l'export Mailchimp con
l'anagrafica sono emersi 40 clienti con `clienti.newsletter = 1` che su Mailchimp
si erano disiscritti. Erano 40 email illecite in canna. È il bug che questo
schema esiste per rendere impossibile.

DUE CANALI, DUE CONSENSI
-------------------------
`stato_email` e `stato_wa` sono indipendenti: chi vuole le mail può non volere i
messaggi. Non esiste un flag unico "vuole essere contattato".
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware, nessun fallback runtime.
DB_PATH = locale_data_path("comunicazioni.sqlite3")


def get_comm_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


# ══════════════════════════════════════════════════════════════════
#  Vocabolari (documentati qui, non sparsi nei router)
# ══════════════════════════════════════════════════════════════════
#
#  comm_contatti.stato_email / stato_wa
#     'iscritto'     → riceve
#     'disiscritto'  → si è tolto lui (click su unsubscribe / STOP)
#     'soppresso'    → tolto dal sistema: indirizzo morto (hard bounce),
#                      segnalazione spam, o import di una lista di soppressione
#     'mai_iscritto' → contatto presente in anagrafica senza consenso su quel canale
#
#  I primi tre NON tornano indietro da soli. Vedi regola in testa al file.
#
#  comm_campagne.stato
#     'bozza' → 'programmata' → 'in_invio' → 'inviata'
#                                    ↓
#                                'fermata'  (stop manuale o kill switch automatico)
#
#  comm_invii.stato
#     'in_coda' → 'inviata' → 'consegnata' → ['aperta', 'click']
#                     ↓
#              'rimbalzata' | 'segnalata' | 'scartata' | 'fallita'
#     'scartata'   = non è mai partita perché il contatto non era più iscritto
#                    al momento dell'invio. Si registra comunque: serve a
#                    spiegare perché i numeri non tornano con i destinatari.
#     'rimbalzata' = l'indirizzo non esiste (rimbalzo duro). Il contatto viene
#                    soppresso nello stesso momento.
#     'fallita'    = errore temporaneo (rete, quota, 5xx del provider). Non
#                    torna in coda da sola: la si rimette a mano, altrimenti
#                    lo scaglione la ripescherebbe all'infinito.


def init_comm_db() -> None:
    """Crea lo schema. Idempotente: IF NOT EXISTS su tutto."""
    conn = get_comm_conn()
    cur = conn.cursor()

    # ── CONTATTI ──────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_contatti (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,

            -- Aggancio debole al CRM. NULL = iscritto che non è mai stato cliente.
            -- Nessuna FK: vive in un altro DB (modulo separabile).
            cliente_id          INTEGER,

            -- Anagrafica denormalizzata (padrone: modulo clienti quando attivo)
            email               TEXT,
            telefono            TEXT,
            nome                TEXT,
            cognome             TEXT,

            -- Stato per canale — indipendenti
            stato_email         TEXT NOT NULL DEFAULT 'mai_iscritto',
            stato_wa            TEXT NOT NULL DEFAULT 'mai_iscritto',

            -- Prova del consenso (email)
            consenso_email_data TEXT,
            consenso_email_ip   TEXT,
            consenso_email_fonte TEXT,   -- 'form_sito' | 'qr_tavolo' | 'prenotazione'
                                         -- | 'import_mailchimp' | 'manuale'
            consenso_wa_data    TEXT,
            consenso_wa_fonte   TEXT,

            -- Perché non riceve più (valorizzato quando lo stato non è 'iscritto')
            motivo_stop_email   TEXT,    -- 'unsubscribe' | 'hard_bounce' | 'spam'
                                         -- | 'import_soppressi' | 'manuale'
            data_stop_email     TEXT,

            -- Token del link di disiscrizione. Univoco, non indovinabile,
            -- non contiene l'email: finisce in chiaro dentro ogni messaggio.
            unsub_token         TEXT UNIQUE,

            origine             TEXT,    -- da dove è entrato la prima volta
            note                TEXT,

            created_at          TEXT DEFAULT (datetime('now','localtime')),
            updated_at          TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Un indirizzo = un contatto. Confronto sulla forma normalizzata:
    # 'Mario@Gmail.IT ' e 'mario@gmail.it' sono la stessa persona, e un
    # UNIQUE di colonna da solo li accetterebbe entrambi.
    # (stessa lezione delle gift card, sessione 2026-08-08)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_contatti_email_norm
        ON comm_contatti (lower(trim(email)))
        WHERE email IS NOT NULL AND trim(email) != ''
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_contatti_cliente ON comm_contatti(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_contatti_stato_email ON comm_contatti(stato_email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_contatti_stato_wa ON comm_contatti(stato_wa)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_contatti_token ON comm_contatti(unsub_token)")

    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_comm_contatti_updated
        AFTER UPDATE ON comm_contatti
        FOR EACH ROW BEGIN
            UPDATE comm_contatti SET updated_at = datetime('now','localtime')
            WHERE id = NEW.id;
        END
    """)

    # ── LOG CONSENSI (append-only) ────────────────────────────────
    # Se qualcuno contesta "non mi sono mai iscritto", la risposta sta qui.
    # Non si aggiorna e non si cancella: si aggiunge una riga.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_consensi_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            contatto_id     INTEGER NOT NULL REFERENCES comm_contatti(id) ON DELETE CASCADE,
            canale          TEXT NOT NULL,        -- 'email' | 'wa'
            stato_prima     TEXT,
            stato_dopo      TEXT NOT NULL,
            motivo          TEXT,
            fonte           TEXT,                 -- come sopra + 'webhook_provider'
            ip              TEXT,
            user_agent      TEXT,
            attore          TEXT,                 -- username se azione da backoffice
            dettagli        TEXT,                 -- JSON libero (payload webhook, ecc.)
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_consensi_contatto ON comm_consensi_log(contatto_id, created_at)")

    # ── CAMPAGNE ──────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_campagne (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo              TEXT NOT NULL,      -- interno
            oggetto             TEXT,               -- riga oggetto vista dal destinatario
            preheader           TEXT,
            canale              TEXT NOT NULL DEFAULT 'email',   -- 'email' | 'wa'

            corpo_html          TEXT,
            corpo_testo         TEXT,               -- fallback; se vuoto si deriva dall'HTML

            mittente_nome       TEXT,
            mittente_email      TEXT,
            rispondi_a          TEXT,

            -- Destinatari: query salvata, non lista congelata. Risolta all'invio.
            destinatari_filtro  TEXT,               -- JSON
            destinatari_stimati INTEGER,

            stato               TEXT NOT NULL DEFAULT 'bozza',
            programmata_per     TEXT,
            iniziata_at         TEXT,
            conclusa_at         TEXT,

            -- Valorizzato dal kill switch quando la coda si ferma da sola
            motivo_stop         TEXT,

            provider            TEXT,               -- 'brevo' | 'ses' | 'smtp'
            creata_da           TEXT,
            created_at          TEXT DEFAULT (datetime('now','localtime')),
            updated_at          TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_campagne_stato ON comm_campagne(stato, programmata_per)")

    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_comm_campagne_updated
        AFTER UPDATE ON comm_campagne
        FOR EACH ROW BEGIN
            UPDATE comm_campagne SET updated_at = datetime('now','localtime')
            WHERE id = NEW.id;
        END
    """)

    # ── INVII (una riga per destinatario per campagna) ─────────────
    # ~6.000 righe a campagna: la tabella che cresce. Indicizzata di conseguenza.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_invii (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            campagna_id     INTEGER NOT NULL REFERENCES comm_campagne(id) ON DELETE CASCADE,
            contatto_id     INTEGER NOT NULL REFERENCES comm_contatti(id) ON DELETE CASCADE,

            -- Copia dell'indirizzo al momento dell'invio: se il contatto cambia
            -- email domani, lo storico deve continuare a dire dove è andata.
            email_usata     TEXT,

            stato           TEXT NOT NULL DEFAULT 'in_coda',
            scaglione       INTEGER,                -- progressivo del blocco di invio

            provider_msg_id TEXT,                   -- id restituito dal provider
            errore          TEXT,

            inviata_at      TEXT,
            consegnata_at   TEXT,
            aperta_at       TEXT,                   -- prima apertura
            click_at        TEXT,                   -- primo click
            rimbalzata_at   TEXT,
            tipo_rimbalzo   TEXT,                   -- 'hard' | 'soft'
            segnalata_at    TEXT,                   -- marcata come spam
            disiscritta_at  TEXT,

            n_aperture      INTEGER DEFAULT 0,
            n_click         INTEGER DEFAULT 0,

            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_invii_camp_contatto
        ON comm_invii(campagna_id, contatto_id)
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_invii_stato ON comm_invii(campagna_id, stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_invii_provider_msg ON comm_invii(provider_msg_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_invii_contatto ON comm_invii(contatto_id)")

    # ── CLICK PER URL ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_click (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invio_id        INTEGER NOT NULL REFERENCES comm_invii(id) ON DELETE CASCADE,
            url             TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_click_invio ON comm_click(invio_id)")

    # ── EVENTI GREZZI DAL PROVIDER ────────────────────────────────
    # Il payload arriva qui prima di essere interpretato. Se domani un webhook
    # cambia forma, la diagnosi si fa su questa tabella invece che sui log.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_eventi_provider (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            provider        TEXT,
            tipo            TEXT,
            provider_msg_id TEXT,
            email           TEXT,
            payload         TEXT,                   -- JSON grezzo
            elaborato       INTEGER DEFAULT 0,
            errore          TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_eventi_elaborato ON comm_eventi_provider(elaborato, created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comm_eventi_msg ON comm_eventi_provider(provider_msg_id)")

    # ── IMPOSTAZIONI ──────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comm_impostazioni (
            chiave          TEXT PRIMARY KEY,
            valore          TEXT,
            descrizione     TEXT,
            updated_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Nessuna soglia operativa hardcodata nel codice: stanno qui e si cambiano
    # dalla UI Impostazioni del modulo.
    _seed_impostazioni(cur)

    conn.commit()
    conn.close()


def _seed_impostazioni(cur) -> None:
    """Valori di partenza. INSERT OR IGNORE: non sovrascrive scelte già fatte."""
    default = [
        ("provider", "brevo",
         "Chi consegna materialmente le email: brevo | ses | smtp"),
        ("mittente_nome", "",
         "Nome visualizzato come mittente"),
        ("mittente_email", "",
         "Indirizzo mittente (es. news@dominio.it)"),
        ("rispondi_a", "",
         "Indirizzo per le risposte, se diverso dal mittente"),

        ("scaglione_dimensione", "500",
         "Quante email per blocco di invio"),
        ("scaglione_pausa_minuti", "15",
         "Pausa fra un blocco e il successivo"),

        ("stop_soglia_spam_pct", "0.1",
         "Kill switch: se le segnalazioni spam superano questa percentuale "
         "degli invii consegnati, la coda si ferma da sola"),
        ("stop_soglia_bounce_pct", "5.0",
         "Kill switch: soglia di rimbalzi oltre la quale la coda si ferma"),
        ("stop_minimo_invii", "300",
         "Sotto questo numero di invii le soglie non si valutano: su numeri "
         "piccoli una singola segnalazione sfonda qualsiasi percentuale"),

        ("doppio_optin", "1",
         "Le iscrizioni dal form pubblico richiedono conferma via email"),
        ("unsub_url_base", "",
         "Base pubblica del link di disiscrizione"),

        ("wa_attivo", "0",
         "Canale WhatsApp: predisposto ma spento finché la newsletter non gira"),
    ]
    for chiave, valore, descrizione in default:
        cur.execute(
            "INSERT OR IGNORE INTO comm_impostazioni (chiave, valore, descrizione) VALUES (?,?,?)",
            (chiave, valore, descrizione),
        )


def get_impostazione(chiave: str, default: str = "") -> str:
    conn = get_comm_conn()
    try:
        row = conn.execute(
            "SELECT valore FROM comm_impostazioni WHERE chiave = ?", (chiave,)
        ).fetchone()
        return row["valore"] if row and row["valore"] is not None else default
    finally:
        conn.close()
