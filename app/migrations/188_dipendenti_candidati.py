# Modulo: dipendenti (sotto-modulo candidati) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 188 — Dipendenti: candidati (2026-10-16)

Contesto (Marco): le candidature (CV ricevuti) stavano nel second brain; entrano
in TRGB come sezione «Candidati» dentro Dipendenti, solo admin/superadmin.
Doc: docs/modulo_dipendenti.md §5.9.

dipendenti_candidati
  nome, cognome            obbligatorio il nome; il cognome può mancare
  ruolo_cercato            testo libero: «Barista jr · sala»
  reparto_id               reparti(id), facoltativo
  stato                    NUOVO | DA_SENTIRE | COLLOQUIO | IN_PROVA | ASSUNTO | SCARTATO
  telefono, email, disponibilita, lingue, documenti, note
  colloquio_at             'AAAA-MM-GG HH:MM' facoltativo
  ricevuto_il              'AAAA-MM-GG'
  cv_filename / cv_path    nome originale / path relativo a uploads/candidati_cv/
  dipendente_id            valorizzato quando assunto
  fonte                    «pagina», «second brain», «q», «mail»…
  created_at, updated_at, creato_da

Solo CREATE TABLE/INDEX IF NOT EXISTS: idempotente. DB toccato: dipendenti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        dconn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_candidati (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                nome          TEXT NOT NULL,
                cognome       TEXT,
                ruolo_cercato TEXT,
                reparto_id    INTEGER REFERENCES reparti(id) ON DELETE SET NULL,
                stato         TEXT NOT NULL DEFAULT 'NUOVO'
                              CHECK (stato IN ('NUOVO','DA_SENTIRE','COLLOQUIO','IN_PROVA','ASSUNTO','SCARTATO')),
                telefono      TEXT,
                email         TEXT,
                disponibilita TEXT,
                lingue        TEXT,
                documenti     TEXT,
                note          TEXT,
                colloquio_at  TEXT,
                ricevuto_il   TEXT,
                cv_filename   TEXT,
                cv_path       TEXT,
                dipendente_id INTEGER REFERENCES dipendenti(id) ON DELETE SET NULL,
                fonte         TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                creato_da     TEXT
            )
        """)
        dconn.execute("CREATE INDEX IF NOT EXISTS idx_candidati_stato ON dipendenti_candidati(stato)")
        dconn.execute("CREATE INDEX IF NOT EXISTS idx_candidati_reparto ON dipendenti_candidati(reparto_id)")
        dconn.commit()
        print("  [188] dipendenti_candidati creata")
    finally:
        dconn.close()
