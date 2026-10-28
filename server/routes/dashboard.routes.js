import { Router } from 'express';
import mongoose from 'mongoose';
import { Reservacion, Pago, Agente, Cliente } from '../../database/index.js';
import { bloquearSuperAdmin } from '../middleware/tenant.js';
import { MONEDAS, MONEDA_PREDETERMINADA, monedaDe, filtroMoneda } from '../../database/catalogos/monedas.js';

const router = Router();

// Los meses se cortan en hora del centro de México. Desde 2022 México ya no
// cambia de horario, así que el desfase es fijo: UTC-6.
const ZONA = '-06:00';
const DESFASE_MS = 6 * 60 * 60 * 1000;

// "Venta" = reservación no cancelada, por su precio de venta (montoTotal), en
// el mes en que inicia el viaje (fechaEntrada): la venta y los pagos se cierran
// cerca de la fecha del viaje. Un mes cuenta todos sus viajes, también los de
// días que aún no llegan (ya están vendidos).
const VENTA_VALIDA = { estatus: { $ne: 'Cancelada' } };
// fechaEntrada se guarda como día de calendario a medianoche UTC: se agrupa y se
// compara en UTC (con la zona de México caería en el día anterior).
const FECHA_VENTA = 'fechaEntrada';
// Meses siguientes que muestra "Ventas a futuro".
const MESES_FUTURO = 6;
const PAGO_APLICADO = { estatus: { $ne: 'Cancelado' } };

const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;

