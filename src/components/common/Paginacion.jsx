import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const OPCIONES_POR_PAGINA = [25, 50, 100];

// Selector "Mostrar N" ligado a un listado de useListadoRemoto.
export function SelectorPorPagina({ listado }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
      Mostrar
      <select value={listado.porPagina} onChange={e => listado.setPorPagina(Number(e.target.value))}
        className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
        {OPCIONES_POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

// Pie de tabla: "Mostrando a–b de N <etiqueta>" + anterior/siguiente.
export default function Paginacion({ listado, etiqueta }) {
  const { total, pagina, porPagina, totalPaginas, setPagina, cargando } = listado;
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
      <p className="text-sm text-slate-500">
        Mostrando {desde.toLocaleString('es-MX')}–{hasta.toLocaleString('es-MX')} de {total.toLocaleString('es-MX')} {etiqueta}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1 || cargando}
          className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-slate-600 px-2">Página {pagina} de {totalPaginas}</span>
        <button type="button" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas || cargando}
          className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
