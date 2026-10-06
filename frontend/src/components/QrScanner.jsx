// frontend/src/components/QrScanner.jsx
// Modulo: platform (UI primitive) — @version v1.0 (2026-10-06)
//
// Scanner QR a tutto schermo con la fotocamera posteriore. Restituisce il
// testo letto con onResult(text) e si chiude da solo. Primo uso: Vini →
// Vendite (QR delle etichette bottiglia → vino selezionato).
//
// Decodifica: BarcodeDetector nativo dove c'è (Chrome/Android), altrimenti
// jsQR (utils/vendor/jsqr.js) sui fotogrammi — serve su iPhone/Safari.
// La fotocamera richiede HTTPS (app.tregobbi.it ok) e il permesso del browser.
//
// Uso: {open && <QrScanner onResult={(t) => …} onClose={() => setOpen(false)} />}

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "../utils/vendor/jsqr";

const INTERVALLO_MS = 150;
const LATO_MAX = 640; // lato massimo del fotogramma analizzato (prestazioni)

function messaggioErrore(err) {
  const n = err?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Permesso fotocamera negato. Abilitalo nelle impostazioni del browser per questo sito e riprova.";
  if (n === "NotFoundError" || n === "OverconstrainedError")
    return "Nessuna fotocamera trovata su questo dispositivo.";
  if (n === "NotReadableError")
    return "La fotocamera è usata da un'altra app. Chiudila e riprova.";
  return "Impossibile avviare la fotocamera.";
}

export default function QrScanner({ onResult, onClose, title = "Inquadra il QR" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [errore, setErrore] = useState("");
  const [pronto, setPronto] = useState(false);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => {
    let stream = null;
    let timer = null;
    let finito = false;
    let detector = null;

    const stop = () => {
      finito = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };

    const trovato = (testo) => {
      if (finito || !testo) return;
      stop();
      try { navigator.vibrate && navigator.vibrate(60); } catch { /* niente */ }
      cbRef.current && cbRef.current(testo);
    };

    const leggiFotogramma = async () => {
      if (finito) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          if (detector) {
            const codici = await detector.detect(video);
            if (codici && codici[0]?.rawValue) return trovato(codici[0].rawValue);
          } else {
            const k = Math.min(1, LATO_MAX / Math.max(video.videoWidth, video.videoHeight));
            const w = Math.round(video.videoWidth * k);
            const h = Math.round(video.videoHeight * k);
            const c = canvasRef.current;
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const r = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (r?.data) return trovato(r.data);
          }
        } catch { /* fotogramma saltato */ }
      }
      timer = setTimeout(leggiFotogramma, INTERVALLO_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrore("Questo browser non dà accesso alla fotocamera (serve HTTPS).");
        return;
      }
      try {
        if ("BarcodeDetector" in window) {
          const formati = await window.BarcodeDetector.getSupportedFormats?.();
          if (!formati || formati.includes("qr_code"))
            detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        }
      } catch { detector = null; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (finito) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setPronto(true);
        leggiFotogramma();
      } catch (e) {
        setErrore(messaggioErrore(e));
      }
    })();

    return stop;
  }, []);

  // Esc chiude
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <span className="text-base font-semibold">{title}</span>
        <button type="button" onClick={onClose}
          className="min-w-[48px] min-h-[48px] rounded-full bg-white/15 text-white text-xl font-bold"
          aria-label="Chiudi">✕</button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        {!errore && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] rounded-2xl border-4 border-white/90"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,.45)" }} />
          </div>
        )}
        {errore && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-white text-center text-base max-w-sm">{errore}</p>
          </div>
        )}
      </div>
      <div className="px-4 py-4 text-center text-white/80 text-sm" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {errore ? " " : pronto ? "Avvicina l'etichetta: si legge da sola" : "Avvio fotocamera…"}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  );
}
