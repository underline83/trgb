// @version: v4.0-redirect
// Redirect to fornitori list — detail is now shown inline
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function FattureFornitoreDettaglio() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/acquisti/fornitori", { replace: true });
  }, [navigate]);
  return null;
}
