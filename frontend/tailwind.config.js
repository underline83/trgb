/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",   // <— QUESTA È LA RIGA CHE RISOLVE IL PROBLEMA
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};