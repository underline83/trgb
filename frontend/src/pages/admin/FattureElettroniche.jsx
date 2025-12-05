// @version: v1.0-fe-frontend
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function FattureElettroniche() {
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

  // -----------------------------------
  // FETCH FATTURE LISTA
  // -----------------------------------
  const fetchFatture = async () => {
    setFattureLoading(true);
    setFattureError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/contabilita/fe/fatture`, {
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

  useEffect(() => {
    fetchFatture();
  }, []);

  // -----------------------------------
  // CAMBIO FILE
  // -----------------------------------
  const handleFileChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    setFiles(fileList);
    setUploadResult(null);
    setUploadError(null);
  };

  // -----------------------------------
  // IMPORT XML
  // -----------------------------------
  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setUploadError("Seleziona almeno un file XML di fattura elettronica.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const token = localStorage.getItem("token");

      const res = await fetch(`${API_BASE_URL}/contabilita/fe/import`, {
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

      // dopo un import andato a buon fine, ricarico la lista
      fetchFatture();
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
        `${API_BASE_URL}/contabilita/fe/fatture/${fatturaId}`,
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
              🧾 Fatture elettroniche (XML)
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Importa le fatture elettroniche in formato XML per analisi acquisti
              e controllo di gestione.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Amministrazione
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Home
            </button>
          </div>
        </div>

        {/* GRID CONTENUTO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* COLONNA SINISTRA: IMPORT XML */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold font-playfair text-amber-900 mb-2">
                📤 Import fatture XML
              </h2>
              <p className="text-sm text-neutral-600 mb-3">
                Puoi selezionare uno o più file XML scaricati dal cassetto
                fiscale / intermediario e importarli nel gestionale.
              </p>

              <label className="block text-sm font-medium text-neutral-700 mb-1">
                File XML di fattura elettronica
              </label>
              <input
                type="file"
                accept=".xml"
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-neutral-700
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-xl file:border-0
                           file:text-sm file:font-medium
                           file:bg-amber-50 file:text-amber-900
                           hover:file:bg-amber-100"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Formato standard FatturaPA (ITxxxxx_*.xml). I duplicati vengono
                rilevati automaticamente tramite hash del contenuto.
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
                  File selezionati:{" "}
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
                📚 Fatture importate
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
                🔍 Dettaglio fattura
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
      </div>
    </div>
  );
}
