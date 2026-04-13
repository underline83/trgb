"""
Servizio Preventivi — logica business per gestione preventivi eventi.
Fase A (10.1) + Fase B (10.2): CRUD, righe, template, numerazione progressiva.
"""

from datetime import datetime
from app.models.clienti_db import get_clienti_conn


# ---------------------------------------------------------------------------
# Numero progressivo  PRE-{anno}-{NNN}
# ---------------------------------------------------------------------------

def _prossimo_numero(conn) -> str:
    anno = datetime.now().year
    prefisso = f"PRE-{anno}-"
    row = conn.execute(
        "SELECT numero FROM clienti_preventivi WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1",
        (f"{prefisso}%",),
    ).fetchone()
    if row:
        ultimo = int(row["numero"].split("-")[-1])
        prossimo = ultimo + 1
    else:
        prossimo = 1
    return f"{prefisso}{prossimo:03d}"


# ---------------------------------------------------------------------------
# Ricalcolo totale
# ---------------------------------------------------------------------------

def _ricalcola_totale(conn, preventivo_id: int) -> float:
    """Ricalcola totale_calcolato dalla somma delle righe."""
    rows = conn.execute(
        "SELECT qta, prezzo_unitario, tipo_riga FROM clienti_preventivi_righe WHERE preventivo_id = ?",
        (preventivo_id,),
    ).fetchall()
    totale = 0.0
    for r in rows:
        sub = (r["qta"] or 0) * (r["prezzo_unitario"] or 0)
        if r["tipo_riga"] == "sconto":
            totale -= abs(sub)
        else:
            totale += sub
    conn.execute(
        "UPDATE clienti_preventivi SET totale_calcolato = ? WHERE id = ?",
        (round(totale, 2), preventivo_id),
    )
    return round(totale, 2)


# ---------------------------------------------------------------------------
# Salva righe in blocco (replace)
# ---------------------------------------------------------------------------

