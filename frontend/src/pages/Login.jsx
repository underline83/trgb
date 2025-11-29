import React from 'react';
import LoginForm from '../components/LoginForm';

export default function Login({ setToken, setRole }) {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <LoginForm setToken={setToken} setRole={setRole} />
    </div>
  );
}