// Referencias de calendario (en hora de México) para "ahora".
function calendario(ahora = new Date()) {
  const mx = new Date(ahora.getTime() - DESFASE_MS);
  const anio = mx.getUTCFullYear();
  const mes = mx.getUTCMonth();
  // Medianoche (hora de México) del día 1 de hace `k` meses, para los pagos
  // (su fecha es un momento real). Date.UTC acepta meses negativos.
  const inicioMes = (k, a = anio, m = mes) => new Date(Date.UTC(a, m - k, 1) + DESFASE_MS);
  const clave = (k) => {
    const d = new Date(Date.UTC(anio, mes - k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return { ahora, anio, mes, dia: mx.getUTCDate(), inicioMes, clave };
}

// Día 1 (medianoche UTC) del mes de hace `k` meses; k negativo = meses futuros.
const mesViaje = (cal, k) => new Date(Date.UTC(cal.anio, cal.mes - k, 1));

// Periodo actual y el anterior para comparar, por meses completos de viaje.
function rangos(periodo, cal) {
  const m = (k) => mesViaje(cal, k);
  const { anio } = cal;
  switch (periodo) {
    case 'mes':
      return { actual: [m(0), m(-1)], previo: [m(1), m(0)] };
    case 'anio':
      return {
        actual: [new Date(Date.UTC(anio, 0, 1)), new Date(Date.UTC(anio + 1, 0, 1))],
        previo: [new Date(Date.UTC(anio - 1, 0, 1)), new Date(Date.UTC(anio, 0, 1))],
      };
    case '24m':
      return { actual: [m(23), m(-1)], previo: null };
    case '12m':
    default:
      return { actual: [m(11), m(-1)], previo: [m(23), m(11)] };
  }
}

async function ventasEnRango(filtro, [desde, hasta]) {
  const [r] = await Reservacion.aggregate([
    { $match: { ...filtro, ...VENTA_VALIDA, [FECHA_VENTA]: { $gte: desde, $lt: hasta } } },
    { $group: { _id: null, ventas: { $sum: '$montoTotal' }, reservaciones: { $sum: 1 } } },
  ]);
  return { ventas: aCentavos(r?.ventas), reservaciones: r?.reservaciones || 0 };
}

async function ventasPorAgente(empresa, [desde, hasta], moneda = MONEDA_PREDETERMINADA) {
  const filas = await Reservacion.aggregate([
    { $match: { empresa, ...VENTA_VALIDA, ...filtroMoneda(moneda), [FECHA_VENTA]: { $gte: desde, $lt: hasta } } },
    { $group: { _id: '$agente', ventas: { $sum: '$montoTotal' }, reservaciones: { $sum: 1 } } },
  ]);
  return new Map(filas.map((f) => [String(f._id), f]));
}

// GET /api/dashboard/admin?periodo=mes|12m|anio|24m&moneda=MXN|USD
// Tablero ejecutivo del Administrador: ventas mensuales de 24 meses, indicadores
// y ranking de agentes del periodo elegido. Solo ve su propia empresa. Todo se
// calcula en la moneda elegida (por defecto MXN): pesos y dólares no se suman.
router.get('/admin', async (req, res, next) => {
  try {
    if (req.agente.rol !== 'Administrador') {
      return res.status(403).json({ error: 'El tablero de ventas es solo para el Administrador de la empresa.' });
    }
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const cal = calendario();
    const desde24 = cal.inicioMes(23);
    const moneda = monedaDe(req.query.moneda);
    const otraMoneda = MONEDAS.find((m) => m !== moneda);
    const fm = filtroMoneda(moneda);

    // --- Serie mensual de 24 meses (ventas, reservaciones y cobrado) ---
    const [ventasMes, cobradoMes] = await Promise.all([
      Reservacion.aggregate([
        { $match: { empresa, ...VENTA_VALIDA, ...fm, [FECHA_VENTA]: { $gte: mesViaje(cal, 23), $lt: mesViaje(cal, -1) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: `$${FECHA_VENTA}` } },
            ventas: { $sum: '$montoTotal' },
            reservaciones: { $sum: 1 },
          },
        },
      ]),
      Pago.aggregate([
        { $match: { empresa, ...PAGO_APLICADO, ...fm, fecha: { $gte: desde24 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$fecha', timezone: ZONA } }, cobrado: { $sum: '$monto' } } },
      ]),
    ]);
    const vPorMes = new Map(ventasMes.map((v) => [v._id, v]));
    const cPorMes = new Map(cobradoMes.map((c) => [c._id, c.cobrado]));
    const meses = [];
    for (let k = 23; k >= 0; k--) {
      const mes = cal.clave(k);
      meses.push({
        mes,
        ventas: aCentavos(vPorMes.get(mes)?.ventas),
        reservaciones: vPorMes.get(mes)?.reservaciones || 0,
        cobrado: aCentavos(cPorMes.get(mes)),
        enCurso: k === 0,
      });
    }

    // --- Ventas a futuro: viajes ya vendidos que inician en los próximos meses ---
    // Por mes de viaje: lo vendido, cuántas reservaciones y lo que falta cobrar
    // (abonado lo mantiene el servidor en cada reservación).
    const ventasFuturas = await Reservacion.aggregate([
      { $match: { empresa, ...VENTA_VALIDA, ...fm, [FECHA_VENTA]: { $gte: mesViaje(cal, -1), $lt: mesViaje(cal, -(MESES_FUTURO + 1)) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: `$${FECHA_VENTA}` } },
          ventas: { $sum: '$montoTotal' },
          cobrado: { $sum: { $ifNull: ['$abonado', 0] } },
          reservaciones: { $sum: 1 },
        },
      },
    ]);
    const fPorMes = new Map(ventasFuturas.map((f) => [f._id, f]));
    const futuro = [];
    for (let k = -1; k >= -MESES_FUTURO; k--) {
      const mes = cal.clave(k);
      const f = fPorMes.get(mes);
      const ventas = aCentavos(f?.ventas);
      const cobrado = aCentavos(f?.cobrado);
      futuro.push({ mes, ventas, reservaciones: f?.reservaciones || 0, cobrado, porCobrar: aCentavos(ventas - cobrado) });
    }

    // --- Indicadores ---
    const filtroEmpresa = { empresa, ...fm };
    const r12 = rangos('12m', cal);
    const rMes = rangos('mes', cal);
    const [mesActual, mesPrevio, doce, docePrevio] = await Promise.all([
      ventasEnRango(filtroEmpresa, rMes.actual),
      ventasEnRango(filtroEmpresa, rMes.previo),
      ventasEnRango(filtroEmpresa, r12.actual),
      ventasEnRango(filtroEmpresa, r12.previo),
    ]);

    // Saldo de las reservaciones activas, calculado en la base (sin cargarlas a memoria).
    const [cartera] = await Reservacion.aggregate([
      { $match: { empresa, estatus: 'Activa', ...fm } },
      {
        $lookup: {
          from: Pago.collection.name,
          let: { id: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$idReservacion', '$$id'] }, ...PAGO_APLICADO } },
            { $group: { _id: null, pagado: { $sum: '$monto' } } },
          ],
          as: 'abonado',
        },
      },
      { $group: { _id: null, total: { $sum: '$montoTotal' }, pagado: { $sum: { $ifNull: [{ $arrayElemAt: ['$abonado.pagado', 0] }, 0] } }, reservaciones: { $sum: 1 } } },
    ]);
    const porCobrar = aCentavos((cartera?.total || 0) - (cartera?.pagado || 0));
    const activas = { length: cartera?.reservaciones || 0 };

    const completos = meses.filter((m) => !m.enCurso);
    const mejorMes = completos.reduce((mejor, m) => (m.ventas > (mejor?.ventas ?? -1) ? m : mejor), null);

    // --- Ranking de agentes ---
    const periodo = ['mes', '12m', 'anio', '24m'].includes(req.query.periodo) ? req.query.periodo : 'mes';
    const r = rangos(periodo, cal);
    const [actual, previo, enOtraMoneda, agentes, ventasEnUSD] = await Promise.all([
      ventasPorAgente(empresa, r.actual, moneda),
      r.previo ? ventasPorAgente(empresa, r.previo, moneda) : new Map(),
      ventasPorAgente(empresa, r.actual, otraMoneda),
      Agente.find({ empresa }).select('nombre rol estatus'),
      Reservacion.exists({ empresa, ...VENTA_VALIDA, moneda: 'USD' }),
    ]);
    const totalPeriodo = [...actual.values()].reduce((acc, f) => acc + f.ventas, 0);
    const ranking = agentes
      .map((a) => {
        const f = actual.get(String(a._id));
        const ventas = aCentavos(f?.ventas);
        const reservaciones = f?.reservaciones || 0;
        return {
          id: a._id,
          nombre: a.nombre,
          rol: a.rol,
          estatus: a.estatus,
          ventas,
          reservaciones,
          ticketPromedio: reservaciones ? aCentavos(ventas / reservaciones) : 0,
          participacion: totalPeriodo ? Math.round((ventas / totalPeriodo) * 1000) / 10 : 0,
          ventasPrevio: r.previo ? aCentavos(previo.get(String(a._id))?.ventas) : null,
          // Informativo: lo que vendió en la otra moneda en el mismo periodo.
          ventasOtraMoneda: aCentavos(enOtraMoneda.get(String(a._id))?.ventas),
        };
      })
      // Los dados de baja solo aparecen si vendieron algo en el periodo.
      .filter((a) => a.estatus === 'Activo' || a.ventas > 0 || a.ventasOtraMoneda > 0)
      .sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre, 'es'));

    res.json({
      generado: cal.ahora,
      diaDelMes: cal.dia,
      moneda,
      otraMoneda,
      // Monedas con ventas en la empresa: el selector solo se muestra si hay más de una.
      monedas: ventasEnUSD ? MONEDAS : [MONEDA_PREDETERMINADA],
      meses,
      futuro,
      indicadores: {
        mesALaFecha: { ...mesActual, ventasPrevio: mesPrevio.ventas },
        ultimos12: { ...doce, ventasPrevio: docePrevio.ventas },
        ticketPromedio12: doce.reservaciones ? aCentavos(doce.ventas / doce.reservaciones) : 0,
        cobradoMes: meses[meses.length - 1].cobrado,
        porCobrar: { monto: porCobrar, reservaciones: activas.length },
        mejorMes: mejorMes && mejorMes.ventas > 0 ? { mes: mejorMes.mes, ventas: mejorMes.ventas } : null,
      },
      ranking: { periodo, total: aCentavos(totalPeriodo), agentes: ranking },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/resumen — los tres contadores del panel lateral, con
// consultas de conteo/suma en la base (antes se descargaban listas completas).
router.get('/resumen', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no tiene resumen de empresa.')) return;
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const cal = calendario();
    const [clientesRegistrados, reservacionesActivas, pagos] = await Promise.all([
      Cliente.countDocuments({ empresa, estatus: 'Activo' }),
      Reservacion.countDocuments({ empresa, estatus: 'Activa' }),
      Pago.aggregate([
        { $match: { empresa, ...PAGO_APLICADO, fecha: { $gte: cal.inicioMes(0) } } },
        { $group: { _id: { $ifNull: ['$moneda', MONEDA_PREDETERMINADA] }, total: { $sum: '$monto' } } },
      ]),
    ]);
    const porMoneda = Object.fromEntries(pagos.map((p) => [p._id, aCentavos(p.total)]));
    // pagosDelMes en MXN (como siempre) y aparte lo cobrado en dólares.
    res.json({ clientesRegistrados, reservacionesActivas, pagosDelMes: porMoneda.MXN || 0, pagosDelMesUSD: porMoneda.USD || 0 });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/agente — lo que el panel inicial del agente necesita
// además de su cobranza y sus seguimientos: sus ventas del mes y su lugar
// en el ranking del mes (sin exponer las ventas de los demás).
router.get('/agente', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no tiene panel de agente.')) return;
    const empresa = new mongoose.Types.ObjectId(String(req.agente.empresa));
    const yo = String(req.agente.id);
    const cal = calendario();
    const r = rangos('mes', cal);

    // Ventas y lugar en el ranking en pesos; lo vendido en dólares, aparte.
    const yoId = new mongoose.Types.ObjectId(yo);
    const [porAgente, previo, enUSD] = await Promise.all([
      ventasPorAgente(empresa, r.actual),
      ventasEnRango({ empresa, agente: yoId, ...filtroMoneda(MONEDA_PREDETERMINADA) }, r.previo),
      ventasEnRango({ empresa, agente: yoId, ...filtroMoneda('USD') }, r.actual),
    ]);
    const mio = porAgente.get(yo);
    const ordenados = [...porAgente.entries()].sort((a, b) => b[1].ventas - a[1].ventas);
    const lugar = mio ? ordenados.findIndex(([id]) => id === yo) + 1 : null;

    res.json({
      mesALaFecha: {
        ventas: aCentavos(mio?.ventas),
        reservaciones: mio?.reservaciones || 0,
        ventasPrevio: previo.ventas,
        ventasUSD: enUSD.ventas,
        reservacionesUSD: enUSD.reservaciones,
      },
      lugarEnElMes: lugar,
      agentesConVentas: ordenados.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
