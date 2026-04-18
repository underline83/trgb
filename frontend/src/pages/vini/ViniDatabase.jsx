// @version: v2.5-mattoni — M.I primitives (Btn) su back e import
// Pagina Database Vini — Import Excel + Risultato
// Stile Vintage Premium allineato a Carta e Menu

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

export default function ViniDatabase() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadResult, setUploadResult] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Seleziona un file Excel (.xlsx).");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await apiFetch(
        `${API_BASE}/vini/cantina-tools/import-excel`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        throw new Error(`Errore server: ${response.status}`);
      }

      const data = await response.json();
      const html = `<p><strong>${data.msg}</strong></p>`
        + `<p>Righe Excel: ${data.righe_excel} — Nuovi: ${data.inseriti} — Aggiornati: ${data.aggiornati}</p>`
        + (data.errori?.length ? `<p style="color:red">Errori: ${data.errori.length}</p>` : "");
      setUploadResult(html);

    } catch (err) {
      setUploadResult(
        `<p style="color:red;font-weight:bold;">${err.message}</p>`
      );
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* 🔙 BACK BUTTON */}
        <Btn variant="secondary" size="md" onClick={() => navigate("/vini")} className="mb-6">
          ← Torna al Menu Vini
        </Btn>

        {/* HEADER */}
        <h1 className="text-4xl tracking-wide font-bold text-center mb-4 text-blue-900 font-playfair">
          📦 Database Vini — Import Excel
        </h1>
        <p className="text-center text-neutral-600 mb-10">
          Carica il file <code>vini.xlsx</code> per aggiornare il database.
        </p>

        {/* UPLOAD BOX */}
        <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-inner mb-10">

          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setSelectedFile(e.target.files[0])}
            className="border border-gray-300 p-3 w-full rounded-lg bg-white shadow-sm"
          />

          <Btn variant="primary" size="md" onClick={handleUpload} disabled={loading} loading={loading}>
            {loading ? "Caricamento…" : "📤 Importa file Excel"}
          </Btn>
        </div>

        {/* RISULTATO */}
        <div
          className="
            text-sm leading-relaxed bg-neutral-50 
            border border-neutral-300 rounded-xl 
            p-5 shadow-inner max-h-[60vh] overflow-auto
          "
          dangerouslySetInnerHTML={{ __html: uploadResult }}
        />
      </div>
    </div>
  );
}