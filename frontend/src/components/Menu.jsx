import React from "react";

export default function Menu({ onNavigate }) {
  return (
    <nav className="menu">
      <ul className="menu-list">
        <li>
          <button onClick={() => onNavigate("vini")}>🍷 Gestione Vini</button>
        </li>
        <li>
          <button disabled>📜 Gestione Ricette</button>
        </li>
        <li>
          <button disabled>💰 Food Cost</button>
        </li>
        <li>
          <button disabled>📊 Amministrazione</button>
        </li>
      </ul>
    </nav>
  );
}