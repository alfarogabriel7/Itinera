import { Router } from 'express';
import { Reservacion, Cliente, Proveedor, Pago, PagoProveedor, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, sinSuperAdmin, asegurarMismaEmpresa,
  soloCampos, usuarioDeLaSesion, errorHttp, filtroPorAgente, regexBusqueda,
} from '../middleware/tenant.js';
import { paginar } from '../utils/paginacion.js';

const router = Router();

router.use(sinSuperAdmin('El rol superAdmin no puede consultar ni gestionar reservaciones.'));

const POPULATE_CLIENTE = 'idCliente';
const POPULATE_AGENTE = 'agente';
const POPULATE_PROVEEDOR = 'detalleReservacion.idProveedor';

// Campos editables; empresa y agente (quien la vendió) nunca se reasignan desde aquí.
const CAMPOS = ['idCliente', 'fechaEntrada', 'fechaSalida', 'destino', 'descripcion', 'montoTotal', 'notas', 'detalleReservacion', 'estatus'];

// El cliente debe ser un cliente activo de la misma empresa. Cualquier agente
// puede venderle (si el responsable no está, otro lo atiende); la venta queda
// a nombre de quien la registra y el cliente conserva su agente responsable.
async function validarCliente(req, idCliente) {
  await asegurarMismaEmpresa(Cliente, idCliente, req.agente.empresa,
    'El cliente seleccionado no pertenece a tu empresa o no está activo.', { estatus: 'Activo' });
}

// Todos los proveedores del detalle deben ser de la misma empresa.
async function validarProveedores(req, detalle, { exigirActivo }) {
  if (!Array.isArray(detalle)) return;
  await asegurarMismaEmpresa(Proveedor, detalle.map((d) => d?.idProveedor), req.agente.empresa,
    'Uno o más proveedores seleccionados no pertenecen a tu empresa o no están activos.',
    exigirActivo ? { estatus: 'Activo' } : {});
}

// Si el detalle cambia, cada servicio que ya tiene pagos al proveedor debe
// seguir existiendo (mismo _id y mismo proveedor) y no puede quedar con un
// total menor a lo ya pagado; si no, esos pagos quedarían huérfanos.
async function validarPagosAProveedores(reservacion, nuevoDetalle) {
  const pagados = await PagoProveedor.aggregate([
    { $match: { idReservacion: reservacion._id, estatus: { $ne: 'Cancelado' } } },
    { $group: { _id: '$idDetalle', pagado: { $sum: '$monto' } } },
  ]);
  for (const { _id, pagado } of pagados) {
    const anterior = reservacion.detalleReservacion.id(_id);
    const nuevo = nuevoDetalle.find((d) => String(d?._id) === String(_id));
    if (!nuevo || String(nuevo.idProveedor) !== String(anterior?.idProveedor)) {
      throw errorHttp(409, `El servicio ${anterior?.claveReservacion || ''} ya tiene pagos al proveedor; no se puede quitar ni cambiar de proveedor. Cancela primero esos pagos.`);
    }
    if (nuevo.totalReservacion !== undefined && Number(nuevo.totalReservacion) < pagado) {
      throw errorHttp(400, `El total del servicio ${anterior.claveReservacion} no puede ser menor a lo ya pagado al proveedor ($${pagado.toFixed(2)}).`);
    }
  }
}

async function abonadoDe(idReservacion) {
  const [r] = await Pago.aggregate([
    { $match: { idReservacion, estatus: { $ne: 'Cancelado' } } },
    { $group: { _id: null, total: { $sum: '$monto' } } },
  ]);
  return r?.total || 0;
}

