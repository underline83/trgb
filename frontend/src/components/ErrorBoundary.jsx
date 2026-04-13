// FILE: frontend/src/components/ErrorBoundary.jsx
// @version: v1.0 — Cattura errori React e mostra messaggio utile
// Evita che un errore in una pagina faccia crashare tutta l'app

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log dettagliato in console per debug
    console.error("[ErrorBoundary] Errore catturato:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center bg-brand-cream p-6">
          <div className="bg-white rounded-2xl shadow-lg border border-red-200 max-w-lg w-full p-8 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-xl font-bold text-brand-ink mb-2">
              Qualcosa è andato storto
            </h2>
            <p className="text-sm text-neutral-600 mb-4">
              Si è verificato un errore nel caricamento della pagina.
            </p>

            {/* Mostra errore per debug (utile per Marco) */}
            {this.state.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left">
                <p className="text-xs font-mono text-red-700 break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                  window.location.href = "/";
                }}
                className="px-4 py-2 bg-brand-blue text-white text-sm font-semibold rounded-lg hover:opacity-90 transition"
              >
                Torna alla Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-neutral-100 text-neutral-700 text-sm font-semibold rounded-lg hover:bg-neutral-200 transition"
              >
                Ricarica pagina
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
