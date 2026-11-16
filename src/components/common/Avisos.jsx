import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { suscribirAvisos } from '../../utils/avisos';

const ESTILOS = {
  exito: { caja: 'bg-emerald-50 border-emerald-200 text-emerald-800', icono: CheckCircle2, color: 'text-emerald-600' },
  advertencia: { caja: 'bg-amber-50 border-amber-200 text-amber-900', icono: AlertTriangle, color: 'text-amber-600' },
  error: { caja: 'bg-red-50 border-red-200 text-red-800', icono: XCircle, color: 'text-red-600' },
};

// Muestra los avisos de utils/avisos.js arriba a la derecha (en celular, arriba
// a lo ancho). Se ocultan solos; un clic los cierra antes.
export default function Avisos() {
  const [avisos, setAvisos] = useState([]);

  useEffect(() => suscribirAvisos(aviso => {
    setAvisos(lista => [...lista.slice(-3), aviso]);
    setTimeout(() => setAvisos(lista => lista.filter(a => a.id !== aviso.id)), aviso.duracion);
  }), []);

  const quitar = (id) => setAvisos(lista => lista.filter(a => a.id !== id));

  return (
    <div aria-live="polite" className="fixed z-[60] top-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-96 flex flex-col gap-2 pointer-events-none">
      {avisos.map(a => {
        const estilo = ESTILOS[a.tipo] || ESTILOS.exito;
        const Icono = estilo.icono;
        return (
          <div key={a.id} role="status" onClick={() => quitar(a.id)}
            className={`pointer-events-auto cursor-pointer flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-fadeIn ${estilo.caja}`}>
            <Icono size={18} className={`shrink-0 mt-0.5 ${estilo.color}`} />
            <span className="whitespace-pre-line">{a.mensaje}</span>
          </div>
        );
      })}
    </div>
  );
}
