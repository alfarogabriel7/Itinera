import React from 'react';
import { dinero } from '../../utils/formato';

// Línea secundaria bajo un total en pesos: "+ $3,198.00 USD". Pesos y dólares
// no se suman; si no hay nada en dólares no se muestra nada.
export default function MasUSD({ monto, className = 'text-slate-500' }) {
  if (!(monto > 0)) return null;
  return (
    <div className={`text-xs font-semibold tabular-nums ${className}`} title="Monto en dólares (no se suma a los pesos)">
      + {dinero(monto)} USD
    </div>
  );
}
