import { Router } from 'express';
import mongoose from 'mongoose';
import { Pendiente, Prospecto, Cliente, Reservacion, Agente, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, empresaDeLaSesion, sinSuperAdmin, asegurarMismaEmpresa, usuarioDeLaSesion, errorHttp, idDe,
} from '../middleware/tenant.js';
import { hoyEnMexico } from '../utils/fechas.js';
import { generarPendientesAutomaticos } from '../utils/pendientesAutomaticos.js';

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
    automatico: Boolean(p.automatico?.regla),
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
    await generarPendientesAutomaticos(empresa);
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

// GET /api/pendientes/equipo — vista del Administrador ("Pendientes del equipo"):
//   - carga por agente activo: vencidos, hoy, próximos 7 días y ventas sin próximo paso;
//   - sin asignar: pendientes abiertos cuyo responsable ya no está activo (de baja);
//   - vencidos más antiguos de toda la empresa;
//   - ventas sin próximo paso de todo el equipo (las más olvidadas primero).
router.get('/equipo', async (req, res, next) => {
  try {
    if (!esAdmin(req)) throw errorHttp(403, 'Solo el Administrador ve los pendientes del equipo.');
    const empresa = oid(empresaDeLaSesion(req));
    await generarPendientesAutomaticos(empresa);
    const hoy = hoyUTC();
    const en7 = new Date(hoy.getTime() + 7 * DIA);

    const [usuarios, cargas, conProspecto, conReservacion] = await Promise.all([
      Agente.find({ empresa, rol: { $ne: 'superAdmin' } }).select('nombre estatus rol').sort({ nombre: 1 }).lean(),
      Pendiente.aggregate([
        { $match: { empresa, estatus: 'pendiente', fecha: { $lte: en7 } } },
        { $group: {
          _id: '$agente',
          vencidos: { $sum: { $cond: [{ $lt: ['$fecha', hoy] }, 1, 0] } },
          hoy: { $sum: { $cond: [{ $eq: ['$fecha', hoy] }, 1, 0] } },
          proximos: { $sum: { $cond: [{ $gt: ['$fecha', hoy] }, 1, 0] } },
        } },
      ]),
      Pendiente.distinct('prospecto', { empresa, estatus: 'pendiente', prospecto: { $ne: null } }),
      Pendiente.distinct('reservacion', { empresa, estatus: 'pendiente', reservacion: { $ne: null } }),
    ]);
    const activos = usuarios.filter((u) => u.estatus === 'Activo');
    const idsActivos = activos.map((u) => u._id);

    // Ventas sin próximo paso: conteo por agente y las 15 más olvidadas.
    const filtroP = { empresa, estatus: 'prospecto', _id: { $nin: conProspecto } };
    const filtroR = { empresa, estatus: 'Activa', fechaSalida: { $gte: hoy }, _id: { $nin: conReservacion } };
    const porAgente = [{ $group: { _id: '$agente', n: { $sum: 1 } } }];
    const [sinPasoP, sinPasoR, listaP, listaR, sinAsignar, totalSinAsignar, vencidosAntiguos] = await Promise.all([
      Prospecto.aggregate([{ $match: filtroP }, ...porAgente]),
      Reservacion.aggregate([{ $match: filtroR }, ...porAgente]),
      Prospecto.find(filtroP).select('nombreCompleto ciudad agente updatedAt').populate('agente', 'nombre estatus').sort({ updatedAt: 1 }).limit(15).lean(),
      Reservacion.find(filtroR).select('destino idCliente agente updatedAt').populate('idCliente', 'nombreCompleto').populate('agente', 'nombre estatus')
        .sort({ updatedAt: 1 }).limit(15).lean(),
      Pendiente.find({ empresa, estatus: 'pendiente', agente: { $nin: idsActivos } }).sort({ fecha: 1 }).limit(50).populate(POPULATE),
      Pendiente.countDocuments({ empresa, estatus: 'pendiente', agente: { $nin: idsActivos } }),
      Pendiente.find({ empresa, estatus: 'pendiente', fecha: { $lt: hoy }, agente: { $in: idsActivos } }).sort({ fecha: 1 }).limit(10).populate(POPULATE),
    ]);

    const sinPasoDe = new Map();
    for (const g of [...sinPasoP, ...sinPasoR]) sinPasoDe.set(String(g._id), (sinPasoDe.get(String(g._id)) || 0) + g.n);
    const cargaDe = new Map(cargas.map((c) => [String(c._id), c]));
    const yo = String(req.agente.id);

    const agentes = activos.map((u) => {
      const c = cargaDe.get(String(u._id)) || {};
      return {
        id: u._id, nombre: u.nombre, rol: u.rol, esYo: String(u._id) === yo,
        vencidos: c.vencidos || 0, hoy: c.hoy || 0, proximos: c.proximos || 0, sinProximoPaso: sinPasoDe.get(String(u._id)) || 0,
      };
    }).sort((a, b) => b.vencidos - a.vencidos || (b.hoy + b.proximos) - (a.hoy + a.proximos));

    const dias = (f) => Math.max(0, Math.floor((Date.now() - new Date(f).getTime()) / DIA));
    const agenteDe = (a) => (a ? { id: a._id, nombre: a.nombre, deBaja: a.estatus !== 'Activo' } : null);
    const ventas = [
      ...listaP.map((p) => ({ tipo: 'prospecto', id: p._id, nombre: p.nombreCompleto, detalle: `Prospecto${p.ciudad ? ` · ${p.ciudad}` : ''}`, agente: agenteDe(p.agente), diasSinActividad: dias(p.updatedAt) })),
      ...listaR.map((r) => ({ tipo: 'reservacion', id: r._id, nombre: r.idCliente?.nombreCompleto || '—', detalle: `${r.destino} · Reservación activa`, agente: agenteDe(r.agente), diasSinActividad: dias(r.updatedAt) })),
    ].sort((a, b) => b.diasSinActividad - a.diasSinActividad).slice(0, 15);

    // Totales solo de usuarios activos (los de usuarios de baja cuentan en "Sin asignar").
    const total = (campo) => agentes.reduce((s, a) => s + a[campo], 0);
    res.json({
      hoy: hoyEnMexico(),
      totales: {
        vencidos: total('vencidos'),
        hoy: total('hoy'),
        sinAsignar: totalSinAsignar,
        sinProximoPaso: [...sinPasoDe.values()].reduce((s, n) => s + n, 0), // de todo el equipo, incluso de usuarios de baja
      },
      agentes,
      sinAsignar: sinAsignar.map(aFila),
      vencidosAntiguos: vencidosAntiguos.map((p) => ({ ...aFila(p), diasVencido: Math.round((hoy - p.fecha) / DIA) })),
      ventasSinProximoPaso: ventas,
      usuariosActivos: activos.map((u) => ({ _id: u._id, nombre: u.nombre })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/pendientes/reasignar { de, a } — el Administrador pasa todos los
// pendientes abiertos de un usuario (normalmente uno dado de baja) a otro activo.
router.post('/reasignar', async (req, res, next) => {
  try {
    if (!esAdmin(req)) throw errorHttp(403, 'Solo el Administrador puede reasignar pendientes.');
    const { de, a } = req.body || {};
    if (!mongoose.isValidObjectId(de) || !mongoose.isValidObjectId(a)) throw errorHttp(400, 'Indica de quién y a quién reasignar.');
    if (String(de) === String(a)) throw errorHttp(400, 'Elige a un responsable distinto.');
    const empresa = empresaDeLaSesion(req);
    await asegurarMismaEmpresa(Agente, de, empresa, 'El usuario no pertenece a tu empresa.');
    const destino = await resolverResponsable(req, a);
    const r = await Pendiente.updateMany({ empresa, agente: de, estatus: 'pendiente' }, { $set: { agente: destino } });
    if (r.modifiedCount) {
      const [origen, nuevo] = await Promise.all([Agente.findById(de).select('nombre').lean(), Agente.findById(destino).select('nombre').lean()]);
      await registrarEvento({
        entidad: 'Agente', entidadId: oid(de), empresa, evento: 'pendientes reasignados',
        detalle: `${r.modifiedCount} pendiente(s) de ${origen?.nombre || '—'} a ${nuevo?.nombre || '—'}`, usuario: usuarioDeLaSesion(req),
      });
    }
    res.json({ reasignados: r.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/pendientes/resumen — contadores del usuario (insignia del menú).
router.get('/resumen', async (req, res, next) => {
  try {
    await generarPendientesAutomaticos(empresaDeLaSesion(req));
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
