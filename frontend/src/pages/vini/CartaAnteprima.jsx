// @version: v3.0-removed — sessione 58 fase 2 iter 7 (2026-04-25)
// La pagina di anteprima inline e' stata rimossa per scelta UX di Marco.
// Questo file e' un semplice redirect a /vini/carta, mantenuto per non
// rompere eventuali deep-link esistenti (`/vini/carta/anteprima`).
// Puo' essere eliminato definitivamente quando ci sara' la certezza che
// nessuno punti piu' a quella route.

import React from "react";
import { Navigate } from "react-router-dom";

export default function CartaAnteprima() {
  return <Navigate to="/vini/carta" replace />;
}
