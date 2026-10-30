import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, MessageCircle, PlaneTakeoff } from 'lucide-react';
import { reservacionesApi } from '../../api';
import { dinero, fechaViaje } from '../../utils/formato';
import { EtiquetaViaje } from '../Cobranza';

// Reservaciones activas próximas a viajar (por fecha de entrada), para tener a
// los clientes en el radar. Se usa en "Mi panel" y en la campana de avisos.
//   mios: solo las vendidas por el usuario · conAgente: mostrar quién vendió
//   onAbonar(idReservacion): ir a Registro de Pagos con la reservación elegida

// WhatsApp con un recordatorio del viaje (si hay saldo, también lo menciona).
function whatsappViaje(f) {
  const digitos = String(f.cliente?.telefono || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  const cuando = f.diasParaViajar === 0 ? 'hoy' : f.diasParaViajar === 1 ? 'mañana' : `el ${fechaViaje(f.fechaEntrada)}`;
  const mensaje = `Hola ${f.cliente.nombre}, te recordamos que tu viaje a ${f.destino} comienza ${cuando}. ` +
    (f.saldo > 0 ? `Queda un saldo pendiente de ${dinero(f.saldo)} ${f.moneda}. ` : '') +
    '¿Tienes alguna duda o necesitas algo para tu viaje? ¡Estamos para ayudarte!';
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export default function ProximosViajes({ mios = false, dias = 30, conAgente = false, onAbonar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    reservacionesApi.proximas({ dias, ...(mios ? { mios: 1 } : {}) })
      .then((d) => { if (!cancelado) setDatos(d); })
      .catch((err) => { if (!cancelado) setError(err.message); });
    return () => { cancelado = true; };
  }, [mios, dias]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!datos) return <p className="py-4 text-center text-sm text-slate-400">Cargando próximos viajes...</p>;
  if (datos.datos.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        <PlaneTakeoff size={22} className="mx-auto mb-1 text-slate-400" /> No hay viajes en los próximos {datos.dias} días.
      </div>
    );
  }

  return (
    <div>
      <ul className="space-y-2">
        {datos.datos.map((f) => {
          const wa = whatsappViaje(f);
          return (
            <li key={f.idReservacion} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 sm:flex-row sm:items-center">
              <div className="w-28 shrink-0"><EtiquetaViaje fila={f} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-700">
                  {f.cliente?.nombre || '—'}
                  {conAgente && f.agente && <span className="ml-1.5 text-xs font-normal text-slate-400">· {f.agente}</span>}
                </div>
                <div className="truncate text-xs text-slate-500">{f.destino} · {fechaViaje(f.fechaEntrada)} al {fechaViaje(f.fechaSalida)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {f.saldo > 0.005
                  ? <span className="text-xs font-bold text-red-600 tabular-nums">Saldo {dinero(f.saldo)}{f.moneda === 'USD' && ' USD'}</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} /> Liquidado</span>}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" title="Enviar recordatorio del viaje por WhatsApp"
                    className="rounded-lg border border-slate-200 p-1.5 text-emerald-600 hover:bg-white">
                    <MessageCircle size={14} />
                  </a>
                )}
                {onAbonar && f.saldo > 0.005 && (
                  <button onClick={() => onAbonar(f.idReservacion)} title="Registrar abono"
                    className="rounded-lg bg-brand-coral p-1.5 text-white hover:brightness-90">
                    <CreditCard size={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {datos.total > datos.datos.length && (
        <p className="mt-2 text-center text-xs text-slate-400">Mostrando los {datos.datos.length} más cercanos de {datos.total}.</p>
      )}
    </div>
  );
}
