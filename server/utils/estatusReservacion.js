import mongoose from 'mongoose';
import { Reservacion, registrarCambios } from '../../database/index.js';
import { hoyEnMexico } from './fechas.js';

// Ciclo de vida de la reservación:
//   Activa      → vigente: se edita, se cobra y se paga a proveedores.
//   Completada  → automática: el viaje terminó (pasó la fecha de salida), el
//                 cliente liquidó y los proveedores están pagados.
//   Cancelada   → manual, solo el Administrador (ver reservaciones.routes.js).
// Completadas y activas cuentan en ventas y en el acumulado de proveedores;
// las canceladas no.

const SISTEMA = { userId: 'sistema', nombre: 'Sistema (cierre automático)' };
const TOLERANCIA = 0.005; // centavos de redondeo

// Condición "terminada y liquidada", evaluada en la base.
const terminadaYLiquidada = (finDeAyer) => ({
  estatus: 'Activa',
  fechaSalida: { $lt: finDeAyer },
  $expr: {
    $and: [
      { $gte: [{ $ifNull: ['$abonado', 0] }, { $subtract: ['$montoTotal', TOLERANCIA] }] },
      {
        $allElementsTrue: [{
          $map: {
            input: { $ifNull: ['$detalleReservacion', []] },
            as: 'd',
            in: { $gte: [{ $ifNull: ['$$d.pagado', 0] }, { $subtract: ['$$d.totalReservacion', TOLERANCIA] }] },
          },
        }],
      },
    ],
  },
});

// Se revisa como máximo una vez cada 10 minutos por empresa y por instancia del
// servidor: es una consulta indexada (empresa + estatus) y normalmente no cambia nada.
const ultimaRevision = new Map();
const CADA_MS = 10 * 60 * 1000;

export async function completarTerminadas(empresa) {
  if (!empresa) return;
  const clave = String(empresa);
  const ahora = Date.now();
  if (ahora - (ultimaRevision.get(clave) || 0) < CADA_MS) return;
  ultimaRevision.set(clave, ahora);

  // fechaSalida es un día de calendario a medianoche UTC: "ya pasó" = antes de hoy (México).
  const hoy = new Date(`${hoyEnMexico()}T00:00:00Z`);
  const filtro = { empresa: new mongoose.Types.ObjectId(clave), ...terminadaYLiquidada(hoy) };
  const listas = await Reservacion.find(filtro).select('_id empresa').lean();
  if (listas.length === 0) return;

  // Se vuelve a exigir la condición al actualizar por si cambió mientras tanto.
  await Reservacion.updateMany({ ...filtro, _id: { $in: listas.map((r) => r._id) } }, { $set: { estatus: 'Completada' }, $inc: { __v: 1 } });
  await Promise.all(listas.map((r) => registrarCambios({
    entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa,
    anterior: { estatus: 'Activa' }, nuevo: { estatus: 'Completada' }, usuario: SISTEMA,
  })));
}

// Si a una reservación completada se le cancela un abono o un pago a proveedor,
// vuelve a tener saldo: regresa a Activa para que se pueda cobrar o pagar.
export async function reactivarSiTieneSaldo(idReservacion, usuario) {
  const r = await Reservacion.findOneAndUpdate(
    { _id: idReservacion, estatus: 'Completada' },
    { $set: { estatus: 'Activa' }, $inc: { __v: 1 } },
    { returnDocument: 'after' }
  ).select('_id empresa');
  if (!r) return;
  await registrarCambios({
    entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa,
    anterior: { estatus: 'Completada' }, nuevo: { estatus: 'Activa' }, usuario,
  });
}

// Para pruebas: olvida la última revisión (fuerza la siguiente).
export const reiniciarRevision = () => ultimaRevision.clear();
