import React, { useState } from 'react';
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
}