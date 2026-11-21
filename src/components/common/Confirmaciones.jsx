import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, AlertTriangle } from 'lucide-react';
import { registrarConfirmaciones } from '../../utils/confirmar';

// Dibuja las confirmaciones de utils/confirmar.js con el estilo de la app
// (mismo encabezado a color que la ventana "Ver"). Esc o clic afuera cancelan.
// Con conTexto (pedirTexto) muestra un campo, p.ej. el motivo de una cancelación.
export default function Confirmaciones() {
  const [actual, setActual] = useState(null);
  const [texto, setTexto] = useState('');
  const aceptarRef = useRef(null);
  const campoRef = useRef(null);

  useEffect(() => registrarConfirmaciones((op) => { setTexto(''); setActual(op); }), []);

  const cancelar = () => {
    actual?.resolve(actual.conTexto ? null : false);
    setActual(null);
  };
  const aceptar = () => {
    if (actual.conTexto && actual.requerido && !texto.trim()) { campoRef.current?.focus(); return; }
    actual.resolve(actual.conTexto ? texto.trim() : true);
    setActual(null);
  };

  useEffect(() => {
    if (!actual) return undefined;
    (actual.conTexto ? campoRef : aceptarRef).current?.focus();
    const alTeclear = (e) => { if (e.key === 'Escape') cancelar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [actual]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!actual) return null;
  const peligro = actual.tono === 'peligro';
  const Icono = peligro ? AlertTriangle : HelpCircle;
  const faltaTexto = actual.conTexto && actual.requerido && !texto.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-20 sm:pt-28" onMouseDown={cancelar}>
      <div role="alertdialog" aria-modal="true" aria-label={actual.titulo}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl animate-fadeIn" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`flex items-center gap-3 px-6 py-4 text-white ${peligro ? 'bg-gradient-to-r from-red-700 to-red-500' : 'bg-gradient-to-r from-brand-noche to-brand-petroleo'}`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${peligro ? 'bg-white/20' : 'bg-brand-coral'}`}>
            <Icono size={20} />
          </div>
          <h2 className="text-base font-bold leading-tight break-words">{actual.titulo}</h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          {actual.mensaje && <p className="text-sm text-slate-600 whitespace-pre-line">{actual.mensaje}</p>}
          {actual.detalles?.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              {actual.detalles.map(d => (
                <div key={d.etiqueta} className={d.completo ? 'col-span-2' : ''}>
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-400">{d.etiqueta}</dt>
                  <dd className={`mt-0.5 tabular-nums break-words ${d.destacado ? 'text-lg font-bold text-brand-noche' : 'text-sm font-semibold text-slate-700'}`}>{d.valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {actual.conTexto && (
            <div>
              <label className="block text-sm font-semibold text-slate-700">{actual.etiqueta || 'Motivo'}{actual.requerido && ' *'}</label>
              <textarea ref={campoRef} rows={3} maxLength={actual.maxLength || 300} placeholder={actual.placeholder || ''}
                value={texto} onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aceptar(); }}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
            </div>
          )}
          {actual.nota && <p className="text-xs text-slate-500">{actual.nota}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button onClick={cancelar} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
            {actual.textoCancelar || 'Cancelar'}
          </button>
          <button ref={aceptarRef} onClick={aceptar} disabled={faltaTexto}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-coral hover:brightness-90'}`}>
            {actual.textoAceptar || 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}
