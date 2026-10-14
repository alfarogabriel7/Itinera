import { Router } from 'express';
import { Prospecto, Cliente } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, bloquearSuperAdmin } from '../middleware/tenant.js';

const router = Router();

const MSG_SUPERADMIN = 'El rol superAdmin no puede consultar ni gestionar prospectos.';

router.get('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const { q } = req.query;
    // El listado principal siempre descarta los que ya se convirtieron a cliente.
    const filtroBase = { estatus: 'prospecto' };
    if (q) {
      filtroBase.$or = [
        { nombreCompleto: new RegExp(q, 'i') },
        { correo: new RegExp(q, 'i') },
        { ciudad: new RegExp(q, 'i') },
      ];
    }
    const filter = alcanceEmpresa(req, filtroBase, { porAgente: true });

    const prospectos = await Prospecto.find(filter)
      .populate('agente', 'nombre')
      .sort({ createdAt: -1 });
    res.json(prospectos);
  } catch (err) {
    next(err);
  }
});

// Solo para Administrador: prospectos registrados este mes y cuántos de esos
// ya se convirtieron a cliente.
router.get('/estadisticas', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;
    if (req.agente.rol !== 'Administrador') {
      return res.status(403).json({ error: 'Solo un Administrador puede consultar las estadísticas de prospectos.' });
    }

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);

    const filtroMes = { empresa: req.agente.empresa, fechaRegistro: { $gte: inicioMes, $lte: finMes } };
    const [totalMes, prospectosMes, convertidosMes] = await Promise.all([
      Prospecto.countDocuments(filtroMes),
      Prospecto.countDocuments({ ...filtroMes, estatus: 'prospecto' }),
      Prospecto.countDocuments({ ...filtroMes, estatus: 'cliente' }),
    ]);

    res.json({ inicioMes, finMes, totalMes, prospectosMes, convertidosMes });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const prospecto = await Prospecto.findById(req.params.id).populate('agente', 'nombre');
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    if (!perteneceAlAlcance(prospecto, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para ver este prospecto.' });
    }
    res.json(prospecto);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear prospectos.');

    const { nombreCompleto, correo, telefono, direccion, fechaNacimiento, ciudad, pais, notas } = req.body;
    const prospecto = await Prospecto.create({
      empresa,
      agente: req.agente.id,
      nombreCompleto,
      correo,
      telefono,
      direccion,
      fechaNacimiento,
      ciudad,
      pais,
      notas,
      // estatus y fechaRegistro los define siempre el servidor (default del esquema).
    });
    res.status(201).json(prospecto);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const prospecto = await Prospecto.findById(req.params.id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    if (!perteneceAlAlcance(prospecto, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para editar este prospecto.' });
    }

    // empresa, agente, estatus y fechaRegistro no se reasignan desde aquí.
    const { empresa, agente, estatus, fechaRegistro, ...cambios } = req.body;
    Object.assign(prospecto, cambios);
    await prospecto.save();
    res.json(prospecto);
  } catch (err) {
    next(err);
  }
});

// Da de alta un Cliente real con los datos del prospecto (misma empresa) y
// marca el prospecto como "cliente" para que salga del listado principal.
router.post('/:id/convertir', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const prospecto = await Prospecto.findById(req.params.id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    if (!perteneceAlAlcance(prospecto, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para convertir este prospecto.' });
    }
    if (prospecto.estatus === 'cliente') {
      return res.status(409).json({ error: 'Este prospecto ya fue convertido a cliente.' });
    }

    const cliente = await Cliente.create({
      empresa: prospecto.empresa,
      nombreCompleto: prospecto.nombreCompleto,
      correo: prospecto.correo,
      telefono: prospecto.telefono,
      direccion: prospecto.direccion,
      fechaNacimiento: prospecto.fechaNacimiento,
      ciudad: prospecto.ciudad,
      pais: prospecto.pais,
      estatus: 'Activo',
    });

    prospecto.estatus = 'cliente';
    await prospecto.save();

    res.json({ prospecto, cliente });
  } catch (err) {
    next(err);
  }
});

export default router;
