export const dinero = (n) =>
  `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Cifras grandes en formato corto para tableros: $2.59 M, $432 K, $950.
export function dineroCompacto(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: abs >= 1e7 ? 1 : 2 })} M`;
  if (abs >= 1e3) return `$${(v / 1e3).toLocaleString('es-MX', { maximumFractionDigits: abs >= 1e5 ? 0 : 1 })} K`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

// Variación porcentual con signo; null si no hay base para comparar.
export function variacion(actual, previo) {
  if (!previo) return null;
  return ((actual - previo) / previo) * 100;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// '2026-07' -> 'jul' / 'julio 2026'
export function nombreMes(clave, { largo = false, conAnio = false } = {}) {
  const [anio, mes] = clave.split('-').map(Number);
  const nombre = (largo ? MESES_LARGOS : MESES_CORTOS)[mes - 1];
  return conAnio ? `${nombre} ${anio}` : nombre;
}

// Fecha y hora real de un evento (p.ej. cuándo se registró un abono): en hora local.
export const fechaCorta = (f) => new Date(f).toLocaleDateString('es-MX');

// Fechas de viaje: se capturan como día de calendario ('2026-12-15') y Mongo las
// guarda como medianoche UTC. Se muestran en UTC para que en México no aparezcan
// un día antes.
export const fechaViaje = (f) => new Date(f).toLocaleDateString('es-MX', { timeZone: 'UTC' });
export const fechaViajeLarga = (f) =>
  new Date(f).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

// Teléfono de México (10 dígitos) agrupado para leerlo mejor, respetando la
// lada: 2 dígitos en CDMX, Guadalajara y Monterrey ("33 3726 7047") y 3 en el
// resto del país ("477 136 1173"). Cualquier otro largo se muestra tal cual.
const LADAS_DE_DOS = new Set(['33', '55', '56', '81']);
export function telefono(t) {
  const d = String(t ?? '').replace(/\D/g, '');
  if (d.length !== 10) return t ?? '';
  return LADAS_DE_DOS.has(d.slice(0, 2))
    ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`
    : `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

// Cuenta bancaria agrupada de 4 en 4 para leerla mejor (solo vista): tarjeta de
// 16 dígitos "0121 8000 1234 5678" y CLABE de 18 "0121 8000 1234 5678 91".
// Cualquier otro largo se muestra tal cual.
export function cuentaBancaria(c) {
  const d = String(c ?? '').replace(/\D/g, '');
  if (d.length !== 16 && d.length !== 18) return c ?? '';
  return d.match(/.{1,4}/g).join(' ');
}

// Días de calendario entre hoy (local) y una fecha de viaje. Negativo si ya pasó.
export function diasHasta(f) {
  const d = new Date(f);
  const hoy = new Date();
  return Math.round(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86_400_000
  );
}
