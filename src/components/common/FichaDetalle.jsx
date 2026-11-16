import React, { useEffect } from 'react';
import { X, MessageSquareText } from 'lucide-react';

const TONOS = {
  ok: 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/40',
  baja: 'bg-red-400/20 text-red-100 ring-red-300/40',
  info: 'bg-white/15 text-white ring-white/30',
};

const vacio = (v) => v === undefined || v === null || v === '';

// Columnas de cada sección en pantallas anchas (en celular siempre 1, en tableta 2).
const COLUMNAS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

// Ventana de consulta (botón "Ver" de los catálogos): encabezado a color con el
// nombre y estatus, y los datos agrupados en secciones de etiqueta / valor.
//   secciones: [{ titulo, columnas?: 2|3|4, campos: [{ etiqueta, valor, completo?, doble?, mono? }] }]
//   (completo = ocupa todo el renglón; doble = ocupa 2 columnas)
//   notas: notas de seguimiento [{ texto, fecha, accionesNotas }] (opcional)
export default function FichaDetalle({ icono: Icono, titulo, subtitulo, estatus, secciones = [], notas, onCerrar }) {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-8 sm:pt-12 overflow-y-auto" onMouseDown={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden animate-fadeIn" onMouseDown={(e) => e.stopPropagation()}>

        <div className="relative bg-gradient-to-r from-brand-noche to-brand-petroleo px-6 py-4 text-white">
          <button onClick={onCerrar} title="Cerrar (Esc)" className="absolute right-4 top-4 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
          <div className="flex items-center gap-4 pr-8">
            {Icono && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-coral shadow-sm">
                <Icono size={20} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight break-words">{titulo}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/75">
                {estatus && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONOS[estatus.tono] || TONOS.info}`}>{estatus.texto}</span>
                )}
                {subtitulo && <span>{subtitulo}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-4 space-y-4">
          {secciones.map(s => {
            const campos = s.campos.filter(c => !c.opcional || !vacio(c.valor));
            if (campos.length === 0) return null;
            return (
              <section key={s.titulo}>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-petroleo">{s.titulo}</h3>
                <dl className={`grid grid-cols-1 ${COLUMNAS[s.columnas] || COLUMNAS[2]} gap-x-6 gap-y-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3`}>
                  {campos.map(c => (
                    <div key={c.etiqueta} className={c.completo ? 'col-span-full' : c.doble ? 'sm:col-span-2' : ''}>
                      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-400">{c.etiqueta}</dt>
                      <dd className={`mt-0.5 text-sm text-slate-800 break-words whitespace-pre-line ${c.mono ? 'font-mono tabular-nums' : ''}`}>
                        {vacio(c.valor) ? <span className="text-slate-300">—</span> : c.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}

          {notas !== undefined && (
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-petroleo">
                <MessageSquareText size={14} /> Seguimiento
              </h3>
              {(!notas || notas.length === 0) ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-center text-sm text-slate-400">Sin notas registradas.</p>
              ) : (
                <ul className="space-y-2">
                  {notas.map((n, i) => (
                    <li key={n._id || i} className="rounded-xl border border-brand-petroleo/15 bg-brand-petroleo/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-700 whitespace-pre-line break-words">{n.texto}</p>
                        {n.fecha && <span className="shrink-0 text-2xs text-slate-400">{new Date(n.fecha).toLocaleDateString('es-MX')}</span>}
                      </div>
                      {(n.accionesNotas || []).length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {n.accionesNotas.map((a, j) => (
                            <li key={a._id || j} className="flex items-start gap-2 text-xs text-slate-600">
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${a.estatus === 'Completada' || a.estatus === 'Hecha' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{a.estatus}</span>
                              <span className="break-words">{a.descripcion}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-2.5">
          <button onClick={onCerrar} className="rounded-lg bg-brand-petroleo px-4 py-2 text-sm font-semibold text-white hover:bg-brand-noche">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
