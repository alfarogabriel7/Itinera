import { Router } from 'express';
import mongoose from 'mongoose';
import { Pago, PagoProveedor, Reservacion, Cliente, Proveedor } from '../../database/index.js';
import { errorHttp } from '../middleware/tenant.js';
import { autorizarPago, rechazarPago } from '../utils/autorizaciones.js';

// Bandeja de Autorizaciones (solo el Administrador de la empresa): pagos de
// clientes y a proveedores que registraron los agentes y esperan autorización.
// Ver server/utils/autorizaciones.js.
const router = Router();

router.use((req, res, next) => {
  if (req.agente?.rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo el Administrador de la empresa puede autorizar pagos.' });
  }
  next();
});

const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;
const LIMITE = 300;

// GET /api/autorizaciones/resumen — cuántos pagos esperan autorización (contador del menú).
router.get('/resumen', async (req, res, next) => {
  try {
    const filtro = { empresa: new mongoose.Types.ObjectId(String(req.agente.empresa)), estatus: 'Pendiente' };
    const [clientes, proveedores] = await Promise.all([Pago.countDocuments(filtro), PagoProveedor.countDocuments(filtro)]);
    res.json({ clientes, proveedores, total: clientes + proveedores });
  } catch (err) {
    next(err);
  }
});

// GET /api/autorizaciones — todos los pagos pendientes de autorizar, del más antiguo al más reciente.
router.get('/', async (req, res, next) => {
  try {
    const filtro = { empresa: new mongoose.Types.ObjectId(String(req.agente.empresa)), estatus: 'Pendiente' };
    const [cobros, pagosProv] = await Promise.all([
      Pago.find(filtro).sort({ createdAt: 1 }).limit(LIMITE).populate('agente', 'nombre').lean(),
      PagoProveedor.find(filtro).sort({ createdAt: 1 }).limit(LIMITE).populate('agente', 'nombre').lean(),
    ]);

    const idsReservacion = [...new Set([...cobros, ...pagosProv].map((p) => String(p.idReservacion)))];
    const reservaciones = await Reservacion.find({ _id: { $in: idsReservacion }, empresa: filtro.empresa })
      .select('destino fechaEntrada fechaSalida estatus montoTotal abonado moneda idCliente detalleReservacion._id detalleReservacion.claveReservacion detalleReservacion.totalReservacion detalleReservacion.pagado')
      .populate('idCliente', 'nombreCompleto')
      .lean();
    const porId = new Map(reservaciones.map((r) => [String(r._id), r]));
    const proveedores = await Proveedor.find({ _id: { $in: [...new Set(pagosProv.map((p) => String(p.idProveedor)))] } }).select('nombreProveedor').lean();
    const nombreProveedor = new Map(proveedores.map((p) => [String(p._id), p.nombreProveedor]));

    const base = (p, tipo) => {
      const r = porId.get(String(p.idReservacion));
      return {
        tipo,
        id: p._id,
        monto: aCentavos(p.monto),
        moneda: p.moneda || 'MXN',
        formaPago: p.formaPago,
        referencia: p.referencia || '',
        fecha: p.fecha,
        registrado: p.createdAt,
        capturista: p.agente?.nombre || '—',
        comprobante: p.comprobante?.id ? { nombreArchivo: p.comprobante.nombreArchivo } : null,
        reservacion: r ? {
          id: r._id,
          destino: r.destino,
          cliente: r.idCliente?.nombreCompleto || '—',
          fechaEntrada: r.fechaEntrada,
          fechaSalida: r.fechaSalida,
          estatus: r.estatus,
        } : null,
        r,
      };
    };

    const datos = [
      ...cobros.map((p) => {
        const { r, ...fila } = base(p, 'cliente');
        // Saldo del cliente antes de aplicar este pago.
        return { ...fila, saldoActual: r ? aCentavos(r.montoTotal - (r.abonado || 0)) : null };
      }),
      ...pagosProv.map((p) => {
        const { r, ...fila } = base(p, 'proveedor');
        const d = r?.detalleReservacion?.find((x) => String(x._id) === String(p.idDetalle));
        return {
          ...fila,
          proveedor: nombreProveedor.get(String(p.idProveedor)) || 'Proveedor',
          servicio: d?.claveReservacion || '',
          saldoActual: d ? aCentavos(d.totalReservacion - (d.pagado || 0)) : null,
        };
      }),
    ].sort((a, b) => new Date(a.registrado) - new Date(b.registrado));

    res.json({ datos, totales: { clientes: cobros.length, proveedores: pagosProv.length } });
  } catch (err) {
    next(err);
  }
});

const TIPOS = new Set(['cliente', 'proveedor']);
const tipoDe = (req) => {
  if (!TIPOS.has(req.params.tipo)) throw errorHttp(400, 'Tipo de pago inválido.');
  return req.params.tipo;
};

// POST /api/autorizaciones/:tipo/:id/autorizar — aplica el pago a la reservación.
router.post('/:tipo/:id/autorizar', async (req, res, next) => {
  try {
    const pago = await autorizarPago(req, tipoDe(req), req.params.id);
    res.json({ id: pago._id, estatus: pago.estatus });
  } catch (err) {
    next(err);
  }
});

// POST /api/autorizaciones/:tipo/:id/rechazar { motivo } — el pago queda Cancelado.
router.post('/:tipo/:id/rechazar', async (req, res, next) => {
  try {
    const pago = await rechazarPago(req, tipoDe(req), req.params.id, req.body?.motivo);
    res.json({ id: pago._id, estatus: pago.estatus });
  } catch (err) {
    next(err);
  }
});

export default router;
