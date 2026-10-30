import React, { useEffect, useState } from 'react';
import { Bell, PlaneTakeoff, X } from 'lucide-react';
import { reservacionesApi } from '../../api';
import ProximosViajes from './ProximosViajes';

// Campana del encabezado: el número de viajes que inician en los próximos 7
// días y, al abrirla, la lista de próximos viajes a 30 días. El Agente ve los
// que él vendió; el Administrador, los de toda la empresa.
export default function CampanaViajes({ auth, onAbonar }) {
  const esAgente = auth.rol === 'Agente';
  const [abierto, setAbierto] = useState(false);
  const [enSemana, setEnSemana] = useState(0);

  // Solo el conteo (consulta ligera); se refresca al cerrar la ventana.
  useEffect(() => {
    if (abierto) return undefined;
    let cancelado = false;
    reservacionesApi.proximas({ dias: 7, ...(esAgente ? { mios: 1 } : {}) })
      .then((d) => { if (!cancelado) setEnSemana(d.total); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [abierto, esAgente]);

  useEffect(() => {
    if (!abierto) return undefined;
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [abierto]);

  const titulo = enSemana > 0 ? `${enSemana} viaje(s) en los próximos 7 días` : 'Próximos viajes';

  return (
    <>
      <button onClick={() => setAbierto(true)} title={titulo} aria-label={titulo}
        className="relative text-slate-400 hover:text-slate-600">
        <Bell size={20} />
        {enSemana > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold text-white">
            {enSemana > 99 ? '99+' : enSemana}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 sm:pt-24" onMouseDown={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Próximos viajes"
            className="w-full max-w-2xl rounded-2xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><PlaneTakeoff size={18} className="text-brand-petroleo" /> Próximos viajes · 30 días</h2>
                <p className="text-xs text-slate-500">{esAgente ? 'Tus reservaciones activas' : 'Reservaciones activas de la empresa'} por fecha de entrada.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              <ProximosViajes mios={esAgente} dias={30} conAgente={!esAgente}
                onAbonar={(id) => { setAbierto(false); onAbonar(id); }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
