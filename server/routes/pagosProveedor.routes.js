import { Router } from 'express';
import mongoose from 'mongoose';
import { PagoProveedor, Reservacion, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, sinSuperAdmin, filtroPorAgente, usuarioDeLaSesion, errorHttp,
} from '../middleware/tenant.js';
import { paginar } from '../utils/paginacion.js';
import { rutasComprobante } from '../utils/comprobantes.js';

// Pagos de la agencia a sus proveedores (cuentas por pagar), por servicio de
// cada reservación. Mismas reglas que los cobros a clientes: cualquier usuario
// de la empresa los registra, queda guardado quién los capturó y se bitacorean;
// cancelarlos es exclusivo del Administrador.
const router = Router();

router.use(sinSuperAdmin('El rol superAdmin no puede consultar ni registrar pagos de las empresas.'));

const SOLO_APLICADOS = { estatus: { $ne: 'Cancelado' } };
const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;

// Lo pagado por renglón del detalle (solo pagos aplicados).
async function pagadoPorDetalle(idReservacion) {
  const filas = await PagoProveedor.aggregate([
    { $match: { idReservacion: new mongoose.Types.ObjectId(String(idReservacion)), ...SOLO_APLICADOS } },
    { $group: { _id: '$idDetalle', pagado: { $sum: '$monto' } } },
  ]);
  return new Map(filas.map((f) => [String(f._id), aCentavos(f.pagado)]));
}

async function cargarReservacion(req, id) {
  if (!mongoose.isValidObjectId(id)) throw errorHttp(400, 'Reservación inválida.');
  const reservacion = await Reservacion.findById(id).populate('detalleReservacion.idProveedor', 'nombreProveedor');
  if (!reservacion) throw errorHttp(404, 'Reservación no encontrada');
  if (!perteneceAlAlcance(reservacion, req)) throw errorHttp(403, 'No tienes permiso para consultar esta reservación.');
  return reservacion;
}

