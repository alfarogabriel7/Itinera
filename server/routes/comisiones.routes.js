import { Router } from 'express';
import mongoose from 'mongoose';
import { Reservacion, Agente, Pago, Cliente, registrarEvento, PAGO_CONTABLE } from '../../database/index.js';
import { usuarioDeLaSesion, errorHttp } from '../middleware/tenant.js';

// Pago de comisiones a agentes (solo el Administrador de la empresa).
// Una venta entra cuando está LIQUIDADA (el cliente pagó todo); su fecha es la
// del último abono aplicado. La comisión = venta al público × % del agente, o
// un monto especial capturado a mano. Pagar marca la reservación con
// pagadalagente = true y guarda en pagoComision cuánto, cuándo y quién pagó.

const router = Router();

router.use((req, res, next) => {
  if (req.agente.rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo el Administrador de la empresa puede gestionar el pago de comisiones.' });
  }
  next();
});

const TOLERANCIA = 0.005;
const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;
const comisionDe = (venta, porcentaje) => Math.round(Number(venta || 0) * Number(porcentaje || 0)) / 100;
const liquidada = { montoTotal: { $gt: 0 }, $expr: { $gte: [{ $ifNull: ['$abonado', 0] }, { $subtract: ['$montoTotal', TOLERANCIA] }] } };

// Días de México (UTC-6) 'YYYY-MM-DD' → instantes inicio/fin del rango.
function rangoDe(desde, hasta) {
  const ok = (t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t || ''));
  if (!ok(desde) || !ok(hasta) || desde > hasta) throw errorHttp(400, 'Rango de fechas inválido.');
  return { inicio: new Date(`${desde}T00:00:00-06:00`), fin: new Date(`${hasta}T23:59:59.999-06:00`) };
}

async function agenteDeLaEmpresa(req, id) {
  if (!mongoose.isValidObjectId(id)) throw errorHttp(400, 'Selecciona un agente.');
  const agente = await Agente.findOne({ _id: id, empresa: req.agente.empresa }).select('nombre userId estatus rol porcentajeComision').lean();
  if (!agente) throw errorHttp(404, 'Agente no encontrado en tu empresa.');
  return agente;
}

