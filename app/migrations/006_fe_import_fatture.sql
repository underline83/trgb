-- 006_fe_import_fatture.sql
-- Import fatture elettroniche XML (uso statistico / controllo acquisti)

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS fe_fatture (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    fornitore_nome    TEXT NOT NULL,
    fornitore_piva    TEXT,
    numero_fattura    TEXT,
    data_fattura      DATE,
    imponibile_totale REAL,
    iva_totale        REAL,
    totale_fattura    REAL,
    valuta            TEXT DEFAULT 'EUR',
    xml_hash          TEXT UNIQUE,
    xml_filename      TEXT,
    data_import       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fe_righe (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fattura_id      INTEGER NOT NULL,
    numero_linea    INTEGER,
    descrizione     TEXT,
    quantita        REAL,
    unita_misura    TEXT,
    prezzo_unitario REAL,
    prezzo_totale   REAL,
    aliquota_iva    REAL,
    categoria_grezza TEXT,
    note_analisi     TEXT,
    FOREIGN KEY (fattura_id)
        REFERENCES fe_fatture (id)
        ON DELETE CASCADE
);

COMMIT;

PRAGMA foreign_keys = ON;
