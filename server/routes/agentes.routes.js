import { Router } from 'express';
import { Agente, Empresa, Cliente, Prospecto, Reservacion, Pago, registrarCambios, registrarEvento } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, regexBusqueda, usuarioDeLaSesion, errorHttp } from '../middleware/tenant.js';
import { paginar, ordenDe } from '../utils/paginacion.js';

const router = Router();

// Un Agente no administra usuarios.
router.use((req, res, next) => {
  if (req.agente.rol === 'Agente' && req.method !== 'GET') {
    return res.status(403).json({ error: 'No tienes permiso para administrar agentes.' });
  }
  next();
});

// La empresa destino debe existir y estar activa.
async function validarEmpresa(id) {
  const empresa = id && (await Empresa.findById(id).select('estatus'));
  if (!empresa) throw errorHttp(400, 'La empresa seleccionada no existe.');
  if (empresa.estatus !== 'Activo') throw errorHttp(400, 'La empresa seleccionada no está activa.');
}

// GET /api/agentes?q=&estatus=Activo&rol=&orden=nombre&pagina=&porPagina=
router.get('/', async (req, res, next) => {
  try {
    const regex = regexBusqueda(req.query.q);
    const filtroBase = {};
    if (regex) {
      // La búsqueda también cubre la columna Empresa (por su nombre).
      const empresas = await Empresa.find({ nombreEmpresa: regex }).select('_id').lean();
      filtroBase.$or = [{ nombre: regex }, { userId: regex }, { empresa: { $in: empresas.map((e) => e._id) } }];
    }
    if (req.query.estatus) filtroBase.estatus = String(req.query.estatus);
    if (req.query.rol) filtroBase.rol = String(req.query.rol);
    // El superAdmin solo gestiona a los Administradores de cada empresa; los
    // agentes los da de alta y administra cada empresa.
    if (req.agente.rol === 'superAdmin') filtroBase.rol = 'Administrador';
    const orden = ordenDe(req, { nombre: { nombre: 1 } }, { createdAt: -1 });
    res.json(await paginar(Agente, alcanceEmpresa(req, filtroBase), req, { orden, populate: [['empresa', 'nombreEmpresa']] }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const agente = await Agente.findById(req.params.id).populate('empresa', 'nombreEmpresa');
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req) || (req.agente.rol === 'superAdmin' && agente.rol === 'Agente')) {
      return res.status(403).json({ error: 'No tienes permiso para ver este agente.' });
    }
    res.json(agente);
  } catch (err) {
    next(err);
  }
});

// Valida a quién le corresponde crear cada rol y de dónde sale la empresa:
// - Administrador: solo lo crea un superAdmin, y la empresa se elige explícitamente
//   (un administrador por empresa, reforzado también por el índice único parcial).
// - Agente: solo lo crea un Administrador, y la empresa se toma de su propia sesión
//   (se ignora cualquier "empresa" que venga en el body, nunca se confía en el cliente).
async function resolverEmpresaParaAlta(rol, empresaSolicitada, solicitante) {
  if (rol === 'Administrador') {
    if (solicitante.rol !== 'superAdmin') throw errorHttp(403, 'Solo un superAdmin puede crear administradores.');
    if (!empresaSolicitada) throw errorHttp(400, 'Debes seleccionar la empresa para el administrador.');
    await validarEmpresa(empresaSolicitada);
    if (await Agente.exists({ empresa: empresaSolicitada, rol: 'Administrador' })) {
      throw errorHttp(409, 'Ya existe un administrador para esta empresa.');
    }
    return empresaSolicitada;
  }

  if (rol === 'Agente') {
    if (solicitante.rol !== 'Administrador') throw errorHttp(403, 'Solo un administrador puede crear agentes.');
    if (!solicitante.empresa) throw errorHttp(400, 'Tu sesión no tiene una empresa asociada.');
    return solicitante.empresa;
  }

  throw errorHttp(400, 'Rol inválido para dar de alta.');
}

