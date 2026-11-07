import { Router } from 'express';
import mongoose from 'mongoose';
import { Pendiente, Prospecto, Cliente, Reservacion, Agente, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, empresaDeLaSesion, sinSuperAdmin, asegurarMismaEmpresa, usuarioDeLaSesion, errorHttp, idDe,
} from '../middleware/tenant.js';
import { hoyEnMexico } from '../utils/fechas.js';

// Pendientes (módulo "Mi día"). Reglas:
//   - Un Agente ve y maneja sus pendientes (donde él es el responsable).
//   - El Administrador ve los de toda la empresa y puede asignarlos a cualquier agente activo.
//   - Los pendientes de un registro (cliente, prospecto, reservación) los consulta
//     cualquier usuario de la empresa, para atender al cliente si su agente no está.
const router = Router();
router.use(sinSuperAdmin('El rol superAdmin no maneja pendientes de las empresas.'));

const DIA = 24 * 60 * 60 * 1000;
const CAMPOS_EDITABLES = ['titulo', 'detalle', 'tipo', 'hora'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const hoyUTC = () => new Date(`${hoyEnMexico()}T00:00:00Z`);
const esAdmin = (req) => req.agente.rol === 'Administrador';

// 'YYYY-MM-DD' → día de calendario a medianoche UTC (como las fechas de viaje).
function diaDe(texto, campo = 'fecha') {
  const valor = String(texto || '');
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw errorHttp(400, `La ${campo} no es válida.`);
  }
  return fecha;
}

// Solo su responsable o el Administrador modifican un pendiente.
async function cargarPropio(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw errorHttp(400, 'Pendiente inválido.');
  const p = await Pendiente.findById(req.params.id);
  if (!p || idDe(p.empresa) !== String(req.agente.empresa)) throw errorHttp(404, 'Pendiente no encontrado.');
  if (!esAdmin(req) && idDe(p.agente) !== String(req.agente.id)) {
    throw errorHttp(403, 'Solo el responsable del pendiente o el Administrador pueden modificarlo.');
  }
  return p;
}

// Prospecto / cliente / reservación ligados: deben ser de la empresa. Si viene la
// reservación y no el cliente, el cliente es el de la reservación.
async function resolverLigas(req, body) {
  const ligas = {};
  const empresa = req.agente.empresa;
  if (body.prospecto) {
    await asegurarMismaEmpresa(Prospecto, body.prospecto, empresa, 'El prospecto no pertenece a tu empresa.');
    ligas.prospecto = body.prospecto;
  }
  if (body.reservacion) {
    await asegurarMismaEmpresa(Reservacion, body.reservacion, empresa, 'La reservación no pertenece a tu empresa.');
    ligas.reservacion = body.reservacion;
    if (!body.cliente) {
      const r = await Reservacion.findById(body.reservacion).select('idCliente').lean();
      if (r?.idCliente) ligas.cliente = r.idCliente;
    }
  }
  if (body.cliente) {
    await asegurarMismaEmpresa(Cliente, body.cliente, empresa, 'El cliente no pertenece a tu empresa.');
    ligas.cliente = body.cliente;
  }
  return ligas;
}

// Responsable: un Agente siempre es él mismo; el Administrador puede elegir a
// cualquier usuario activo de su empresa.
async function resolverResponsable(req, solicitado) {
  if (!esAdmin(req) || !solicitado) return req.agente.id;
  await asegurarMismaEmpresa(Agente, solicitado, req.agente.empresa,
    'El responsable no pertenece a tu empresa o no está activo.', { estatus: 'Activo' });
  return solicitado;
}

const POPULATE = [
  { path: 'agente', select: 'nombre' },
  { path: 'prospecto', select: 'nombreCompleto telefono estatus' },
  { path: 'cliente', select: 'nombreCompleto telefono' },
  { path: 'reservacion', select: 'destino fechaEntrada fechaSalida estatus' },
];

// Forma que consume la pantalla: fecha como 'YYYY-MM-DD' y un contacto para WhatsApp.
function aFila(p) {
  const contacto = p.cliente || p.prospecto;
  return {
    _id: p._id,
    titulo: p.titulo,
    detalle: p.detalle || '',
    tipo: p.tipo,
    fecha: p.fecha.toISOString().slice(0, 10),
    hora: p.hora || '',
    estatus: p.estatus,
    completadoEn: p.completadoEn || null,
    pospuesto: p.pospuesto || 0,
    agente: p.agente ? { id: p.agente._id, nombre: p.agente.nombre } : null,
    prospecto: p.prospecto ? { id: p.prospecto._id, nombre: p.prospecto.nombreCompleto, estatus: p.prospecto.estatus } : null,
    cliente: p.cliente ? { id: p.cliente._id, nombre: p.cliente.nombreCompleto } : null,
    reservacion: p.reservacion
      ? { id: p.reservacion._id, destino: p.reservacion.destino, fechaEntrada: p.reservacion.fechaEntrada, estatus: p.reservacion.estatus }
      : null,
    contacto: contacto ? { nombre: contacto.nombreCompleto, telefono: contacto.telefono } : null,
  };
}

