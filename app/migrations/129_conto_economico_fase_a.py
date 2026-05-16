"""
Migrazione 129 — G.3 Conto Economico Fase A (2026-05-14)

CONTESTO:
  Marco 2026-05-14: il dashboard Controllo Gestione mostra solo `margine_lordo
  = vendite - acquisti`, ignorando le 22 spese fisse + 274 rate (affitti,
  stipendi, tasse, assicurazioni, prestiti). L'"utile" visualizzato è in
  realtà solo gross margin, fuorviante per decisioni operative.

  Il task G.3 (PRIORITÀ TOP) implementa il Conto Economico Completo con
  utile netto vero. Vedi `docs/roadmap.md` §G.3.

OBIETTIVI FASE A:
  1. INSERT 3 nuove macro-categorie in `fe_categorie` per coprire le spese
     senza fattura (TASSE E IMPOSTE, ASSICURAZIONI, FINANZIARI).
  2. INSERT sottocategorie associate (F24, IRES/IRAP, IVA, IMU, TARI, INPS,
     RIFIUTI, ALTRO / RC, INCENDIO, INFORTUNI, AUTO, ALTRO / MUTUI, PRESTITI,
     INTERESSI, RATEIZZAZIONI).
  3. ALTER `cg_spese_fisse` ADD COLUMN `categoria_id`, `sottocategoria_id`
     (FK soft a fe_categorie / fe_sottocategorie). Per aggregare le spese
     senza fattura nello stesso linguaggio delle fatture acquisti.
  4. Backfill: mapping `tipo` → `categoria_id` sulle 22 spese fisse esistenti
     (AFFITTO→AFFITTI, STIPENDIO→STAFF, TASSA→TASSE E IMPOSTE,
     ASSICURAZIONE→ASSICURAZIONI, PRESTITO/RATEIZZAZIONE→FINANZIARI).

DB COLPITO: foodcost.db (fe_categorie, fe_sottocategorie, cg_spese_fisse).
Idempotente. Re-run no-op (INSERT OR IGNORE / check colonne).

PROSSIME FASI (separate, NON in questa mig):
  Fase B: app/services/conto_economico.py + endpoint
          GET /controllo-gestione/conto-economico
  Fase C: frontend pagina ControlloGestioneContoEconomico.jsx
  Fase D: verifica con dati reali maggio 2026

DECISIONI PRESE DA MARCO (2026-05-14):
  - Calcolo su imponibile (no IVA).
  - V1: stipendi = solo netto (da cg_uscite.totale dove tipo_uscita='STIPENDIO').
    V1.1: lordo + contributi + TFR (TODO futuro).
  - Note credito (TD04): già escluse via WHERE clause esistenti.
  - Cassa + competenza come toggle (V1).
  - Spalmatura mensile spese pluri-mensili: V2 futuro.
"""
import sqlite3


# ─────────────────────────────────────────────────────────────
# DATI SEED
# ─────────────────────────────────────────────────────────────

# Le 9 macro-categorie esistenti hanno ordine 10..90 (step 10) circa.
# Le nuove le mettiamo dopo MANUTENZIONE (assumendo ordine ~90).
# Useremo ordine 100, 110, 120 — sicuro non collida.
NUOVE_MACRO_CATEGORIE = [
    {"nome": "TASSE E IMPOSTE", "ordine": 100},
    {"nome": "ASSICURAZIONI",   "ordine": 110},
    {"nome": "FINANZIARI",      "ordine": 120},
]

# Sottocategorie per ogni macro nuova
NUOVE_SOTTOCATEGORIE = {
    "TASSE E IMPOSTE": [
        "F24", "IRES/IRAP", "IVA", "IMU", "TARI", "INPS", "RIFIUTI", "ALTRO"
    ],
    "ASSICURAZIONI": [
        "RC", "INCENDIO", "INFORTUNI", "AUTO", "ALTRO"
    ],
    "FINANZIARI": [
        "MUTUI", "PRESTITI", "INTERESSI", "RATEIZZAZIONI"
    ],
}

# Mapping cg_spese_fisse.tipo → fe_categorie.nome (per backfill)
# NB: RATEIZZAZIONE_TASSE è stato introdotto post-129 (mig 131): mapping qui
# documentato per coerenza, ma la mig 131 fa il backfill specifico dei record
# riclassificati. Aggiungerlo qui lo include automaticamente nei prossimi
# backfill (re-run dovesse mai capitare).
TIPO_TO_CATEGORIA = {
    "AFFITTO":             "AFFITTI",
    "STIPENDIO":           "STAFF",
    "TASSA":               "TASSE E IMPOSTE",
    "RATEIZZAZIONE_TASSE": "TASSE E IMPOSTE",
    "ASSICURAZIONE":       "ASSICURAZIONI",
    "PRESTITO":            "FINANZIARI",
    "RATEIZZAZIONE":       "FINANZIARI",
    # "ALTRO": niente default → resta NULL, Marco mappa manualmente
}

