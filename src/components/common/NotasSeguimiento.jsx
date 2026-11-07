import React from 'react';
import { Plus, X } from 'lucide-react';

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

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <span className="font-semibold text-slate-700 text-sm">Notas</span>
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

              {/* Las acciones de seguimiento ahora son Pendientes (ver el panel "Pendientes").
                  Las acciones anteriores se conservan en los datos como histórico. */}
              {n.fecha && <p className="pl-1 text-2xs text-slate-400">{new Date(n.fecha).toLocaleDateString('es-MX')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
