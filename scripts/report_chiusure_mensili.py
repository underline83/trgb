#!/usr/bin/env python3
"""
Report chiusure cassa — riepilogo mese per mese.
Lancia dal server: python3 scripts/report_chiusure_mensili.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "data", "admin_finance.sqlite3")

MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT
            substr(date, 1, 4) AS anno,
            CAST(substr(date, 6, 2) AS INTEGER) AS mese,
            COUNT(*) AS giorni_totali,
            SUM(CASE WHEN COALESCE(is_closed, 0) = 0 AND corrispettivi_tot > 0 THEN 1 ELSE 0 END) AS giorni_aperti,
            ROUND(SUM(CASE WHEN COALESCE(is_closed, 0) = 0 THEN corrispettivi_tot ELSE 0 END), 2) AS corrispettivi,
            ROUND(SUM(CASE WHEN COALESCE(is_closed, 0) = 0 THEN (contanti_finali + pos + sella + stripe_pay + bonifici + mance) ELSE 0 END), 2) AS incassi,
            ROUND(AVG(CASE WHEN COALESCE(is_closed, 0) = 0 AND corrispettivi_tot > 0 THEN corrispettivi_tot END), 2) AS media_corr
        FROM daily_closures
        GROUP BY anno, mese
        ORDER BY anno, mese
    """).fetchall()

    conn.close()

    if not rows:
        print("Nessuna chiusura trovata nel database.")
        return

    # Header
    print()
    print("=" * 95)
    print("  REPORT CHIUSURE CASSA — RIEPILOGO MENSILE")
    print("=" * 95)

    current_year = None
    year_corr = 0
    year_inc = 0
    year_days = 0

    for r in rows:
        anno = r["anno"]
        mese = r["mese"]

        # Cambio anno
        if anno != current_year:
            if current_year is not None:
                _print_year_total(current_year, year_corr, year_inc, year_days)
            current_year = anno
            year_corr = 0
            year_inc = 0
            year_days = 0
            print(f"\n  {'─' * 89}")
            print(f"  {anno}")
            print(f"  {'─' * 89}")
            print(f"  {'Mese':<6} {'Gg Aperti':>9} {'Corrispettivi':>15} {'Incassi':>15} {'Media/gg':>12} {'Diff Cassa':>14}")
            print(f"  {'─' * 89}")

        corr = r["corrispettivi"] or 0
        inc = r["incassi"] or 0
        avg = r["media_corr"] or 0
        gg = r["giorni_aperti"] or 0
        diff = inc - corr

        year_corr += corr
        year_inc += inc
        year_days += gg

        mn = MONTH_NAMES[mese - 1]
        print(f"  {mn:<6} {gg:>9} {corr:>15,.2f} {inc:>15,.2f} {avg:>12,.2f} {diff:>14,.2f}")

    # Ultimo anno
    if current_year is not None:
        _print_year_total(current_year, year_corr, year_inc, year_days)

    print(f"\n{'=' * 95}")
    print()


def _print_year_total(year, corr, inc, days):
    diff = inc - corr
    avg = corr / days if days > 0 else 0
    print(f"  {'─' * 89}")
    print(f"  {'TOTALE ' + year:<6} {days:>9} {corr:>15,.2f} {inc:>15,.2f} {avg:>12,.2f} {diff:>14,.2f}")


if __name__ == "__main__":
    main()
