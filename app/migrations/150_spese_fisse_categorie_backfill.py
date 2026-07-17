"""
Migrazione 150: sottocategoria SPESE CONDOMINIALI + backfill categorie
spese fisse rimaste NULL (richiesta Marco 2026-07-12).

Problema: le spese condominiali (tipo=ALTRO) e altre spese fisse create dopo
la mig 129 hanno categoria_id NULL → nel Conto Economico cadono in "Non
categorizzato" e dalla UI non si poteva rimediare perché la sottocategoria
"SPESE CONDOMINIALI" non esisteva sotto AFFITTI.

Cosa fa (tutto idempotente, no-op sui locali senza dati):
 1. Crea la sottocategoria AFFITTI → SPESE CONDOMINIALI (se manca).
 2. Auto-assegna AFFITTI/SPESE CONDOMINIALI alle spese fisse con categoria
    NULL e titolo contenente 'condominial' (su tregobbi: id 18, 19).
 3. Backfill generico: spese fisse con categoria NULL e tipo mappabile
    ricevono la categoria dal mapping della mig 129 (su tregobbi ripara la
    Rateizzazione Orobica id 24 → FINANZIARI/RATEIZZAZIONI).
NB: 'DIPENDENTI' con fallback 'STAFF' (il nome storico pre-rename) per
compatibilità con installazioni fresche seminate dalla mig 008.
"""

# (nomi categoria in ordine di preferenza, sottocategoria o None)
TIPO_MAP = {
    "AFFITTO":             (("AFFITTI",), None),
    "STIPENDIO":           (("DIPENDENTI", "STAFF"), "STIPENDI"),
    "TASSA":               (("TASSE E IMPOSTE",), None),
    "RATEIZZAZIONE_TASSE": (("TASSE E IMPOSTE",), None),
    "ASSICURAZIONE":       (("ASSICURAZIONI",), None),
    "PRESTITO":            (("FINANZIARI",), "PRESTITI"),
    "RATEIZZAZIONE":       (("FINANZIARI",), "RATEIZZAZIONI"),
}


def _cat_id(cur, nomi):
    for nome in nomi:
        r = cur.execute("SELECT id FROM fe_categorie WHERE nome = ?", (nome,)).fetchone()
        if r:
            return r[0]
    return None


def _sub_id(cur, cat_id, nome):
    if cat_id is None or not nome:
        return None
    r = cur.execute(
        "SELECT id FROM fe_sottocategorie WHERE categoria_id = ? AND nome = ?",
        (cat_id, nome),
    ).fetchone()
    return r[0] if r else None


def upgrade(conn):
    cur = conn.cursor()
    for t in ("fe_categorie", "fe_sottocategorie", "cg_spese_fisse"):
        if not cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)
        ).fetchone():
            print(f"  {t} assente — skip")
            return

    # 1) sottocategoria SPESE CONDOMINIALI sotto AFFITTI
    affitti_id = _cat_id(cur, ("AFFITTI",))
    if affitti_id is not None:
        if _sub_id(cur, affitti_id, "SPESE CONDOMINIALI") is None:
            cur.execute(
                """INSERT INTO fe_sottocategorie (categoria_id, nome, ordine)
                   VALUES (?, 'SPESE CONDOMINIALI',
                           (SELECT COALESCE(MAX(ordine),0)+1 FROM fe_sottocategorie
                            WHERE categoria_id = ?))""",
                (affitti_id, affitti_id),
            )
            print("  ✔ creata sottocategoria AFFITTI → SPESE CONDOMINIALI")
        cond_sub = _sub_id(cur, affitti_id, "SPESE CONDOMINIALI")

        # 2) auto-assegna le spese condominiali senza categoria
        n = cur.execute(
            """UPDATE cg_spese_fisse
               SET categoria_id = ?, sottocategoria_id = ?
               WHERE categoria_id IS NULL
                 AND lower(titolo) LIKE '%condominial%'""",
            (affitti_id, cond_sub),
        ).rowcount
        if n:
            print(f"  ✔ {n} spese condominiali → AFFITTI / SPESE CONDOMINIALI")

    # 3) backfill generico per tipo (stesse regole della mig 129)
    tot = 0
    for tipo, (nomi_cat, nome_sub) in TIPO_MAP.items():
        cat_id = _cat_id(cur, nomi_cat)
        if cat_id is None:
            continue
        sub_id = _sub_id(cur, cat_id, nome_sub)
        tot += cur.execute(
            """UPDATE cg_spese_fisse
               SET categoria_id = ?, sottocategoria_id = COALESCE(?, sottocategoria_id)
               WHERE categoria_id IS NULL AND tipo = ?""",
            (cat_id, sub_id, tipo),
        ).rowcount
    if tot:
        print(f"  ✔ backfill categoria per tipo: {tot} spese fisse aggiornate")
    conn.commit()
