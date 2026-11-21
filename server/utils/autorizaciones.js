import mongoose from 'mongoose';
import {
  Empresa, Agente, Pago, PagoProveedor, Pendiente, Reservacion, registrarCambios,
} from '../../database/index.js';
import { errorHttp, idDe } from '../middleware/tenant.js';
import { hoyEnMexico } from './fechas.js';
import { refrescarCobroAutomatico } from './pendientesAutomaticos.js';

// Autorización de pagos (parámetros de "Mi agencia"):
//   - Si la empresa lo pide, el pago que registra un Agente queda 'Pendiente':
//     no sube el acumulado de la reservación (abonado / detalle.pagado) ni cuenta
//     en saldos, ventas o reportes.
//   - Al registrarlo se le crea un seguimiento a cada Administrador activo.
//   - Autorizar = aplicar: se sube el acumulado de forma atómica (igual que un
//     pago normal) y se cierra el seguimiento. Rechazar = cancelarlo con motivo.
//   - Los pagos que registra el Administrador se aplican directo.

const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;
const dinero = (n, moneda = 'MXN') => `$${aCentavos(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;

export const TIPOS_AUTORIZACION = {
  cliente: { Modelo: Pago, campo: 'autorizarPagosClientes', entidad: 'Pago' },
  proveedor: { Modelo: PagoProveedor, campo: 'autorizarPagosProveedores', entidad: 'PagoProveedor' },
};

// ¿El pago que está registrando este usuario debe esperar autorización?
export async function requiereAutorizacion(req, tipo) {
  if (req.agente.rol === 'Administrador') return false;
  const empresa = await Empresa.findById(req.agente.empresa).select('configuracion').lean();
  return Boolean(empresa?.configuracion?.[TIPOS_AUTORIZACION[tipo].campo]);
}

// Suma de lo pendiente de autorizar: de una reservación (cobros) o por servicio (proveedores).
export async function porAutorizarCliente(idReservacion) {
  const [r] = await Pago.aggregate([
    { $match: { idReservacion: new mongoose.Types.ObjectId(String(idReservacion)), estatus: 'Pendiente' } },
    { $group: { _id: null, total: { $sum: '$monto' } } },
  ]);
  return aCentavos(r?.total);
}

export async function porAutorizarPorDetalle(idReservacion) {
  const filas = await PagoProveedor.aggregate([
    { $match: { idReservacion: new mongoose.Types.ObjectId(String(idReservacion)), estatus: 'Pendiente' } },
    { $group: { _id: '$idDetalle', total: { $sum: '$monto' } } },
  ]);
  return new Map(filas.map((f) => [String(f._id), aCentavos(f.total)]));
}

// Seguimiento (Mi día) para cada Administrador activo de la empresa.
export async function crearSeguimientoAutorizacion({ tipo, pago, reservacion, capturista, proveedor }) {
  const admins = await Agente.find({ empresa: pago.empresa, rol: 'Administrador', estatus: 'Activo' }).select('_id').lean();
  if (admins.length === 0) return;
  const que = tipo === 'cliente' ? 'abono del cliente' : `pago a ${proveedor || 'proveedor'}`;
  const titulo = `Autorizar ${que} de ${dinero(pago.monto, pago.moneda)}`;
  const detalle = `Lo registró ${capturista?.nombre || 'un agente'} · ${pago.formaPago}${pago.referencia ? ` · ref. ${pago.referencia}` : ''} · ${reservacion.destino}`;
  const fecha = new Date(`${hoyEnMexico()}T00:00:00Z`);
  await Pendiente.insertMany(admins.map((a) => ({
    empresa: pago.empresa,
    agente: a._id,
    creadoPor: { userId: 'sistema', nombre: 'Rutana (autorización de pagos)' },
    titulo: titulo.slice(0, 200),
    detalle: detalle.slice(0, 1000),
    tipo: 'autorizacion',
    fecha,
    reservacion: reservacion._id,
    cliente: reservacion.idCliente?._id || reservacion.idCliente || undefined,
    automatico: { regla: 'autorizacion' },
    autorizacion: { tipo, pago: pago._id },
  })));
}

async function cerrarSeguimientos(idPago, usuario) {
  await Pendiente.updateMany(
    { 'autorizacion.pago': idPago, estatus: 'pendiente' },
    { $set: { estatus: 'hecho', completadoEn: new Date(), completadoPor: usuario } }
  );
}

async function cargarPendiente(req, tipo, id) {
  const config = TIPOS_AUTORIZACION[tipo];
  if (!config) throw errorHttp(400, 'Tipo de pago inválido.');
  if (!mongoose.isValidObjectId(id)) throw errorHttp(400, 'Pago inválido.');
  const pago = await config.Modelo.findById(id);
  if (!pago || idDe(pago.empresa) !== String(req.agente.empresa)) throw errorHttp(404, 'Pago no encontrado.');
  if (pago.estatus !== 'Pendiente') {
    throw errorHttp(409, pago.estatus === 'Cancelado' ? 'Este pago ya fue rechazado o cancelado.' : 'Este pago ya estaba autorizado.');
  }
  return { pago, config };
}

// Autoriza y aplica el pago. Primero se "toma" el pago (Pendiente → Aplicado,
// atómico: dos autorizaciones simultáneas no lo aplican dos veces) y luego se
// sube el acumulado con la misma condición que un pago normal (no rebasar el
// total). Si ya no cabe, el pago regresa a Pendiente y se explica por qué.
export async function autorizarPago(req, tipo, id) {
  const { pago, config } = await cargarPendiente(req, tipo, id);
  const usuario = { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre };

  const reservacion = await Reservacion.findById(pago.idReservacion);
  if (!reservacion) throw errorHttp(404, 'La reservación del pago ya no existe.');
  let detalle = null;
  if (tipo === 'cliente') {
    if (reservacion.estatus !== 'Activa') {
      throw errorHttp(409, `La reservación está ${reservacion.estatus.toLowerCase()}; ya no se le pueden aplicar abonos. Rechaza este pago.`);
    }
  } else {
    if (reservacion.estatus === 'Cancelada') throw errorHttp(409, 'La reservación está cancelada; rechaza este pago.');
    detalle = reservacion.detalleReservacion.id(pago.idDetalle);
    if (!detalle) throw errorHttp(409, 'El servicio de este pago ya no existe en la reservación; rechaza este pago.');
  }

  const tomado = await config.Modelo.findOneAndUpdate(
    { _id: pago._id, estatus: 'Pendiente' },
    { $set: { estatus: 'Aplicado', autorizadoPor: usuario, fechaAutorizacion: new Date() } },
    { returnDocument: 'after' }
  );
  if (!tomado) throw errorHttp(409, 'Este pago ya fue autorizado o rechazado por otro usuario.');

  const aplicado = tipo === 'cliente'
    ? await Reservacion.updateOne(
      {
        _id: reservacion._id,
        estatus: 'Activa',
        montoTotal: reservacion.montoTotal,
        abonado: { $lte: aCentavos(reservacion.montoTotal - pago.monto) + 0.005 },
      },
      { $inc: { abonado: pago.monto, __v: 1 } }
    )
    : await Reservacion.updateOne(
      {
        _id: reservacion._id,
        estatus: { $ne: 'Cancelada' },
        detalleReservacion: {
          $elemMatch: {
            _id: detalle._id,
            totalReservacion: detalle.totalReservacion,
            pagado: { $lte: aCentavos(detalle.totalReservacion - pago.monto) + 0.005 },
          },
        },
      },
      { $inc: { 'detalleReservacion.$.pagado': pago.monto, __v: 1 } }
    );

  if (aplicado.modifiedCount === 0) {
    await config.Modelo.updateOne({ _id: pago._id }, { $set: { estatus: 'Pendiente' }, $unset: { autorizadoPor: 1, fechaAutorizacion: 1 } });
    const saldo = tipo === 'cliente'
      ? aCentavos(reservacion.montoTotal - (reservacion.abonado || 0))
      : aCentavos(detalle.totalReservacion - (detalle.pagado || 0));
    throw errorHttp(409, `No se puede autorizar: el pago (${dinero(pago.monto, pago.moneda)}) rebasa el saldo actual (${dinero(saldo, pago.moneda)}). Puede que la reservación haya cambiado; rechaza este pago y pide que se registre de nuevo.`);
  }

  await cerrarSeguimientos(pago._id, usuario);
  await registrarCambios({
    entidad: config.entidad, entidadId: pago._id, empresa: pago.empresa,
    anterior: { estatus: 'Pendiente' }, nuevo: { estatus: 'Aplicado (autorizado)' }, usuario,
  });
  if (tipo === 'cliente') {
    await refrescarCobroAutomatico(reservacion._id).catch((err) => console.error('No se pudo refrescar el pendiente de cobro:', err.message));
  }
  return tomado;
}

// Rechazo: el pago queda Cancelado con el motivo (nunca se aplicó, así que no hay acumulado que restar).
export async function rechazarPago(req, tipo, id, motivoTexto) {
  const motivo = String(motivoTexto || '').trim().slice(0, 300);
  if (!motivo) throw errorHttp(400, 'Indica el motivo del rechazo.');
  const { pago, config } = await cargarPendiente(req, tipo, id);
  const usuario = { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre };
  const rechazado = await config.Modelo.findOneAndUpdate(
    { _id: pago._id, estatus: 'Pendiente' },
    { $set: { estatus: 'Cancelado', motivoCancelacion: `Rechazado: ${motivo}`.slice(0, 300), fechaCancelacion: new Date(), canceladoPor: usuario } },
    { returnDocument: 'after' }
  );
  if (!rechazado) throw errorHttp(409, 'Este pago ya fue autorizado o rechazado por otro usuario.');
  await cerrarSeguimientos(pago._id, usuario);
  await registrarCambios({
    entidad: config.entidad, entidadId: pago._id, empresa: pago.empresa,
    anterior: { estatus: 'Pendiente' }, nuevo: { estatus: 'Cancelado (rechazado)', motivoCancelacion: motivo }, usuario,
  });
  return rechazado;
}
