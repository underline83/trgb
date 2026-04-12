// @version: v1.5-with-nav
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

export default function FattureImport() {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const [fatture, setFatture] = useState([]);
  const [fattureLoading, setFattureLoading] = useState(false);
  const [fattureError, setFattureError] = useState(null);

  const [selectedFattura, setSelectedFattura] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const [resetting, setResetting] = useState(false);

  // -----------------------------------
  // FETCH FATTURE LISTA
  // -----------------------------------
  const fetchFatture = async () => {
    setFattureLoading(true);
    setFattureError(null);
    try {
      const res = await apiFetch(`${API_BASE}/contabilita/fe/fatture`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel caricamento delle fatture.");
      }

      const data = await res.json();
      // Backend now returns {fatture, total, totale_importo}
      setFatture(data.fatture || data || []);
    } catch (e) {
      setFattureError(e.message);
    } finally {
      setFattureLoading(false);
    }
  };

  // carica le fatture alla prima apertura pagina
  React.useEffect(() => {
    fetchFatture();
  }, []);

  // -----------------------------------
  // GESTIONE FILE (selezione standard)
  // -----------------------------------
  const handleFileChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    const validFiles = fileList.filter((f) => {
      const lower = f.name?.toLowerCase() || "";
      return lower.endsWith(".xml") || lower.endsWith(".zip");
    });
    setFiles(validFiles);
    setUploadResult(null);
    setUploadError(null);
  };

  // -----------------------------------
  // GESTIONE DRAG & DROP
  // -----------------------------------
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setUploadResult(null);
    setUploadError(null);

    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (!droppedFiles.length) return;

    const validFiles = droppedFiles.filter((f) => {
      const lower = f.name?.toLowerCase() || "";
      return lower.endsWith(".xml") || lower.endsWith(".zip");
    });

    if (!validFiles.length) {
      setUploadError("I file trascinati non contengono XML o ZIP di fattura.");
      return;
    }

    setFiles(validFiles);
  };

  // -----------------------------------
  // IMPORT XML
  // -----------------------------------
  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setUploadError("Seleziona o trascina almeno un file XML o ZIP di fattura.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const res = await apiFetch(`${API_BASE}/contabilita/fe/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore durante l'importazione XML.");
      }

      const data = await res.json();
      setUploadResult(data);

      // aggiorna lista dopo l'import
      await fetchFatture();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  // -----------------------------------
  // DETTAGLIO FATTURA
  // -----------------------------------
  const handleSelectFattura = async (fatturaId) => {
    setSelectedFattura(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const res = await apiFetch(
        `${API_BASE}/contabilita/fe/fatture/${fatturaId}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel caricamento del dettaglio.");
      }

      const data = await res.json();
      setSelectedFattura(data);
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // -----------------------------------
  // RESET DB FATTURE
  // -----------------------------------
  const handleReset = async () => {
    if (!window.confirm("Sei sicuro? Verranno eliminate TUTTE le fatture importate. Questa azione non è reversibile.")) return;
    setResetting(true);
    try {
      const res = await apiFetch(`${API_BASE}/contabilita/fe/fatture`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore durante il reset.");
      }
      setFatture([]);
      setSelectedFattura(null);
      setUploadResult(null);
      setFiles([]);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setResetting(false);
    }
  };

  // -----------------------------------
  // RENDER
  // -----------------------------------
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <FattureNav current="import" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-teal-900 tracking-wide font-playfair mb-1">
            Import Fatture Elettroniche (XML)
          </h1>
          <p className="text-neutral-500 text-sm">
            Carica file XML o archivi ZIP. I duplicati vengono scartati automaticamente.
          </p>
        </div>

        {/* GRID CONTENUTO PRINCIPALE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* COLONNA SINISTRA: IMPORT XML */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold font-playfair text-teal-900 mb-2">
                Zona import massivo XML
              </h2>
              <p className="text-sm text-neutral-600 mb-3">
                Trascina qui file XML o archivi ZIP (anche con sottocartelle).
                Puoi importare centinaia di fatture in una volta sola. I
                duplicati vengono automaticamente scartati.
              </p>

              {/* DROPZONE */}
              <div
                className={`border-2 rounded-2xl px-4 py-6 text-center cursor-pointer transition
                  ${
                    isDragging
                      ? "border-teal-500 bg-teal-50"
                      : "border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Trascina qui file XML o ZIP di fatture
                </label>
                <p className="text-xs text-neutral-500 mb-3">
                  Oppure clicca sul pulsante qui sotto per scegliere i file.
                  Gli archivi ZIP con sottocartelle mensili sono supportati.
                </p>

                <input
                  type="file"
                  accept=".xml,.zip"
                  multiple
                  onClick={(e) => {
                    e.target.value = null;
                  }}
                  onChange={handleFileChange}
                  className="block w-full text-sm text-neutral-700
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-xl file:border-0
                             file:text-sm file:font-medium
                             file:bg-teal-50 file:text-teal-900
                             hover:file:bg-teal-100"
                />

                {files && files.length > 0 && (
                  <p className="text-xs text-neutral-600 mt-3">
                    File XML selezionati:{" "}
                    <strong>
                      {files.length === 1
                        ? files[0].name
                        : `${files.length} file`}
                    </strong>
                  </p>
                )}
              </div>

              <p className="text-xs text-neutral-500 mt-2">
                Formati accettati: file XML FatturaPA ({" "}
                <span className="font-mono">ITxxxxxxxxxxxx_*.xml</span>) oppure
                archivi ZIP contenenti XML (anche organizzati in sottocartelle).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading || !files || files.length === 0}
                onClick={handleUpload}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow
                  ${
                    uploading || !files || files.length === 0
                      ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                      : "bg-teal-600 text-white hover:bg-teal-700 transition"
                  }`}
              >
                {uploading
                  ? "Import in corso..."
                  : "Importa fatture elettroniche"}
              </button>

              {files && files.length > 0 && !uploading && (
                <span className="text-xs text-neutral-500">
                  Pronti all&apos;import:{" "}
                  <strong>
                    {files.length === 1
                      ? files[0].name
                      : `${files.length} file`}
                  </strong>
                </span>
              )}
            </div>

            {/* MESSAGGI IMPORT */}
            {uploadError && (
              <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Errore durante l&apos;import: {uploadError}
              </div>
            )}

            {uploadResult && (
              <div className="mt-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <p className="font-semibold mb-1">Import completato</p>
                <p className="mb-1">
                  Nuove fatture importate:{" "}
                  <strong>{uploadResult.importate?.length || 0}</strong>
                </p>
                {uploadResult.gia_presenti &&
                  uploadResult.gia_presenti.length > 0 && (
                    <p className="text-xs mt-1">
                      Fatture già presenti (saltate):{" "}
                      <strong>{uploadResult.gia_presenti.length}</strong>
                    </p>
                  )}
                {uploadResult.errori &&
                  uploadResult.errori.length > 0 && (
                    <div className="mt-2 text-xs text-red-700">
                      <p className="font-semibold">File con errori ({uploadResult.errori.length}):</p>
                      <ul className="list-disc list-inside mt-1">
                        {uploadResult.errori.map((e, i) => (
                          <li key={i}>{e.filename}: {e.errore}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* COLONNA DESTRA: LISTA + DETTAGLIO */}
          <div className="space-y-4">
            {/* LISTA FATTURE */}
            <div>
              <h2 className="text-xl font-semibold font-playfair text-teal-900 mb-2">
                Elenco fatture importate
              </h2>

              {fattureLoading && (
                <p className="text-sm text-neutral-500">
                  Caricamento fatture in corso…
                </p>
              )}

              {fattureError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-2">
                  Errore nel caricamento delle fatture: {fattureError}
                </div>
              )}

              {!fattureLoading && !fattureError && fatture.length === 0 && (
                <p className="text-sm text-neutral-500">
                  Nessuna fattura importata al momento.
                </p>
              )}

              {fatture.length > 0 && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm max-h-72 overflow-y-auto">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Fornitore</th>
                        <th className="px-3 py-2 text-left">Numero</th>
                        <th className="px-3 py-2 text-right">Totale</th>
                        <th className="px-3 py-2 text-center">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fatture.map((f) => (
                        <tr
                          key={f.id}
                          className="border-t border-neutral-200 hover:bg-neutral-50"
                        >
                          <td className="px-3 py-2 align-middle">
                            {f.data_fattura || "-"}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <span className="font-medium">
                              {f.fornitore_nome}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {f.numero_fattura || "-"}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {f.totale_fattura != null
                              ? f.totale_fattura.toLocaleString("it-IT", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => handleSelectFattura(f.id)}
                              className="px-3 py-1 rounded-full text-xs font-medium border border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100 transition"
                            >
                              Dettaglio
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* DETTAGLIO FATTURA */}
            <div className="mt-4">
              <h3 className="text-lg font-semibold font-playfair text-teal-900 mb-2">
                Dettaglio fattura selezionata
              </h3>

              {detailLoading && (
                <p className="text-sm text-neutral-500">
                  Caricamento dettaglio…
                </p>
              )}

              {detailError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-2">
                  Errore nel caricamento del dettaglio: {detailError}
                </div>
              )}

              {!detailLoading && !selectedFattura && !detailError && (
                <p className="text-sm text-neutral-500">
                  Seleziona una fattura dalla lista per vedere i dettagli.
                </p>
              )}

              {selectedFattura && !detailLoading && (
                <div className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                    <div>
                      <p className="text-xs text-neutral-500">Fornitore</p>
                      <p className="text-sm font-semibold">
                        {selectedFattura.fornitore_nome}
                      </p>
                      {selectedFattura.fornitore_piva && (
                        <p className="text-xs text-neutral-500">
                          P.IVA / CF: {selectedFattura.fornitore_piva}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-right">
                      <p>
                        <span className="text-xs text-neutral-500">
                          Numero:
                        </span>{" "}
                        <strong>{selectedFattura.numero_fattura || "-"}</strong>
                      </p>
                      <p>
                        <span className="text-xs text-neutral-500">Data:</span>{" "}
                        <strong>{selectedFattura.data_fattura || "-"}</strong>
                      </p>
                      <p>
                        <span className="text-xs text-neutral-500">
                          Totale:
                        </span>{" "}
                        <strong>
                          {selectedFattura.totale_fattura != null
                            ? selectedFattura.totale_fattura.toLocaleString(
                                "it-IT",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )
                            : "-"}{" "}
                          €
                        </strong>
                      </p>
                    </div>
                  </div>

                  {/* TABELLA RIGHE */}
                  <div className="mt-2 border border-neutral-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-neutral-50 text-neutral-600">
                        <tr>
                          <th className="px-2 py-1 text-left">#</th>
                          <th className="px-2 py-1 text-left">Descrizione</th>
                          <th className="px-2 py-1 text-right">Q.tà</th>
                          <th className="px-2 py-1 text-right">Prezzo</th>
                          <th className="px-2 py-1 text-right">Totale</th>
                          <th className="px-2 py-1 text-right">IVA%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFattura.righe?.map((r) => (
                          <tr
                            key={r.id}
                            className="border-t border-neutral-200"
                          >
                            <td className="px-2 py-1 align-top">
                              {r.numero_linea || "-"}
                            </td>
                            <td className="px-2 py-1 align-top">
                              {r.descrizione}
                            </td>
                            <td className="px-2 py-1 text-right align-top">
                              {r.quantita != null
                                ? r.quantita.toLocaleString("it-IT", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}{" "}
                              {r.unita_misura || ""}
                            </td>
                            <td className="px-2 py-1 text-right align-top">
                              {r.prezzo_unitario != null
                                ? r.prezzo_unitario.toLocaleString("it-IT", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </td>
                            <td className="px-2 py-1 text-right align-top">
                              {r.prezzo_totale != null
                                ? r.prezzo_totale.toLocaleString("it-IT", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "-"}
                            </td>
                            <td className="px-2 py-1 text-right align-top">
                              {r.aliquota_iva != null
                                ? r.aliquota_iva.toLocaleString("it-IT", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[10px] text-neutral-400 mt-1">
                    Le righe sono importate dal file XML così come ricevute. In
                    una fase successiva verranno collegate agli ingredienti e
                    alle categorie di acquisto.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER: DASHBOARD + RESET */}
        <div className="mt-8 border-t border-neutral-200 pt-4 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={resetting || fatture.length === 0}
              onClick={handleReset}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                resetting || fatture.length === 0
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
              }`}
            >
              {resetting ? "Eliminazione..." : `Svuota DB (${fatture.length} fatture)`}
            </button>
            <p className="text-xs text-neutral-500">
              I dati importati alimentano la Dashboard Acquisti.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/acquisti/dashboard")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100 transition"
          >
            Vai alla Dashboard Acquisti →
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
