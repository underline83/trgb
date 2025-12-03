// src/pages/admin/CorrispettiviDashboard.jsx

import React, { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function formatEuro(value) {
  if (value === null || value === undefined || isNaN(value)) return "€ 0,00";
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function monthName(month) {
  const mesi = [
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];
  return mesi[month - 1] || "";
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

export default function CorrispettiviDashboard() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);

  const [monthly, setMonthly] = useState(null);
  const [annual, setAnnual] = useState(null);
  const [annualCompare, setAnnualCompare] = useState(null);
  const [topDays, setTopDays] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function fetchJson(url) {
    const resp = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(
        `Errore ${resp.status}: ${resp.statusText} - ${txt || "no body"}`
      );
    }
    return resp.json();
  }

  async function loadData(selectedYear, selectedMonth) {
    setLoading(true);
    setErrorMsg("");

    try {
      const qsMonth = `year=${selectedYear}&month=${selectedMonth}`;
      const qsYear = `year=${selectedYear}`;

      const [m, a, comp, top] = await Promise.all([
        fetchJson(`${API_BASE_URL}/admin/finance/stats/monthly?${qsMonth}`),
        fetchJson(`${API_BASE_URL}/admin/finance/stats/annual?${qsYear}`),
        fetchJson(
          `${API_BASE_URL}/admin/finance/stats/annual-compare?${qsYear}`
        ),
        fetchJson(
          `${API_BASE_URL}/admin/finance/stats/top-days?${qsYear}&limit=10`
        ),
      ]);

      setMonthly(m);
      setAnnual(a);
      setAnnualCompare(comp);
      setTopDays(top);
    } catch (err) {
      console.error("Errore dashboard corrispettivi:", err);
      setErrorMsg(err.message || "Errore nel caricamento dei dati.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApplyFilters(e) {
    e.preventDefault();
    loadData(year, month);
  }

  const handleYearChange = (e) => setYear(Number(e.target.value) || CURRENT_YEAR);
  const handleMonthChange = (e) => setMonth(Number(e.target.value) || 1);

  const monthlyHasData = monthly && monthly.giorni_con_chiusura > 0;

  return (
    <div className="page-container" style={{ padding: "16px" }}>
      <h1 style={{ marginBottom: "8px" }}>Amministrazione — Dashboard Corrispettivi</h1>
      <p style={{ marginBottom: "16px", color: "#555" }}>
        Analisi mensile, annuale e confronto anni basata sui corrispettivi importati.
      </p>

      {/* FILTRI */}
      <form
        onSubmit={handleApplyFilters}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "flex-end",
          marginBottom: "16px",
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          backgroundColor: "#fafafa",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label>Anno</label>
          <input
            type="number"
            value={year}
            onChange={handleYearChange}
            min="2000"
            max="2100"
            style={{ padding: "4px 8px" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label>Mese</label>
          <select
            value={month}
            onChange={handleMonthChange}
            style={{ padding: "4px 8px" }}
          >
            {Array.from({ length: 12 }).map((_, idx) => {
              const m = idx + 1;
              return (
                <option key={m} value={m}>
                  {m} — {monthName(m)}
                </option>
              );
            })}
          </select>
        </div>

        <button
          type="submit"
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: "#222",
            color: "white",
            cursor: "pointer",
          }}
        >
          Aggiorna
        </button>

        {loading && (
          <span style={{ marginLeft: "8px", color: "#444" }}>
            Caricamento dati…
          </span>
        )}
      </form>

      {errorMsg && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid #f99",
            backgroundColor: "#ffecec",
            color: "#900",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* SEZIONE KPI MENSILI */}
      {monthly && (
        <>
          <h2 style={{ marginBottom: "8px" }}>
            Mese selezionato: {monthName(month)} {year}
          </h2>
          {!monthlyHasData && (
            <p style={{ marginBottom: "16px", color: "#a33" }}>
              Nessuna chiusura registrata per questo mese.
            </p>
          )}

          {monthlyHasData && (
            <>
              <div
                className="kpi-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <KpiCard
                  title="Totale Corrispettivi"
                  value={formatEuro(monthly.totale_corrispettivi)}
                />
                <KpiCard
                  title="Totale Incassi"
                  value={formatEuro(monthly.totale_incassi)}
                />
                <KpiCard
                  title="Media Corrispettivi / giorno"
                  value={formatEuro(monthly.media_corrispettivi)}
                />
                <KpiCard
                  title="Media Incassi / giorno"
                  value={formatEuro(monthly.media_incassi)}
                />
                <KpiCard
                  title="Totale Fatture"
                  value={formatEuro(monthly.totale_fatture)}
                />
                <KpiCard
                  title="Giorni con chiusura"
                  value={monthly.giorni_con_chiusura}
                />
              </div>

              {/* Breakdown Pagamenti */}
              <section style={{ marginBottom: "20px" }}>
                <h3>Distribuzione incassi per metodo di pagamento</h3>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "8px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Metodo</th>
                      <th style={thStyle}>Totale</th>
                      <th style={thStyle}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderPaymentRow(
                      "Contanti",
                      monthly.pagamenti.contanti_finali,
                      monthly.pagamenti.totale_incassi
                    )}
                    {renderPaymentRow(
                      "POS",
                      monthly.pagamenti.pos,
                      monthly.pagamenti.totale_incassi
                    )}
                    {renderPaymentRow(
                      "Sella",
                      monthly.pagamenti.sella,
                      monthly.pagamenti.totale_incassi
                    )}
                    {renderPaymentRow(
                      "Stripe Pay",
                      monthly.pagamenti.stripe_pay,
                      monthly.pagamenti.totale_incassi
                    )}
                    {renderPaymentRow(
                      "Bonifici",
                      monthly.pagamenti.bonifici,
                      monthly.pagamenti.totale_incassi
                    )}
                    {renderPaymentRow(
                      "Mance",
                      monthly.pagamenti.mance,
                      monthly.pagamenti.totale_incassi
                    )}
                    <tr>
                      <td style={tdStyleStrong}>Totale</td>
                      <td style={tdStyleStrong}>
                        {formatEuro(monthly.pagamenti.totale_incassi)}
                      </td>
                      <td style={tdStyleStrong}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Tabella giornaliera */}
              <section style={{ marginBottom: "24px" }}>
                <h3>Dettaglio giornaliero</h3>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginTop: "8px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>Data</th>
                        <th style={thStyle}>Giorno</th>
                        <th style={thStyle}>Corrispettivi</th>
                        <th style={thStyle}>Incassi totali</th>
                        <th style={thStyle}>Scostamento cassa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.giorni.map((g) => (
                        <tr key={g.date}>
                          <td style={tdStyle}>{g.date}</td>
                          <td style={tdStyle}>{g.weekday}</td>
                          <td style={tdStyle}>{formatEuro(g.corrispettivi)}</td>
                          <td style={tdStyle}>{formatEuro(g.totale_incassi)}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color:
                                g.cash_diff > 5
                                  ? "#b22222"
                                  : g.cash_diff < -5
                                  ? "#006400"
                                  : "#333",
                            }}
                          >
                            {formatEuro(g.cash_diff)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Alert di cassa */}
              <section style={{ marginBottom: "24px" }}>
                <h3>Alert cassa (scostamento oltre soglia)</h3>
                {monthly.alerts.length === 0 ? (
                  <p style={{ color: "#2a662a" }}>Nessun alert per questo mese.</p>
                ) : (
                  <ul style={{ paddingLeft: "20px" }}>
                    {monthly.alerts.map((a) => (
                      <li key={a.date}>
                        <strong>{a.date}</strong> — {a.message} (
                        {formatEuro(a.cash_diff)})
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}

      {/* SEZIONE ANNUALE */}
      {annual && (
        <section style={{ marginBottom: "24px" }}>
          <h2>Riepilogo annuale {annual.year}</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              marginTop: "8px",
              marginBottom: "16px",
            }}
          >
            <KpiCard
              title="Totale Corrispettivi anno"
              value={formatEuro(annual.totale_corrispettivi)}
            />
            <KpiCard
              title="Totale Incassi anno"
              value={formatEuro(annual.totale_incassi)}
            />
            <KpiCard
              title="Totale Fatture anno"
              value={formatEuro(annual.totale_fatture)}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Mese</th>
                  <th style={thStyle}>Corrispettivi</th>
                  <th style={thStyle}>Incassi</th>
                  <th style={thStyle}>Fatture</th>
                  <th style={thStyle}>Giorni con chiusura</th>
                  <th style={thStyle}>Media corr./giorno</th>
                  <th style={thStyle}>Media incassi/giorno</th>
                </tr>
              </thead>
              <tbody>
                {annual.mesi.map((m) => (
                  <tr key={m.month}>
                    <td style={tdStyle}>
                      {m.month} — {monthName(m.month)}
                    </td>
                    <td style={tdStyle}>
                      {formatEuro(m.totale_corrispettivi)}
                    </td>
                    <td style={tdStyle}>
                      {formatEuro(m.totale_incassi)}
                    </td>
                    <td style={tdStyle}>{formatEuro(m.totale_fatture)}</td>
                    <td style={tdStyle}>{m.giorni_con_chiusura}</td>
                    <td style={tdStyle}>
                      {formatEuro(m.media_corrispettivi)}
                    </td>
                    <td style={tdStyle}>{formatEuro(m.media_incassi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SEZIONE CONFRONTO ANNI */}
      {annualCompare && (
        <section style={{ marginBottom: "24px" }}>
          <h2>
            Confronto {annualCompare.year} vs {annualCompare.prev_year}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            <KpiCard
              title={`Corrispettivi ${annualCompare.year}`}
              value={formatEuro(
                annualCompare.current.totale_corrispettivi
              )}
              subtitle={`vs ${annualCompare.prev_year}: ${formatEuro(
                annualCompare.previous.totale_corrispettivi
              )}`}
            />
            <KpiCard
              title="Delta Corrispettivi"
              value={formatEuro(annualCompare.delta_corrispettivi)}
              subtitle={
                annualCompare.delta_corrispettivi_pct != null
                  ? `${annualCompare.delta_corrispettivi_pct.toFixed(
                      1
                    )} %`
                  : ""
              }
            />
            <KpiCard
              title={`Incassi ${annualCompare.year}`}
              value={formatEuro(annualCompare.current.totale_incassi)}
              subtitle={`vs ${annualCompare.prev_year}: ${formatEuro(
                annualCompare.previous.totale_incassi
              )}`}
            />
            <KpiCard
              title="Delta Incassi"
              value={formatEuro(annualCompare.delta_incassi)}
              subtitle={
                annualCompare.delta_incassi_pct != null
                  ? `${annualCompare.delta_incassi_pct.toFixed(1)} %`
                  : ""
              }
            />
          </div>
        </section>
      )}

      {/* SEZIONE TOP/BOTTOM DAYS */}
      {topDays && (
        <section style={{ marginBottom: "24px" }}>
          <h2>Giorni migliori e peggiori {topDays.year}</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "24px",
              marginTop: "8px",
            }}
          >
            <div>
              <h3>Top {topDays.top_best.length} giorni migliori</h3>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.9rem",
                  marginTop: "6px",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Giorno</th>
                    <th style={thStyle}>Incassi</th>
                    <th style={thStyle}>Corrisp.</th>
                  </tr>
                </thead>
                <tbody>
                  {topDays.top_best.map((d) => (
                    <tr key={d.date}>
                      <td style={tdStyle}>{d.date}</td>
                      <td style={tdStyle}>{d.weekday}</td>
                      <td style={tdStyle}>{formatEuro(d.totale_incassi)}</td>
                      <td style={tdStyle}>{formatEuro(d.corrispettivi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Top {topDays.top_worst.length} giorni peggiori</h3>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.9rem",
                  marginTop: "6px",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Giorno</th>
                    <th style={thStyle}>Incassi</th>
                    <th style={thStyle}>Corrisp.</th>
                  </tr>
                </thead>
                <tbody>
                  {topDays.top_worst.map((d) => (
                    <tr key={d.date}>
                      <td style={tdStyle}>{d.date}</td>
                      <td style={tdStyle}>{d.weekday}</td>
                      <td style={tdStyle}>{formatEuro(d.totale_incassi)}</td>
                      <td style={tdStyle}>{formatEuro(d.corrispettivi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// --- Piccoli componenti di supporto ---

const thStyle = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #ddd",
  backgroundColor: "#f2f2f2",
};

const tdStyle = {
  padding: "4px 8px",
  borderBottom: "1px solid #eee",
};

const tdStyleStrong = {
  ...tdStyle,
  fontWeight: "bold",
};

function KpiCard({ title, value, subtitle }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid #ddd",
        backgroundColor: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: "0.9rem", color: "#666", marginBottom: "4px" }}>
        {title}
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: "0.8rem", color: "#777", marginTop: "2px" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function renderPaymentRow(label, value, total) {
  const pct =
    total && total !== 0 ? ((value / total) * 100).toFixed(1) + " %" : "-";
  return (
    <tr>
      <td style={tdStyle}>{label}</td>
      <td style={tdStyle}>{formatEuro(value)}</td>
      <td style={tdStyle}>{pct}</td>
    </tr>
  );
}
