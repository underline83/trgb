"""
Migrazione 055: fe_fatture.rateizzata_in_spesa_fissa_id

Parte della release CG v2.0 "Controllo Gestione come aggregatore".

Aggiunge la colonna `rateizzata_in_spesa_fissa_id` a `fe_fatture`. Quando
una fattura viene assorbita da un piano di rateizzazione (creato dal
wizard del modulo Controllo Gestione), questo campo punta all'id del
record `cg_spese_fisse` che contiene il piano. La query dello Scadenzario
esclude di default le fatture con questo campo valorizzato, evitando i
duplicati "fattura + rata" che fino alla v1.7.1 apparivano entrambi.

Semantica:
- NULL      → fattura normale, visibile in Scadenzario
- <integer> → fattura rateizzata, nascosta di default, riapare con il
              toggle "Mostra fatture rateizzate"

L'indice e' parziale (WHERE ... IS NOT NULL) perche' la stragrande
maggioranza delle fatture NON e' rateizzata: indicizzare solo le poche
con valore valorizzato risparmia spazio senza perdere selettivita'.

La colonna e' NULL-safe: il codice v1.7.1 la ignora senza errori, quindi
questa migrazione e' rollback-safe. Se la v2.0 va male basta fare revert
del codice: il DB resta compatibile.

Backfill retroattivo: gestito dalla migrazione 057 (dry-run CSV +
apply script con backup automatico). Questa migrazione crea solo la
struttura.
"""


def upgrade(conn):
    cur = conn.cursor()

    cols = {row[1] for row in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}

    if "rateizzata_in_spesa_fissa_id" not in cols:
        try:
            cur.execute(
                "ALTER TABLE fe_fatture ADD COLUMN rateizzata_in_spesa_fissa_id INTEGER"
            )
            print("  + fe_fatture.rateizzata_in_spesa_fissa_id")
        except Exception as e:
            print(f"  skip fe_fatture.rateizzata_in_spesa_fissa_id: {e}")
    else:
        print("  fe_fatture.rateizzata_in_spesa_fissa_id gia' presente")

    # Indice parziale: solo le fatture effettivamente rateizzate
    try:
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_fatture_rateizzata "
            "ON fe_fatture(rateizzata_in_spesa_fissa_id) "
            "WHERE rateizzata_in_spesa_fissa_id IS NOT NULL"
        )
        print("  + idx_fatture_rateizzata (parziale)")
    except Exception as e:
        print(f"  skip idx_fatture_rateizzata: {e}")

    print("  mig 055 fe_fatture.rateizzata_in_spesa_fissa_id pronta")
