import { Router } from 'express';
import { Pago, Reservacion, Empresa, Cliente, Agente, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, sinSuperAdmin, filtroPorAgente, regexBusqueda, usuarioDeLaSesion,
} from '../middleware/tenant.js';
import { DESFASE_MX, fechaDelPago, fechaCortaMx } from '../utils/fechas.js';
import { paginar, leerPaginacion, sobre } from '../utils/paginacion.js';
import { rutasComprobante } from '../utils/comprobantes.js';

const router = Router();

router.use(sinSuperAdmin('El rol superAdmin no puede consultar ni registrar pagos de las empresas.'));

// Regla de operación: cualquier usuario de la empresa puede consultar la
// cuenta de una reservación y registrar el abono del cliente (aunque el agente
// responsable no esté). Cada abono guarda quién lo capturó (`agente`) y queda
// en la bitácora; cancelarlo es exclusivo del Administrador.

// Los abonos cancelados se conservan pero no cuentan para el saldo.
// Se usa $ne (y no 'Aplicado') para que los pagos anteriores al campo estatus sigan contando.
const SOLO_APLICADOS = { estatus: { $ne: 'Cancelado' } };

// Redondeo a centavos para que la suma de decimales no deje saldos como 0.0000001.
const aCentavos = (n) => Math.round(Number(n) * 100) / 100;

const DIA = 24 * 60 * 60 * 1000;

// Lo que debe pagar el cliente es el precio de venta (montoTotal), no el costo con proveedores.
async function calcularSaldo(reservacion) {
  const aplicados = await Pago.find({ idReservacion: reservacion._id, ...SOLO_APLICADOS });
  const total = aCentavos(reservacion.montoTotal);
  const pagado = aCentavos(aplicados.reduce((acc, p) => acc + p.monto, 0));
  return { total, pagado, saldo: aCentavos(total - pagado) };
}

// GET /api/pagos?idReservacion=&agente=<id capturista>|mios=1&pagina=&porPagina=
router.get('/', async (req, res, next) => {
  try {
    const filtroBase = { ...filtroPorAgente(req) };
    if (req.query.idReservacion) filtroBase.idReservacion = req.query.idReservacion;
    res.json(await paginar(Pago, alcanceEmpresa(req, filtroBase), req, {
      orden: { fecha: -1 },
      populate: [['agente', 'nombre userId']],
    }));
  } catch (err) {
    next(err);
  }
});

