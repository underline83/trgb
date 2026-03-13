// @version: v1.0-ricette-settings
// Strumenti Ricette — Export JSON, Export PDF, Import JSON
// Visibile solo per admin
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;

// ===============================================================
// SEZIONE COLLASSABILE
// ===============================================================
function Section({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-neutral-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 hover:bg-neutral-100 transition text-left">
        <h2 className="text-lg font-semibold text-amber-900 font-playfair">
          {icon} {title}
        </h2>
        <span className="text-neutral-400 text-lg">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-6 py-5 border-t border-neutral-200">{children}</div>}
    </div>
  );
}

export default function RicetteSettings() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAllowed = role === "admin";

  const [ricette, setRicette] = useState([]);
  const [loadingRicette, setLoadingRicette] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState("");

  // Carica lista ricette per PDF singolo
  useEffect(() => {
    (async () => {
      setLoadingRicette(true);
      try {
        const r = await apiFetch(`${FC}/ricette`);
        if (r.ok) setRicette(await r.json());
      } catch {}
      setLoadingRicette(false);
    })();
  }, []);

  // Export JSON
  const handleExportJson = () => {
    const token = localStorage.getItem("token");
    window.open(`${FC}/ricette/export/json?token=${token}`, "_blank");
    setExportMsg("Export JSON avviato — controlla i download.");
    setTimeout(() => setExportMsg(""), 4000);
  };

  // Export PDF singola ricetta
  const handleExportPdf = (id) => {
    const token = localStorage.getItem("token");
    window.open(`${FC}/ricette/${id}/pdf?token=${token}`, "_blank");
  };

  // Import JSON
  const handleImportJson = async (file) => {
    if (!file) return;
    setImportLoading(true);
    setError("");
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.ricette || !Array.isArray(data.ricette)) {
        throw new Error("Il file JSON non contiene un array 'ricette' valido.");
      }

      let importate = 0;
      let errori = [];

      for (const ricetta of data.ricette) {
        try {
          // Per ogni ricetta, dobbiamo risolvere ingredient_id e sub_recipe_id dai nomi
          // Per ora, creiamo solo le ricette senza items (da completare manualmente)
          const payload = {
            name: ricetta.name,
            is_base: ricetta.is_base || false,
            yield_qty: ricetta.yield_qty || 1,
            yield_unit: ricetta.yield_unit || "pz",
            selling_price: ricetta.selling_price || null,
            prep_time: ricetta.prep_time || null,
            note: ricetta.note || null,
            items: [],
          };

          // Se la categoria esiste, cerchiamo di associarla
          if (ricetta.category) {
            try {
              const catResp = await apiFetch(`${FC}/ricette/categorie`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: ricetta.category }),
              });
              if (catResp.ok) {
                const cat = await catResp.json();
                payload.category_id = cat.id;
              }
            } catch {}
          }

          const resp = await apiFetch(`${FC}/ricette`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (resp.ok) {
            importate++;
          } else {
            const errText = await resp.text().catch(() => "");
            errori.push(`${ricetta.name}: ${errText || resp.status}`);
          }
        } catch (e) {
          errori.push(`${ricetta.name}: ${e.message}`);
        }
      }

      setImportResult({
        totale: data.ricette.length,
        importate,
        errori,
      });
    } catch (e) {
      setError(e.message || "Errore durante l'import JSON.");
    } finally {
      setImportLoading(false);
    }
  };

  // Access check
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per gli amministratori.
          </p>
          <button onClick={() => navigate("/ricette")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Menu Ricette
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <RicetteNav current="settings" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
            Strumenti Ricette
          </h1>
          <p className="text-neutral-600">
            Export, import, generazione PDF e strumenti di manutenzione.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        )}

        {exportMsg && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{exportMsg}</div>
        )}

        {/* ============================================= */}
        {/* SEZIONE 1: EXPORT JSON */}
        {/* ============================================= */}
        <Section title="Export ricette (JSON)" icon="📤" defaultOpen={true}>
          <p className="text-sm text-neutral-600 mb-4">
            Esporta tutte le ricette attive con i loro ingredienti in formato JSON.
            Utile per backup o per trasferire le ricette ad un'altra installazione.
          </p>
          <button onClick={handleExportJson}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
            Scarica JSON completo
          </button>
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 2: EXPORT PDF SINGOLA */}
        {/* ============================================= */}
        <Section title="Schede ricetta (PDF)" icon="📄">
          <p className="text-sm text-neutral-600 mb-4">
            Genera la scheda PDF di una singola ricetta con food cost, composizione e note.
          </p>
          {loadingRicette ? (
            <p className="text-sm text-neutral-400">Caricamento ricette...</p>
          ) : ricette.length === 0 ? (
            <p className="text-sm text-neutral-400">Nessuna ricetta trovata.</p>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-600 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left font-medium">Ricetta</th>
                    <th className="p-2.5 text-left font-medium">Categoria</th>
                    <th className="p-2.5 text-center font-medium">FC %</th>
                    <th className="p-2.5 text-right font-medium">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {ricette.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-100 hover:bg-amber-50/40 transition">
                      <td className="p-2.5 font-medium text-neutral-900">
                        {r.is_base && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1.5">Base</span>}
                        {r.name}
                      </td>
                      <td className="p-2.5 text-neutral-600">{r.category_name || "—"}</td>
                      <td className="p-2.5 text-center">
                        {r.food_cost_pct != null ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            r.food_cost_pct > 45 ? "bg-red-100 text-red-800 border-red-300"
                              : r.food_cost_pct > 35 ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : "bg-green-100 text-green-800 border-green-300"
                          }`}>
                            {r.food_cost_pct.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-2.5 text-right">
                        <button onClick={() => handleExportPdf(r.id)}
                          className="px-3 py-1 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition">
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 3: IMPORT JSON */}
        {/* ============================================= */}
        <Section title="Import ricette (JSON)" icon="📥">
          <p className="text-sm text-neutral-600 mb-4">
            Importa ricette da un file JSON (stesso formato dell'export).
            Le ricette vengono create come nuove — gli ingredienti devono già esistere nel sistema.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${
              importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
              {importLoading ? "Importazione..." : "Seleziona file JSON"}
              <input type="file" accept=".json" className="hidden"
                onChange={(e) => handleImportJson(e.target.files?.[0])} disabled={importLoading} />
            </label>
          </div>
          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">Import completato</p>
              <p className="text-green-700">
                Totale nel file: <strong>{importResult.totale}</strong> — Importate: <strong>{importResult.importate}</strong>
              </p>
              {importResult.errori.length > 0 && (
                <details className="mt-2">
                  <summary className="font-semibold text-red-700 cursor-pointer">Errori ({importResult.errori.length})</summary>
                  <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                    {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Section>

        {/* INFO */}
        <div className="text-xs text-neutral-500 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
          <p className="font-semibold mb-1">Note:</p>
          <p>L'export JSON include tutte le ricette attive con i nomi degli ingredienti.</p>
          <p>L'import crea le ricette come nuove entry. Per aggiornare ricette esistenti, modificale singolarmente.</p>
          <p>Il PDF viene generato dal server con i dati aggiornati al momento della richiesta.</p>
        </div>

      </div>
    </div>
  );
}
