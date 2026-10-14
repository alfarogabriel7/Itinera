import { Router } from 'express';
import { Pago, Reservacion } from '../../database/index.js';
import { alcanceEmpresa, perteneceAlAlcance, bloquearSuperAdmin } from '../middleware/tenant.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no puede consultar pagos.')) return;

    const { idReservacion } = req.query;
    const filter = alcanceEmpresa(req, idReservacion ? { idReservacion } : {}, { porAgente: true });
    const pagos = await Pago.find(filter).sort({ fecha: -1 });
    res.json(pagos);
  } catch (err) {
    next(err);
  }
});

// Resumen financiero de una reservación: costo total, abonado y saldo pendiente.
router.get('/resumen/:idReservacion', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no puede consultar pagos.')) return;

    const reservacion = await Reservacion.findById(req.params.idReservacion).populate(
      'idCliente',
      'nombreCompleto'
    );
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para consultar pagos de esta reservación.' });
    }

    const pagos = await Pago.find({ idReservacion: reservacion._id });
    const total = reservacion.detalleReservacion.reduce((acc, d) => acc + d.totalReservacion, 0);
    const pagado = pagos.reduce((acc, p) => acc + p.monto, 0);

    res.json({
      cliente: reservacion.idCliente?.nombreCompleto,
      destino: reservacion.destino,
      total,
      pagado,
      saldo: total - pagado,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no puede registrar pagos.')) return;

    const { idReservacion, monto, formaPago } = req.body;
    const reservacion = await Reservacion.findById(idReservacion);
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para registrar pagos de esta reservación.' });
    }

    const total = reservacion.detalleReservacion.reduce((acc, d) => acc + d.totalReservacion, 0);
    const pagosPrevios = await Pago.find({ idReservacion });
    const pagadoPrevio = pagosPrevios.reduce((acc, p) => acc + p.monto, 0);

    if (pagadoPrevio + Number(monto) > total) {
      return res.status(400).json({ error: 'El monto excede el saldo pendiente de la reservación' });
    }

    const pago = await Pago.create({
      idReservacion,
      monto,
      formaPago,
      empresa: reservacion.empresa,
      agente: req.agente.id,
    });
    res.status(201).json(pago);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, 'El rol superAdmin no puede eliminar pagos.')) return;

    const pago = await Pago.findById(req.params.id);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (!perteneceAlAlcance(pago, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este pago.' });
    }
    await pago.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