// GET /api/pagos/cobranza?q=&urgencia=todas|iniciado|7|30|mas&orden=fecha|saldo|avance
//   &agente=<id>|mios=1&incluirLiquidadas=1&pagina=&porPagina=
// Reservaciones activas con lo que el cliente lleva pagado y lo que debe. Todo
// se calcula en MongoDB (agregación + $facet): la tabla paginada, su total y
// los indicadores, sin traer todas las reservaciones a memoria.
//   - agente/mios acotan todo (tabla e indicadores);
//   - q y urgencia solo acotan la tabla (los indicadores muestran el total).
router.get('/cobranza', async (req, res, next) => {
  try {
    const p = leerPaginacion(req);
    const incluirLiquidadas = req.query.incluirLiquidadas === '1';

    // "Hoy" como día de calendario en México; las fechas de viaje se guardan a medianoche UTC.
    const mx = new Date(Date.now() - DESFASE_MX);
    const hoy = new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate()));
    const en = (dias) => new Date(hoy.getTime() + dias * DIA);

    const filtroTabla = {};
    const urgencias = {
      iniciado: { $lt: hoy },
      7: { $gte: hoy, $lte: en(7) },
      30: { $gte: hoy, $lte: en(30) },
      mas: { $gt: en(30) },
    };
    if (urgencias[req.query.urgencia]) filtroTabla.fechaEntrada = urgencias[req.query.urgencia];
    const regex = regexBusqueda(req.query.q);
    if (regex) {
      const clientes = await Cliente.find(alcanceEmpresa(req, { $or: [{ nombreCompleto: regex }, { telefono: regex }] }))
        .select('_id').limit(500).lean();
      filtroTabla.$or = [{ destino: regex }, { idCliente: { $in: clientes.map((c) => c._id) } }];
    }
    const ordenes = { saldo: { saldo: -1 }, avance: { avance: 1 }, fecha: { fechaEntrada: 1 } };
    const orden = { ...(ordenes[req.query.orden] || ordenes.fecha), _id: 1 };
    const conSaldo = { saldo: { $gt: 0.005 } };
    const entre = (desde, hasta) => ({ $and: [{ $gte: ['$fechaEntrada', desde] }, { $lte: ['$fechaEntrada', hasta] }] });

    const [resultado] = await Reservacion.aggregate([
      { $match: alcanceEmpresa(req, { estatus: 'Activa', ...filtroPorAgente(req) }) },
      {
        $lookup: {
          from: Pago.collection.name,
          let: { id: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$idReservacion', '$$id'] }, ...SOLO_APLICADOS } },
            { $group: { _id: null, pagado: { $sum: '$monto' }, abonos: { $sum: 1 }, ultimo: { $max: '$fecha' } } },
          ],
          as: 'abonado',
        },
      },
      {
        $addFields: {
          pagado: { $ifNull: [{ $arrayElemAt: ['$abonado.pagado', 0] }, 0] },
          abonos: { $ifNull: [{ $arrayElemAt: ['$abonado.abonos', 0] }, 0] },
          ultimoAbono: { $arrayElemAt: ['$abonado.ultimo', 0] },
        },
      },
      {
        $addFields: {
          saldo: { $subtract: ['$montoTotal', '$pagado'] },
          avance: { $cond: [{ $gt: ['$montoTotal', 0] }, { $divide: ['$pagado', '$montoTotal'] }, 1] },
        },
      },
      ...(incluirLiquidadas ? [] : [{ $match: conSaldo }]),
      {
        $facet: {
          indicadores: [
            { $match: conSaldo },
            {
              $group: {
                // Montos por moneda (nunca se suman pesos con dólares).
                _id: { $ifNull: ['$moneda', 'MXN'] },
                porCobrar: { $sum: '$saldo' },
                reservaciones: { $sum: 1 },
                proximosMonto: { $sum: { $cond: [entre(hoy, en(30)), '$saldo', 0] } },
                proximos: { $sum: { $cond: [entre(hoy, en(30)), 1, 0] } },
                iniciadosMonto: { $sum: { $cond: [{ $lt: ['$fechaEntrada', hoy] }, '$saldo', 0] } },
                iniciados: { $sum: { $cond: [{ $lt: ['$fechaEntrada', hoy] }, 1, 0] } },
              },
            },
          ],
          total: [{ $match: filtroTabla }, { $count: 'n' }],
          datos: [
            { $match: filtroTabla },
            { $sort: orden },
            { $skip: p.saltar },
            { $limit: p.porPagina },
            { $lookup: { from: Cliente.collection.name, localField: 'idCliente', foreignField: '_id', as: 'cliente', pipeline: [{ $project: { nombreCompleto: 1, telefono: 1, correo: 1 } }] } },
            { $lookup: { from: Agente.collection.name, localField: 'agente', foreignField: '_id', as: 'vendedor', pipeline: [{ $project: { nombre: 1 } }] } },
          ],
        },
      },
    ]);

    const indPor = Object.fromEntries(resultado.indicadores.map((i) => [i._id, i]));
    const ind = indPor.MXN || {};
    const usd = indPor.USD || {};
    const cuenta = (campo) => (ind[campo] || 0) + (usd[campo] || 0);
    const filas = resultado.datos.map((r) => {
      const c = r.cliente[0];
      return {
        idReservacion: r._id,
        cliente: c ? { nombre: c.nombreCompleto, telefono: c.telefono, correo: c.correo } : null,
        agente: r.vendedor[0]?.nombre || null,
        destino: r.destino,
        fechaEntrada: r.fechaEntrada,
        fechaSalida: r.fechaSalida,
        total: aCentavos(r.montoTotal),
        moneda: r.moneda || 'MXN',
        pagado: aCentavos(r.pagado),
        saldo: aCentavos(r.saldo),
        abonos: r.abonos,
        ultimoAbono: r.ultimoAbono || null,
      };
    });

    res.json({
      ...sobre(filas, resultado.total[0]?.n || 0, p),
      // Montos en MXN (los mismos campos de siempre) y, aparte, los de USD.
      // Las cantidades de reservaciones cuentan ambas monedas.
      indicadores: {
        porCobrar: aCentavos(ind.porCobrar),
        reservaciones: cuenta('reservaciones'),
        proximos: { cantidad: cuenta('proximos'), monto: aCentavos(ind.proximosMonto) },
        iniciados: { cantidad: cuenta('iniciados'), monto: aCentavos(ind.iniciadosMonto) },
        usd: {
          porCobrar: aCentavos(usd.porCobrar),
          proximos: aCentavos(usd.proximosMonto),
          iniciados: aCentavos(usd.iniciadosMonto),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Resumen financiero de una reservación: total a pagar por el cliente, abonado,
// saldo pendiente e historial de abonos (incluidos los cancelados), más los
// datos de la empresa y del viaje que necesita el recibo imprimible.
router.get('/resumen/:idReservacion', async (req, res, next) => {
  try {
    const reservacion = await Reservacion.findById(req.params.idReservacion)
      .populate('idCliente', 'nombreCompleto telefono correo agente')
      .populate('agente', 'nombre');
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req)) {
      return res.status(403).json({ error: 'No tienes permiso para consultar pagos de esta reservación.' });
    }

    const { total, pagado, saldo } = await calcularSaldo(reservacion);
    const pagos = await Pago.find({ idReservacion: reservacion._id })
      .populate('agente', 'nombre userId')
      .sort({ fecha: -1 });
    const empresa = await Empresa.findById(reservacion.empresa).select(
      'nombreEmpresa rfc telefonoPrincipal correo codigoPostal direccion colonia ciudad estado pais tema logo.tipo'
    );

    res.json({
      cliente: reservacion.idCliente?.nombreCompleto,
      telefonoCliente: reservacion.idCliente?.telefono,
      destino: reservacion.destino,
      fechaEntrada: reservacion.fechaEntrada,
      fechaSalida: reservacion.fechaSalida,
      estatusReservacion: reservacion.estatus,
      vendedor: reservacion.agente?.nombre || null,
      empresa,
      moneda: reservacion.moneda || 'MXN',
      total,
      pagado,
      saldo,
      pagos,
    });
  } catch (err) {
    next(err);
  }
});

// Abono del cliente. Lo puede capturar cualquier usuario de la empresa; queda
// guardado quién lo capturó (`agente`) y se registra en la bitácora.
router.post('/', async (req, res, next) => {
  try {
    const { idReservacion, formaPago } = req.body;
    const referencia = String(req.body.referencia || '').trim() || undefined;
    const monto = aCentavos(req.body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'El monto del abono debe ser mayor a cero.' });
    }
    // Cuándo pagó el cliente (puede ser antes de capturarlo); la captura queda en createdAt.
    const fecha = fechaDelPago(req.body.fecha);

    const reservacion = await Reservacion.findById(idReservacion);
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req)) {
      return res.status(403).json({ error: 'No tienes permiso para registrar pagos de esta reservación.' });
    }
    if (reservacion.estatus !== 'Activa') {
      return res.status(400).json({ error: `No se pueden registrar abonos en una reservación ${reservacion.estatus.toLowerCase()}.` });
    }

    const { saldo } = await calcularSaldo(reservacion);
    if (monto > saldo) {
      return res.status(400).json({ error: `El monto excede el saldo pendiente de la reservación ($${saldo.toFixed(2)}).` });
    }

    // Aplicación atómica: el acumulado solo sube si con este abono no se rebasa
    // el total. Si dos usuarios cobran a la vez, MongoDB deja pasar solo los
    // que caben (la validación de arriba no basta ante capturas simultáneas).
    const aplicado = await Reservacion.updateOne(
      {
        _id: reservacion._id,
        empresa: reservacion.empresa,
        estatus: 'Activa',
        montoTotal: reservacion.montoTotal,
        abonado: { $lte: aCentavos(reservacion.montoTotal - monto) + 0.005 },
      },
      { $inc: { abonado: monto, __v: 1 } }
    );
    if (aplicado.modifiedCount === 0) {
      return res.status(409).json({ error: 'El saldo de la reservación cambió mientras capturabas (otro usuario registró un movimiento). Revisa el saldo e intenta de nuevo.' });
    }

    let pago;
    try {
      pago = await Pago.create({
        idReservacion,
        monto,
        moneda: reservacion.moneda || 'MXN',
        formaPago,
        referencia,
        fecha,
        empresa: reservacion.empresa,
        agente: req.agente.id, // capturista: quien registró el abono en el sistema
      });
    } catch (err) {
      // Compensación: si el abono no se pudo guardar, se revierte el acumulado.
      await Reservacion.updateOne({ _id: reservacion._id }, { $inc: { abonado: -monto, __v: 1 } });
      throw err;
    }
    await registrarEvento({
      entidad: 'Pago', entidadId: pago._id, empresa: pago.empresa, evento: 'abono del cliente',
      detalle: `$${monto.toFixed(2)} ${pago.moneda} · pagado el ${fechaCortaMx(fecha)} ·${formaPago}${referencia ? ` · ref. ${referencia}` : ''} · reservación ${reservacion._id} (${reservacion.destino})`,
      usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(await pago.populate('agente', 'nombre userId'));
  } catch (err) {
    next(err);
  }
});

// Cancelación de un abono (no se borra). Solo el Administrador de la empresa
// dueña del pago puede hacerlo, y queda registrada en la bitácora.
router.patch('/:id/cancelar', async (req, res, next) => {
  try {
    if (req.agente.rol !== 'Administrador') {
      return res.status(403).json({ error: 'Solo el Administrador de la empresa puede cancelar abonos.' });
    }

    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Indica el motivo de la cancelación.' });

    const pago = await Pago.findById(req.params.id);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (!perteneceAlAlcance(pago, req)) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar este pago.' });
    }
    if (pago.estatus === 'Cancelado') {
      return res.status(400).json({ error: 'Este abono ya estaba cancelado.' });
    }

    const usuario = usuarioDeLaSesion(req);
    const anterior = { estatus: pago.estatus || 'Aplicado', motivoCancelacion: pago.motivoCancelacion };

    // Atómico: solo cancela si sigue aplicado, así dos cancelaciones simultáneas
    // no restan el monto dos veces del acumulado de la reservación.
    const cancelado = await Pago.findOneAndUpdate(
      { _id: pago._id, estatus: { $ne: 'Cancelado' } },
      { $set: { estatus: 'Cancelado', motivoCancelacion: motivo, fechaCancelacion: new Date(), canceladoPor: usuario } },
      { returnDocument: 'after' }
    );
    if (!cancelado) return res.status(400).json({ error: 'Este abono ya estaba cancelado.' });
    await Reservacion.updateOne({ _id: pago.idReservacion }, { $inc: { abonado: -pago.monto, __v: 1 } });

    await registrarCambios({
      entidad: 'Pago',
      entidadId: pago._id,
      empresa: pago.empresa,
      anterior,
      nuevo: { estatus: cancelado.estatus, motivoCancelacion: motivo },
      usuario,
    });

    res.json(cancelado);
  } catch (err) {
    next(err);
  }
});

// ---- Comprobantes de pago (mismas reglas que los de pagos a proveedores) ----
rutasComprobante(router, { Modelo: Pago, entidad: 'Pago' });

export default router;
