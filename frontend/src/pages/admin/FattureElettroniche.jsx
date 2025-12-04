// @version: v1.0
// Dashboard Fatture Elettroniche — TRGB

import React, { useEffect, useState } from "react";
import { API_BASE } from "../../config/api";

function FattureElettroniche() {
  const [fatture, setFatture] = useState([]);
  const [selectedFattura, setSelectedFattura] = useState(null);
  const [righe, setRighe] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [error, setError] = useState(null);

  const loadFatture = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/contabilita/fe/fatture`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Errore nel caricamento fatture (${res.status})`);
      }
      const data = await res.json();
      setFatture(data);
    } catch (err) {
      setError(err.message || "Errore generico nel caricamento");
    } finally {
      setIsLoading(false);
    }
  };

  const loadDettaglioFattura = async (fatturaId) => {
    setSelectedFattura(null);
    setRighe([]);
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/contabilita/fe/fatture/${fatturaId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Errore nel caricamento dettaglio (${res.status})`);
      }
      const data = await res.json();
      setSelectedFattura(data);
      setRighe(data.righe || []);
    } catch (err) {
      setError(err.message || "Errore nel caricamento dettaglio");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadMessage(null);
    setError(null);
    setIsLoading(true);

    const formData = new FormData();
    // supporta anche più file: stesso campo 'files'
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const res = await fetch(`${API_BASE}/contabilita/fe/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Errore durante import XML (${res.status}): ${errText || "N/A"}`
        );
      }

      const data = await res.json();
      const importedCount = data.importate?.length || 0;
      const skippedCount = data.gia_presenti?.length || 0;

      setUploadMessage(
        `Import completato. Nuove fatture: ${importedCount}, già presenti: ${skippedCount}.`
      );

      // ricarica elenco
      await loadFatture();
    } catch (err) {
      setError(err.message || "Errore durante l'importazione");
    } finally {
      setIsLoading(false);
      event.target.value = ""; // reset input file
    }
  };

  useEffect(() => {
    loadFatture();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">
        Fatture Elettroniche (XML) — Acquisti
      </h1>

      {/* Upload XML */}
      <div className="border rounded-lg p-4 space-y-2 bg-slate-900/30">
        <h2 className="font-semibold">Importa fatture XML</h2>
        <p className="text-sm text-neutral-400">
          Carica una o più fatture elettroniche in formato <code>.xml</code>. I
          duplicati verranno riconosciuti automaticamente tramite hash.
        </p>
        <input
          type="file"
          accept=".xml"
          multiple
          onChange={handleUpload}
          className="mt-2"
        />
        {uploadMessage && (
          <p className="text-sm text-emerald-400 mt-1">{uploadMessage}</p>
        )}
      </div>

      {error && (
        <div className="border border-red-500 text-red-300 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Lista fatture + dettaglio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lista fatture */}
        <div className="border rounded-lg p-4 bg-slate-900/40">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Fatture importate</h2>
            {isLoading && (
              <span className="text-xs text-neutral-400">Caricamento…</span>
            )}
          </div>

          {fatture.length === 0 ? (
            <p className="text-sm text-neutral-400">
              Nessuna fattura importata.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700 text-neutral-400">
                <tr>
                  <th className="text-left py-1">Data</th>
                  <th className="text-left py-1">Fornitore</th>
                  <th className="text-right py-1">Totale</th>
                  <th className="text-right py-1">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {fatture.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-b border-slate-800 hover:bg-slate-800/40 ${
                      selectedFattura?.id === f.id ? "bg-slate-800/60" : ""
                    }`}
                  >
                    <td className="py-1 pr-2">
                      {f.data_fattura || "-"}
                    </td>
                    <td className="py-1 pr-2">
                      <div className="font-medium truncate max-w-[180px]">
                        {f.fornitore_nome}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {f.numero_fattura || f.xml_filename}
                      </div>
                    </td>
                    <td className="py-1 text-right">
                      {f.totale_fattura != null
                        ? f.totale_fattura.toLocaleString("it-IT", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "-"}
                    </td>
                    <td className="py-1 text-right">
                      <button
                        className="text-xs px-2 py-1 border rounded border-slate-600 hover:bg-slate-700"
                        onClick={() => loadDettaglioFattura(f.id)}
                      >
                        Dettaglio
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Dettaglio fattura selezionata */}
        <div className="border rounded-lg p-4 bg-slate-900/40">
          <h2 className="font-semibold mb-2">Dettaglio fattura</h2>

          {!selectedFattura ? (
            <p className="text-sm text-neutral-400">
              Seleziona una fattura per vedere le righe.
            </p>
          ) : (
            <>
              <div className="text-sm mb-3 space-y-1">
                <div>
                  <span className="font-medium">Fornitore:</span>{" "}
                  {selectedFattura.fornitore_nome}
                </div>
                {selectedFattura.fornitore_piva && (
                  <div>
                    <span className="font-medium">P.IVA:</span>{" "}
                    {selectedFattura.fornitore_piva}
                  </div>
                )}
                <div>
                  <span className="font-medium">Data:</span>{" "}
                  {selectedFattura.data_fattura || "-"}
                </div>
                <div>
                  <span className="font-medium">Numero fattura:</span>{" "}
                  {selectedFattura.numero_fattura || "-"}
                </div>
                <div>
                  <span className="font-medium">Totale:</span>{" "}
                  {selectedFattura.totale_fattura != null
                    ? selectedFattura.totale_fattura.toLocaleString("it-IT", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "-"}{" "}
                  {selectedFattura.valuta}
                </div>
              </div>

              <div className="max-h-80 overflow-auto border-t border-slate-700 pt-2">
                {righe.length === 0 ? (
                  <p className="text-sm text-neutral-400">
                    Nessuna riga trovata per questa fattura.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-neutral-400">
                      <tr>
                        <th className="text-left py-1">#</th>
                        <th className="text-left py-1">Descrizione</th>
                        <th className="text-right py-1">Q.tà</th>
                        <th className="text-left py-1">U.M.</th>
                        <th className="text-right py-1">Pz. unit.</th>
                        <th className="text-right py-1">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-slate-800 align-top"
                        >
                          <td className="py-1 pr-1">{r.numero_linea}</td>
                          <td className="py-1 pr-2">
                            <div className="whitespace-pre-wrap">
                              {r.descrizione}
                            </div>
                          </td>
                          <td className="py-1 text-right">
                            {r.quantita != null ? r.quantita : "-"}
                          </td>
                          <td className="py-1">{r.unita_misura || ""}</td>
                          <td className="py-1 text-right">
                            {r.prezzo_unitario != null
                              ? r.prezzo_unitario.toLocaleString("it-IT", {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })
                              : "-"}
                          </td>
                          <td className="py-1 text-right">
                            {r.prezzo_totale != null
                              ? r.prezzo_totale.toLocaleString("it-IT", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FattureElettroniche;
