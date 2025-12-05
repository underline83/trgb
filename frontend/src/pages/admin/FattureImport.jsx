// @version: v1.3-fe-import
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

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

  // -----------------------------------
  // FETCH FATTURE LISTA
  // -----------------------------------
  const fetchFatture = async () => {
    setFattureLoading(true);
    setFattureError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/contabilita/fe/fatture`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel caricamento delle fatture.");
      }

      const data = await res.json();
      setFatture(data || []);
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
    const xmlFiles = fileList.filter((f) =>
      f.name?.toLowerCase().endsWith(".xml")
    );
    setFiles(xmlFiles);
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

    const xmlFiles = droppedFiles.filter((f) =>
      f.name?.toLowerCase().endsWith(".xml")
    );

    if (!xmlFiles.length) {
      setUploadError("I file trascinati non contengono XML di fattura.");
      return;
    }

    setFiles(xmlFiles);
  };

  // -----------------------------------
  // IMPORT XML
  // -----------------------------------
  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setUploadError("Seleziona o trascina almeno un file XML di fattura.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const token = localStorage.getItem("token");

      const res = await fetch(`${API_BASE}/contabilita/fe/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/contabilita/fe/fatture/${fatturaId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
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
  // RENDER
  // -----------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📤 Import Fatture Elettroniche (XML)
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Carica i file XML di fattura elettronica, evita i duplicati e
              consulta l&apos;elenco delle fatture importate con relativo
              dettaglio.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/fatture")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Menu Fatture
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* GRID CONTENUTO PRINCIPALE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* COLONNA SINISTRA: IMPORT XML */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold font-playfair text-amber-900 mb-2">
                Zona import massivo XML
              </h2>
              <p className="text-sm text-neutral-600 mb-3">
                Trascina qui i file XML oppure selezionali dal tuo computer.
                Puoi importare anche decine di file in una volta sola. I
                duplicati vengono automaticamente scartati.
              </p>

              {/* DROPZONE */}
              <div
                className={`border-2 rounded-2xl px-4 py-6 text-center cursor-pointer transition
                  ${
                    isDragging
                      ? "border-amber-500 bg-amber-50"
                      : "border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Trascina qui i file XML di fattura
                </label>
                <p className="text-xs text-neutral-500 mb-3">
                  Oppure clicca sul pulsante qui sotto per scegliere i file.
                </p>

                <input
                  type="file"
                  accept=".xml"
                  multiple
                  onClick={(e) => {
                    e.target.value = null;
                  }}
                  onChange={handleFileChange}
                  className="block w-full text-sm text-neutral-700
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-xl file:border-0
                             file:text-sm file:font-medium
                             file:bg-amber-50 file:text-amber-900
                             hover:file:bg-amber-100"
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
                Formato atteso: file FatturaPA tipo{" "}
                <span className="font-mono">ITxxxxxxxxxxxx_*.xml</span>.
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
                      : "bg-amber-600 text-white hover:bg-amber-700 transition"
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
              </div>
            )}
          </div>

          {/* COLONNA DESTRA: LISTA + DETTAGLIO */}
          <div className="space-y-4">
            {/* LISTA FATTURE */}
            <div>
              <h2 className="text-xl font-semibold font-playfair text-amber-900 mb-2">
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
                              className="px-3 py-1 rounded-full text-xs font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 transition"
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
              <h3 className="text-lg font-semibold font-playfair text-amber-900 mb-2">
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

        {/* LINK ALLA DASHBOARD */}
        <div className="mt-8 border-t border-neutral-200 pt-4 flex justify-between items-center">
          <p className="text-xs text-neutral-500">
            I dati importati alimentano la Dashboard Acquisti da Fatture.
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin/fatture/dashboard")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100 transition"
          >
            Vai alla Dashboard Acquisti →
          </button>
        </div>
      </div>
    </div>
  );
}
