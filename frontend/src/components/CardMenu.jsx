// src/components/CardMenu.jsx
import React from "react";
import "./CardMenu.css";

export default function CardMenu({ title, subtitle, onClick }) {
  return (
    <div className="card-menu" onClick={onClick}>
      <div className="card-menu-title">{title}</div>
      {subtitle && <div className="card-menu-subtitle">{subtitle}</div>}
    </div>
  );
}