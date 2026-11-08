import React from 'react';
import { Sun, Sunset, Moon, Plane } from 'lucide-react';

// Bienvenida de la pantalla de inicio ("Mi día"): saludo según la hora, nombre y
// un mensaje con lo que hay que atender. `children` va a la derecha (p.ej. filtros).
function porHora() {
  const h = new Date().getHours();
  if (h < 12) return { texto: 'Buenos días', Icono: Sun };
  if (h < 19) return { texto: 'Buenas tardes', Icono: Sunset };
  return { texto: 'Buenas noches', Icono: Moon };
}

export default function Saludo({ nombre, mensaje, children }) {
  const { texto, Icono } = porHora();
  const primerNombre = (nombre || '').split(' ')[0];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-noche to-brand-petroleo p-6 text-white shadow-sm">
      <Plane size={120} className="absolute -right-4 -top-6 rotate-12 text-white/10" aria-hidden="true" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-white/80"><Icono size={16} aria-hidden="true" /> {texto}</div>
          <h1 className="mt-1 text-2xl font-bold">{primerNombre ? `¡Hola, ${primerNombre}!` : '¡Hola!'}</h1>
          {mensaje && <p className="mt-1 text-sm text-white/80">{mensaje}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
