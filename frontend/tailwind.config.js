/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aivi: {
          dark: '#111111',      // Fondo casi negro y elegante
          gold: '#C59A63',      // El dorado/arena de tu logo
          panel: '#1E1E1E',     // Gris muy oscuro para tarjetas
        }
      }
    },
  },
  plugins: [],
}