import { errorHttp } from '../middleware/tenant.js';

// Centro de México: UTC-6 fijo desde 2022 (ya no hay horario de verano).
export const DESFASE_MX = 6 * 60 * 60 * 1000;

// Hoy como día de calendario de México ('YYYY-MM-DD').
export const hoyEnMexico = () => new Date(Date.now() - DESFASE_MX).toISOString().slice(0, 10);

// Fecha en que se hizo un pago (texto 'YYYY-MM-DD', día de México). Sin fecha o
// con la de hoy: el momento actual. Un día anterior se guarda a mediodía de
// México para que siempre caiga en su día y mes al agrupar. No se aceptan
// fechas futuras ni días inexistentes; hacia atrás no hay límite.
// La fecha real de captura queda en createdAt.
export function fechaDelPago(texto) {
  const hoy = hoyEnMexico();
  if (texto === undefined || texto === null || texto === '' || texto === hoy) return new Date();
  const valor = String(texto);
  const fecha = new Date(`${valor}T12:00:00-06:00`);
  // Además del formato, el día debe existir: "2026-02-31" no se recorre al 3 de marzo.
  const existe = !Number.isNaN(fecha.getTime()) && new Date(fecha.getTime() - DESFASE_MX).toISOString().slice(0, 10) === valor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || !existe) throw errorHttp(400, 'La fecha del pago no es válida.');
  if (valor > hoy) throw errorHttp(400, 'La fecha del pago no puede ser posterior a hoy.');
  return fecha;
}

// Texto corto para bitácora: "30/9/2026".
export const fechaCortaMx = (fecha) => fecha.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
