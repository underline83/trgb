// @version: v1.1-import-ricette — incolla JSON come testo (oltre al file)
// Modulo: ricette
// Importazione ricette da file JSON.
// Flusso: scarica tracciato → carica file → analisi → conferma (match
// ingredienti / sotto-ricette o creazione placeholder) → import.
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const UNITA = ["kg", "g", "L", "ml", "cl", "pz", "n"];

export default function RicetteImport() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState("upload"); // upload | review | done
  const [fileName, setFileName] = useState("");
  const [recipesPayload, setRecipesPayload] = useState(null); // { ricette: [...] }
  const [analysis, setAnalysis] = useState(null);
  const [ingResol, setIngResol] = useState({}); // key -> { nome, azione, ingredient_id, unita, categoria }
  const [subResol, setSubResol] = useState({}); // key -> { nome, azione, recipe_id }
  const [allIngredients, setAllIngredients] = useState([]);
  const [allRecipes, setAllRecipes] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSpec, setShowSpec] = useState(false);
  const [pasteText, setPasteText] = useState(""); // JSON incollato a mano

  // ─── Scarica il tracciato JSON ───────────────────────────────
  const handleDownloadTemplate = async () => {
    setError("");
    try {
      const resp = await apiFetch(`${FC}/ricette/import/tracciato`);
      if (!resp.ok) throw new Error("Recupero tracciato fallito");
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tracciato_ricette_trgb.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  // ─── Normalizza il contenuto del file ────────────────────────
  const normalizePayload = (raw) => {
    if (Array.isArray(raw)) return { ricette: raw };
    if (raw && Array.isArray(raw.ricette)) return { ricette: raw.ricette };
    if (raw && typeof raw === "object" && (raw.nome || raw.voci)) return { ricette: [raw] };
    return null;
  };

  // ─── Analizza una stringa JSON (da file o incollata) ─────────
  const startFromText = async (text, sourceLabel) => {
    setError("");
    setResult(null);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      setError("Il JSON non è valido. Controlla di aver incollato il testo completo.");
      return;
    }
    const payload = normalizePayload(raw);
    if (!payload || !payload.ricette.length) {
      setError("Nessuna ricetta riconoscibile. Scarica il tracciato per il formato corretto.");
      return;
    }
    payload.ricette = payload.ricette.filter((r) => r && typeof r === "object");
    setRecipesPayload(payload);
    setFileName(sourceLabel);
    await analyze(payload);
  };

  // ─── Carica e analizza il file ───────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await startFromText(await file.text(), file.name);
  };

  // ─── Analizza il JSON incollato a mano ───────────────────────
  const handlePaste = async () => {
    if (!pasteText.trim()) {
      setError("Incolla prima il JSON delle ricette.");
      return;
    }
    await startFromText(pasteText, "(JSON incollato)");
  };

  const analyze = async (payload) => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/ricette/import/analizza`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const a = await resp.json();
      setAnalysis(a);

      // Pre-imposta le risoluzioni ingredienti
      const ir = {};
      for (const ing of a.ingredienti) {
        const key = ing.nome.toLowerCase();
        if (ing.stato === "trovato") {
          ir[key] = { nome: ing.nome, azione: "usa", ingredient_id: ing.ingredient_id };
        } else if (ing.stato === "da_confermare" && ing.candidati.length) {
          ir[key] = { nome: ing.nome, azione: "usa", ingredient_id: ing.candidati[0].id };
        } else {
          ir[key] = {
            nome: ing.nome, azione: "placeholder", ingredient_id: null,
            unita: ing.unita_suggerita || "kg", categoria: "",
          };
        }
      }
      setIngResol(ir);

      // Pre-imposta le risoluzioni sotto-ricette
      const sr = {};
      for (const s of a.sotto_ricette) {
        const key = s.nome.toLowerCase();
        if (s.stato === "trovata") sr[key] = { nome: s.nome, azione: "usa", recipe_id: s.recipe_id };
        else if (s.stato === "nel_file") sr[key] = { nome: s.nome, azione: "nel_file", recipe_id: null };
        else sr[key] = {
          nome: s.nome,
          azione: s.candidati.length ? "usa" : "salta",
          recipe_id: s.candidati.length ? s.candidati[0].id : null,
        };
      }
      setSubResol(sr);

      loadPickers();
      setStep("review");
    } catch (e) {
      setError(`Errore analisi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPickers = async () => {
    try {
      const [ri, rr] = await Promise.all([
        apiFetch(`${FC}/ingredients/`),
        apiFetch(`${FC}/ricette`),
      ]);
      if (ri.ok) setAllIngredients(await ri.json());
      if (rr.ok) setAllRecipes(await rr.json());
    } catch {
      /* non bloccante: l'override manuale userà solo i candidati */
    }
  };

  // ─── Conferma import ─────────────────────────────────────────
  const handleImport = async () => {
    setLoading(true);
    setError("");
    try {
      const body = {
        ricette: recipesPayload.ricette,
        ingredienti: Object.values(ingResol).map((r) => ({
          nome: r.nome,
          azione: r.azione,
          ingredient_id: r.ingredient_id || null,
          unita: r.unita || null,
          categoria: r.categoria || null,
        })),
        sotto_ricette: Object.values(subResol).map((r) => ({
          nome: r.nome,
          azione: r.azione,
          recipe_id: r.recipe_id || null,
        })),
      };
      const resp = await apiFetch(`${FC}/ricette/import/conferma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setResult(await resp.json());
      setStep("done");
    } catch (e) {
      setError(`Errore import: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setRecipesPayload(null);
    setAnalysis(null);
    setIngResol({});
    setSubResol({});
    setResult(null);
    setError("");
    setPasteText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ─── Update helpers ──────────────────────────────────────────
  const setIng = (key, patch) =>
    setIngResol((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const setSub = (key, patch) =>
    setSubResol((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const placeholderCount = Object.values(ingResol).filter((r) => r.azione === "placeholder").length;
  const skipSubCount = Object.values(subResol).filter((r) => r.azione === "salta").length;

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="archivio" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-orange-900 font-playfair mb-1">
              Importa ricette
            </h1>
            <p className="text-neutral-600 text-sm">
              Carica un file JSON di ricette. Gli ingredienti vengono abbinati a quelli
              in archivio, oppure creati come placeholder da completare.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/archivio")}>
              ← Archivio
            </Btn>
            <Btn variant="chip" tone="blue" size="md" onClick={handleDownloadTemplate}>
              ⬇ Scarica tracciato JSON
            </Btn>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* SPEC collassabile */}
        <div className="mb-6 border border-neutral-200 rounded-xl">
          <button
            onClick={() => setShowSpec((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <span>{showSpec ? "▾" : "▸"}</span>
            Com'è fatto il file JSON
          </button>
          {showSpec && (
            <div className="px-4 pb-4 text-sm text-neutral-600 space-y-2">
              <p>
                Il file contiene una lista <code className="bg-neutral-100 px-1 rounded">ricette</code>.
                Ogni ricetta ha un <strong>nome</strong> e una lista di <strong>voci</strong>.
              </p>
              <p>
                Ogni voce è <strong>un ingrediente</strong> (campo <code className="bg-neutral-100 px-1 rounded">ingrediente</code>)
                oppure <strong>una sotto-ricetta</strong> (campo <code className="bg-neutral-100 px-1 rounded">sotto_ricetta</code>),
                con <code className="bg-neutral-100 px-1 rounded">quantita</code> e <code className="bg-neutral-100 px-1 rounded">unita</code>.
              </p>
              <p>
                Ingredienti e sotto-ricette si indicano <strong>per nome</strong>: non servono ID né
                codici. Scarica il tracciato qui sopra per avere il modello completo con due esempi —
                puoi passarlo a un assistente AI e chiedergli di comporre le ricette secondo quel formato.
              </p>
            </div>
          )}
        </div>

        {/* ═══ STEP UPLOAD ═══ */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Incolla il JSON */}
            <div className="border border-neutral-300 rounded-2xl p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-2">
                Incolla il JSON
              </h2>
              <p className="text-xs text-neutral-500 mb-3">
                Incolla qui il JSON delle ricette (es. quello prodotto da un assistente AI).
                Non serve salvarlo come file.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={'{\n  "ricette": [ ... ]\n}'}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <div className="mt-3">
                <Btn variant="primary" size="lg" onClick={handlePaste} loading={loading}>
                  {loading ? "Analisi in corso..." : "Analizza JSON"}
                </Btn>
              </div>
            </div>

            {/* oppure da file */}
            <div className="text-center text-xs text-neutral-400">— oppure —</div>
            <div className="text-center border-2 border-dashed border-neutral-300 rounded-2xl py-6">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFile}
                className="hidden"
              />
              <Btn variant="secondary" size="md" onClick={() => fileRef.current?.click()} loading={loading}>
                Carica un file .json
              </Btn>
              {fileName && !loading && (
                <p className="text-xs text-neutral-400 mt-2">{fileName}</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP REVIEW ═══ */}
        {step === "review" && analysis && (
          <div className="space-y-6">
            {/* Riepilogo */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <strong>{analysis.totali.ricette}</strong> ricette nel file ·{" "}
              <strong>{analysis.totali.ingredienti_totali}</strong> ingredienti referenziati
              {" "}({analysis.totali.ingredienti_trovati} già in archivio,{" "}
              {analysis.totali.ingredienti_da_confermare + analysis.totali.ingredienti_nuovi} da risolvere)
              {analysis.totali.ricette_con_errori > 0 && (
                <span className="text-amber-800">
                  {" "}· {analysis.totali.ricette_con_errori} ricette con avvisi
                </span>
              )}
            </div>

            {/* Ricette */}
            <section>
              <h2 className="text-lg font-bold text-orange-900 mb-2">Ricette</h2>
              <div className="space-y-2">
                {analysis.ricette.map((r) => (
                  <div key={r.indice} className="rounded-xl border border-neutral-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-neutral-900">{r.nome || "(senza nome)"}</span>
                      {r.categoria && (
                        <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                          {r.categoria}
                        </span>
                      )}
                      {r.tipo === "base" && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          base
                        </span>
                      )}
                      <span className="text-xs text-neutral-400">{r.n_voci} voci</span>
                    </div>
                    {r.errori.length > 0 && (
                      <ul className="mt-1 text-xs text-amber-700 list-disc pl-5">
                        {r.errori.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Ingredienti */}
            <section>
              <h2 className="text-lg font-bold text-orange-900 mb-2">
                Ingredienti
                {placeholderCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    {placeholderCount} verranno creati come placeholder
                  </span>
                )}
              </h2>
              <div className="space-y-2">
                {analysis.ingredienti.map((ing) => {
                  const key = ing.nome.toLowerCase();
                  const res = ingResol[key] || {};
                  const selectValue = res.azione === "placeholder" ? "placeholder" : String(res.ingredient_id || "");
                  return (
                    <div key={key} className="rounded-xl border border-neutral-200 p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <span className="font-medium text-sm text-neutral-900">{ing.nome}</span>
                          <span className="text-xs text-neutral-400 ml-2">
                            {ing.occorrenze}× nelle ricette
                          </span>
                        </div>

                        {ing.stato === "trovato" ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-lg">
                            ✓ Già in archivio: {ing.ingredient_nome}
                          </span>
                        ) : (
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "placeholder") {
                                setIng(key, { azione: "placeholder", ingredient_id: null });
                              } else {
                                setIng(key, { azione: "usa", ingredient_id: Number(v) });
                              }
                            }}
                            className="text-sm border border-neutral-300 rounded-lg px-2 py-1.5 bg-white min-w-[220px] focus:ring-orange-500 focus:border-orange-500"
                          >
                            <option value="placeholder">➕ Crea nuovo (placeholder)</option>
                            {ing.candidati.length > 0 && (
                              <optgroup label="Suggeriti">
                                {ing.candidati.map((c) => (
                                  <option key={`c${c.id}`} value={c.id}>
                                    {c.nome} ({c.score}%)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {allIngredients.length > 0 && (
                              <optgroup label="Tutti gli ingredienti">
                                {allIngredients.map((a) => (
                                  <option key={`a${a.id}`} value={a.id}>{a.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        )}
                      </div>

                      {/* Campi placeholder */}
                      {ing.stato !== "trovato" && res.azione === "placeholder" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                          <span>Unità base:</span>
                          <select
                            value={res.unita || "kg"}
                            onChange={(e) => setIng(key, { unita: e.target.value })}
                            className="border border-neutral-300 rounded-lg px-2 py-1 bg-white"
                          >
                            {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <input
                            type="text"
                            value={res.categoria || ""}
                            onChange={(e) => setIng(key, { categoria: e.target.value })}
                            placeholder="Categoria (opzionale)"
                            className="border border-neutral-300 rounded-lg px-2 py-1 bg-white flex-1 min-w-[140px]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Sotto-ricette */}
            {analysis.sotto_ricette.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-orange-900 mb-2">Sotto-ricette</h2>
                <div className="space-y-2">
                  {analysis.sotto_ricette.map((s) => {
                    const key = s.nome.toLowerCase();
                    const res = subResol[key] || {};
                    const selectValue =
                      res.azione === "salta" ? "salta" : String(res.recipe_id || "");
                    return (
                      <div key={key} className="rounded-xl border border-neutral-200 p-3 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <span className="font-medium text-sm text-neutral-900">{s.nome}</span>
                          <span className="text-xs text-neutral-400 ml-2">{s.occorrenze}×</span>
                        </div>
                        {s.stato === "trovata" ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-lg">
                            ✓ Già in archivio
                          </span>
                        ) : s.stato === "nel_file" ? (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-lg">
                            ✓ Creata da questo file
                          </span>
                        ) : (
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "salta") setSub(key, { azione: "salta", recipe_id: null });
                              else setSub(key, { azione: "usa", recipe_id: Number(v) });
                            }}
                            className="text-sm border border-neutral-300 rounded-lg px-2 py-1.5 bg-white min-w-[220px] focus:ring-orange-500 focus:border-orange-500"
                          >
                            <option value="salta">⊘ Salta questa voce</option>
                            {s.candidati.length > 0 && (
                              <optgroup label="Suggerite">
                                {s.candidati.map((c) => (
                                  <option key={`c${c.id}`} value={c.id}>
                                    {c.nome} ({c.score}%)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {allRecipes.length > 0 && (
                              <optgroup label="Tutte le ricette">
                                {allRecipes.map((a) => (
                                  <option key={`a${a.id}`} value={a.id}>{a.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Azioni */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
              <Btn variant="ghost" size="md" onClick={reset}>
                Annulla
              </Btn>
              <div className="flex items-center gap-3">
                {skipSubCount > 0 && (
                  <span className="text-xs text-amber-700">
                    {skipSubCount} sotto-ricette verranno saltate
                  </span>
                )}
                <Btn variant="success" size="lg" onClick={handleImport} loading={loading}>
                  {loading ? "Import in corso..." : `Importa ${analysis.totali.ricette} ricette`}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP DONE ═══ */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-4 text-sm text-green-900">
              <div className="text-lg font-semibold mb-1">Import completato</div>
              <strong>{result.ricette_create}</strong> ricette create ·{" "}
              <strong>{result.ingredienti_placeholder}</strong> ingredienti placeholder ·{" "}
              <strong>{result.voci_inserite}</strong> voci inserite
              {result.voci_saltate > 0 && ` · ${result.voci_saltate} voci saltate`}
            </div>

            {result.warnings?.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold mb-1">Avvisi ({result.warnings.length})</div>
                <ul className="list-disc pl-5 text-xs space-y-0.5">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {result.ingredienti_placeholder > 0 && (
              <p className="text-sm text-neutral-600">
                Gli ingredienti placeholder sono segnati come "da completare":
                trovali nella pagina Ingredienti per assegnare categoria e prezzi.
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Btn variant="primary" size="md" onClick={() => navigate("/ricette/archivio")}>
                Vai all'archivio ricette
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/ingredienti")}>
                Vai agli ingredienti
              </Btn>
              <Btn variant="ghost" size="md" onClick={reset}>
                Importa un altro file
              </Btn>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
