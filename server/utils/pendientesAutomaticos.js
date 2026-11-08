import mongoose from 'mongoose';
import { Reservacion, Prospecto, Cliente, Agente, Pendiente, PendienteAutomatico } from '../../database/index.js';
import { DOCUMENTOS_BASE } from '../../database/models/Reservacion.js';
import { hoyEnMexico } from './fechas.js';

// Pendientes automáticos: el sistema crea pendientes a partir de los datos y
// cierra solos los que ya se resolvieron.
//
//   1. cobro       Reservación activa con saldo del cliente: aviso a 20 días del
//                  viaje y 2º aviso a 12 días. Se cierra al liquidar.
//   2. proveedor   Servicio con saldo al proveedor a 15 días del viaje. Se cierra al pagarlo.
//   3. documentos  Documentos en "Pendiente" a 10 días del viaje. Se cierra cuando
//                  ya no queda ninguno pendiente.
//   4. regreso     Al día siguiente de que regresa: preguntar cómo le fue y pedir reseña.
//   5. prospecto   Prospecto sin pendientes ni cambios en 10 días. Se cierra si se convierte.
//   6. recompra    11 meses después de su último viaje, si no ha reservado otro.
//                  Se cierra si reserva un viaje nuevo.
//   7. cumpleanos  El día del cumpleaños del cliente (si tiene fecha de nacimiento).
//
// Responsable: el agente que vendió (o el del prospecto/cliente); si está de baja,
// el agente del cliente; si tampoco, un Administrador activo.
// Cada ocurrencia queda en PendienteAutomatico: no se duplica y, si alguien
// elimina el pendiente, no se vuelve a crear.

export const REGLAS = {
  cobroDias: [20, 12], // primer aviso y 2º aviso (días antes del viaje)
  proveedorDias: 15,
  documentosDias: 10,
  regresoVentana: 7, // días después del regreso en que aún se crea (si nadie entró al sistema)
  prospectoDias: 10,
  prospectoMaxDias: 60, // prospectos sin actividad desde hace más tiempo ya no se retoman solos
  recompraMeses: 11,
  cumpleVentana: 2, // días de atraso permitidos (si nadie entró ese día)
};

const SISTEMA = { userId: 'sistema', nombre: 'Itinera (automático)' };
const DIA = 24 * 60 * 60 * 1000;
const TOLERANCIA = 0.005;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (f) => `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
const dinero = (n, moneda) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'MXN'}`;
const masDias = (fecha, n) => new Date(fecha.getTime() + n * DIA);
const saldoDe = (d) => (d.totalReservacion || 0) - (d.pagado || 0);

// Se revisa como máximo una vez cada 10 minutos por empresa y por instancia.
const ultimaRevision = new Map();
const CADA_MS = 10 * 60 * 1000;

export async function generarPendientesAutomaticos(empresa) {
  if (!empresa) return;
  const clave = String(empresa);
  const ahora = Date.now();
  if (ahora - (ultimaRevision.get(clave) || 0) < CADA_MS) return;
  ultimaRevision.set(clave, ahora);
  try {
    await revisar(new mongoose.Types.ObjectId(clave));
  } catch (err) {
    // Nunca debe romper la pantalla que lo disparó.
    console.error('Pendientes automáticos:', err);
  }
}

// Para pruebas: olvida la última revisión (fuerza la siguiente).
export const reiniciarRevisionAutomaticos = () => ultimaRevision.clear();

async function revisar(empresa) {
  const hoy = new Date(`${hoyEnMexico()}T00:00:00Z`);
  const usuarios = await Agente.find({ empresa, estatus: 'Activo', rol: { $ne: 'superAdmin' } }).select('rol').lean();
  const activos = new Set(usuarios.map((u) => String(u._id)));
  const admin = usuarios.find((u) => u.rol === 'Administrador')?._id || null;
  // Primer candidato activo; si ninguno, un Administrador.
  const elegir = (...candidatos) => {
    for (const c of candidatos) {
      const id = c?._id || c;
      if (id && activos.has(String(id))) return id;
    }
    return admin;
  };
  const ctx = { empresa, hoy, elegir };

  await cerrarResueltos(ctx);
  await Promise.all([
    reglaCobro(ctx), reglaProveedor(ctx), reglaDocumentos(ctx), reglaRegreso(ctx),
    reglaProspecto(ctx), reglaRecompra(ctx), reglaCumpleanos(ctx),
  ]);
}

