import React from 'react';

// Listado que se adapta al espacio REAL que tiene (no al tamaño de la pantalla):
// tabla cuando cabe y tarjetas cuando no. Usa una consulta de contenedor de CSS
// (.listado-adaptable en index.css), así responde igual con el menú abierto o
// compactado y con o sin el panel lateral derecho.
//
//   columnas: [{ titulo, celda: fila => nodo, className? }]
//   acciones: fila => botones redondos (se acomodan de 2 en 2 en la tabla)
//   tarjeta:  fila => { titulo, subtitulo?, estatus?, campos: [{ etiqueta, valor }] }
export default function ListadoAdaptable({ filas, clave = (f) => f._id, columnas, acciones, tarjeta, cargando, textoCargando, vacio, textoVacio }) {
  const totalColumnas = columnas.length + (acciones ? 1 : 0);
  return (
    <div className="listado-adaptable">
      <div className="vista-tabla rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-brand-noche text-white text-sm">
              {columnas.map(c => <th key={c.titulo} className={`p-3 font-semibold ${c.className || ''}`}>{c.titulo}</th>)}
              {acciones && <th className="p-3 font-semibold text-center w-28">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando && <tr><td colSpan={totalColumnas} className="p-6 text-center text-slate-400 text-sm">{textoCargando}</td></tr>}
            {filas.map(f => (
              <tr key={clave(f)} className="text-sm hover:bg-slate-50">
                {columnas.map(c => <td key={c.titulo} className={`p-3 text-slate-600 ${c.className || ''}`}>{c.celda(f)}</td>)}
                {acciones && (
                  <td className="p-3">
                    {/* Botones de 2 en 2 para que la columna sea angosta. */}
                    <div className="mx-auto flex max-w-[88px] flex-wrap items-center justify-center gap-1.5">{acciones(f)}</div>
                  </td>
                )}
              </tr>
            ))}
            {vacio && <tr><td colSpan={totalColumnas} className="p-6 text-center text-slate-400 text-sm">{textoVacio}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="vista-tarjetas space-y-3">
        {cargando && <p className="p-6 text-center text-slate-400 text-sm">{textoCargando}</p>}
        {filas.map(f => {
          const t = tarjeta(f);
          return (
            <div key={clave(f)} className="rounded-xl border border-slate-100 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 break-words">{t.titulo}</div>
                  {t.subtitulo && <div className="text-xs text-slate-500 break-words">{t.subtitulo}</div>}
                </div>
                {t.estatus && <div className="shrink-0">{t.estatus}</div>}
              </div>
              {t.campos?.length > 0 && (
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {t.campos.map(c => (
                    <div key={c.etiqueta} className="min-w-0">
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-400">{c.etiqueta}</dt>
                      <dd className="text-slate-700 break-words">{c.valor === undefined || c.valor === null || c.valor === '' ? '—' : c.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {acciones && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">{acciones(f)}</div>}
            </div>
          );
        })}
        {vacio && <p className="p-6 text-center text-slate-400 text-sm rounded-xl border border-slate-100">{textoVacio}</p>}
      </div>
    </div>
  );
}
