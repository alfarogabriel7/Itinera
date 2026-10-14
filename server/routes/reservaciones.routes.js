import { Router } from 'express';
import { Reservacion, Cliente, Proveedor } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, bloquearSuperAdmin } from '../middleware/tenant.js';

const router = Router();

const POPULATE_CLIENTE = 'idCliente';
const POPULATE_AGENTE = 'agente';
const POPULATE_PROVEEDOR = 'detalleReservacion.idProveedor';
const MSG_SUPERADMIN = 'El rol superAdmin no puede consultar ni gestionar reservaciones.';

router.get('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const filtroBase = {};
    if (req.query.idCliente) filtroBase.idCliente = req.query.idCliente;
    const filter = alcanceEmpresa(req, filtroBase, { porAgente: true });

    const reservaciones = await Reservacion.find(filter)
      .populate(POPULATE_CLIENTE, 'nombreCompleto correo')
      .populate(POPULATE_AGENTE, 'nombre userId')
      .populate(POPULATE_PROVEEDOR, 'nombreProveedor')
      .sort({ createdAt: -1 });
    res.json(reservaciones);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const reservacion = await Reservacion.findById(req.params.id)
      .populate(POPULATE_CLIENTE, 'nombreCompleto correo')
      .populate(POPULATE_AGENTE, 'nombre userId')
      .populate(POPULATE_PROVEEDOR, 'nombreProveedor');
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta reservación.' });
    }
    res.json(reservacion);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear reservaciones.');

    const { idCliente, fechaEntrada, fechaSalida, destino, descripcion, montoTotal, notas, detalleReservacion } = req.body;

    // El cliente elegido debe pertenecer a la misma empresa de la sesión
    // (la dependencia real es: primero empresa, luego cliente).
    const cliente = await Cliente.findById(idCliente);
    if (!cliente || String(cliente.empresa) !== String(empresa)) {
      return res.status(400).json({ error: 'El cliente seleccionado no pertenece a tu empresa.' });
    }

    // Cada proveedor del detalle también debe pertenecer a la misma empresa.
    const idsProveedor = (detalleReservacion || []).map((d) => d.idProveedor);
    if (idsProveedor.length > 0) {
      const proveedoresValidos = await Proveedor.countDocuments({
        _id: { $in: idsProveedor },
        empresa,
      });
      if (proveedoresValidos !== new Set(idsProveedor.map(String)).size) {
        return res.status(400).json({ error: 'Uno o más proveedores seleccionados no pertenecen a tu empresa.' });
      }
    }

    const reservacion = await Reservacion.create({
      empresa,
      agente: req.agente.id,
      idCliente,
      fechaEntrada,
      fechaSalida,
      destino,
      descripcion,
      montoTotal,
      notas,
      detalleReservacion,
    });
    res.status(201).json(reservacion);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const reservacion = await Reservacion.findById(req.params.id);
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta reservación.' });
    }

    // La empresa y el agente que registró la reservación no se reasignan desde aquí.
    const { empresa, agente, ...cambios } = req.body;

    Object.assign(reservacion, cambios);
    await reservacion.save();
    res.json(reservacion);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const reservacion = await Reservacion.findById(req.params.id);
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta reservación.' });
    }
    await reservacion.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
