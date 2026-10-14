import { Router } from 'express';
import { Proveedor, registrarCambios } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion } from '../middleware/tenant.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filtroBase = q ? { nombreProveedor: new RegExp(q, 'i') } : {};
    const filter = alcanceEmpresa(req, filtroBase);
    const proveedores = await Proveedor.find(filter).sort({ createdAt: -1 });
    res.json(proveedores);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findById(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!perteneceAlAlcance(proveedor, req)) {
      return res.status(403).json({ error: 'No tienes permiso para ver este proveedor.' });
    }
    res.json(proveedor);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    // La empresa nunca se toma del body: siempre es la de la sesión de quien crea.
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear proveedores.');
    const proveedor = await Proveedor.create({ ...req.body, empresa });
    res.status(201).json(proveedor);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const anterior = await Proveedor.findById(req.params.id);
    if (!anterior) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!perteneceAlAlcance(anterior, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar proveedores de otra empresa.' });
    }

    // Un Agente puede editar proveedores de su empresa, pero no darlos de baja.
    if (req.body.estatus === 'Baja' && req.agente.rol === 'Agente') {
      return res.status(403).json({ error: 'No tienes permiso para dar de baja proveedores.' });
    }

    // La empresa de un proveedor no se reasigna desde este endpoint.
    const { empresa, ...cambios } = req.body;
    const anteriorPlano = anterior.toObject();

    const proveedor = await Proveedor.findByIdAndUpdate(req.params.id, cambios, {
      new: true,
      runValidators: true,
    });

    await registrarCambios({
      entidad: 'Proveedor',
      entidadId: proveedor._id,
      empresa: anteriorPlano.empresa,
      anterior: anteriorPlano,
      nuevo: cambios,
      usuario: req.agente
        ? { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre }
        : undefined,
    });

    res.json(proveedor);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findById(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!perteneceAlAlcance(proveedor, req)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar proveedores de otra empresa.' });
    }
    await proveedor.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