const porFechaYHora = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.hora || '99:99').localeCompare(b.hora || '99:99'));

// GET /api/pendientes/mi-dia?agente=<id>
// Vencidos (antes de hoy), de hoy (también los ya hechos, para ver el avance) y
// de los próximos 7 días, más las "ventas sin próximo paso" del responsable.
// El Administrador puede ver el día de otro usuario con ?agente=.
router.get('/mi-dia', async (req, res, next) => {
  try {
    const empresa = oid(empresaDeLaSesion(req));
    const responsable = esAdmin(req) && req.query.agente && mongoose.isValidObjectId(req.query.agente)
      ? oid(req.query.agente) : oid(req.agente.id);
    const hoy = hoyUTC();
    const en7 = new Date(hoy.getTime() + 7 * DIA);
    const base = { empresa, agente: responsable };

    const [vencidos, deHoy, proximos] = await Promise.all([
      Pendiente.find({ ...base, estatus: 'pendiente', fecha: { $lt: hoy } }).sort({ fecha: 1 }).limit(200).populate(POPULATE),
      Pendiente.find({ ...base, fecha: hoy }).limit(200).populate(POPULATE),
      Pendiente.find({ ...base, estatus: 'pendiente', fecha: { $gt: hoy, $lte: en7 } }).sort({ fecha: 1 }).limit(200).populate(POPULATE),
    ]);

    // Ventas sin próximo paso: prospectos y reservaciones activas (viaje aún por
    // terminar) del responsable que no tienen ningún pendiente abierto.
    const [conProspecto, conReservacion] = await Promise.all([
      Pendiente.distinct('prospecto', { empresa, estatus: 'pendiente', prospecto: { $ne: null } }),
      Pendiente.distinct('reservacion', { empresa, estatus: 'pendiente', reservacion: { $ne: null } }),
    ]);
    const [prospectos, reservaciones] = await Promise.all([
      Prospecto.find({ empresa, agente: responsable, estatus: 'prospecto', _id: { $nin: conProspecto } })
        .select('nombreCompleto ciudad updatedAt').sort({ updatedAt: 1 }).limit(10).lean(),
      Reservacion.find({ empresa, agente: responsable, estatus: 'Activa', fechaSalida: { $gte: hoy }, _id: { $nin: conReservacion } })
        .select('destino fechaEntrada idCliente updatedAt').populate('idCliente', 'nombreCompleto').sort({ updatedAt: 1 }).limit(10).lean(),
    ]);
    const dias = (f) => Math.max(0, Math.floor((Date.now() - new Date(f).getTime()) / DIA));
    const sinProximoPaso = [
      ...prospectos.map((p) => ({ tipo: 'prospecto', id: p._id, nombre: p.nombreCompleto, detalle: `Prospecto${p.ciudad ? ` · ${p.ciudad}` : ''}`, diasSinActividad: dias(p.updatedAt) })),
      ...reservaciones.map((r) => ({ tipo: 'reservacion', id: r._id, nombre: r.idCliente?.nombreCompleto || '—', detalle: `${r.destino} · Reservación activa`, diasSinActividad: dias(r.updatedAt), idCliente: r.idCliente?._id || null })),
    ].sort((a, b) => b.diasSinActividad - a.diasSinActividad).slice(0, 10);

    res.json({
      hoy: hoyEnMexico(),
      vencidos: vencidos.map(aFila),
      hoyLista: deHoy.map(aFila).sort((a, b) => (a.estatus === b.estatus ? porFechaYHora(a, b) : a.estatus === 'hecho' ? 1 : -1)),
      proximos: proximos.map(aFila).sort(porFechaYHora),
      sinProximoPaso,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pendientes/resumen — contadores del usuario (insignia del menú).
router.get('/resumen', async (req, res, next) => {
  try {
    const base = { empresa: oid(empresaDeLaSesion(req)), agente: oid(req.agente.id), estatus: 'pendiente' };
    const hoy = hoyUTC();
    const [vencidos, deHoy] = await Promise.all([
      Pendiente.countDocuments({ ...base, fecha: { $lt: hoy } }),
      Pendiente.countDocuments({ ...base, fecha: hoy }),
    ]);
    res.json({ vencidos, hoy: deHoy });
  } catch (err) {
    next(err);
  }
});

// GET /api/pendientes?prospecto=|cliente=|reservacion=&estatus=pendiente|hecho
// Pendientes de un registro (cualquier usuario de la empresa los consulta).
router.get('/', async (req, res, next) => {
  try {
    const filtro = {};
    for (const campo of ['prospecto', 'cliente', 'reservacion']) {
      if (req.query[campo]) {
        if (!mongoose.isValidObjectId(req.query[campo])) throw errorHttp(400, 'Registro inválido.');
        filtro[campo] = oid(req.query[campo]);
      }
    }
    if (!Object.keys(filtro).length) throw errorHttp(400, 'Indica de qué registro quieres los pendientes.');
    if (['pendiente', 'hecho'].includes(req.query.estatus)) filtro.estatus = req.query.estatus;
    const lista = await Pendiente.find(alcanceEmpresa(req, filtro)).sort({ estatus: -1, fecha: 1 }).limit(100).populate(POPULATE);
    res.json(lista.map(aFila));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const empresa = empresaDeLaSesion(req);
    const b = req.body || {};
    const datos = {};
    for (const campo of CAMPOS_EDITABLES) if (b[campo] !== undefined && b[campo] !== '') datos[campo] = b[campo];
    const pendiente = await Pendiente.create({
      ...datos,
      ...(await resolverLigas(req, b)),
      empresa,
      agente: await resolverResponsable(req, b.agente),
      fecha: b.fecha ? diaDe(b.fecha) : hoyUTC(),
      creadoPor: usuarioDeLaSesion(req),
    });
    await registrarEvento({
      entidad: 'Pendiente', entidadId: pendiente._id, empresa, evento: 'alta',
      detalle: `${pendiente.titulo} · para el ${pendiente.fecha.toISOString().slice(0, 10)}`, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(aFila(await pendiente.populate(POPULATE)));
  } catch (err) {
    next(err);
  }
});

// Editar título, detalle, tipo, fecha, hora o (Administrador) responsable.
router.put('/:id', async (req, res, next) => {
  try {
    const p = await cargarPropio(req);
    const b = req.body || {};
    const cambios = {};
    for (const campo of CAMPOS_EDITABLES) if (b[campo] !== undefined) cambios[campo] = b[campo] === '' ? undefined : b[campo];
    if (b.fecha !== undefined) cambios.fecha = diaDe(b.fecha);
    if (b.agente !== undefined && String(b.agente) !== idDe(p.agente)) {
      if (!esAdmin(req)) throw errorHttp(403, 'Solo el Administrador puede reasignar pendientes.');
      cambios.agente = await resolverResponsable(req, b.agente);
    }
    const anterior = p.toObject();
    p.set(cambios);
    await p.save();
    await registrarCambios({ entidad: 'Pendiente', entidadId: p._id, empresa: p.empresa, anterior, nuevo: cambios, usuario: usuarioDeLaSesion(req) });
    res.json(aFila(await p.populate(POPULATE)));
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/hecho { hecho: true|false } — marcar como hecho o reabrir.
router.patch('/:id/hecho', async (req, res, next) => {
  try {
    const p = await cargarPropio(req);
    const hecho = req.body?.hecho !== false;
    const anterior = p.estatus;
    p.estatus = hecho ? 'hecho' : 'pendiente';
    p.completadoEn = hecho ? new Date() : undefined;
    p.completadoPor = hecho ? usuarioDeLaSesion(req) : undefined;
    await p.save();
    await registrarCambios({ entidad: 'Pendiente', entidadId: p._id, empresa: p.empresa, anterior: { estatus: anterior }, nuevo: { estatus: p.estatus }, usuario: usuarioDeLaSesion(req) });
    res.json(aFila(await p.populate(POPULATE)));
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/posponer { fecha: 'YYYY-MM-DD' } o { dias: n } — mueve la fecha (nunca antes de hoy).
router.patch('/:id/posponer', async (req, res, next) => {
  try {
    const p = await cargarPropio(req);
    if (p.estatus === 'hecho') throw errorHttp(400, 'El pendiente ya está hecho.');
    const hoy = hoyUTC();
    let nueva;
    if (req.body?.fecha) nueva = diaDe(req.body.fecha, 'nueva fecha');
    else {
      const dias = Math.round(Number(req.body?.dias));
      if (!(dias >= 1 && dias <= 365)) throw errorHttp(400, 'Indica una fecha o cuántos días posponer.');
      nueva = new Date(Math.max(hoy.getTime(), p.fecha.getTime()) + dias * DIA);
    }
    if (nueva < hoy) throw errorHttp(400, 'No se puede posponer a una fecha anterior a hoy.');
    const anterior = p.fecha.toISOString().slice(0, 10);
    p.fecha = nueva;
    p.pospuesto = (p.pospuesto || 0) + 1;
    await p.save();
    await registrarCambios({ entidad: 'Pendiente', entidadId: p._id, empresa: p.empresa, anterior: { fecha: anterior }, nuevo: { fecha: nueva.toISOString().slice(0, 10) }, usuario: usuarioDeLaSesion(req) });
    res.json(aFila(await p.populate(POPULATE)));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const p = await cargarPropio(req);
    await p.deleteOne();
    await registrarEvento({ entidad: 'Pendiente', entidadId: p._id, empresa: p.empresa, evento: 'eliminado', detalle: p.titulo, usuario: usuarioDeLaSesion(req) });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
