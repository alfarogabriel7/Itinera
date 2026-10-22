import plugin from 'tailwindcss/plugin';
import { TEMAS, TEMA_PREDETERMINADO } from './database/catalogos/temas.js';

// Los colores `brand-*` son variables CSS para poder cambiar de tema al iniciar
// sesión sin recompilar: Itinera en :root (login, superAdmin y empresas sin
// grupo) y cada grupo bajo <html data-tema="...">. Las paletas viven en
// database/catalogos/temas.js; aquí solo se convierten a variables.
const TOKENS = Object.keys(TEMAS[TEMA_PREDETERMINADO].colores);
const aRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const variablesDe = (colores) => Object.fromEntries(TOKENS.map((t) => [`--brand-${t}`, aRgb(colores[t])]));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: Object.fromEntries(TOKENS.map((t) => [t, `rgb(var(--brand-${t}) / <alpha-value>)`])),
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
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': variablesDe(TEMAS[TEMA_PREDETERMINADO].colores) });
      for (const [clave, tema] of Object.entries(TEMAS)) {
        if (clave !== TEMA_PREDETERMINADO) addBase({ [`[data-tema="${clave}"]`]: variablesDe(tema.colores) });
      }
    }),
  ],
}