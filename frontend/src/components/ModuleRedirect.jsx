// FILE: frontend/src/components/ModuleRedirect.jsx
// @version: v1.0 — role-aware redirect per landing modulo
//
// Sostituisce le vecchie pagine hub (*Menu.jsx). Quando si entra in /modulo
// sceglie la prima destinazione accessibile al ruolo corrente fra quelle dichiarate.
// Se nessuna è accessibile → mostra una pagina "Nessun accesso" coerente col brand.
//
// Uso:
//   <Route path="/vini" element={
//     <ModuleRedirect module="vini" targets={[
//       { sub: "dashboard", path: "/vini/dashboard" },
//       { sub: "magazzino", path: "/vini/magazzino" },
//       { sub: "carta",     path: "/vini/carta" },
//       { sub: "vendite",   path: "/vini/vendite" },
//       { sub: "settings",  path: "/vini/settings" },
//     ]} />
//   } />
//
// Props:
//   - module: chiave modulo (es. "vini")
//   - targets: array ordinato { sub, path }. Il primo accessibile vince.
//              Se `sub` è undefined, il target è considerato sempre accessibile
//              (purché l'utente veda il modulo padre).
//
// Comportamento:
//   - loading → null (evita flicker)
//   - utente non accede al modulo → Navigate("/")
//   - nessun target accessibile → schermata "Nessun accesso"
//
// NB: per path con querystring (es. "/impostazioni?tab=utenti") il `sub`
// va comunque referenziato al sotto-modulo di modules.json.

import React from "react";
import { Navigate } from "react-router-dom";
import useModuleAccess from "../hooks/useModuleAccess";

export default function ModuleRedirect({ module, targets = [] }) {
  const { canAccessModule, canAccessSub, loading, role } = useModuleAccess();

  if (loading) return null;

  if (!canAccessModule(module)) {
    return <Navigate to="/" replace />;
  }

  // Trova il primo target accessibile
  const pick = targets.find((t) => {
    if (!t || !t.path) return false;
    if (!t.sub) return true;
    return canAccessSub(module, t.sub);
  });

  if (pick) return <Navigate to={pick.path} replace />;

  // Fallback: l'utente ha il modulo ma nessuna delle sub richieste — messaggio brand
  return (
    <div className="min-h-[60vh] bg-brand-cream flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-xl font-semibold text-brand-ink mb-2">
          Nessuna pagina accessibile
        </h1>
        <p className="text-sm text-neutral-600 leading-relaxed">
          Non hai i privilegi per aprire nessuna delle sezioni di questo modulo
          {role ? <> col ruolo <span className="font-medium">{role}</span></> : null}.
          Chiedi all'amministratore di concederti l'accesso.
        </p>
        <a
          href="/"
          className="mt-5 inline-block px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 transition"
        >
          Torna alla Home
        </a>
      </div>
    </div>
  );
}
