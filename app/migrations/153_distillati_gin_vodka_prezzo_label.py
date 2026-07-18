"""
Migrazione 153: sezione Distillati — tipologie Gin e Vodka + campo prezzo_label

Contesto (sessione 2026-07-18): Marco carica gin e vodka in carta. Le options
del select tipologia erano solo Grappa/Rum/Whisky/Cognac/Altro, e per i gin
serve il doppio prezzo "liscio 8 · G&T 11" → campo prezzo_label nel form
(la colonna DB bevande_voci.prezzo_label esiste già e ha già precedenza nei
renderer FE/BE; mancava solo dallo schema_form).

Il seed di bevande_db.py (v1.3) è aggiornato per i DB nuovi, ma il seed non
tocca le sezioni esistenti → questa migrazione allinea i DB già vivi.

Idempotente: controlla la presenza prima di aggiungere. Se bevande.sqlite3
o la sezione distillati non esistono ancora, salta (il seed farà tutto).

NB: bevande_voci vive in bevande.sqlite3 — il runner passa la connessione di
foodcost.db, quindi apriamo la nostra (stesso pattern della migrazione 152).
"""

import json
import sqlite3

from app.utils.locale_data import locale_data_path

# Da inserire dopo "Whisky" in quest'ordine (allineato a _TIP_ORDER in
# carta_bevande_service.py e TIPOLOGIA_ORDER in CartaClienti.jsx)
NEW_OPTIONS = [
    {"value": "Gin",   "label": "Gin"},
    {"value": "Vodka", "label": "Vodka"},
]

PREZZO_LABEL_FIELD = {
    "key": "prezzo_label",
    "label": "Prezzo in carta (testo, opz)",
    "type": "text",
    "help": "Se compilato sostituisce il prezzo € in carta — es. 'liscio 8 · G&T 11'",
}


def upgrade(conn):
    bev_path = locale_data_path("bevande.sqlite3")
    bconn = sqlite3.connect(bev_path)
    bconn.row_factory = sqlite3.Row
    try:
        row = bconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='bevande_sezioni'"
        ).fetchone()
        if not row:
            print("  bevande_sezioni non ancora presente — salto (ci pensa il seed)")
            return

        sez = bconn.execute(
            "SELECT schema_form FROM bevande_sezioni WHERE key = 'distillati'"
        ).fetchone()
        if not sez or not sez["schema_form"]:
            print("  sezione distillati assente o senza schema — salto (ci pensa il seed)")
            return

        schema = json.loads(sez["schema_form"])
        fields = schema.get("fields") or []
        changed = False

        # 1) Options Gin/Vodka nel select tipologia, dopo Whisky
        for f in fields:
            if (f.get("key") or f.get("name")) == "tipologia" and f.get("type") == "select":
                opts = f.get("options") or []

                def _val(o):
                    return o.get("value") if isinstance(o, dict) else o

                existing = {_val(o) for o in opts}
                to_add = [o for o in NEW_OPTIONS if o["value"] not in existing]
                if to_add:
                    # indice dopo Whisky; fallback: prima di Altro; fallback: coda
                    idx = next((i + 1 for i, o in enumerate(opts) if _val(o) == "Whisky"), None)
                    if idx is None:
                        idx = next((i for i, o in enumerate(opts) if _val(o) == "Altro"), len(opts))
                    # se le options sono stringhe legacy, aggiungo stringhe
                    if opts and not isinstance(opts[0], dict):
                        to_add = [o["value"] for o in to_add]
                    f["options"] = opts[:idx] + to_add + opts[idx:]
                    changed = True
                break

        # 2) Campo prezzo_label dopo prezzo_eur
        keys = [(f.get("key") or f.get("name")) for f in fields]
        if "prezzo_label" not in keys:
            idx = keys.index("prezzo_eur") + 1 if "prezzo_eur" in keys else len(fields)
            fields.insert(idx, dict(PREZZO_LABEL_FIELD))
            schema["fields"] = fields
            changed = True

        if not changed:
            print("  schema distillati già aggiornato — nulla da fare")
            return

        bconn.execute(
            "UPDATE bevande_sezioni SET schema_form = ?, "
            "updated_at = datetime('now','localtime') WHERE key = 'distillati'",
            (json.dumps(schema, ensure_ascii=False),),
        )
        bconn.commit()
        print("  schema distillati aggiornato: +Gin/Vodka, +prezzo_label")
    finally:
        bconn.close()