// GET /api/reservaciones?q=&estatus=Activa&idCliente=&agente=<id>|mios=1&pagina=&porPagina=
// Todo usuario de la empresa consulta todas las reservaciones (p.ej. para
// registrar el abono de un cliente cuyo agente no está disponible).
// q busca en el destino y en el nombre/teléfono del cliente.
router.get('/', async (req, res, next) => {
  try {
    const filtroBase = { ...filtroPorAgente(req) };
    if (req.query.idCliente) filtroBase.idCliente = req.query.idCliente;
    if (req.query.estatus) filtroBase.estatus = String(req.query.estatus);
    const regex = regexBusqueda(req.query.q);
    if (regex) {
      const clientes = await Cliente.find(alcanceEmpresa(req, { $or: [{ nombreCompleto: regex }, { telefono: regex }] }))
        .select('_id').limit(500).lean();
      filtroBase.$or = [{ destino: regex }, { idCliente: { $in: clientes.map((c) => c._id) } }];
    }

    res.json(await paginar(Reservacion, alcanceEmpresa(req, filtroBase), req, {
      populate: [
        [POPULATE_CLIENTE, 'nombreCompleto correo telefono'],
        [POPULATE_AGENTE, 'nombre userId'],
        [POPULATE_PROVEEDOR, 'nombreProveedor'],
      ],
    }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const reservacion = await Reservacion.findById(req.params.id)
      .populate(POPULATE_CLIENTE, 'nombreCompleto correo telefono')
      .populate(POPULATE_AGENTE, 'nombre userId')
      .populate(POPULATE_PROVEEDOR, 'nombreProveedor');
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    if (!perteneceAlAlcance(reservacion, req)) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta reservación.' });
    }
    res.json(reservacion);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear reservaciones.');
    const datos = soloCampos(req.body, CAMPOS);
    delete datos.estatus; // toda reservación nace Activa

    await validarCliente(req, datos.idCliente);
    await validarProveedores(req, datos.detalleReservacion, { exigirActivo: true });

    const reservacion = await Reservacion.create({ ...datos, empresa, agente: req.agente.id });
    await registrarEvento({
      entidad: 'Reservacion', entidadId: reservacion._id, empresa, evento: 'alta',
      detalle: `${reservacion.destino} · $${reservacion.montoTotal}`, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(reservacion);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const reservacion = await Reservacion.findById(req.params.id);
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    // Editar: solo el agente que la vendió o el Administrador.
    if (!perteneceAlAlcance(reservacion, req, { porAgente: true })) {
      return res.status(403).json({ error: 'Solo el agente que registró la reservación o el Administrador pueden editarla.' });
    }

    const cambios = soloCampos(req.body, CAMPOS);
    // Las referencias que cambian se revalidan contra la empresa (antes solo se
    // validaban al crear y una edición podía ligar clientes/proveedores ajenos).
    if (cambios.idCliente !== undefined && String(cambios.idCliente) !== String(reservacion.idCliente)) {
      await validarCliente(req, cambios.idCliente);
    }
    await validarProveedores(req, cambios.detalleReservacion, { exigirActivo: false });
    if (Array.isArray(cambios.detalleReservacion)) {
      await validarPagosAProveedores(reservacion, cambios.detalleReservacion);
      // El acumulado pagado al proveedor lo mantiene el servidor: se conserva el
      // de cada servicio existente y nunca se toma del body.
      cambios.detalleReservacion = cambios.detalleReservacion.map((d) => {
        const { pagado, ...resto } = d || {};
        return { ...resto, pagado: reservacion.detalleReservacion.id(d?._id)?.pagado || 0 };
      });
    }

    // El precio de venta no puede quedar por debajo de lo que el cliente ya pagó.
    if (cambios.montoTotal !== undefined) {
      const abonado = await abonadoDe(reservacion._id);
      if (Number(cambios.montoTotal) < abonado) {
        throw errorHttp(400, `El monto total no puede ser menor a lo ya abonado por el cliente ($${abonado.toFixed(2)}).`);
      }
    }

    const anterior = reservacion.toObject();
    reservacion.set(cambios);
    await reservacion.save();

    const { detalleReservacion, ...cambiosSimples } = cambios;
    await registrarCambios({
      entidad: 'Reservacion', entidadId: reservacion._id, empresa: reservacion.empresa,
      anterior, nuevo: cambiosSimples, usuario: usuarioDeLaSesion(req),
    });
    if (detalleReservacion) {
      await registrarEvento({
        entidad: 'Reservacion', entidadId: reservacion._id, empresa: reservacion.empresa,
        evento: 'detalleReservacion', detalle: `${detalleReservacion.length} servicio(s) de proveedores`,
        usuario: usuarioDeLaSesion(req),
      });
    }
    res.json(reservacion);
  } catch (err) {
    next(err);
  }
});

// No hay DELETE: una reservación se cancela (estatus = Cancelada). Borrarla
// dejaría huérfanos sus pagos y comprobantes y alteraría el histórico de ventas.

export default router;
