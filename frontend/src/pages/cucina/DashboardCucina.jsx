// @version: v1.1 — refactor Home v3 originale potenziato + RicetteNav (sessione 59 cont., 2026-04-27)
// Modulo H — Dashboard Cucina chef. Vista operativa giornaliera.
// Pattern visivo: card tintate con border colorato, emoji 28px, font-playfair sui titoli,
// brand-cream sfondo, palette cucina = orange. Coerente con DashboardSala / Home v3.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "../ricette/RicetteNav";
import TrgbLoader from "../../components/TrgbLoader";

const DASH = `${API_BASE}/dashboard`;

const STATO_PRANZO = {
  bozza:        { label: "Bozza",       cls: "bg-amber-50 text-amber-800 border-amber-200", emoji: "✏️" },
  pubblicato:   { label: "Pubblicato",  cls: "bg-emerald-50 text-emerald-800 border-emerald-200", emoji: "✅" },
  archiviato:   { label: "Archiviato",  cls: "bg-neutral-100 text-neutral-600 border-neutral-300", emoji: "📦" },
};

function fmtDataLunga() {
  const d = new Date();
  const giorni = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}
function fmtDataBreve(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}
function fmtFa(isoDate) {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate.replace(" ", "T"));
    const giorni = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (giorni <= 0) return "oggi";
    if (giorni === 1) return "ieri";
    if (giorni < 7) return `${giorni}gg fa`;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch { return ""; }
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default function DashboardCucina() {
  const navigate = useNavigate();
  const displayName = (localStorage.getItem("display_name") || localStorage.getItem("username") || "Chef").split(" ")[0];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await apiFetch(`${DASH}/cucina`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.name === "AbortError" ? "Timeout (20s)" : (e.message || "Errore caricamento"));
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <RicetteNav current="cucina-dashboard" />
        <div className="flex items-center justify-center py-24">
          <TrgbLoader size={56} label="Caricamento dashboard…" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="cucina-dashboard" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

        {/* ═══ Header pagina (Playfair + saluto contestuale) ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <div>
            <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-orange-900 tracking-tight leading-tight">
              {getGreeting()}, {displayName} 🍳
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-1 capitalize">
              {fmtDataLunga()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-white border border-orange-200 text-orange-800 hover:bg-orange-50 transition disabled:opacity-50">
              {loading ? "…" : "↻ Aggiorna"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <span>⚠ {error}</span>
            <button onClick={load} className="text-xs font-semibold underline">Riprova</button>
          </div>
        )}

        {data && (
          <div className="space-y-4">

            {/* ═══ KPI HEADER — card tintate Home v3 ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiTile
                emoji="📚"
                value={data.kpi.n_ricette_attive}
                label="Ricette attive"
                sub={`${data.kpi.n_basi} basi · ${data.kpi.n_piatti} piatti`}
                bg="bg-orange-50"
                border="border-orange-200"
                text="text-orange-900"
              />
              <KpiTile
                emoji="📜"
                value={data.kpi.n_publications_carta}
                label="Piatti in carta"
                sub={data.carta_attiva ? data.carta_attiva.nome : "Nessuna carta attiva"}
                bg="bg-indigo-50"
                border="border-indigo-200"
                text="text-indigo-900"
              />
              <KpiTile
                emoji="🥙"
                value={data.kpi.n_pranzi_settimana}
                label="Pranzi 7 giorni"
                sub="oggi + 7gg avanti"
                bg="bg-amber-50"
                border="border-amber-200"
                text="text-amber-900"
              />
              <KpiTile
                emoji="💰"
                value={data.kpi.n_senza_prezzo_vendita}
                label="Senza prezzo"
                sub="piatti da prezzare"
                bg={data.kpi.n_senza_prezzo_vendita > 0 ? "bg-red-50" : "bg-emerald-50"}
                border={data.kpi.n_senza_prezzo_vendita > 0 ? "border-red-200" : "border-emerald-200"}
                text={data.kpi.n_senza_prezzo_vendita > 0 ? "text-red-900" : "text-emerald-900"}
              />
              <KpiTile
                emoji="🥕"
                value={data.ingredienti_senza_prezzo}
                label="Ingredienti senza €"
                sub="costing incompleto"
                bg={data.ingredienti_senza_prezzo > 20 ? "bg-red-50" : "bg-neutral-50"}
                border={data.ingredienti_senza_prezzo > 20 ? "border-red-200" : "border-neutral-200"}
                text={data.ingredienti_senza_prezzo > 20 ? "text-red-900" : "text-neutral-900"}
              />
            </div>

            {/* ═══ Grid 2 colonne: contenuti operativi ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* PRANZO OGGI */}
              <Section
                emoji="🍽️"
                title="Pranzo del Giorno"
                bg="bg-amber-50"
                border="border-amber-200"
                titleColor="text-amber-900"
                cta={{ label: "Apri Menu Pranzo →", onClick: () => navigate("/pranzo"), color: "amber" }}
              >
                {data.pranzo_oggi ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatoBadge stato={data.pranzo_oggi.stato} />
                      <span className="text-sm text-neutral-700">
                        <strong className="text-amber-900">{data.pranzo_oggi.n_righe}</strong> piatt{data.pranzo_oggi.n_righe === 1 ? "o" : "i"} in menu
                      </span>
                    </div>
                    {data.pranzo_oggi.titolo && (
                      <div className="text-base font-medium text-brand-ink">{data.pranzo_oggi.titolo}</div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-neutral-700 pt-1">
                      <span className="px-2 py-1 rounded-md bg-white border border-amber-200">
                        1 portata <strong className="text-amber-900">€ {data.pranzo_oggi.prezzo_1?.toFixed(0) || "-"}</strong>
                      </span>
                      <span className="px-2 py-1 rounded-md bg-white border border-amber-200">
                        2 portate <strong className="text-amber-900">€ {data.pranzo_oggi.prezzo_2?.toFixed(0) || "-"}</strong>
                      </span>
                      <span className="px-2 py-1 rounded-md bg-white border border-amber-200">
                        3 portate <strong className="text-amber-900">€ {data.pranzo_oggi.prezzo_3?.toFixed(0) || "-"}</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-neutral-600 mb-3">Nessun menu pranzo per oggi.</p>
                    <button onClick={() => navigate("/pranzo")}
                      className="px-4 py-2 rounded-[10px] bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition">
                      + Crea menu di oggi
                    </button>
                  </div>
                )}

                {data.pranzo_prossimi.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-amber-200">
                    <div className="text-[10px] uppercase tracking-[1.2px] text-amber-700 mb-2 font-bold">
                      📅 Prossimi {data.pranzo_prossimi.length}
                    </div>
                    <div className="space-y-1">
                      {data.pranzo_prossimi.map(p => (
                        <button key={p.id} onClick={() => navigate("/pranzo")}
                          className="w-full flex items-center justify-between text-xs text-brand-ink hover:bg-amber-100/60 rounded-md px-2 py-1.5 transition">
                          <span className="font-mono tabular-nums">{fmtDataBreve(p.data)}</span>
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
                emoji="📜"
                title="Carta Cliente in Corso"
                bg="bg-indigo-50"
                border="border-indigo-200"
                titleColor="text-indigo-900"
                cta={data.carta_attiva ? { label: "Apri Carta →", onClick: () => navigate(`/menu-carta/${data.carta_attiva.id}`), color: "indigo" } : null}
              >
                {data.carta_attiva ? (
                  <div className="space-y-3">
                    <div className="font-semibold text-base text-brand-ink">{data.carta_attiva.nome}</div>
                    <div className="text-xs text-neutral-700 flex flex-wrap gap-x-3 gap-y-1">
                      {data.carta_attiva.stagione && (
                        <span>🌿 {data.carta_attiva.stagione} {data.carta_attiva.anno || ""}</span>
                      )}
                      {data.carta_attiva.data_inizio && (
                        <span>📅 {fmtDataBreve(data.carta_attiva.data_inizio)}{data.carta_attiva.data_fine ? ` → ${fmtDataBreve(data.carta_attiva.data_fine)}` : " → ∞"}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-md bg-white border border-indigo-200 text-indigo-900">
                        <strong>{data.carta_attiva.n_publications}</strong> piatti totali
                      </span>
                      <span className="px-2 py-1 rounded-md bg-white border border-indigo-200 text-indigo-900">
                        <strong>{data.carta_attiva.n_visibili}</strong> visibili
                      </span>
                    </div>
                    <div className="pt-1">
                      <a href="/carta/menu" target="_blank" rel="noopener noreferrer"
                        className="inline-block px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-white border border-indigo-300 text-indigo-800 hover:bg-indigo-100 transition">
                        🔗 Carta cliente pubblica
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-neutral-600 mb-3">Nessuna carta attiva (stato "in_carta").</p>
                    <button onClick={() => navigate("/menu-carta")}
                      className="px-4 py-2 rounded-[10px] bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition">
                      + Gestisci carte
                    </button>
                  </div>
                )}
              </Section>

              {/* ALERT ALLERGENI */}
              <Section
                emoji={data.alert_allergeni.count > 0 ? "⚠️" : "✓"}
                title="Alert Allergeni"
                bg={data.alert_allergeni.count > 0 ? "bg-red-50" : "bg-emerald-50"}
                border={data.alert_allergeni.count > 0 ? "border-red-200" : "border-emerald-200"}
                titleColor={data.alert_allergeni.count > 0 ? "text-red-900" : "text-emerald-900"}
                badge={data.alert_allergeni.count > 0 ? data.alert_allergeni.count : null}
              >
                {data.alert_allergeni.count === 0 ? (
                  <p className="text-sm text-emerald-900">
                    ✓ Tutti i piatti in carta hanno gli allergeni dichiarati o calcolati a monte.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-red-900 mb-3">
                      <strong>{data.alert_allergeni.count}</strong> piatt{data.alert_allergeni.count === 1 ? "o" : "i"} in carta senza allergeni dichiarati né calcolati.
                    </p>
                    <div className="space-y-1">
                      {data.alert_allergeni.lista.map(a => (
                        <button key={a.publication_id}
                          onClick={() => a.recipe_id && navigate(`/ricette/${a.recipe_id}`)}
                          disabled={!a.recipe_id}
                          className="w-full flex items-center justify-between text-xs hover:bg-red-100/60 rounded-md px-2 py-1.5 transition disabled:cursor-default text-left"
                        >
                          <div className="flex flex-col items-start min-w-0">
                            <span className="font-medium text-brand-ink truncate">{a.titolo}</span>
                            <span className="text-[10px] text-neutral-500">sezione: {a.sezione}</span>
                          </div>
                          {a.recipe_id && <span className="text-[10px] font-semibold text-red-700 ml-2 whitespace-nowrap">Apri →</span>}
                        </button>
                      ))}
                      {data.alert_allergeni.count > data.alert_allergeni.lista.length && (
                        <div className="text-[10px] text-neutral-500 italic px-2 pt-1">
                          +{data.alert_allergeni.count - data.alert_allergeni.lista.length} altr{data.alert_allergeni.count - data.alert_allergeni.lista.length === 1 ? "o" : "i"} — apri Carta per il dettaglio.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Section>

              {/* RICETTE MODIFICATE */}
              <Section
                emoji="✏️"
                title="Ricette Modificate Recentemente"
                bg="bg-white"
                border="border-neutral-200"
                titleColor="text-brand-ink"
                cta={{ label: "Archivio →", onClick: () => navigate("/ricette/archivio"), color: "neutral" }}
              >
                {data.ricette_modificate.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessuna modifica negli ultimi 7 giorni.</p>
                ) : (
                  <div className="space-y-1">
                    {data.ricette_modificate.map(r => (
                      <button key={r.id}
                        onClick={() => navigate(`/ricette/${r.id}`)}
                        className="w-full flex items-center justify-between text-xs hover:bg-neutral-50 rounded-md px-2 py-1.5 transition text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm">{r.is_base ? "🧂" : "🍽️"}</span>
                          <span className="font-medium text-brand-ink truncate">{r.name}</span>
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

            {/* ═══ Azioni rapide (stile Home v3) ═══ */}
            <div className="bg-white rounded-[14px] border border-neutral-200 p-4" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div className="text-[10px] uppercase tracking-[1.2px] text-[#a8a49e] mb-3 font-bold">
                ⚡ Azioni rapide
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <QuickAction emoji="🥙" label="Menu Pranzo"   onClick={() => navigate("/pranzo")}        bg="bg-amber-50"   border="border-amber-200"   text="text-amber-900" />
                <QuickAction emoji="📜" label="Menu Carta"    onClick={() => navigate("/menu-carta")}    bg="bg-indigo-50"  border="border-indigo-200"  text="text-indigo-900" />
                <QuickAction emoji="📚" label="Archivio"      onClick={() => navigate("/ricette/archivio")} bg="bg-orange-50"  border="border-orange-200"  text="text-orange-900" />
                <QuickAction emoji="📊" label="Food Cost"     onClick={() => navigate("/ricette/dashboard")} bg="bg-blue-50"    border="border-blue-200"    text="text-blue-900" />
                <QuickAction emoji="🥕" label="Ingredienti"   onClick={() => navigate("/ricette/ingredienti")} bg="bg-emerald-50" border="border-emerald-200" text="text-emerald-900" />
                <QuickAction emoji="+"  label="Nuova ricetta" onClick={() => navigate("/ricette/nuova")} bg="bg-neutral-50" border="border-neutral-200" text="text-neutral-700" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KpiTile({ emoji, value, label, sub, bg, border, text }) {
  return (
    <div
      className={`rounded-[14px] border ${bg} ${border} px-3 py-3 flex items-start gap-3 min-h-[80px]`}
      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
    >
      <span className="text-[28px] leading-none flex-shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-2xl font-extrabold tabular-nums leading-none ${text}`}>{value ?? "—"}</div>
        <div className="text-[11px] text-brand-ink font-semibold mt-1 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-neutral-500 mt-0.5 truncate" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ emoji, title, bg, border, titleColor, badge, cta, children }) {
  return (
    <div
      className={`rounded-[14px] border ${bg} ${border} p-4`}
      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[24px] leading-none flex-shrink-0" aria-hidden>{emoji}</span>
          <h3 className={`text-base font-bold font-playfair tracking-tight truncate ${titleColor || "text-brand-ink"}`}>
            {title}
          </h3>
          {badge != null && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
              {badge}
            </span>
          )}
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            className={`text-[11px] font-semibold whitespace-nowrap px-2.5 py-1 rounded-md border bg-white hover:bg-neutral-50 transition ${
              cta.color === "amber"   ? "border-amber-300 text-amber-800"   :
              cta.color === "indigo"  ? "border-indigo-300 text-indigo-800" :
              cta.color === "red"     ? "border-red-300 text-red-800"       :
              "border-neutral-300 text-neutral-700"
            }`}
          >
            {cta.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function StatoBadge({ stato, compact = false }) {
  const cfg = STATO_PRANZO[stato] || { label: stato || "—", cls: "bg-neutral-100 text-neutral-600 border-neutral-300", emoji: "" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
      {!compact && cfg.emoji} {cfg.label}
    </span>
  );
}

function QuickAction({ emoji, label, onClick, bg, border, text }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] border ${bg} ${border} ${text} hover:brightness-95 transition active:scale-[.97] min-h-[44px]`}
    >
      <span className="text-xl leading-none">{emoji}</span>
      <span className="text-xs font-semibold text-left">{label}</span>
    </button>
  );
}
