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

  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [updateClosedLoading, setUpdateClosedLoading] = useState(false);
  const [updateClosedError, setUpdateClosedError] = useState("");

  async function fetchJson(url, options = {}) {
    const resp = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(
        `Errore ${resp.status}: ${resp.statusText} - ${txt || "no body"}`
      );
    }
    return resp.json();
  }

  async function loadData(selectedYear, selectedMonth, focusDate = null) {
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

      // Se possibile, manteniamo selezionato un giorno specifico
      let newSelected = null;
      if (m && m.giorni && m.giorni.length > 0) {
        if (focusDate) {
          newSelected =
            m.giorni.find((g) => g.date === focusDate) || null;
        }
        if (!newSelected) {
          // Prova con oggi se è nel mese
          const todayStr = new Date().toISOString().slice(0, 10);
          newSelected =
            m.giorni.find((g) => g.date === todayStr) || m.giorni[0];
        }
      }
      setSelectedDay(newSelected || null);
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

  const handleYearChange = (e) =>
    setYear(Number(e.target.value) || CURRENT_YEAR);
  const handleMonthChange = (e) => setMonth(Number(e.target.value) || 1);

  const monthlyHasData =
    monthly && monthly.giorni_con_chiusura > 0;

  async function handleToggleClosed() {
    if (!selectedDay) return;
    setUpdateClosedLoading(true);
    setUpdateClosedError("");

    try {
      await fetchJson(
        `${API_BASE_URL}/admin/finance/daily-closures/${selectedDay.date}/set-closed`,
        {
          method: "POST",
          body: JSON.stringify({
            is_closed: !selectedDay.is_closed,
          }),
        }
      );

      // ricarica dati mantenendo il giorno in focus
      await loadData(year, month, selectedDay.date);
    } catch (err) {
      console.error("Errore set-closed:", err);
      setUpdateClosedError(
        err.message || "Errore nel salvataggio del flag chiusura."
      );
    } finally {
      setUpdateClosedLoading(false);
    }
  }

  return (
    <div className="page-container" style={{ padding: "16px" }}>
      <h1 style={{ marginBottom: "8px" }}>
        Amministrazione — Dashboard Corrispettivi
      </h1>
      <p style={{ marginBottom: "16px", color: "#555" }}>
        Analisi mensile, annuale e confronto anni basata sui corrispettivi
        importati.
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

      {/* CALENDARIO + PANNELLO GIORNO SELEZIONATO */}
      {monthly && (
        <section
          style={{
            marginBottom: "24px",
            display: "grid",
            gridTemplateColumns: "minmax(260px, 1.3fr) minmax(260px, 1.5fr)",
            gap: "16px",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              borderRadius: "10px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              padding: "12px",
            }}
          >
            <h2 style={{ marginBottom: "4px", fontSize: "1rem" }}>
              Calendario chiusure — {monthName(month)} {year}
            </h2>
            <p
              style={{
                marginBottom: "8px",
                fontSize: "0.8rem",
                color: "#666",
              }}
            >
              Grigio = giorno chiuso (flag o mercoledì con 0). Blu = giorno
              aperto con incassi.
            </p>
            <MonthlyCalendar
              year={year}
              month={month}
              days={monthly.giorni || []}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>

          <div
            style={{
              borderRadius: "10px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              padding: "12px",
              minHeight: "220px",
            }}
          >
            <h2 style={{ marginBottom: "8px", fontSize: "1rem" }}>
              Dettaglio giorno selezionato
            </h2>
            {!selectedDay && (
              <p style={{ fontSize: "0.9rem", color: "#666" }}>
                Seleziona un giorno dal calendario per vedere i dettagli.
              </p>
            )}
            {selectedDay && (
              <>
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    {selectedDay.date} — {selectedDay.weekday}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#666" }}>
                    {selectedDay.is_closed
                      ? "Questo giorno è attualmente considerato CHIUSO nelle statistiche."
                      : "Questo giorno è considerato APERTO nelle statistiche."}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <MiniKpi
                    label="Corrispettivi"
                    value={formatEuro(selectedDay.corrispettivi)}
                  />
                  <MiniKpi
                    label="Incassi totali"
                    value={formatEuro(selectedDay.totale_incassi)}
                  />
                  <MiniKpi
                    label="Scostamento cassa"
                    value={formatEuro(selectedDay.cash_diff)}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleToggleClosed}
                  disabled={updateClosedLoading}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: selectedDay.is_closed
                      ? "#2563eb"
                      : "#6b21a8",
                    color: "white",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    marginBottom: "6px",
                  }}
                >
                  {updateClosedLoading
                    ? "Salvataggio..."
                    : selectedDay.is_closed
                    ? "Segna come APERTO nelle statistiche"
                    : "Segna come GIORNO DI CHIUSURA"}
                </button>

                {updateClosedError && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#b91c1c",
                      marginTop: "4px",
                    }}
                  >
                    {updateClosedError}
                  </div>
                )}

                <p style={{ fontSize: "0.75rem", color: "#777", marginTop: 6 }}>
                  Nota: i giorni di chiusura vengono esclusi dalle medie,
                  dai totali e dai grafici annuali. Le aperture straordinarie
                  (es. mercoledì con incassi) rimangono incluse.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* SEZIONE KPI MENSILI */}
      {monthly && (
        <>
          <h2 style={{ marginBottom: "8px" }}>
            Mese selezionato: {monthName(month)} {year}
          </h2>
          {!monthlyHasData && (
            <p style={{ marginBottom: "16px", color: "#a33" }}>
              Nessuna chiusura registrata (giorni aperti) per questo mese.
            </p>
          )}

          {monthlyHasData && (
            <>
              <div
                className="kpi-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
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
                  title="Media Corrispettivi / giorno (aperto)"
                  value={formatEuro(monthly.media_corrispettivi)}
                />
                <KpiCard
                  title="Media Incassi / giorno (aperto)"
                  value={formatEuro(monthly.media_incassi)}
                />
                <KpiCard
                  title="Totale Fatture"
                  value={formatEuro(monthly.totale_fatture)}
                />
                <KpiCard
                  title="Giorni aperti (conteggiati)"
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
                        <th style={thStyle}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.giorni.map((g) => (
                        <tr key={g.date}>
                          <td style={tdStyle}>{g.date}</td>
                          <td style={tdStyle}>{g.weekday}</td>
                          <td style={tdStyle}>
                            {formatEuro(g.corrispettivi)}
                          </td>
                          <td style={tdStyle}>
                            {formatEuro(g.totale_incassi)}
                          </td>
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
                          <td style={tdStyle}>
                            {g.is_closed
                              ? "CHIUSO"
                              : g.totale_incassi > 0
                              ? "APERTO"
                              : "N.D."}
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
                  <p style={{ color: "#2a662a" }}>
                    Nessun alert per questo mese.
                  </p>
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
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
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
                  <th style={thStyle}>Giorni aperti</th>
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
                    <td style={tdStyle}>
                      {formatEuro(m.totale_fatture)}
                    </td>
                    <td style={tdStyle}>{m.giorni_con_chiusura}</td>
                    <td style={tdStyle}>
                      {formatEuro(m.media_corrispettivi)}
                    </td>
                    <td style={tdStyle}>
                      {formatEuro(m.media_incassi)}
                    </td>
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
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
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
              value={formatEuro(
                annualCompare.delta_corrispettivi
              )}
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
              value={formatEuro(
                annualCompare.current.totale_incassi
              )}
              subtitle={`vs ${annualCompare.prev_year}: ${formatEuro(
                annualCompare.previous.totale_incassi
              )}`}
            />
            <KpiCard
              title="Delta Incassi"
              value={formatEuro(annualCompare.delta_incassi)}
              subtitle={
                annualCompare.delta_incassi_pct != null
                  ? `${annualCompare.delta_incassi_pct.toFixed(
                      1
                    )} %`
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
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
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
                      <td style={tdStyle}>
                        {formatEuro(d.totale_incassi)}
                      </td>
                      <td style={tdStyle}>
                        {formatEuro(d.corrispettivi)}
                      </td>
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
                      <td style={tdStyle}>
                        {formatEuro(d.totale_incassi)}
                      </td>
                      <td style={tdStyle}>
                        {formatEuro(d.corrispettivi)}
                      </td>
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
      <div
        style={{
          fontSize: "0.9rem",
          color: "#666",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{value}</div>
      {subtitle && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "#777",
            marginTop: "2px",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div
      style={{
        padding: "6px 8px",
        borderRadius: "6px",
        border: "1px solid #e5e5e5",
        backgroundColor: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "#666",
          marginBottom: "2px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{value}</div>
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

/**
 * CALENDARIO MENSILE SEMPLICE
 * - Mostra i giorni del mese in griglia 7xN
 * - Usa monthly.giorni come sorgente
 * - Evidenzia giorni chiusi / aperti
 */

function MonthlyCalendar({ year, month, days, selectedDay, onSelectDay }) {
  // mappa "YYYY-MM-DD" -> info giorno
  const dayMap = {};
  if (Array.isArray(days)) {
    for (const d of days) {
      if (d && d.date) {
        dayMap[d.date] = d;
      }
    }
  }

  const firstDay = new Date(year, month - 1, 1);
  const jsWeekday = firstDay.getDay(); // 0 domenica ... 6 sabato
  const startOffset = jsWeekday === 0 ? 6 : jsWeekday - 1; // 0=lun, ... 6=dom
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // celle vuote prima
  for (let i = 0; i < startOffset; i++) {
    cells.push({ type: "empty", key: `empty-${i}` });
  }
  // giorni del mese
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
      d
    ).padStart(2, "0")}`;
    const info = dayMap[dateStr] || null;
    cells.push({
      type: "day",
      key: dateStr,
      dayNumber: d,
      dateStr,
      info,
    });
  }

  // riempi fino a multiplo di 7
  while (cells.length % 7 !== 0) {
    cells.push({
      type: "empty",
      key: `empty-tail-${cells.length}`,
    });
  }

  const weekdayHeaders = [
    "Lun",
    "Mar",
    "Mer",
    "Gio",
    "Ven",
    "Sab",
    "Dom",
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          fontSize: "0.75rem",
          marginBottom: "4px",
        }}
      >
        {weekdayHeaders.map((wd) => (
          <div
            key={wd}
            style={{
              textAlign: "center",
              padding: "2px 0",
              fontWeight: 600,
              color: "#555",
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
          fontSize: "0.8rem",
        }}
      >
        {cells.map((cell) => {
          if (cell.type === "empty") {
            return (
              <div
                key={cell.key}
                style={{
                  minHeight: "52px",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                }}
              />
            );
          }

          const info = cell.info;
          const isSelected =
            selectedDay && selectedDay.date === cell.dateStr;

          const baseStyle = {
            minHeight: "52px",
            borderRadius: "6px",
            border: "1px solid #e5e5e5",
            padding: "4px 4px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontSize: "0.8rem",
          };

          let bg = "#ffffff";
          let borderColor = "#e5e5e5";
          let badgeText = "";
          let badgeBg = "#e5e5e5";
          let badgeColor = "#555";

          if (info) {
            if (info.is_closed) {
              bg = "#f5f5f5";
              borderColor = "#d4d4d4";
              badgeText = "CHIUSO";
              badgeBg = "#e5e5e5";
              badgeColor = "#555";
            } else if (info.totale_incassi > 0) {
              bg = "#eff6ff";
              borderColor = "#bfdbfe";
              badgeText = "APERTO";
              badgeBg = "#bfdbfe";
              badgeColor = "#1e3a8a";
            }
          }

          if (isSelected) {
            borderColor = "#1f2937";
          }

          return (
            <div
              key={cell.key}
              style={{
                ...baseStyle,
                backgroundColor: bg,
                borderColor: borderColor,
              }}
              onClick={() => {
                if (info) {
                  onSelectDay(info);
                } else {
                  onSelectDay({
                    date: cell.dateStr,
                    weekday: "",
                    corrispettivi: 0,
                    totale_incassi: 0,
                    cash_diff: 0,
                    is_closed: false,
                  });
                }
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  }}
                >
                  {cell.dayNumber}
                </span>
                {badgeText && (
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "0 6px",
                      fontSize: "0.65rem",
                      backgroundColor: badgeBg,
                      color: badgeColor,
                    }}
                  >
                    {badgeText}
                  </span>
                )}
              </div>
              {info && info.totale_incassi > 0 && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#1f2937",
                    marginTop: "2px",
                  }}
                >
                  {formatEuro(info.totale_incassi)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