// GET /api/pagos-proveedor/reservacion/:idReservacion
// Estado de cuenta con proveedores de una reservación: por cada servicio, lo
// que se le debe al proveedor, lo pagado y el saldo; más el historial de pagos.
router.get('/reservacion/:idReservacion', async (req, res, next) => {
  try {
    const reservacion = await cargarReservacion(req, req.params.idReservacion);
    const [pagado, pagos] = await Promise.all([
      pagadoPorDetalle(reservacion._id),
      PagoProveedor.find({ idReservacion: reservacion._id, empresa: reservacion.empresa })
        .populate('agente', 'nombre userId')
        .populate('idProveedor', 'nombreProveedor')
        .sort({ fecha: -1 }),
    ]);

    const detalles = reservacion.detalleReservacion.map((d) => {
      const total = aCentavos(d.totalReservacion);
      const abonado = pagado.get(String(d._id)) || 0;
      return {
        idDetalle: d._id,
        proveedor: d.idProveedor ? { id: d.idProveedor._id, nombre: d.idProveedor.nombreProveedor } : null,
        claveReservacion: d.claveReservacion,
        total,
        pagado: abonado,
        saldo: aCentavos(total - abonado),
      };
    });
    const suma = (campo) => aCentavos(detalles.reduce((acc, d) => acc + d[campo], 0));

    res.json({
      idReservacion: reservacion._id,
      destino: reservacion.destino,
      estatusReservacion: reservacion.estatus,
      totales: { total: suma('total'), pagado: suma('pagado'), saldo: suma('saldo') },
      detalles,
      pagos,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pagos-proveedor?idProveedor=&idReservacion=&agente=<capturista>|mios=1&pagina=&porPagina=
router.get('/', async (req, res, next) => {
  try {
    const filtroBase = { ...filtroPorAgente(req) };
    if (req.query.idProveedor) filtroBase.idProveedor = req.query.idProveedor;
    if (req.query.idReservacion) filtroBase.idReservacion = req.query.idReservacion;
    res.json(await paginar(PagoProveedor, alcanceEmpresa(req, filtroBase), req, {
      orden: { fecha: -1 },
      populate: [['agente', 'nombre userId'], ['idProveedor', 'nombreProveedor']],
    }));
  } catch (err) {
    next(err);
  }
});

// POST /api/pagos-proveedor { idReservacion, idDetalle, monto, formaPago, referencia? }
router.post('/', async (req, res, next) => {
  try {
    const { idReservacion, idDetalle, formaPago } = req.body;
    const referencia = String(req.body.referencia || '').trim() || undefined;
    const monto = aCentavos(req.body.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw errorHttp(400, 'El monto del pago debe ser mayor a cero.');

    const reservacion = await cargarReservacion(req, idReservacion);
    if (reservacion.estatus === 'Cancelada') {
      throw errorHttp(400, 'No se pueden registrar pagos a proveedores de una reservación cancelada.');
    }
    const detalle = mongoose.isValidObjectId(idDetalle) && reservacion.detalleReservacion.id(idDetalle);
    if (!detalle) throw errorHttp(400, 'El servicio seleccionado no pertenece a esta reservación.');

    const pagado = (await pagadoPorDetalle(reservacion._id)).get(String(detalle._id)) || 0;
    const saldo = aCentavos(detalle.totalReservacion - pagado);
    if (monto > saldo) throw errorHttp(400, `El monto excede el saldo pendiente con el proveedor ($${saldo.toFixed(2)}).`);

    // Aplicación atómica sobre el renglón del servicio: el acumulado solo sube si
    // con este pago no se rebasa lo que se le debe al proveedor (protege contra
    // dos capturas simultáneas del mismo servicio).
    const aplicado = await Reservacion.updateOne(
      {
        _id: reservacion._id,
        empresa: reservacion.empresa,
        estatus: { $ne: 'Cancelada' },
        detalleReservacion: {
          $elemMatch: {
            _id: detalle._id,
            totalReservacion: detalle.totalReservacion,
            pagado: { $lte: aCentavos(detalle.totalReservacion - monto) + 0.005 },
          },
        },
      },
      { $inc: { 'detalleReservacion.$.pagado': monto, __v: 1 } }
    );
    if (aplicado.modifiedCount === 0) {
      throw errorHttp(409, 'El saldo con el proveedor cambió mientras capturabas (otro usuario registró un movimiento). Revisa el saldo e intenta de nuevo.');
    }

    let pago;
    try {
      pago = await PagoProveedor.create({
        empresa: reservacion.empresa,
        idReservacion: reservacion._id,
        idDetalle: detalle._id,
        idProveedor: detalle.idProveedor._id,
        monto,
        formaPago,
        referencia,
        agente: req.agente.id, // capturista
      });
    } catch (err) {
      // Compensación: si el pago no se pudo guardar, se revierte el acumulado.
      await Reservacion.updateOne(
        { _id: reservacion._id, 'detalleReservacion._id': detalle._id },
        { $inc: { 'detalleReservacion.$.pagado': -monto, __v: 1 } }
      );
      throw err;
    }
    await registrarEvento({
      entidad: 'PagoProveedor', entidadId: pago._id, empresa: pago.empresa, evento: 'pago a proveedor',
      detalle: `$${monto.toFixed(2)} · ${formaPago}${referencia ? ` · ref. ${referencia}` : ''} · ${detalle.idProveedor.nombreProveedor} (${detalle.claveReservacion}) · reservación ${reservacion._id} (${reservacion.destino})`,
      usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(await pago.populate([
      { path: 'agente', select: 'nombre userId' },
      { path: 'idProveedor', select: 'nombreProveedor' },
    ]));
  } catch (err) {
    next(err);
  }
});

// Cancelación (no se borra): solo el Administrador de la empresa.
router.patch('/:id/cancelar', async (req, res, next) => {
  try {
    if (req.agente.rol !== 'Administrador') throw errorHttp(403, 'Solo el Administrador de la empresa puede cancelar pagos a proveedores.');
    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) throw errorHttp(400, 'Indica el motivo de la cancelación.');

    const pago = await PagoProveedor.findById(req.params.id);
    if (!pago) throw errorHttp(404, 'Pago no encontrado');
    if (!perteneceAlAlcance(pago, req)) throw errorHttp(403, 'No tienes permiso para cancelar este pago.');
    if (pago.estatus === 'Cancelado') throw errorHttp(400, 'Este pago ya estaba cancelado.');

    const usuario = usuarioDeLaSesion(req);
    const anterior = { estatus: pago.estatus, motivoCancelacion: pago.motivoCancelacion };
    // Atómico: solo cancela si sigue aplicado (evita restar dos veces el acumulado).
    const cancelado = await PagoProveedor.findOneAndUpdate(
      { _id: pago._id, estatus: { $ne: 'Cancelado' } },
      { $set: { estatus: 'Cancelado', motivoCancelacion: motivo, fechaCancelacion: new Date(), canceladoPor: usuario } },
      { returnDocument: 'after' }
    );
    if (!cancelado) throw errorHttp(400, 'Este pago ya estaba cancelado.');
    await Reservacion.updateOne(
      { _id: pago.idReservacion, 'detalleReservacion._id': pago.idDetalle },
      { $inc: { 'detalleReservacion.$.pagado': -pago.monto, __v: 1 } }
    );

    await registrarCambios({
      entidad: 'PagoProveedor', entidadId: pago._id, empresa: pago.empresa,
      anterior, nuevo: { estatus: cancelado.estatus, motivoCancelacion: motivo }, usuario,
    });
    res.json(cancelado);
  } catch (err) {
    next(err);
  }
});

rutasComprobante(router, { Modelo: PagoProveedor, entidad: 'PagoProveedor' });

export default router;
