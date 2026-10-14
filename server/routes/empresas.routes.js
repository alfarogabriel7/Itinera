import { Router } from 'express';
import { Empresa, Agente, registrarCambios } from '../../database/index.js';

const router = Router();

// El módulo de Empresas solo lo administra el superAdmin.
router.use((req, res, next) => {
  if (req.agente?.rol !== 'superAdmin') {
    return res.status(403).json({ error: 'Solo un superAdmin puede administrar empresas.' });
  }
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = q
      ? {
          $or: [
            { nombreEmpresa: new RegExp(q, 'i') },
            { rfc: new RegExp(q, 'i') },
            { correo: new RegExp(q, 'i') },
          ],
        }
      : {};
    const empresas = await Empresa.find(filter).sort({ createdAt: -1 });
    res.json(empresas);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const empresa = await Empresa.create(req.body);
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const anterior = await Empresa.findById(req.params.id);
    if (!anterior) return res.status(404).json({ error: 'Empresa no encontrada' });
    const anteriorPlano = anterior.toObject();

    // No se puede dar de baja una empresa que todavía tiene agentes activos
    // (sin importar si son Administrador o Agente).
    if (req.body.estatus === 'Baja' && anterior.estatus !== 'Baja') {
      const tieneAgentesActivos = await Agente.exists({ empresa: anterior._id, estatus: 'Activo' });
      if (tieneAgentesActivos) {
        return res.status(409).json({ error: 'No se puede dar de baja: la empresa tiene agentes con estatus Activo.' });
      }
    }

    const empresa = await Empresa.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    await registrarCambios({
      entidad: 'Empresa',
      entidadId: empresa._id,
      empresa: empresa._id,
      anterior: anteriorPlano,
      nuevo: req.body,
      usuario: req.agente
        ? { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre }
        : undefined,
    });

    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const empresa = await Empresa.findByIdAndDelete(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