// Claves ya generadas (de una lista de candidatas).
async function yaGeneradas(empresa, claves) {
  if (!claves.length) return new Set();
  return new Set(await PendienteAutomatico.distinct('clave', { empresa, clave: { $in: claves } }));
}

// Registra la ocurrencia (si otra instancia ganó, no hace nada) y crea el pendiente.
async function crear(ctx, { clave, regla, registro, candidatos, datos }) {
  const agente = ctx.elegir(...candidatos);
  if (!agente) return null;
  try {
    await PendienteAutomatico.create({ empresa: ctx.empresa, clave, regla, registro });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
  const p = await Pendiente.create({
    empresa: ctx.empresa, agente, creadoPor: SISTEMA, fecha: ctx.hoy, ...datos,
    titulo: datos.titulo.slice(0, 200),
    automatico: { regla, ...(datos.detalleId ? { detalleId: datos.detalleId } : {}) },
  });
  await PendienteAutomatico.updateOne({ empresa: ctx.empresa, clave }, { $set: { pendiente: p._id } });
  return p;
}

const conSaldoCliente = { $expr: { $gt: [{ $subtract: ['$montoTotal', { $ifNull: ['$abonado', 0] }] }, TOLERANCIA] } };

// 1. Cobrar saldo a 20 días; 2º aviso a 12 días (reutiliza el abierto si lo hay).
async function reglaCobro(ctx) {
  const [primero, segundo] = REGLAS.cobroDias;
  const lista = await Reservacion.find({
    empresa: ctx.empresa, estatus: 'Activa', fechaEntrada: { $gte: ctx.hoy, $lte: masDias(ctx.hoy, primero) }, ...conSaldoCliente,
  }).select('idCliente agente fechaEntrada destino montoTotal abonado moneda').populate('idCliente', 'nombreCompleto agente').lean();

  const candidatas = lista.map((r) => {
    const dias = Math.round((r.fechaEntrada - ctx.hoy) / DIA);
    const aviso = dias <= segundo ? segundo : primero;
    return { r, aviso, clave: `cobro${aviso}:${r._id}` };
  });
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((c) => c.clave));

  for (const { r, aviso, clave } of candidatas.filter((c) => !hechas.has(c.clave))) {
    const nombre = r.idCliente?.nombreCompleto || 'el cliente';
    const segundoAviso = aviso === segundo;
    const titulo = `${segundoAviso ? '2º aviso · ' : ''}Cobrar saldo a ${nombre} · viaja ${fechaCorta(r.fechaEntrada)}`;
    const detalle = `Saldo de ${dinero(r.montoTotal - (r.abonado || 0), r.moneda)} (${r.destino}).`;

    if (segundoAviso) {
      // Si sigue abierto el primer aviso, se actualiza en vez de crear otro.
      const abierto = await Pendiente.findOne({ empresa: ctx.empresa, reservacion: r._id, 'automatico.regla': 'cobro', estatus: 'pendiente' });
      if (abierto) {
        try {
          await PendienteAutomatico.create({ empresa: ctx.empresa, clave, regla: 'cobro', registro: r._id, pendiente: abierto._id });
        } catch (err) {
          if (err.code === 11000) continue;
          throw err;
        }
        abierto.set({ titulo, detalle, fecha: ctx.hoy });
        await abierto.save();
        continue;
      }
    }
    await crear(ctx, {
      clave, regla: 'cobro', registro: r._id, candidatos: [r.agente, r.idCliente?.agente],
      datos: { titulo, detalle, tipo: 'pago', reservacion: r._id, cliente: r.idCliente?._id },
    });
  }
}

