"""
Migrazione 059: Campi riconciliazione chiusa manualmente su banca_movimenti

Marco ha segnalato (problemi.md D2) che ci sono casi in cui la cifra del
movimento bancario e quella delle fatture collegate non coincidono
perfettamente — note di credito che spezzano l'importo, bonifici che
sommano più fatture, bonifici che sommano una fattura + una rata. Ha
aggiunto i link ma i movimenti restano "aperti" perché `residuo > 1€`.

Soluzione: aggiungere un flag `riconciliazione_chiusa` che permette di
dichiarare manualmente un movimento come riconciliato anche se il residuo
non quadra al centesimo. L'UI avrà un pulsante "✓ Chiudi" nel tab
Suggerimenti/Senza quando il movimento ha almeno un link parziale, e un
pulsante "Riapri" nel tab Collegati per annullare la chiusura.

Colonne aggiunte:
- `riconciliazione_chiusa` INTEGER DEFAULT 0 — 0=aperto, 1=chiuso manualmente
- `riconciliazione_chiusa_at` TEXT NULL — timestamp chiusura
- `riconciliazione_chiusa_note` TEXT NULL — nota opzionale (es. "N/C sconto",
  "bonifico multiplo F1+F2", "fattura + rata")
"""


def upgrade(conn):
    cur = conn.cursor()

    # Controlla se le colonne esistono già (idempotente)
    cur.execute("PRAGMA table_info(banca_movimenti)")
    cols = {r[1] for r in cur.fetchall()}

    if "riconciliazione_chiusa" not in cols:
        cur.execute("""
            ALTER TABLE banca_movimenti
            ADD COLUMN riconciliazione_chiusa INTEGER DEFAULT 0
        """)

    if "riconciliazione_chiusa_at" not in cols:
        cur.execute("""
            ALTER TABLE banca_movimenti
            ADD COLUMN riconciliazione_chiusa_at TEXT
        """)

    if "riconciliazione_chiusa_note" not in cols:
        cur.execute("""
            ALTER TABLE banca_movimenti
            ADD COLUMN riconciliazione_chiusa_note TEXT
        """)

    # Indice parziale per velocizzare il filtro tab "collegati"
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_banca_mov_riconcilia_chiusa
        ON banca_movimenti(riconciliazione_chiusa)
        WHERE riconciliazione_chiusa = 1
    """)

    conn.commit()
    print("  Migrazione 059: aggiunti campi riconciliazione_chiusa/at/note a banca_movimenti")
    return 1