# Sottocategoria default per tipo (best-effort, dove ha senso)
TIPO_TO_SOTTOCATEGORIA = {
    "STIPENDIO":     "STIPENDI",       # dentro STAFF (esistente)
    "PRESTITO":      "PRESTITI",       # dentro FINANZIARI (nuovo)
    "RATEIZZAZIONE": "RATEIZZAZIONI",  # dentro FINANZIARI (nuovo)
    # AFFITTO/TASSA/ASSICURAZIONE: lasciamo NULL, Marco rifinisce dalla UI
}


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def _row_exists(conn: sqlite3.Connection, table: str,
                where_clause: str, params: list) -> bool:
    cur = conn.execute(
        f"SELECT 1 FROM {table} WHERE {where_clause} LIMIT 1", params
    )
    return cur.fetchone() is not None


def _get_id(conn: sqlite3.Connection, table: str,
            where_clause: str, params: list):
    cur = conn.execute(
        f"SELECT id FROM {table} WHERE {where_clause} LIMIT 1", params
    )
    row = cur.fetchone()
    return row[0] if row else None


# ─────────────────────────────────────────────────────────────
# MIGRATION
# ─────────────────────────────────────────────────────────────

def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    # ── 1. INSERT nuove macro-categorie (idempotente, UNIQUE su nome) ──
    inserted_macro = 0
    for macro in NUOVE_MACRO_CATEGORIE:
        cur.execute(
            "INSERT OR IGNORE INTO fe_categorie (nome, ordine, attiva) "
            "VALUES (?, ?, 1)",
            [macro["nome"], macro["ordine"]]
        )
        if cur.rowcount:
            inserted_macro += 1
    print(f"  [129] macro-categorie inserite: {inserted_macro}/{len(NUOVE_MACRO_CATEGORIE)} "
          f"(le altre già presenti)")

    # ── 2. INSERT sottocategorie ──
    inserted_sub = 0
    skipped_sub = 0
    for macro_nome, sotto_list in NUOVE_SOTTOCATEGORIE.items():
        macro_id = _get_id(conn, "fe_categorie", "nome = ?", [macro_nome])
        if macro_id is None:
            print(f"  [129] WARN: macro '{macro_nome}' non trovata, skip sotto-cat")
            continue

        for i, sotto_nome in enumerate(sotto_list):
            # Check pre-INSERT per supportare schemi senza UNIQUE(cat_id, nome)
            if _row_exists(conn, "fe_sottocategorie",
                          "categoria_id = ? AND nome = ?",
                          [macro_id, sotto_nome]):
                skipped_sub += 1
                continue
            cur.execute(
                "INSERT INTO fe_sottocategorie "
                "(categoria_id, nome, ordine, attiva) VALUES (?, ?, ?, 1)",
                [macro_id, sotto_nome, (i + 1) * 10]
            )
            inserted_sub += 1
    print(f"  [129] sottocategorie inserite: {inserted_sub}, già presenti: {skipped_sub}")

    # ── 3. ALTER cg_spese_fisse: categoria_id, sottocategoria_id ──
    alter_count = 0
    if not _column_exists(conn, "cg_spese_fisse", "categoria_id"):
        cur.execute(
            "ALTER TABLE cg_spese_fisse ADD COLUMN categoria_id INTEGER NULL"
        )
        alter_count += 1
        print("  [129] cg_spese_fisse.categoria_id aggiunta")
    if not _column_exists(conn, "cg_spese_fisse", "sottocategoria_id"):
        cur.execute(
            "ALTER TABLE cg_spese_fisse ADD COLUMN sottocategoria_id INTEGER NULL"
        )
        alter_count += 1
        print("  [129] cg_spese_fisse.sottocategoria_id aggiunta")
    if alter_count == 0:
        print("  [129] colonne categoria_id/sottocategoria_id già presenti")

    # ── 4. BACKFILL: mapping tipo → categoria_id sulle spese fisse esistenti ──
    cur.execute(
        "SELECT id, tipo FROM cg_spese_fisse "
        "WHERE categoria_id IS NULL AND tipo IS NOT NULL"
    )
    spese_da_mappare = cur.fetchall()

    updates = 0
    skipped_unknown = 0
    for spesa_id, tipo in spese_da_mappare:
        cat_nome = TIPO_TO_CATEGORIA.get(tipo)
        if not cat_nome:
            skipped_unknown += 1
            continue  # tipo ALTRO/sconosciuto → resta NULL

        cat_id = _get_id(conn, "fe_categorie", "nome = ?", [cat_nome])
        if cat_id is None:
            print(f"  [129] WARN: categoria '{cat_nome}' non trovata per spesa {spesa_id}")
            continue

        # Sottocategoria default best-effort
        sub_id = None
        sub_nome = TIPO_TO_SOTTOCATEGORIA.get(tipo)
        if sub_nome:
            sub_id = _get_id(
                conn, "fe_sottocategorie",
                "categoria_id = ? AND nome = ?", [cat_id, sub_nome]
            )

        cur.execute(
            "UPDATE cg_spese_fisse "
            "SET categoria_id = ?, sottocategoria_id = ? WHERE id = ?",
            [cat_id, sub_id, spesa_id]
        )
        updates += 1

    print(f"  [129] backfill cg_spese_fisse: {updates} mappate, "
          f"{skipped_unknown} skip (tipo ALTRO/sconosciuto, resta NULL)")

    # Commit gestito dal runner via conn.commit() dopo INSERT INTO schema_migrations
    print("  [129] DONE")