// 2. Pagar al proveedor (por servicio) a 15 días del viaje.
async function reglaProveedor(ctx) {
  const lista = await Reservacion.find({
    empresa: ctx.empresa, estatus: 'Activa', fechaEntrada: { $gte: ctx.hoy, $lte: masDias(ctx.hoy, REGLAS.proveedorDias) },
  }).select('idCliente agente fechaEntrada moneda detalleReservacion')
    .populate('idCliente', 'nombreCompleto agente').populate('detalleReservacion.idProveedor', 'nombreProveedor').lean();

  const candidatas = [];
  for (const r of lista) {
    for (const d of r.detalleReservacion || []) {
      if (saldoDe(d) > TOLERANCIA) candidatas.push({ r, d, clave: `proveedor:${r._id}:${d._id}` });
    }
  }
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((c) => c.clave));
  for (const { r, d, clave } of candidatas.filter((c) => !hechas.has(c.clave))) {
    const proveedor = d.idProveedor?.nombreProveedor || 'el proveedor';
    await crear(ctx, {
      clave, regla: 'proveedor', registro: r._id, candidatos: [r.agente, r.idCliente?.agente],
      datos: {
        titulo: `Pagar a ${proveedor} (${d.claveReservacion}) · ${r.idCliente?.nombreCompleto || 'cliente'} viaja ${fechaCorta(r.fechaEntrada)}`,
        detalle: `Saldo con el proveedor: ${dinero(saldoDe(d), r.moneda)}.`,
        tipo: 'proveedor', reservacion: r._id, cliente: r.idCliente?._id, detalleId: d._id,
      },
    });
  }
}

const documentosPendientes = (r) => (r.documentos ?? DOCUMENTOS_BASE.map((nombre) => ({ nombre, estatus: 'Pendiente' })))
  .filter((d) => d.estatus === 'Pendiente').map((d) => d.nombre);

// 3. Documentos pendientes a 10 días del viaje.
async function reglaDocumentos(ctx) {
  const lista = await Reservacion.find({
    empresa: ctx.empresa, estatus: 'Activa', fechaEntrada: { $gte: ctx.hoy, $lte: masDias(ctx.hoy, REGLAS.documentosDias) },
  }).select('idCliente agente fechaEntrada documentos').populate('idCliente', 'nombreCompleto agente').lean();

  const candidatas = lista.map((r) => ({ r, faltan: documentosPendientes(r), clave: `documentos:${r._id}` })).filter((c) => c.faltan.length);
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((c) => c.clave));
  for (const { r, faltan, clave } of candidatas.filter((c) => !hechas.has(c.clave))) {
    await crear(ctx, {
      clave, regla: 'documentos', registro: r._id, candidatos: [r.agente, r.idCliente?.agente],
      datos: {
        titulo: `Enviar documentos a ${r.idCliente?.nombreCompleto || 'el cliente'} · viaja ${fechaCorta(r.fechaEntrada)}`,
        detalle: `Pendientes: ${faltan.join(', ')}.`,
        tipo: 'documentos', reservacion: r._id, cliente: r.idCliente?._id,
      },
    });
  }
}

// 4. Bienvenida de regreso: el día después de la fecha de salida.
async function reglaRegreso(ctx) {
  const lista = await Reservacion.find({
    empresa: ctx.empresa, estatus: { $in: ['Activa', 'Completada'] },
    fechaSalida: { $gte: masDias(ctx.hoy, -REGLAS.regresoVentana), $lt: ctx.hoy },
  }).select('idCliente agente destino').populate('idCliente', 'nombreCompleto agente').lean();

  const candidatas = lista.map((r) => ({ r, clave: `regreso:${r._id}` }));
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((c) => c.clave));
  for (const { r, clave } of candidatas.filter((c) => !hechas.has(c.clave))) {
    await crear(ctx, {
      clave, regla: 'regreso', registro: r._id, candidatos: [r.agente, r.idCliente?.agente],
      datos: {
        titulo: `Preguntar a ${r.idCliente?.nombreCompleto || 'el cliente'} cómo le fue en ${r.destino} y pedir reseña`,
        tipo: 'viaje', reservacion: r._id, cliente: r.idCliente?._id,
      },
    });
  }
}

