import { Router } from 'express';
import mongoose from 'mongoose';
import { PagoProveedor, Reservacion, Cliente, Agente, Proveedor, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, sinSuperAdmin, filtroPorAgente, usuarioDeLaSesion, errorHttp, regexBusqueda,
} from '../middleware/tenant.js';
import { paginar, leerPaginacion, sobre } from '../utils/paginacion.js';
import { rutasComprobante } from '../utils/comprobantes.js';
import { fechaDelPago, fechaCortaMx, hoyEnMexico } from '../utils/fechas.js';
import { completarTerminadas, reactivarSiTieneSaldo } from '../utils/estatusReservacion.js';
import { filtroCartera } from '../utils/cartera.js';

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

// GET /api/pagos-proveedor/pendientes?q=&urgencia=todas|iniciado|7|30|mas&agente=<id>|mios=1&pagina=&porPagina=
// Módulo "Pago a Proveedores": reservaciones activas con saldo pendiente con
// sus proveedores, de la fecha de entrada más próxima a la más lejana. Por fila,
// los servicios que faltan por pagar. Un Agente solo ve su cartera (lo que
// vendió y lo de sus clientes asignados); el Administrador, toda la empresa.
// Todo en una agregación: tabla paginada, su total e indicadores por moneda.
//   - q y urgencia solo acotan la tabla (los indicadores muestran el total).
router.get('/pendientes', async (req, res, next) => {
  try {
    await completarTerminadas(req.agente.empresa);
    const p = leerPaginacion(req);
    const hoy = new Date(`${hoyEnMexico()}T00:00:00Z`);
    const en = (dias) => new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

    const filtroTabla = {};
    const urgencias = { iniciado: { $lt: hoy }, 7: { $gte: hoy, $lte: en(7) }, 30: { $gte: hoy, $lte: en(30) }, mas: { $gt: en(30) } };
    if (urgencias[req.query.urgencia]) filtroTabla.fechaEntrada = urgencias[req.query.urgencia];
    const regex = regexBusqueda(req.query.q);
    if (regex) {
      const clientes = await Cliente.find(alcanceEmpresa(req, { $or: [{ nombreCompleto: regex }, { telefono: regex }] })).select('_id').limit(500).lean();
      const proveedores = await Proveedor.find(alcanceEmpresa(req, { nombreProveedor: regex })).select('_id').limit(500).lean();
      filtroTabla.$or = [
        { destino: regex },
        { idCliente: { $in: clientes.map((c) => c._id) } },
        { 'detalleReservacion.idProveedor': { $in: proveedores.map((x) => x._id) } },
        { 'detalleReservacion.claveReservacion': regex },
      ];
    }
    const entre = (desde, hasta) => ({ $and: [{ $gte: ['$fechaEntrada', desde] }, { $lte: ['$fechaEntrada', hasta] }] });
    const cartera = await filtroCartera(req);

    const [r] = await Reservacion.aggregate([
      { $match: alcanceEmpresa(req, { estatus: 'Activa', ...filtroPorAgente(req), ...cartera }) },
      {
        $addFields: {
          porPagar: { $sum: '$detalleReservacion.totalReservacion' },
          pagadoProveedores: { $sum: { $map: { input: '$detalleReservacion', as: 'd', in: { $ifNull: ['$$d.pagado', 0] } } } },
        },
      },
      { $addFields: { saldo: { $subtract: ['$porPagar', '$pagadoProveedores'] } } },
      { $match: { saldo: { $gt: 0.005 } } },
      {
        $facet: {
          indicadores: [{
            $group: {
              _id: { $ifNull: ['$moneda', 'MXN'] },
              porPagar: { $sum: '$saldo' },
              reservaciones: { $sum: 1 },
              proximosMonto: { $sum: { $cond: [entre(hoy, en(7)), '$saldo', 0] } },
              proximos: { $sum: { $cond: [entre(hoy, en(7)), 1, 0] } },
              iniciadosMonto: { $sum: { $cond: [{ $lt: ['$fechaEntrada', hoy] }, '$saldo', 0] } },
              iniciados: { $sum: { $cond: [{ $lt: ['$fechaEntrada', hoy] }, 1, 0] } },
            },
          }],
          total: [{ $match: filtroTabla }, { $count: 'n' }],
          datos: [
            { $match: filtroTabla },
            { $sort: { fechaEntrada: 1, _id: 1 } },
            { $skip: p.saltar },
            { $limit: p.porPagina },
            { $lookup: { from: Cliente.collection.name, localField: 'idCliente', foreignField: '_id', as: 'cliente', pipeline: [{ $project: { nombreCompleto: 1, telefono: 1 } }] } },
            { $lookup: { from: Agente.collection.name, localField: 'agente', foreignField: '_id', as: 'vendedor', pipeline: [{ $project: { nombre: 1 } }] } },
            { $lookup: { from: Proveedor.collection.name, localField: 'detalleReservacion.idProveedor', foreignField: '_id', as: 'proveedores', pipeline: [{ $project: { nombreProveedor: 1 } }] } },
          ],
        },
      },
    ]);

    const filas = r.datos.map((x) => {
      const nombres = new Map(x.proveedores.map((pv) => [String(pv._id), pv.nombreProveedor]));
      return {
        idReservacion: x._id,
        cliente: x.cliente[0] ? { nombre: x.cliente[0].nombreCompleto, telefono: x.cliente[0].telefono } : null,
        agente: x.vendedor[0]?.nombre || null,
        destino: x.destino,
        fechaEntrada: x.fechaEntrada,
        fechaSalida: x.fechaSalida,
        moneda: x.moneda || 'MXN',
        total: aCentavos(x.porPagar),
        pagado: aCentavos(x.pagadoProveedores),
        saldo: aCentavos(x.saldo),
        // Solo los servicios que todavía tienen saldo con su proveedor.
        pendientes: x.detalleReservacion
          .map((d) => ({ proveedor: nombres.get(String(d.idProveedor)) || 'Proveedor', clave: d.claveReservacion, saldo: aCentavos(d.totalReservacion - (d.pagado || 0)) }))
          .filter((d) => d.saldo > 0.005),
      };
    });

    const por = Object.fromEntries(r.indicadores.map((i) => [i._id, i]));
    const mxn = por.MXN || {};
    const usd = por.USD || {};
    const cuenta = (campo) => (mxn[campo] || 0) + (usd[campo] || 0);
    res.json({
      ...sobre(filas, r.total[0]?.n || 0, p),
      // Montos en MXN y aparte los de USD (no se suman); las cantidades cuentan ambas.
      indicadores: {
        porPagar: aCentavos(mxn.porPagar),
        reservaciones: cuenta('reservaciones'),
        proximos: { cantidad: cuenta('proximos'), monto: aCentavos(mxn.proximosMonto) },
        iniciados: { cantidad: cuenta('iniciados'), monto: aCentavos(mxn.iniciadosMonto) },
        usd: { porPagar: aCentavos(usd.porPagar), proximos: aCentavos(usd.proximosMonto), iniciados: aCentavos(usd.iniciadosMonto) },
      },
    });
  } catch (err) {
    next(err);
  }
});

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
      moneda: reservacion.moneda || 'MXN',
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
    // Cuándo se le pagó al proveedor (puede ser antes de capturarlo); la captura queda en createdAt.
    const fecha = fechaDelPago(req.body.fecha);

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
        moneda: reservacion.moneda || 'MXN',
        formaPago,
        referencia,
        fecha,
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
      detalle: `$${monto.toFixed(2)} ${pago.moneda} · pagado el ${fechaCortaMx(fecha)} · ${formaPago}${referencia ? ` · ref. ${referencia}` : ''} · ${detalle.idProveedor.nombreProveedor} (${detalle.claveReservacion}) · reservación ${reservacion._id} (${reservacion.destino})`,
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
    // Si ya estaba completada, vuelve a tener saldo con el proveedor: regresa a Activa.
    await reactivarSiTieneSaldo(pago.idReservacion, usuario);

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
