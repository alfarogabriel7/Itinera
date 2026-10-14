import { Router } from 'express';
import { Agente } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance } from '../middleware/tenant.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filtroBase = q ? { nombre: new RegExp(q, 'i') } : {};
    const filter = alcanceEmpresa(req, filtroBase);
    const agentes = await Agente.find(filter).populate('empresa', 'nombreEmpresa').sort({ createdAt: -1 });
    res.json(agentes);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const agente = await Agente.findById(req.params.id).populate('empresa', 'nombreEmpresa');
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req)) {
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
    if (solicitante.rol !== 'superAdmin') {
      const err = new Error('Solo un superAdmin puede crear administradores.');
      err.status = 403;
      throw err;
    }
    if (!empresaSolicitada) {
      const err = new Error('Debes seleccionar la empresa para el administrador.');
      err.status = 400;
      throw err;
    }
    const existente = await Agente.findOne({ empresa: empresaSolicitada, rol: 'Administrador' });
    if (existente) {
      const err = new Error('Ya existe un administrador para esta empresa.');
      err.status = 409;
      throw err;
    }
    return empresaSolicitada;
  }

  if (rol === 'Agente') {
    if (solicitante.rol !== 'Administrador') {
      const err = new Error('Solo un administrador puede crear agentes.');
      err.status = 403;
      throw err;
    }
    if (!solicitante.empresa) {
      const err = new Error('Tu sesión no tiene una empresa asociada.');
      err.status = 400;
      throw err;
    }
    return solicitante.empresa;
  }

  const err = new Error('Rol inválido para dar de alta.');
  err.status = 400;
  throw err;
}

router.post('/', async (req, res, next) => {
  try {
    const { nombre, userId, rol, estatus, password, empresa } = req.body;
    const empresaFinal = await resolverEmpresaParaAlta(rol, empresa, req.agente);
    const agente = await Agente.create({ nombre, userId, rol, estatus, password, empresa: empresaFinal });
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
    if (req.agente.rol === 'Agente') {
      return res.status(403).json({ error: 'No tienes permiso para editar agentes.' });
    }

    const agente = await Agente.findById(req.params.id);
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar agentes de otra empresa.' });
    }

    const { nombre, userId, rol, estatus, password, empresa } = req.body;
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
        return res.status(403).json({ error: 'Solo un superAdmin puede cambiar el rol o la empresa de un agente.' });
      }
      const rolDestino = rol !== undefined ? rol : agente.rol;
      const empresaDestino = empresa !== undefined ? empresa : agente.empresa;
      if (rolDestino === 'Administrador') {
        const duplicado = await Agente.findOne({
          empresa: empresaDestino,
          rol: 'Administrador',
          _id: { $ne: agente._id },
        });
        if (duplicado) {
          return res.status(409).json({ error: 'Ya existe un administrador para esta empresa.' });
        }
      }
      if (rol !== undefined) agente.rol = rol;
      if (empresa !== undefined) agente.empresa = empresa;
    }

    await agente.save();
    res.json(agente);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.agente.rol === 'Agente') {
      return res.status(403).json({ error: 'No tienes permiso para eliminar agentes.' });
    }

    const agente = await Agente.findById(req.params.id);
    if (!agente) return res.status(404).json({ error: 'Agente no encontrado' });
    if (!perteneceAlAlcance(agente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar agentes de otra empresa.' });
    }

    await agente.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
