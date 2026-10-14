import { Router } from 'express';
import { Cliente, registrarCambios } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion } from '../middleware/tenant.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filtroBase = q
      ? {
          $or: [
            { nombreCompleto: new RegExp(q, 'i') },
            { correo: new RegExp(q, 'i') },
            { ciudad: new RegExp(q, 'i') },
          ],
        }
      : {};
    const filter = alcanceEmpresa(req, filtroBase);
    const clientes = await Cliente.find(filter).sort({ createdAt: -1 });
    res.json(clientes);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!perteneceAlAlcance(cliente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para ver este cliente.' });
    }
    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    // La empresa nunca se toma del body: siempre es la de la sesión de quien crea,
    // igual que un Administrador da de alta Agentes para su propia empresa.
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear clientes.');
    const cliente = await Cliente.create({ ...req.body, empresa });
    res.status(201).json(cliente);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const anterior = await Cliente.findById(req.params.id);
    if (!anterior) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!perteneceAlAlcance(anterior, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar clientes de otra empresa.' });
    }

    // Un Agente puede editar clientes de su empresa, pero no darlos de baja.
    if (req.body.estatus === 'Baja' && req.agente.rol === 'Agente') {
      return res.status(403).json({ error: 'No tienes permiso para dar de baja clientes.' });
    }

    const anteriorPlano = anterior.toObject();

    // La empresa de un cliente no se reasigna desde este endpoint.
    const { empresa, ...cambios } = req.body;

    const cliente = await Cliente.findByIdAndUpdate(req.params.id, cambios, {
      new: true,
      runValidators: true,
    });

    await registrarCambios({
      entidad: 'Cliente',
      entidadId: cliente._id,
      empresa: anteriorPlano.empresa,
      anterior: anteriorPlano,
      nuevo: cambios,
      usuario: req.agente
        ? { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre }
        : undefined,
    });

    res.json(cliente);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!perteneceAlAlcance(cliente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar clientes de otra empresa.' });
    }
    await cliente.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
