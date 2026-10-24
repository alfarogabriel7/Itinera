import React from 'react';
import { Plus, X, CheckCircle2, Circle } from 'lucide-react';

// Editor de notas de seguimiento con acciones anidadas (Prospectos y Clientes).
// Trabaja sobre una copia local de las notas con `key` para React; usa
// `notasDesdeServidor` al editar y `notasParaServidor` al guardar.

let contadorKey = 0;
const nuevaKey = () => `k${Date.now()}_${contadorKey++}`;

// Se conservan _id y fechas para que al guardar no se recreen las notas y
// acciones con la fecha de hoy (el panel del agente las ordena por fecha).
export const notasDesdeServidor = (notas) => (Array.isArray(notas) ? notas : []).map(n => ({
  key: n._id || nuevaKey(),
  _id: n._id,
  fecha: n.fecha,
  texto: n.texto,
  accionesNotas: (n.accionesNotas || []).map(a => ({
    key: a._id || nuevaKey(),
    _id: a._id,
    fecha: a.fecha,
    fechaCompletada: a.fechaCompletada,
    migradaACliente: a.migradaACliente,
    descripcion: a.descripcion,
    estatus: a.estatus,
  })),
}));

export const notasParaServidor = (notas) => notas.map(({ key, accionesNotas, ...n }) => ({
  ...n,
  accionesNotas: accionesNotas.map(({ key, ...a }) => a),
}));

// Texto para las ventanas de consulta ("Ver").
export const resumenNotas = (notas) => (Array.isArray(notas) ? notas : []).map(n =>
  `• ${n.texto}\n${(n.accionesNotas || []).map(a => `   - [${a.estatus}] ${a.descripcion}`).join('\n')}`
).join('\n');

export default function NotasSeguimiento({ notas, onChange, vacio = 'No hay notas agregadas.' }) {
  const cambiarNota = (ni, cambio) => onChange(notas.map((n, i) => (i === ni ? { ...n, ...cambio } : n)));
  const cambiarAcciones = (ni, f) => cambiarNota(ni, { accionesNotas: f(notas[ni].accionesNotas) });
  const cambiarAccion = (ni, ai, cambio) => cambiarAcciones(ni, acc => acc.map((a, i) => (i === ai ? { ...a, ...cambio } : a)));

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <span className="font-semibold text-slate-700 text-sm">Notas de seguimiento</span>
        <button type="button" onClick={() => onChange([...notas, { key: nuevaKey(), texto: '', accionesNotas: [] }])}
          className="inline-flex items-center gap-1.5 bg-brand-coral text-white px-3 py-1.5 text-xs font-semibold rounded-lg hover:brightness-90">
          <Plus size={14} /> Añadir Nota
        </button>
      </div>

      {notas.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">{vacio}</p>
      ) : (
        <div className="space-y-3">
          {notas.map((n, ni) => (
            <div key={n.key} className="p-3 bg-brand-petroleo/10 rounded-lg border border-brand-petroleo/20">
              <div className="flex items-start gap-2 mb-3">
                <textarea rows={2} required placeholder="Escribe la nota de seguimiento..."
                  className="flex-1 p-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
                  value={n.texto} onChange={e => cambiarNota(ni, { texto: e.target.value })} />
                <button type="button" onClick={() => onChange(notas.filter((_, i) => i !== ni))} title="Quitar esta nota" className="text-slate-400 hover:text-red-600 shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="pl-3 border-l-2 border-brand-petroleo/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs uppercase text-slate-500 font-bold">Acciones / actividades</span>
                  <button type="button" onClick={() => cambiarAcciones(ni, acc => [...acc, { key: nuevaKey(), descripcion: '', estatus: 'En seguimiento' }])}
                    className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-noche hover:underline">
                    <Plus size={12} /> Añadir acción
                  </button>
                </div>

                {n.accionesNotas.length === 0 ? (
                  <p className="text-slate-400 text-xs">Sin actividades registradas.</p>
                ) : (
                  n.accionesNotas.map((a, ai) => (
                    <div key={a.key} className="flex items-center gap-2">
                      <input type="text" required placeholder="Ej. Llamar para dar seguimiento"
                        className="flex-1 p-1.5 border border-slate-300 rounded text-xs bg-white"
                        value={a.descripcion} onChange={e => cambiarAccion(ni, ai, { descripcion: e.target.value })} />
                      {a.migradaACliente && a.estatus === 'Completada' && (
                        <span className="text-2xs font-semibold text-slate-400 whitespace-nowrap" title="Se cerró aquí porque su seguimiento pasó al cliente">→ pasó a cliente</span>
                      )}
                      <button type="button" onClick={() => cambiarAccion(ni, ai, { estatus: a.estatus === 'Completada' ? 'En seguimiento' : 'Completada' })}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-2xs font-semibold whitespace-nowrap ${
                          a.estatus === 'Completada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                        {a.estatus === 'Completada' ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        {a.estatus}
                      </button>
                      <button type="button" onClick={() => cambiarAcciones(ni, acc => acc.filter((_, i) => i !== ai))} title="Quitar actividad" className="text-slate-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