router.post('/', async (req, res, next) => {
  try {
    const { nombre, userId, rol, estatus, password, empresa } = req.body;
    const empresaFinal = await resolverEmpresaParaAlta(rol, empresa, req.agente);
    const agente = await Agente.create({ nombre, userId, rol, estatus, password, empresa: empresaFinal });
    await registrarEvento({
      entidad: 'Agente', entidadId: agente._id, empresa: empresaFinal, evento: 'alta',
      detalle: `${agente.nombre} (${agente.rol})`, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(agente);
  } catch (err) {
    next(err);
  }
});

// Se usa findById + save() (en vez de findByIdAndUpdate) para que el hook
// pre('save') del esquema se dispare y la contraseña nueva quede hasheada,
// y para que el validador de fortaleza de contraseña corra igual que al crear.
router.put('/:id', async (req, res, next) => {
  try {
    const agente = await Agente.findById(req.params.id);
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar agentes de otra empresa.' });
    }

    const { nombre, userId, rol, estatus, password, empresa } = req.body;
    const esUnoMismo = String(agente._id) === req.agente.id;
    if (esUnoMismo && estatus !== undefined && estatus !== 'Activo') {
      throw errorHttp(400, 'No puedes dar de baja tu propio usuario.');
    }

    const anterior = agente.toObject();
    if (nombre !== undefined) agente.nombre = nombre;
    if (userId !== undefined) agente.userId = userId;
    if (estatus !== undefined) agente.estatus = estatus;
    if (password) agente.password = password;

    // Reestructurar rol/empresa es una operación sensible: solo el superAdmin
    // puede hacerlo, y se revalida la regla de "un administrador por empresa".
    const cambiaRol = rol !== undefined && rol !== agente.rol;
    const cambiaEmpresa = empresa !== undefined && String(empresa) !== String(agente.empresa || '');
    if (cambiaRol || cambiaEmpresa) {
      if (req.agente.rol !== 'superAdmin') {
        throw errorHttp(403, 'Solo un superAdmin puede cambiar el rol o la empresa de un agente.');
      }
      const rolDestino = rol !== undefined ? rol : agente.rol;
      const empresaDestino = empresa !== undefined ? empresa : agente.empresa;
      if (rolDestino !== 'superAdmin') await validarEmpresa(empresaDestino);
      // Mover a alguien de empresa con cartera o ventas mezclaría datos de dos empresas.
      if (cambiaEmpresa && (await tieneHistorial(agente._id))) {
        throw errorHttp(409, 'Este agente ya tiene clientes, prospectos o ventas en su empresa; no se puede mover a otra. Desactívalo y crea un usuario nuevo.');
      }
      if (rolDestino === 'Administrador') {
        const duplicado = await Agente.exists({ empresa: empresaDestino, rol: 'Administrador', _id: { $ne: agente._id } });
        if (duplicado) throw errorHttp(409, 'Ya existe un administrador para esta empresa.');
      }
      if (rol !== undefined) agente.rol = rol;
      if (empresa !== undefined) agente.empresa = empresa;
    }

    await agente.save();
    await registrarCambios({
      entidad: 'Agente', entidadId: agente._id, empresa: agente.empresa,
      anterior, nuevo: { nombre, userId, rol, estatus, empresa }, usuario: usuarioDeLaSesion(req),
    });
    if (password) {
      await registrarEvento({
        entidad: 'Agente', entidadId: agente._id, empresa: agente.empresa,
        evento: 'cambio de contraseña', usuario: usuarioDeLaSesion(req),
      });
    }
    res.json(agente);
  } catch (err) {
    next(err);
  }
});

async function tieneHistorial(idAgente) {
  const consultas = await Promise.all([
    Cliente.exists({ agente: idAgente }),
    Prospecto.exists({ agente: idAgente }),
    Reservacion.exists({ agente: idAgente }),
    Pago.exists({ agente: idAgente }),
  ]);
  return consultas.some(Boolean);
}

// Solo se puede borrar un usuario sin historial (p.ej. dado de alta por error).
// Si ya trabajó, se desactiva: su nombre debe seguir en ventas, cobros y bitácora.
router.delete('/:id', async (req, res, next) => {
  try {
    const agente = await Agente.findById(req.params.id);
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar agentes de otra empresa.' });
    }
    if (String(agente._id) === req.agente.id) throw errorHttp(400, 'No puedes eliminar tu propio usuario.');
    if (await tieneHistorial(agente._id)) {
      throw errorHttp(409, 'Este agente tiene clientes, prospectos o ventas registradas; no se puede eliminar. Cámbialo a estatus Baja.');
    }

    await agente.deleteOne();
    await registrarEvento({
      entidad: 'Agente', entidadId: agente._id, empresa: agente.empresa,
      evento: 'eliminado', detalle: agente.nombre, usuario: usuarioDeLaSesion(req),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