// 5. Prospecto olvidado: sin pendientes abiertos ni movimiento en 10 días.
async function reglaProspecto(ctx) {
  const limite = new Date(Date.now() - REGLAS.prospectoDias * DIA);
  const [conActividad, avisados] = await Promise.all([
    Pendiente.distinct('prospecto', { empresa: ctx.empresa, prospecto: { $ne: null }, $or: [{ estatus: 'pendiente' }, { updatedAt: { $gte: limite } }] }),
    PendienteAutomatico.distinct('registro', { empresa: ctx.empresa, regla: 'prospecto', creadoEn: { $gte: limite } }),
  ]);
  const lista = await Prospecto.find({
    empresa: ctx.empresa, estatus: 'prospecto',
    updatedAt: { $lte: limite, $gte: new Date(Date.now() - REGLAS.prospectoMaxDias * DIA) },
    _id: { $nin: [...conActividad, ...avisados] },
  }).select('nombreCompleto agente updatedAt').limit(100).lean();

  const hoyTexto = ctx.hoy.toISOString().slice(0, 10);
  for (const p of lista) {
    const dias = Math.floor((Date.now() - p.updatedAt.getTime()) / DIA);
    await crear(ctx, {
      clave: `prospecto:${p._id}:${hoyTexto}`, regla: 'prospecto', registro: p._id, candidatos: [p.agente],
      datos: { titulo: `Retomar a ${p.nombreCompleto} (sin actividad hace ${dias} días)`, tipo: 'cotizacion', prospecto: p._id },
    });
  }
}

// 6. Recompra: su último viaje fue hace 11 meses (ventana de un mes) y no tiene otro.
async function reglaRecompra(ctx) {
  const y = ctx.hoy.getUTCFullYear();
  const m = ctx.hoy.getUTCMonth();
  const d = ctx.hoy.getUTCDate();
  const desde = new Date(Date.UTC(y, m - REGLAS.recompraMeses - 1, d));
  const hasta = new Date(Date.UTC(y, m - REGLAS.recompraMeses, d));

  const ultimos = await Reservacion.aggregate([
    { $match: { empresa: ctx.empresa, estatus: { $ne: 'Cancelada' } } },
    { $sort: { fechaEntrada: -1 } },
    { $group: { _id: '$idCliente', ultima: { $first: '$fechaEntrada' }, destino: { $first: '$destino' }, reservacion: { $first: '$_id' } } },
    { $match: { ultima: { $gt: desde, $lte: hasta } } },
  ]);
  const candidatas = ultimos.map((u) => ({ u, clave: `recompra:${u._id}:${u.reservacion}` }));
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((c) => c.clave));
  const pendientes = candidatas.filter((c) => !hechas.has(c.clave));
  if (!pendientes.length) return;
  const clientes = await Cliente.find({ _id: { $in: pendientes.map((c) => c.u._id) }, empresa: ctx.empresa, estatus: 'Activo' }).select('nombreCompleto agente').lean();
  const porId = new Map(clientes.map((c) => [String(c._id), c]));

  for (const { u, clave } of pendientes) {
    const c = porId.get(String(u._id));
    if (!c) continue;
    await crear(ctx, {
      clave, regla: 'recompra', registro: c._id, candidatos: [c.agente],
      datos: { titulo: `Ofrecer un nuevo viaje a ${c.nombreCompleto} (hace un año fue a ${u.destino})`, tipo: 'otro', cliente: c._id },
    });
  }
}