def _salva_righe(conn, preventivo_id: int, righe: list):
    """Cancella tutte le righe e le ricrea. Ogni riga: {descrizione, qta, prezzo_unitario, tipo_riga, ordine}"""
    conn.execute("DELETE FROM clienti_preventivi_righe WHERE preventivo_id = ?", (preventivo_id,))
    for i, r in enumerate(righe):
        totale_riga = round((r.get("qta", 1) or 1) * (r.get("prezzo_unitario", 0) or 0), 2)
        conn.execute("""
            INSERT INTO clienti_preventivi_righe (preventivo_id, ordine, descrizione, qta, prezzo_unitario, totale_riga, tipo_riga)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            preventivo_id,
            r.get("ordine", i),
            r.get("descrizione", ""),
            r.get("qta", 1),
            r.get("prezzo_unitario", 0),
            totale_riga,
            r.get("tipo_riga", "voce"),
        ))


# ---------------------------------------------------------------------------
# CRUD Preventivi
# ---------------------------------------------------------------------------

def crea_preventivo(data: dict, righe: list, username: str) -> dict:
    """Crea un nuovo preventivo con righe. Ritorna il preventivo creato."""
    conn = get_clienti_conn()
    try:
        numero = _prossimo_numero(conn)
        conn.execute("""
            INSERT INTO clienti_preventivi
                (numero, cliente_id, titolo, tipo, data_evento, ora_evento,
                 n_persone, luogo, stato, note_interne, note_cliente, condizioni,
                 scadenza_conferma, canale, template_id, creato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?)
        """, (
            numero,
            data.get("cliente_id"),
            data.get("titolo", ""),
            data.get("tipo", "cena_privata"),
            data.get("data_evento"),
            data.get("ora_evento"),
            data.get("n_persone"),
            data.get("luogo", "sala"),
            data.get("note_interne"),
            data.get("note_cliente"),
            data.get("condizioni"),
            data.get("scadenza_conferma"),
            data.get("canale", "telefono"),
            data.get("template_id"),
            username,
        ))
        preventivo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        if righe:
            _salva_righe(conn, preventivo_id, righe)
            _ricalcola_totale(conn, preventivo_id)

        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def get_preventivo(preventivo_id: int) -> dict | None:
    """Ritorna preventivo con righe e dati cliente."""
    conn = get_clienti_conn()
    try:
        row = conn.execute("""
            SELECT p.*,
                   c.nome   AS cliente_nome,
                   c.cognome AS cliente_cognome,
                   c.telefono AS cliente_telefono,
                   c.email  AS cliente_email
            FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.id = ?
        """, (preventivo_id,)).fetchone()
        if not row:
            return None
        prev = dict(row)

        righe = conn.execute("""
            SELECT * FROM clienti_preventivi_righe
            WHERE preventivo_id = ?
            ORDER BY ordine, id
        """, (preventivo_id,)).fetchall()
        prev["righe"] = [dict(r) for r in righe]
        return prev
    finally:
        conn.close()


def lista_preventivi(
    stato: str | None = None,
    mese: int | None = None,
    anno: int | None = None,
    cliente_id: int | None = None,
    tipo: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Lista preventivi con filtri. Ritorna {items, total}."""
    conn = get_clienti_conn()
    try:
        where = ["1=1"]
        params = []

        if stato:
            where.append("p.stato = ?")
            params.append(stato)
        if mese and anno:
            where.append("strftime('%m', p.data_evento) = ? AND strftime('%Y', p.data_evento) = ?")
            params.extend([f"{mese:02d}", str(anno)])
        elif anno:
            where.append("strftime('%Y', p.data_evento) = ?")
            params.append(str(anno))
        if cliente_id:
            where.append("p.cliente_id = ?")
            params.append(cliente_id)
        if tipo:
            where.append("p.tipo = ?")
            params.append(tipo)
        if q:
            like = f"%{q}%"
            where.append("(p.titolo LIKE ? OR p.numero LIKE ? OR c.nome LIKE ? OR c.cognome LIKE ?)")
            params.extend([like, like, like, like])

        where_sql = " AND ".join(where)

        total = conn.execute(f"""
            SELECT COUNT(*) FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE {where_sql}
        """, params).fetchone()[0]

        rows = conn.execute(f"""
            SELECT p.*,
                   c.nome AS cliente_nome,
                   c.cognome AS cliente_cognome,
                   c.telefono AS cliente_telefono
            FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE {where_sql}
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {"items": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


def stats_preventivi() -> dict:
    """Contatori: in_ballo, confermati_mese, valore_totale_mese."""
    conn = get_clienti_conn()
    try:
        oggi = datetime.now().strftime("%Y-%m-%d")
        mese_corrente = datetime.now().strftime("%Y-%m")

        in_ballo = conn.execute(
            "SELECT COUNT(*) FROM clienti_preventivi WHERE stato IN ('bozza','inviato','in_attesa')"
        ).fetchone()[0]

        confermati_mese = conn.execute(
            "SELECT COUNT(*) FROM clienti_preventivi WHERE stato IN ('confermato','prenotato') AND strftime('%Y-%m', data_evento) = ?",
            (mese_corrente,),
        ).fetchone()[0]

        valore_mese = conn.execute(
            "SELECT COALESCE(SUM(totale_calcolato), 0) FROM clienti_preventivi WHERE stato NOT IN ('rifiutato','scaduto') AND strftime('%Y-%m', data_evento) = ?",
            (mese_corrente,),
        ).fetchone()[0]

        return {
            "in_ballo": in_ballo,
            "confermati_mese": confermati_mese,
            "valore_totale_mese": round(valore_mese, 2),
        }
    finally:
        conn.close()


def aggiorna_preventivo(preventivo_id: int, data: dict, righe: list | None = None) -> dict | None:
    """Aggiorna testata + opzionalmente righe. Ricalcola totale."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not existing:
            return None

        campi = []
        params = []
        campi_ammessi = [
            "cliente_id", "titolo", "tipo", "data_evento", "ora_evento",
            "n_persone", "luogo", "note_interne", "note_cliente", "condizioni",
            "scadenza_conferma", "canale", "template_id",
        ]
        for campo in campi_ammessi:
            if campo in data:
                campi.append(f"{campo} = ?")
                params.append(data[campo])

        if campi:
            params.append(preventivo_id)
            conn.execute(
                f"UPDATE clienti_preventivi SET {', '.join(campi)} WHERE id = ?",
                params,
            )

        if righe is not None:
            _salva_righe(conn, preventivo_id, righe)

        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def elimina_preventivo(preventivo_id: int) -> bool:
    """Elimina preventivo e relative righe (CASCADE)."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not existing:
            return False
        conn.execute("DELETE FROM clienti_preventivi WHERE id = ?", (preventivo_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Transizioni di stato
# ---------------------------------------------------------------------------

TRANSIZIONI = {
    "bozza":      ["inviato"],
    "inviato":    ["in_attesa", "confermato", "rifiutato"],
    "in_attesa":  ["confermato", "rifiutato", "scaduto"],
    "confermato": ["prenotato"],
    "prenotato":  ["completato"],
    "completato": ["fatturato"],
    "rifiutato":  [],
    "scaduto":    ["bozza"],  # riapertura
    "fatturato":  [],
}


def cambia_stato(preventivo_id: int, nuovo_stato: str) -> dict | None:
    """Cambia stato con validazione transizioni. Ritorna preventivo aggiornato."""
    conn = get_clienti_conn()
    try:
        row = conn.execute("SELECT stato FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not row:
            return None

        stato_attuale = row["stato"]
        ammessi = TRANSIZIONI.get(stato_attuale, [])
        if nuovo_stato not in ammessi:
            raise ValueError(f"Transizione non permessa: {stato_attuale} → {nuovo_stato}. Ammessi: {ammessi}")

        conn.execute(
            "UPDATE clienti_preventivi SET stato = ? WHERE id = ?",
            (nuovo_stato, preventivo_id),
        )
        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def duplica_preventivo(preventivo_id: int, username: str) -> dict | None:
    """Duplica un preventivo come nuova bozza."""
    conn = get_clienti_conn()
    try:
        orig = conn.execute("SELECT * FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not orig:
            return None
        orig = dict(orig)

        numero = _prossimo_numero(conn)
        conn.execute("""
            INSERT INTO clienti_preventivi
                (numero, cliente_id, titolo, tipo, data_evento, ora_evento,
                 n_persone, luogo, stato, note_interne, note_cliente, condizioni,
                 scadenza_conferma, canale, template_id, creato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?)
        """, (
            numero,
            orig["cliente_id"],
            f"{orig['titolo']} (copia)",
            orig["tipo"],
            orig["data_evento"],
            orig["ora_evento"],
            orig["n_persone"],
            orig["luogo"],
            orig["note_interne"],
            orig["note_cliente"],
            orig["condizioni"],
            orig["scadenza_conferma"],
            orig["canale"],
            orig["template_id"],
            username,
        ))
        nuovo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Copia righe
        righe_orig = conn.execute(
            "SELECT * FROM clienti_preventivi_righe WHERE preventivo_id = ? ORDER BY ordine",
            (preventivo_id,),
        ).fetchall()
        for r in righe_orig:
            conn.execute("""
                INSERT INTO clienti_preventivi_righe (preventivo_id, ordine, descrizione, qta, prezzo_unitario, totale_riga, tipo_riga)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (nuovo_id, r["ordine"], r["descrizione"], r["qta"], r["prezzo_unitario"], r["totale_riga"], r["tipo_riga"]))

        _ricalcola_totale(conn, nuovo_id)
        conn.commit()
        return get_preventivo(nuovo_id)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------

def lista_template(solo_attivi: bool = True) -> list:
    conn = get_clienti_conn()
    try:
        if solo_attivi:
            rows = conn.execute("SELECT * FROM clienti_preventivi_template WHERE attivo = 1 ORDER BY nome").fetchall()
        else:
            rows = conn.execute("SELECT * FROM clienti_preventivi_template ORDER BY nome").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def crea_template(data: dict) -> dict:
    import json
    conn = get_clienti_conn()
    try:
        righe_json = json.dumps(data.get("righe", []), ensure_ascii=False) if data.get("righe") else None
        conn.execute("""
            INSERT INTO clienti_preventivi_template (nome, tipo, righe_json, condizioni_default)
            VALUES (?, ?, ?, ?)
        """, (
            data.get("nome", ""),
            data.get("tipo", "cena_privata"),
            righe_json,
            data.get("condizioni_default"),
        ))
        template_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
        row = conn.execute("SELECT * FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def aggiorna_template(template_id: int, data: dict) -> dict | None:
    import json
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        if not existing:
            return None

        campi = []
        params = []
        for campo in ["nome", "tipo", "condizioni_default"]:
            if campo in data:
                campi.append(f"{campo} = ?")
                params.append(data[campo])
        if "righe" in data:
            campi.append("righe_json = ?")
            params.append(json.dumps(data["righe"], ensure_ascii=False))
        if "attivo" in data:
            campi.append("attivo = ?")
            params.append(1 if data["attivo"] else 0)

        if campi:
            params.append(template_id)
            conn.execute(f"UPDATE clienti_preventivi_template SET {', '.join(campi)} WHERE id = ?", params)
            conn.commit()

        row = conn.execute("SELECT * FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def elimina_template(template_id: int) -> bool:
    """Disattiva template (soft delete)."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        if not existing:
            return False
        conn.execute("UPDATE clienti_preventivi_template SET attivo = 0 WHERE id = ?", (template_id,))
        conn.commit()
        return True
    finally:
        conn.close()
