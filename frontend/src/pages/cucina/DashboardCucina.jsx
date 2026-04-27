// @version: v1.0 — Modulo H Dashboard Cucina chef (sessione 59, 2026-04-27)
// Vista operativa giornaliera per chef: pranzo oggi, carta attiva,
// alert allergeni, KPI ricette, ricette modificate, quick actions.
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, PageLayout, EmptyState } from "../../components/ui";

const DASH = `${API_BASE}/dashboard`;

// Etichette stato pranzo
const STATO_PRANZO = {
  bozza:        { label: "Bozza",       cls: "bg-amber-100 text-amber-800 border-amber-300", emoji: "✏️" },
  pubblicato:   { label: "Pubblicato",  cls: "bg-emerald-100 text-emerald-800 border-emerald-300", emoji: "✅" },
  archiviato:   { label: "Archiviato",  cls: "bg-neutral-100 text-neutral-600 border-neutral-300", emoji: "📦" },
};

// Formatter data: "lun 27 apr"
function fmtDataBreve(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}

// Formatter "X giorni fa" / "oggi"
function fmtFa(isoDate) {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate.replace(" ", "T"));
    const ms = Date.now() - d.getTime();
    const giorni = Math.floor(ms / 86400000);
    if (giorni <= 0) return "oggi";
    if (giorni === 1) return "ieri";
    if (giorni < 7) return `${giorni}gg fa`;
    if (giorni < 30) return `${Math.floor(giorni / 7)}sett fa`;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export default function DashboardCucina() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    (async () => {
      try {
        const r = await apiFetch(`${DASH}/cucina`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancel) setData(d);
      } catch (e) {
        if (!cancel) setError(e.name === "AbortError" ? "Timeout (20s) — riprova" : (e.message || "Errore caricamento dashboard"));
      } finally {
        clearTimeout(t);
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; ctrl.abort(); };
  }, []);

  const reload = () => {
    setLoading(true); setError(""); setData(null);
    apiFetch(`${DASH}/cucina`).then(r => r.json()).then(setData)
      .catch(e => setError(e.message || "Errore"))
      .finally(() => setLoading(false));
  };

  return (
    <PageLayout
      title="Dashboard Cucina"
      subtitle={data?.data_oggi ? fmtDataBreve(data.data_oggi) : "Vista operativa giornaliera"}
      wide
      actions={
        <Btn variant="secondary" size="sm" onClick={reload} disabled={loading}>
          {loading ? "..." : "↻ Aggiorna"}
        </Btn>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between">
          <span>⚠ {error}</span>
          <Btn variant="secondary" size="sm" onClick={reload}>Riprova</Btn>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-neutral-500">Caricamento dashboard...</div>
      ) : !data ? (
        <EmptyState
          icon="🍳"
          title="Dati non disponibili"
          description="La dashboard non ha potuto caricare i dati. Riprova tra qualche istante."
          action={<Btn variant="primary" onClick={reload}>Ricarica</Btn>}
        />
      ) : (
        <div className="space-y-4">

          {/* ── KPI HEADER (5 card) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Ricette attive" value={data.kpi.n_ricette_attive} sub={`${data.kpi.n_basi} basi · ${data.kpi.n_piatti} piatti`} color="orange" />
            <KpiCard label="In carta" value={data.kpi.n_publications_carta} sub={data.carta_attiva ? data.carta_attiva.nome : "Nessuna carta attiva"} color="indigo" />
            <KpiCard label="Pranzi 7gg" value={data.kpi.n_pranzi_settimana} sub="oggi + 7 gg avanti" color="amber" />
            <KpiCard label="Senza prezzo" value={data.kpi.n_senza_prezzo_vendita} sub="piatti da prezzare" color={data.kpi.n_senza_prezzo_vendita > 0 ? "red" : "green"} />
            <KpiCard label="Ingredienti senza prezzo" value={data.ingredienti_senza_prezzo} sub="costing incompleto" color={data.ingredienti_senza_prezzo > 20 ? "red" : "neutral"} />
          </div>

          {/* ── COL 1: Pranzo + Carta · COL 2: Alert + Recenti ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* PRANZO OGGI */}
            <Section
              title="Pranzo del Giorno"
              emoji="🍽️"
              tint="bg-amber-50 border-amber-200"
              cta={
                <Btn variant="secondary" size="sm" onClick={() => navigate("/pranzo")}>
                  Apri Menu Pranzo →
                </Btn>
              }
            >
              {data.pranzo_oggi ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatoBadge stato={data.pranzo_oggi.stato} />
                    <span className="text-sm text-neutral-700">
                      <strong>{data.pranzo_oggi.n_righe}</strong> piatt{data.pranzo_oggi.n_righe === 1 ? "o" : "i"} in menu
                    </span>
                  </div>
                  {data.pranzo_oggi.titolo && (
                    <div className="text-base font-medium text-neutral-800">{data.pranzo_oggi.titolo}</div>
                  )}
                  <div className="flex gap-3 text-xs text-neutral-600">
                    <span>1 portata <strong className="text-neutral-800">€ {data.pranzo_oggi.prezzo_1?.toFixed(0) || "-"}</strong></span>
                    <span>·</span>
                    <span>2 portate <strong className="text-neutral-800">€ {data.pranzo_oggi.prezzo_2?.toFixed(0) || "-"}</strong></span>
                    <span>·</span>
                    <span>3 portate <strong className="text-neutral-800">€ {data.pranzo_oggi.prezzo_3?.toFixed(0) || "-"}</strong></span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-neutral-500 mb-3">Nessun menu pranzo per oggi.</p>
                  <Btn variant="primary" size="sm" onClick={() => navigate("/pranzo")}>+ Crea menu di oggi</Btn>
                </div>
              )}

              {/* Pianificati prossimi giorni */}
              {data.pranzo_prossimi.length > 0 && (
                <div className="mt-4 pt-3 border-t border-amber-200">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-2 font-semibold">
                    Prossimi {data.pranzo_prossimi.length}
                  </div>
                  <div className="space-y-1">
                    {data.pranzo_prossimi.map(p => (
                      <button key={p.id} onClick={() => navigate("/pranzo")}
                        className="w-full flex items-center justify-between text-xs text-neutral-700 hover:bg-amber-100/50 rounded px-2 py-1 transition">
                        <span className="font-mono">{fmtDataBreve(p.data)}</span>
                        <span className="text-neutral-500">{p.n_righe} piatt{p.n_righe === 1 ? "o" : "i"}</span>
                        <StatoBadge stato={p.stato} compact />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* CARTA ATTIVA */}
            <Section
              title="Carta Cliente in Corso"
              emoji="📜"
              tint="bg-indigo-50 border-indigo-200"
              cta={data.carta_attiva && (
                <Btn variant="secondary" size="sm" onClick={() => navigate(`/menu-carta/${data.carta_attiva.id}`)}>
                  Apri Carta →
                </Btn>
              )}
            >
              {data.carta_attiva ? (
                <div className="space-y-3">
                  <div className="font-medium text-neutral-800">{data.carta_attiva.nome}</div>
                  <div className="text-xs text-neutral-600 flex flex-wrap gap-x-3 gap-y-1">
                    {data.carta_attiva.stagione && <span>🌿 {data.carta_attiva.stagione} {data.carta_attiva.anno || ""}</span>}
                    {data.carta_attiva.data_inizio && (
                      <span>📅 {fmtDataBreve(data.carta_attiva.data_inizio)}{data.carta_attiva.data_fine ? ` → ${fmtDataBreve(data.carta_attiva.data_fine)}` : " → ∞"}</span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="px-2 py-1 rounded bg-white border border-indigo-200 text-indigo-800">
                      <strong>{data.carta_attiva.n_publications}</strong> piatti totali
                    </span>
                    <span className="px-2 py-1 rounded bg-white border border-indigo-200 text-indigo-800">
                      <strong>{data.carta_attiva.n_visibili}</strong> visibili
                    </span>
                  </div>
                  <div className="pt-2">
                    <Btn variant="secondary" size="sm" as="a" href="/carta/menu" target="_blank">
                      🔗 Apri carta cliente pubblica
                    </Btn>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-neutral-500 mb-3">Nessuna carta attiva (stato "in_carta").</p>
                  <Btn variant="primary" size="sm" onClick={() => navigate("/menu-carta")}>+ Gestisci carte</Btn>
                </div>
              )}
            </Section>

            {/* ALERT ALLERGENI */}
            <Section
              title="Alert Allergeni"
              emoji={data.alert_allergeni.count > 0 ? "⚠️" : "✓"}
              tint={data.alert_allergeni.count > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}
              badge={data.alert_allergeni.count > 0 ? data.alert_allergeni.count : null}
            >
              {data.alert_allergeni.count === 0 ? (
                <p className="text-sm text-emerald-800">
                  ✓ Tutti i piatti in carta hanno gli allergeni dichiarati o calcolati a monte.
                </p>
              ) : (
                <>
                  <p className="text-sm text-red-900 mb-3">
                    <strong>{data.alert_allergeni.count}</strong> piatt{data.alert_allergeni.count === 1 ? "o" : "i"} in carta non h{data.alert_allergeni.count === 1 ? "a" : "anno"} allergeni dichiarati
                    né a livello pubblicazione né nella ricetta sorgente.
                  </p>
                  <div className="space-y-1.5">
                    {data.alert_allergeni.lista.map(a => (
                      <button key={a.publication_id}
                        onClick={() => a.recipe_id && navigate(`/ricette/${a.recipe_id}`)}
                        disabled={!a.recipe_id}
                        className="w-full flex items-center justify-between text-xs hover:bg-red-100/50 rounded px-2 py-1.5 transition disabled:cursor-default"
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium text-neutral-800">{a.titolo}</span>
                          <span className="text-[10px] text-neutral-500">sezione: {a.sezione}</span>
                        </div>
                        {a.recipe_id && <span className="text-[10px] text-red-700">Apri ricetta →</span>}
                      </button>
                    ))}
                    {data.alert_allergeni.count > data.alert_allergeni.lista.length && (
                      <div className="text-[10px] text-neutral-500 italic px-2 pt-1">
                        +{data.alert_allergeni.count - data.alert_allergeni.lista.length} altr{data.alert_allergeni.count - data.alert_allergeni.lista.length === 1 ? "o" : "i"} non mostrat{data.alert_allergeni.count - data.alert_allergeni.lista.length === 1 ? "o" : "i"} — apri Carta per il dettaglio.
                      </div>
                    )}
                  </div>
                </>
              )}
            </Section>

            {/* RICETTE MODIFICATE */}
            <Section
              title="Ricette Modificate Recentemente"
              emoji="✏️"
              tint="bg-neutral-50 border-neutral-200"
              cta={
                <Btn variant="secondary" size="sm" onClick={() => navigate("/ricette/archivio")}>
                  Archivio →
                </Btn>
              }
            >
              {data.ricette_modificate.length === 0 ? (
                <p className="text-sm text-neutral-500">Nessuna modifica negli ultimi 7 giorni.</p>
              ) : (
                <div className="space-y-1">
                  {data.ricette_modificate.map(r => (
                    <button key={r.id}
                      onClick={() => navigate(`/ricette/${r.id}`)}
                      className="w-full flex items-center justify-between text-xs hover:bg-neutral-100 rounded px-2 py-1.5 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px]">{r.is_base ? "🧂" : "🍽️"}</span>
                        <span className="font-medium text-neutral-800 truncate">{r.name}</span>
                        {r.category && (
                          <span className="text-[10px] text-neutral-400 hidden sm:inline">· {r.category}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-500 ml-2 whitespace-nowrap">{fmtFa(r.updated_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Section>

          </div>

          {/* ── AZIONI RAPIDE in fondo ── */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-3 font-semibold">Azioni rapide</div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="secondary" size="sm" onClick={() => navigate("/pranzo")}>🍽 Menu Pranzo</Btn>
              <Btn variant="secondary" size="sm" onClick={() => navigate("/menu-carta")}>📜 Menu Carta</Btn>
              <Btn variant="secondary" size="sm" onClick={() => navigate("/ricette/archivio")}>📚 Archivio Ricette</Btn>
              <Btn variant="secondary" size="sm" onClick={() => navigate("/ricette/dashboard")}>📊 Dashboard Food Cost</Btn>
              <Btn variant="secondary" size="sm" onClick={() => navigate("/ricette/ingredienti")}>🥕 Ingredienti</Btn>
              <Btn variant="secondary" size="sm" onClick={() => navigate("/ricette/nuova")}>+ Nuova ricetta</Btn>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KpiCard({ label, value, sub, color = "neutral" }) {
  const colorMap = {
    orange:  "text-orange-700",
    indigo:  "text-indigo-700",
    amber:   "text-amber-700",
    red:     "text-red-700",
    green:   "text-emerald-700",
    neutral: "text-neutral-800",
  };
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
      <div className={`text-2xl font-bold ${colorMap[color] || colorMap.neutral} tabular-nums`}>{value ?? "—"}</div>
      <div className="text-[11px] text-neutral-600 font-medium mt-1">{label}</div>
      {sub && <div className="text-[10px] text-neutral-400 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function Section({ title, emoji, tint, cta, badge, children }) {
  return (
    <div className={`rounded-xl border p-4 ${tint || "bg-white border-neutral-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>{emoji}</span>
          <h3 className="text-sm font-bold text-neutral-800">{title}</h3>
          {badge != null && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
              {badge}
            </span>
          )}
        </div>
        {cta}
      </div>
      {children}
    </div>
  );
}

function StatoBadge({ stato, compact = false }) {
  const cfg = STATO_PRANZO[stato] || { label: stato || "—", cls: "bg-neutral-100 text-neutral-600 border-neutral-300", emoji: "" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
      {!compact && cfg.emoji} {cfg.label}
    </span>
  );
}