// 7. Cumpleaños del cliente (hoy o hasta 2 días antes, si nadie entró ese día).
async function reglaCumpleanos(ctx) {
  const dias = [];
  for (let k = 0; k <= REGLAS.cumpleVentana; k++) dias.push(masDias(ctx.hoy, -k));
  const claves = dias.map((f) => f.toISOString().slice(5, 10));
  // En años no bisiestos, quien nació un 29 de febrero se felicita el 28.
  const anio = ctx.hoy.getUTCFullYear();
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  if (!bisiesto && claves.includes('02-28')) claves.push('02-29');

  const lista = await Cliente.find({
    empresa: ctx.empresa, estatus: 'Activo', fechaNacimiento: { $ne: null },
    $expr: { $in: [{ $dateToString: { format: '%m-%d', date: '$fechaNacimiento' } }, claves] },
  }).select('nombreCompleto agente').lean();

  const candidatas = lista.map((c) => ({ c, clave: `cumpleanos:${c._id}:${anio}` }));
  const hechas = await yaGeneradas(ctx.empresa, candidatas.map((x) => x.clave));
  for (const { c, clave } of candidatas.filter((x) => !hechas.has(x.clave))) {
    await crear(ctx, {
      clave, regla: 'cumpleanos', registro: c._id, candidatos: [c.agente],
      datos: { titulo: `Felicitar a ${c.nombreCompleto} por su cumpleaños`, tipo: 'otro', cliente: c._id },
    });
  }
}

// Cierra los automáticos cuya condición ya se resolvió.
async function cerrarResueltos(ctx) {
  const abiertos = await Pendiente.find({
    empresa: ctx.empresa, estatus: 'pendiente', 'automatico.regla': { $in: ['cobro', 'proveedor', 'documentos', 'prospecto', 'recompra'] },
  }).select('automatico reservacion prospecto cliente createdAt').lean();
  if (!abiertos.length) return;

  const ids = (campo) => [...new Set(abiertos.map((p) => p[campo]).filter(Boolean).map(String))];
  const [reservaciones, prospectos] = await Promise.all([
    Reservacion.find({ _id: { $in: ids('reservacion') } }).select('estatus montoTotal abonado detalleReservacion documentos').lean(),
    Prospecto.find({ _id: { $in: ids('prospecto') } }).select('estatus').lean(),
  ]);
  const res = new Map(reservaciones.map((r) => [String(r._id), r]));
  const pros = new Map(prospectos.map((p) => [String(p._id), p]));

  // Recompra: el cliente registró una reservación después de crearse el pendiente.
  const recompras = abiertos.filter((p) => p.automatico.regla === 'recompra' && p.cliente);
  const conViajeNuevo = new Set();
  for (const p of recompras) {
    if (await Reservacion.exists({ empresa: ctx.empresa, idCliente: p.cliente, estatus: { $ne: 'Cancelada' }, createdAt: { $gt: p.createdAt } })) {
      conViajeNuevo.add(String(p._id));
    }
  }

  const resuelto = (p) => {
    const r = p.reservacion && res.get(String(p.reservacion));
    switch (p.automatico.regla) {
      case 'cobro':
        return !r || r.estatus !== 'Activa' || r.montoTotal - (r.abonado || 0) <= TOLERANCIA;
      case 'proveedor': {
        const d = r?.detalleReservacion?.find((x) => String(x._id) === String(p.automatico.detalleId));
        return !r || r.estatus !== 'Activa' || !d || saldoDe(d) <= TOLERANCIA;
      }
      case 'documentos':
        return !r || r.estatus !== 'Activa' || documentosPendientes(r).length === 0;
      case 'prospecto':
        return pros.get(String(p.prospecto))?.estatus !== 'prospecto';
      case 'recompra':
        return conViajeNuevo.has(String(p._id));
      default:
        return false;
    }
  };
  const cerrar = abiertos.filter(resuelto).map((p) => p._id);
  if (cerrar.length) {
    await Pendiente.updateMany({ _id: { $in: cerrar }, estatus: 'pendiente' }, { $set: { estatus: 'hecho', completadoEn: new Date(), completadoPor: SISTEMA } });
  }
}
