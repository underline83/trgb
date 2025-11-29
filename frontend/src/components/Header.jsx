import React from "react";

export default function Header({ onLogout }) {
  return (
    <header className="header">
      <div className="flex items-center space-x-3">
        <img
  			src="/logo_tregobbi.png"
  			alt="Logo Tre Gobbi"
  			className="h-8 w-auto max-h-8 object-contain"
  			style={{ maxWidth: "120px" }}
		/>
        <h1>TRGB — Sistema Gestionale Web</h1>
      </div>
      <button onClick={onLogout} className="logout-btn">
        Logout
      </button>
    </header>
  );
}