# -*- coding: utf-8 -*-
"""Schermo di cucina (comande_schermo.foglietti): DB comande temporaneo, righe scritte a mano.
Si lancia anche da solo: python3 tests/test_comande_schermo.py"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models import comande_db  # noqa: E402


def _db():
    cartella = tempfile.mkdtemp(prefix="trgb_schermo_")
    comande_db.DB_PATH = os.path.join(cartella, "comande.sqlite3")
    comande_db.init_comande_db()
    return comande_db.get_comande_conn()


def _riga(conn, conto, nome, q, uscita, reparto="cucina", stato="inviata", nota=None, motivo=None):
    conn.execute(
        "INSERT INTO comande_righe (conto_id, nome, quantita, uscita, reparto, stato, nota, motivo_storno, "
        "articolo_tipo, famiglia) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (conto, nome, q, uscita, reparto, stato, nota, motivo, "piatto_carta", "food"))


def test_foglietti():
    conn = _db()
    # tavolo 2: uscita 1 andata prima, uscita 2 andata dopo e sollecitata, uscita 3 attende con un annullo
    conn.execute("INSERT INTO comande_conti (id, tavolo, zona, coperti, aperto_da, aperto_at) "
                 "VALUES (1, '2', 'Sala', 4, 'marco', datetime('now','localtime','-40 minutes'))")
    _riga(conn, 1, "Stuzzico", 4, 1)
    _riga(conn, 1, "Rosa di zucca, crema di taleggio", 1, 2, nota="senza taleggio")
    _riga(conn, 1, "Filetto alla Donizetti", 2, 3)
    _riga(conn, 1, "Cappuccino di baccalà", 1, 3, stato="stornata", motivo="cambiato idea")
    _riga(conn, 1, "Acqua", 2, 1, reparto="sala")
    _riga(conn, 1, "Dolce", 1, 4, stato="da_inviare")
    conn.execute("INSERT INTO comande_uscite (conto_id, numero, stato, andata_at) "
                 "VALUES (1, 1, 'andata', datetime('now','localtime','-30 minutes'))")
    conn.execute("INSERT INTO comande_uscite (conto_id, numero, stato, andata_at, solleciti, sollecitata_at) "
                 "VALUES (1, 2, 'andata', datetime('now','localtime','-12 minutes'), 1, datetime('now','localtime','-2 minutes'))")
    conn.execute("INSERT INTO comande_uscite (conto_id, numero, stato) VALUES (1, 3, 'attende')")
    conn.execute("INSERT INTO comande_invii (conto_id, tipo, reparto, creato_da, creato_at) "
                 "VALUES (1, 'comanda', 'cucina', 'lucia', datetime('now','localtime','-31 minutes'))")
    # tavolo 9: solo sala → niente foglietto in cucina
    conn.execute("INSERT INTO comande_conti (id, tavolo, coperti) VALUES (2, '9', 2)")
    _riga(conn, 2, "Calice", 2, 1, reparto="sala")
    # tavolo 5: chiuso → niente foglietto
    conn.execute("INSERT INTO comande_conti (id, tavolo, coperti, stato) VALUES (3, '5', 2, 'chiuso')")
    _riga(conn, 3, "Stuzzico", 2, 1)
    # tavolo 7: andato 5 minuti fa → dopo il tavolo 2 (più vecchio prima); tavolo 8 solo «attende» → in fondo
    conn.execute("INSERT INTO comande_conti (id, tavolo, coperti, aperto_at) VALUES (4, '7', 2, datetime('now','localtime','-50 minutes'))")
    _riga(conn, 4, "Stuzzico", 2, 1)
    conn.execute("INSERT INTO comande_uscite (conto_id, numero, stato, andata_at) "
                 "VALUES (4, 1, 'andata', datetime('now','localtime','-5 minutes'))")
    conn.execute("INSERT INTO comande_conti (id, tavolo, coperti, aperto_at) VALUES (5, '8', 2, datetime('now','localtime','-55 minutes'))")
    _riga(conn, 5, "Pane e Grissini", 1, 2)
    conn.execute("INSERT INTO comande_uscite (conto_id, numero, stato) VALUES (5, 2, 'attende')")
    conn.commit()
    conn.close()

    from app.services import comande_schermo
    d = comande_schermo.foglietti("cucina")
    assert d["reparto"] == "cucina" and len(d["ora"]) == 5
    assert [f["tavolo"] for f in d["foglietti"]] == ["2", "7", "8"], [f["tavolo"] for f in d["foglietti"]]
    t2 = d["foglietti"][0]
    assert t2["chi"] == "lucia" and t2["coperti"] == 4 and t2["zona"] == "Sala" and t2["prova"] is True
    assert [u["numero"] for u in t2["uscite"]] == [1, 2, 3]          # la 4 non è inviata, l'acqua è della sala
    assert [u["fase"] for u in t2["uscite"]] == ["prima", "va", "attende"]
    assert t2["uscita_va"] == 2 and t2["sollecito"] is True and 11 <= t2["minuti"] <= 13
    u2 = t2["uscite"][1]
    assert u2["righe"][0]["nome"] == "ROSA DI ZUCCA" and u2["righe"][0]["nota"] == "senza taleggio"
    u3 = t2["uscite"][2]
    annullata = [r for r in u3["righe"] if r["annullata"]]
    assert len(annullata) == 1 and annullata[0]["motivo"] == "cambiato idea" and not u3["annullata"]
    assert d["foglietti"][2]["uscita_va"] is None and d["foglietti"][2]["uscite"][0]["fase"] == "attende"
    assert "ordine" not in t2
    # reparto sala: tavoli 2 e 9; reparto che non c'è: errore
    sala = comande_schermo.foglietti("sala")
    assert sorted(f["tavolo"] for f in sala["foglietti"]) == ["2", "9"]
    try:
        comande_schermo.foglietti("griglia")
        raise AssertionError("doveva rifiutare il reparto")
    except comande_schermo.svc.ComandaErrore:
        pass
    # senza reparto: il primo attivo
    assert comande_schermo.foglietti()["reparto"] in ("cucina", "sala")


if __name__ == "__main__":
    test_foglietti()
    print("ok")
