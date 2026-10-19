/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Paleta de Itinera (ver LEEME del logo). Es fija para toda la plataforma:
      // cada empresa solo personaliza su logo, nunca los colores.
      colors: {
        brand: {
          petroleo: '#0F4C5C',
          // Petróleo aclarado para barras de gráficas (4.8:1 sobre blanco).
          petroleoMedio: '#3E7A88',
          noche: '#0B2A33',
          coral: '#E36414',
          // Solo sobre fondos oscuros o como relleno con texto oscuro.
          coralClaro: '#F28B44',
          arena: '#F4F1EA',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.85rem' }],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
      },
    },
  },
  plugins: [],
}