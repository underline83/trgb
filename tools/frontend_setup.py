#!/usr/bin/env python3
# @version: v2025.11-web-frontend
# -*- coding: utf-8 -*-
"""
TRGB — Sistema Gestionale Web (Frontend Base)
────────────────────────────────────────────
Script per la generazione automatica della struttura React base del gestionale Tre Gobbi.
Collega il backend FastAPI già attivo su http://127.0.0.1:8000.

Funzionalità:
• Pagina Login (autenticazione JWT via /auth/login)
• Dashboard dinamica con menù basato sul ruolo
• Collegamento API reali backend
• TailwindCSS per styling rapido

Autore: Marco Carminati
Data: 2025-11-11
"""

import os
from pathlib import Path

# ─────────────────────────────────────────────────────────────
# SCRIPT DI CREAZIONE STRUTTURA REACT
# ─────────────────────────────────────────────────────────────

def crea_frontend_base(base_dir: str = "trgb_web/frontend"):
    struttura = [
        f"{base_dir}/src/components",
        f"{base_dir}/src/pages",
    ]
    for folder in struttura:
        Path(folder).mkdir(parents=True, exist_ok=True)
    print(f"✅ Struttura React creata in: {base_dir}")


# ─────────────────────────────────────────────────────────────
# FILE DI BASE
# ─────────────────────────────────────────────────────────────

PACKAGE_JSON = '''{
  "name": "trgb-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.0.0"
  }
}'''

TAILWIND_CONFIG = '''module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};'''

# ─────────────────────────────────────────────────────────────
# App.jsx — Router principale
# ─────────────────────────────────────────────────────────────

APP_JSX = '''import React, { useState } from 'react';
import Login from './pages/Login';
import Home from './pages/Home';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [role, setRole] = useState(localStorage.getItem('role'));

  if (!token) {
    return <Login setToken={setToken} setRole={setRole} />;
  }

  return <Home token={token} role={role} setToken={setToken} />;
}

export default App;'''

# ─────────────────────────────────────────────────────────────
# Login.jsx — pagina principale login
# ─────────────────────────────────────────────────────────────

LOGIN_PAGE = '''import React from 'react';
import LoginForm from '../components/LoginForm';

export default function Login({ setToken, setRole }) {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <LoginForm setToken={setToken} setRole={setRole} />
    </div>
  );
}'''

# ─────────────────────────────────────────────────────────────
# LoginForm.jsx — form di accesso utente
# ─────────────────────────────────────────────────────────────

LOGIN_FORM = '''import React, { useState } from 'react';
import axios from 'axios';

export default function LoginForm({ setToken, setRole }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://127.0.0.1:8000/auth/login', {
        username,
        password,
      });
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('role', response.data.role);
      setToken(response.data.access_token);
      setRole(response.data.role);
    } catch (err) {
      setError('Credenziali non valide');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-80">
      <h1 className="text-xl font-semibold mb-4 text-center">Login Tre Gobbi</h1>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="border p-2 w-full mb-3 rounded"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full mb-3 rounded"
      />
      <button type="submit" className="bg-black text-white w-full p-2 rounded">Accedi</button>
      {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
    </form>
  );
}'''

# ─────────────────────────────────────────────────────────────
# Home.jsx — dashboard principale
# ─────────────────────────────────────────────────────────────

HOME_PAGE = '''import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Home({ token, role, setToken }) {
  const [menu, setMenu] = useState([]);

  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/menu?role=${role}`)
      .then((res) => setMenu(res.data.menu))
      .catch(() => setMenu([]));
  }, [role]);

  const logout = () => {
    localStorage.clear();
    setToken(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Tre Gobbi — Dashboard ({role})</h1>
        <button onClick={logout} className="bg-gray-800 text-white px-4 py-2 rounded">Logout</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {menu.map((item, idx) => (
          <div key={idx} className="p-4 bg-white rounded-lg shadow hover:bg-gray-100 cursor-pointer">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}'''

# ─────────────────────────────────────────────────────────────
# FUNZIONE SCRITTURA FILE
# ─────────────────────────────────────────────────────────────

def scrivi_file(percorso, contenuto):
    Path(percorso).parent.mkdir(parents=True, exist_ok=True)
    with open(percorso, "w", encoding="utf-8") as f:
        f.write(contenuto)


def genera_frontend():
    base = Path("trgb_web/frontend")
    scrivi_file(base / "package.json", PACKAGE_JSON)
    scrivi_file(base / "tailwind.config.js", TAILWIND_CONFIG)
    scrivi_file(base / "src/App.jsx", APP_JSX)
    scrivi_file(base / "src/pages/Login.jsx", LOGIN_PAGE)
    scrivi_file(base / "src/components/LoginForm.jsx", LOGIN_FORM)
    scrivi_file(base / "src/pages/Home.jsx", HOME_PAGE)
    print("✅ Frontend TRGB Web generato con successo.")


if __name__ == "__main__":
    crea_frontend_base()
    genera_frontend()
    print("⚙️ Ora entra in 'trgb_web/frontend' e lancia i comandi:")
    print("  npm install")
    print("  npm run dev")
    print("Apri poi http://localhost:5173 per visualizzare la web app.")