// GET /api/comisiones?agente=<id>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&pagadas=0|1
//  pagadas=0: ventas liquidadas en el rango, pendientes de pagar al agente.
//  pagadas=1: historial de comisiones pagadas en el rango (por fecha de pago).
router.get('/', async (req, res, next) => {
  try {
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const agente = await agenteDeLaEmpresa(req, req.query.agente);
    const { inicio, fin } = rangoDe(req.query.desde, req.query.hasta);
    const verPagadas = req.query.pagadas === '1';

    const pipeline = verPagadas
      ? [
        { $match: { empresa, agente: agente._id, pagadalagente: true, 'pagoComision.fecha': { $gte: inicio, $lte: fin } } },
        { $addFields: { fechaLiquidacion: '$pagoComision.fechaLiquidacion' } },
      ]
      : [
        { $match: { empresa, agente: agente._id, estatus: { $ne: 'Cancelada' }, pagadalagente: { $ne: true }, ...liquidada } },
        // Fecha de liquidación = último abono aplicado del cliente.
        {
          $lookup: {
            from: Pago.collection.name, let: { r: '$_id' }, as: 'liq',
            pipeline: [
              { $match: { $expr: { $eq: ['$idReservacion', '$$r'] }, ...PAGO_CONTABLE } },
              { $group: { _id: null, ultimo: { $max: '$fecha' } } },
            ],
          },
        },
        { $addFields: { fechaLiquidacion: { $arrayElemAt: ['$liq.ultimo', 0] } } },
        { $match: { fechaLiquidacion: { $gte: inicio, $lte: fin } } },
      ];

    const filas = await Reservacion.aggregate([
      ...pipeline,
      { $lookup: { from: Cliente.collection.name, localField: 'idCliente', foreignField: '_id', as: 'cliente', pipeline: [{ $project: { nombreCompleto: 1 } }] } },
      { $sort: { fechaLiquidacion: 1, _id: 1 } },
      { $limit: 500 },
      {
        $project: {
          destino: 1, fechaEntrada: 1, fechaSalida: 1, montoTotal: 1, moneda: 1, estatus: 1, fechaLiquidacion: 1, pagoComision: 1,
          cliente: { $arrayElemAt: ['$cliente.nombreCompleto', 0] },
        },
      },
    ]);

    const porcentaje = agente.porcentajeComision || 0;
    res.json({
      agente: { id: agente._id, nombre: agente.nombre, estatus: agente.estatus, porcentaje },
      filas: filas.map((r) => ({
        id: r._id,
        cliente: r.cliente || '—',
        destino: r.destino,
        fechaEntrada: r.fechaEntrada,
        fechaSalida: r.fechaSalida,
        estatus: r.estatus,
        moneda: r.moneda || 'MXN',
        venta: aCentavos(r.montoTotal),
        fechaLiquidacion: r.fechaLiquidacion || null,
        comision: comisionDe(r.montoTotal, porcentaje),
        pago: verPagadas ? r.pagoComision : undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/comisiones/pagar { agente, reservaciones: [{ id, especial, monto }] }
// Todo o nada en la validación; luego cada reservación se marca de forma
// atómica (solo si sigue sin pagar), así dos clics no pagan dos veces.
router.post('/pagar', async (req, res, next) => {
  try {
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const agente = await agenteDeLaEmpresa(req, req.body.agente);
    const items = Array.isArray(req.body.reservaciones) ? req.body.reservaciones : [];
    if (items.length === 0) throw errorHttp(400, 'Selecciona al menos una reservación para pagar.');
    if (items.length > 500) throw errorHttp(400, 'Paga a lo más 500 reservaciones a la vez.');
    if (items.some((x) => !mongoose.isValidObjectId(x?.id))) throw errorHttp(400, 'Reservación inválida.');

    const ids = items.map((x) => new mongoose.Types.ObjectId(String(x.id)));
    const reservaciones = await Reservacion.find({ _id: { $in: ids }, empresa, agente: agente._id })
      .select('destino montoTotal abonado moneda estatus pagadalagente').lean();
    const porId = new Map(reservaciones.map((r) => [String(r._id), r]));
    const porcentaje = agente.porcentajeComision || 0;

    // Fecha de liquidación de cada una (último abono aplicado), para el registro.
    const ultimos = await Pago.aggregate([
      { $match: { idReservacion: { $in: ids }, ...PAGO_CONTABLE } },
      { $group: { _id: '$idReservacion', ultimo: { $max: '$fecha' } } },
    ]);
    const liquidacionDe = new Map(ultimos.map((u) => [String(u._id), u.ultimo]));

    const pagos = items.map((x) => {
      const r = porId.get(String(x.id));
      if (!r) throw errorHttp(404, 'Una de las reservaciones no es de este agente o no existe.');
      if (r.pagadalagente) throw errorHttp(409, `La reservación a ${r.destino} ya se le pagó al agente.`);
      if (r.estatus === 'Cancelada') throw errorHttp(400, `La reservación a ${r.destino} está cancelada.`);
      if (!(r.montoTotal > 0) || (r.abonado || 0) + TOLERANCIA < r.montoTotal) {
        throw errorHttp(400, `La reservación a ${r.destino} todavía no está liquidada por el cliente.`);
      }
      const especial = Boolean(x.especial);
      let monto;
      if (especial) {
        monto = aCentavos(x.monto);
        if (!Number.isFinite(Number(x.monto)) || monto < 0) throw errorHttp(400, `Captura un monto válido para el pago especial (${r.destino}).`);
        if (monto > r.montoTotal) throw errorHttp(400, `La comisión especial de ${r.destino} no puede ser mayor a la venta.`);
      } else {
        if (!(porcentaje > 0)) throw errorHttp(400, `${agente.nombre} no tiene % de comisión registrado: regístralo en Agentes o marca la reservación como pago especial.`);
        monto = comisionDe(r.montoTotal, porcentaje);
      }
      return { r, especial, monto };
    });

    const usuario = usuarioDeLaSesion(req);
    const ahora = new Date();
    const totales = {};
    let pagadas = 0;
    for (const { r, especial, monto } of pagos) {
      const pagoComision = {
        monto, porcentaje, especial, base: aCentavos(r.montoTotal), moneda: r.moneda || 'MXN',
        fechaLiquidacion: liquidacionDe.get(String(r._id)) || null, fecha: ahora, pagadoPor: usuario,
      };
      const hecho = await Reservacion.updateOne(
        { _id: r._id, empresa, pagadalagente: { $ne: true } },
        { $set: { pagadalagente: true, pagoComision } }
      );
      if (hecho.modifiedCount === 0) continue; // otro usuario la pagó mientras tanto
      pagadas += 1;
      totales[pagoComision.moneda] = aCentavos((totales[pagoComision.moneda] || 0) + monto);
      await registrarEvento({
        entidad: 'Reservacion', entidadId: r._id, empresa, evento: 'comisión pagada al agente',
        detalle: `${agente.nombre}: $${monto.toFixed(2)} ${pagoComision.moneda}${especial ? ' (pago especial)' : ` (${porcentaje} % de $${pagoComision.base.toFixed(2)})`}`,
        usuario,
      });
    }
    res.json({ pagadas, omitidas: pagos.length - pagadas, totales });
  } catch (err) {
    next(err);
  }
});

// POST /api/comisiones/:id/revertir — deshace un pago marcado por error.
router.post('/:id/revertir', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw errorHttp(400, 'Reservación inválida.');
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const r = await Reservacion.findOneAndUpdate(
      { _id: req.params.id, empresa, pagadalagente: true },
      { $set: { pagadalagente: false }, $unset: { pagoComision: 1 } },
      { returnDocument: 'before' }
    ).select('destino pagoComision').lean();
    if (!r) throw errorHttp(404, 'La reservación no existe o no tiene comisión pagada.');
    await registrarEvento({
      entidad: 'Reservacion', entidadId: r._id, empresa, evento: 'pago de comisión revertido',
      detalle: `Se deshizo el pago de $${aCentavos(r.pagoComision?.monto).toFixed(2)} ${r.pagoComision?.moneda || ''} (${r.destino}).`,
      usuario: usuarioDeLaSesion(req),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
