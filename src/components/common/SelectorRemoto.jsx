import React, { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

// Selector con búsqueda en el servidor, para catálogos que pueden ser grandes
// (clientes, reservaciones, proveedores): en lugar de un <select> con todos los
// registros, consulta solo los que coinciden con lo que se escribe.
//
//   buscar(q)        -> Promise<array de opciones> (p.ej. los `datos` de un listado paginado)
//   valor            -> id seleccionado
//   etiquetaValor    -> texto a mostrar del valor seleccionado (si ya se conoce)
//   onCambio(id, opcion)
//   etiqueta(opcion) -> texto de cada opción;  detalle(opcion) -> texto secundario (opcional)
export default function SelectorRemoto({
  buscar, valor, etiquetaValor = '', onCambio, etiqueta, detalle, placeholder = 'Buscar...', required = false,
  disabled = false, compacto = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const contenedor = useRef(null);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    if (!abierto) return undefined;
    let cancelado = false;
    const t = setTimeout(() => {
      setCargando(true);
      buscarRef.current(texto.trim())
        .then(r => { if (!cancelado) { setOpciones(r); setError(''); } })
        .catch(err => { if (!cancelado) setError(err.message); })
        .finally(() => { if (!cancelado) setCargando(false); });
    }, 250);
    return () => { cancelado = true; clearTimeout(t); };
  }, [texto, abierto]);

  useEffect(() => {
    const cerrar = (e) => { if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const elegir = (opcion) => {
    onCambio(opcion._id, opcion);
    setAbierto(false);
    setTexto('');
  };

  const alto = compacto ? 'p-1.5 text-xs rounded' : 'p-2.5 text-sm rounded-lg';

  return (
    <div ref={contenedor} className="relative">
      {/* Input oculto para que la validación nativa "required" del formulario funcione */}
      {required && <input tabIndex={-1} className="absolute inset-0 opacity-0 pointer-events-none" value={valor || ''} required onChange={() => {}} />}
      <button type="button" disabled={disabled} onClick={() => setAbierto(a => !a)}
        className={`relative w-full flex items-center justify-between gap-2 border border-slate-300 bg-white text-left focus:outline-none focus:ring-2 focus:ring-brand-teal disabled:opacity-60 ${alto}`}>
        <span className={`truncate ${valor ? 'text-slate-800' : 'text-slate-400'}`}>{valor ? (etiquetaValor || 'Seleccionado') : placeholder}</span>
        <span className="flex items-center gap-1 shrink-0 text-slate-400">
          {valor && !disabled && (
            <X size={14} className="hover:text-red-600" onClick={(e) => { e.stopPropagation(); onCambio('', null); }} />
          )}
          <ChevronDown size={14} />
        </span>
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe para buscar..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          </div>
          <ul className="max-h-64 overflow-auto py-1 text-sm">
            {cargando && <li className="px-3 py-2 text-slate-400">Buscando...</li>}
            {!cargando && error && <li className="px-3 py-2 text-red-600">{error}</li>}
            {!cargando && !error && opciones.length === 0 && <li className="px-3 py-2 text-slate-400">Sin resultados.</li>}
            {!cargando && opciones.map(o => (
              <li key={o._id}>
                <button type="button" onClick={() => elegir(o)}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${o._id === valor ? 'bg-teal-50' : ''}`}>
                  <div className="text-slate-800">{etiqueta(o)}</div>
                  {detalle && <div className="text-xs text-slate-400">{detalle(o)}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
