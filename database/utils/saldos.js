import Reservacion from '../models/Reservacion.js';
import Pago from '../models/Pago.js';
import PagoProveedor from '../models/PagoProveedor.js';

// Acumulados de pagos en la reservación (reservacion.abonado y
// detalleReservacion[].pagado). Sirven para aplicar cobros y pagos a
// proveedores de forma atómica: el $inc va condicionado a que no se rebase el
// total, así dos capturas simultáneas nunca pasan juntas del saldo.
//
// Los documentos Pago / PagoProveedor siguen siendo la fuente de verdad; esta
// función recalcula los acumulados a partir de ellos (migración, seed, o para
// reconciliar si alguna vez un proceso se interrumpe entre el $inc y el alta).
export async function recalcularSaldos(filtroReservaciones = {}) {
  const reservaciones = await Reservacion.find(filtroReservaciones).select('_id detalleReservacion._id').lean();
  if (reservaciones.length === 0) return 0;
  const ids = reservaciones.map((r) => r._id);

  const [cobros, pagosProv] = await Promise.all([
    Pago.aggregate([
      { $match: { idReservacion: { $in: ids }, estatus: { $ne: 'Cancelado' } } },
      { $group: { _id: '$idReservacion', total: { $sum: '$monto' } } },
    ]),
    PagoProveedor.aggregate([
      { $match: { idReservacion: { $in: ids }, estatus: { $ne: 'Cancelado' } } },
      { $group: { _id: '$idDetalle', total: { $sum: '$monto' } } },
    ]),
  ]);
  const abonado = new Map(cobros.map((c) => [String(c._id), c.total]));
  const pagado = new Map(pagosProv.map((p) => [String(p._id), p.total]));
  const redondear = (n) => Math.round((n || 0) * 100) / 100;

  const operaciones = reservaciones.map((r) => {
    const $set = { abonado: redondear(abonado.get(String(r._id))) };
    (r.detalleReservacion || []).forEach((d, i) => {
      $set[`detalleReservacion.${i}.pagado`] = redondear(pagado.get(String(d._id)));
    });
    return { updateOne: { filter: { _id: r._id }, update: { $set, $inc: { __v: 1 } } } };
  });
  for (let i = 0; i < operaciones.length; i += 500) {
    await Reservacion.bulkWrite(operaciones.slice(i, i + 500), { ordered: false });
  }
  return operaciones.length;
}
