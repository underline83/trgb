import React from "react";
import LoginForm from "../components/LoginForm";

export default function Login({ setToken, setRole }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <LoginForm setToken={setToken} setRole={setRole} />
    </div>
  );
}
