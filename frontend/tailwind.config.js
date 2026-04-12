/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",   // <— QUESTA È LA RIGA CHE RISOLVE IL PROBLEMA
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red:    '#E8402B',
          green:  '#2EB872',
          blue:   '#2E7BE8',
          ink:    '#111111',
          cream:  '#F4F1EC',
          night:  '#0E0E10',
        },
      },
    },
  },
  plugins: [],
};