import React, { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { dashboardApi } from '../../api';
import { dinero } from '../../utils/formato';
import { SelectorRangoFechas, aTexto } from '../common/Calendario';

// Acumulado por proveedor de las reservaciones activas cuyo viaje inicia en el
// rango elegido. Tiene su propia consulta (ligera) y solo se recalcula al
// cambiar el rango o la moneda del tablero, no con el resto del tablero.

const rapido = {
  mes: () => { const h = new Date(); return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 0)]; },
  tres: () => { const h = new Date(); return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 3, 0)]; },
  anio: () => { const h = new Date(); return [new Date(h.getFullYear(), 0, 1), new Date(h.getFullYear(), 11, 31)]; },
};
const ATAJOS = [['mes', 'Este mes'], ['tres', 'Próximos 3 meses'], ['anio', 'Este año']];
const rangoDe = (clave) => rapido[clave]().map(aTexto);

export default function SeccionProveedores({ moneda }) {
  const [[desde, hasta], setRango] = useState(() => rangoDe('mes'));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!desde || !hasta) return undefined;
    let cancelado = false;
    setCargando(true);
    dashboardApi.proveedores(desde, hasta, moneda)
      .then((d) => { if (!cancelado) { setDatos(d); setError(''); } })
      .catch((err) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [desde, hasta, moneda]);

  const atajoActivo = ATAJOS.find(([clave]) => rangoDe(clave).join() === [desde, hasta].join())?.[0];
  const t = datos?.totales;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><Truck size={18} className="text-brand-petroleo" /> Proveedores</h2>
          <p className="text-sm text-slate-500">Acumulado por proveedor de las reservaciones <strong className="font-semibold">activas</strong> cuyo viaje inicia en el rango.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 text-sm">
            {ATAJOS.map(([clave, etiqueta]) => (
              <button key={clave} onClick={() => setRango(rangoDe(clave))}
                className={`rounded-md px-3 py-1.5 font-semibold ${atajoActivo === clave ? 'bg-brand-noche text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                {etiqueta}
              </button>
            ))}
          </div>
          <div className="sm:w-80 [&>div]:mt-0">
            <SelectorRangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => setRango([d, h])} placeholder="Elige el rango de fechas" />
          </div>
        </div>
      </div>

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className={`overflow-x-auto rounded-xl border border-slate-100 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
        <table className="w-full border-collapse text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <th className="p-3 font-semibold">Proveedor</th>
              <th className="p-3 text-right font-semibold">Reservaciones</th>
              <th className="p-3 text-right font-semibold" title="Lo que se le debe al proveedor (monto base menos comisión)">Total a pagar</th>
              <th className="p-3 text-right font-semibold" title="Comisión de la agencia (monto comisionable)">Comisión</th>
              <th className="p-3 text-right font-semibold">Pagado</th>
              <th className="p-3 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!datos && !error && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Cargando proveedores...</td></tr>}
            {datos?.proveedores.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">No hay reservaciones activas con viajes en este rango.</td></tr>
            )}
            {datos?.proveedores.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-700">
                  {p.nombre}
                  {p.estatus === 'Baja' && <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-2xs font-semibold text-red-700">Baja</span>}
                  <div className="text-xs font-normal text-slate-400">{p.servicios} servicio(s)</div>
                </td>
                <td className="p-3 text-right text-slate-600">{p.reservaciones}</td>
                <td className="p-3 text-right font-semibold text-slate-800">{dinero(p.totalPagar)}</td>
                <td className="p-3 text-right text-slate-600">{dinero(p.comision)}</td>
                <td className="p-3 text-right text-emerald-700">{dinero(p.pagado)}</td>
                <td className="p-3 text-right font-semibold">
                  {p.saldo > 0.005 ? <span className="text-red-600">{dinero(p.saldo)}</span> : <span className="text-emerald-700">Liquidado</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {datos?.proveedores.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="p-3">Total <span className="text-xs font-normal text-slate-400">{datos.moneda}</span></td>
                <td className="p-3" />
                <td className="p-3 text-right">{dinero(t.totalPagar)}</td>
                <td className="p-3 text-right">{dinero(t.comision)}</td>
                <td className="p-3 text-right text-emerald-700">{dinero(t.pagado)}</td>
                <td className="p-3 text-right text-red-600">{dinero(t.saldo)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
