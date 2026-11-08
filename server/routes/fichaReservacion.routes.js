import { Router } from 'express';
import mongoose from 'mongoose';
import {
  Reservacion, Pago, PagoProveedor, Pendiente, Bitacora, registrarEvento,
} from '../../database/index.js';
import { ESTATUS_PETICION, ESTATUS_DOCUMENTO, DOCUMENTOS_BASE } from '../../database/models/Reservacion.js';
import { perteneceAlAlcance, sinSuperAdmin, usuarioDeLaSesion, errorHttp, idDe } from '../middleware/tenant.js';
import { hoyEnMexico } from '../utils/fechas.js';

// Ficha de reservación (pantalla de detalle): resumen, servicios, pagos,
// peticiones del cliente, checklist de documentos y bitácora con notas.
//   - Consultarla: cualquier usuario de la empresa.
//   - Operarla (peticiones, documentos, notas): el Administrador, el agente que
//     vendió o el agente responsable del cliente.
const router = Router();
router.use(sinSuperAdmin('El rol superAdmin no consulta reservaciones de las empresas.'));

const DIA = 24 * 60 * 60 * 1000;
const aCentavos = (n) => Math.round(Number(n || 0) * 100) / 100;
const hoyUTC = () => new Date(`${hoyEnMexico()}T00:00:00Z`);

async function cargar(req, { operar = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw errorHttp(400, 'Reservación inválida.');
  const r = await Reservacion.findById(req.params.id)
    .populate('idCliente', 'nombreCompleto telefono correo agente')
    .populate('agente', 'nombre')
    .populate('detalleReservacion.idProveedor', 'nombreProveedor');
  if (!r) throw errorHttp(404, 'Reservación no encontrada');
  if (!perteneceAlAlcance(r, req)) throw errorHttp(403, 'No tienes permiso para ver esta reservación.');
  const yo = String(req.agente.id);
  const puedeOperar = req.agente.rol === 'Administrador' || idDe(r.agente) === yo || idDe(r.idCliente?.agente) === yo;
  if (operar && !puedeOperar) {
    throw errorHttp(403, 'Solo el Administrador, el agente que vendió o el agente del cliente pueden hacer cambios en esta ficha.');
  }
  return { r, puedeOperar };
}

// Pendiente automático de una petición (responsable: quien la está gestionando).
async function pendienteDePeticion(req, r, titulo, dias) {
  const p = await Pendiente.create({
    empresa: r.empresa,
    agente: req.agente.id,
    titulo: titulo.slice(0, 200),
    tipo: 'peticion',
    fecha: new Date(hoyUTC().getTime() + dias * DIA),
    reservacion: r._id,
    cliente: r.idCliente?._id || r.idCliente,
    creadoPor: usuarioDeLaSesion(req),
  });
  return p._id;
}
const cerrarPendiente = (id, req) => id && Pendiente.updateOne(
  { _id: id, estatus: 'pendiente' },
  { $set: { estatus: 'hecho', completadoEn: new Date(), completadoPor: usuarioDeLaSesion(req) } }
);

// GET /api/reservaciones/:id/ficha
router.get('/:id/ficha', async (req, res, next) => {
  try {
    const { r, puedeOperar } = await cargar(req);

    // Checklist inicial: la primera vez que se abre la ficha.
    if (r.documentos === undefined) {
      r.documentos = DOCUMENTOS_BASE.map((nombre) => ({ nombre, estatus: 'Pendiente' }));
      await Reservacion.updateOne({ _id: r._id, documentos: { $exists: false } }, { $set: { documentos: r.documentos } });
    }

    const [idsPagos, idsPagosProv, idsPendientes] = await Promise.all([
      Pago.distinct('_id', { idReservacion: r._id }),
      PagoProveedor.distinct('_id', { idReservacion: r._id }),
      Pendiente.distinct('_id', { reservacion: r._id }),
    ]);
    const bitacora = await Bitacora.find({ empresa: r.empresa, entidadId: { $in: [r._id, ...idsPagos, ...idsPagosProv, ...idsPendientes] } })
      .sort({ fecha: -1 }).limit(80).lean();

    const servicios = r.detalleReservacion.map((d) => ({
      _id: d._id,
      proveedor: d.idProveedor?.nombreProveedor || 'Proveedor',
      clave: d.claveReservacion,
      montoBase: aCentavos(d.montoReservacion),
      comision: aCentavos(d.montoComisionable),
      total: aCentavos(d.totalReservacion),
      pagado: aCentavos(d.pagado),
      saldo: aCentavos(d.totalReservacion - (d.pagado || 0)),
    }));
    const suma = (c) => aCentavos(servicios.reduce((a, s) => a + s[c], 0));
    const esMio = idDe(r.agente) === String(req.agente.id);
    const activa = r.estatus === 'Activa';

    res.json({
      reservacion: r.toObject({ virtuals: true }), // misma forma que el listado (para "Editar")
      hoy: hoyEnMexico(),
      diasParaViajar: Math.round((r.fechaEntrada - hoyUTC()) / DIA),
      cliente: r.idCliente ? { id: r.idCliente._id, nombre: r.idCliente.nombreCompleto, telefono: r.idCliente.telefono, correo: r.idCliente.correo } : null,
      vendedor: r.agente?.nombre || null,
      cobro: { total: aCentavos(r.montoTotal), abonado: aCentavos(r.abonado), saldo: aCentavos(r.montoTotal - (r.abonado || 0)) },
      servicios,
      proveedores: { total: suma('total'), pagado: suma('pagado'), saldo: suma('saldo') },
      peticiones: r.peticiones,
      documentos: r.documentos,
      bitacora: bitacora.map((b) => ({
        _id: b._id, fecha: b.fecha, entidad: b.entidad, campo: b.campo,
        anterior: b.valorAnterior ?? null, nuevo: b.valorNuevo ?? null, usuario: b.usuario?.nombre || null,
      })),
      permisos: {
        operar: puedeOperar,
        editar: activa && (req.agente.rol === 'Administrador' || esMio),
        cancelar: activa && req.agente.rol === 'Administrador',
        cobrar: activa,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/reservaciones/:id/peticiones { descripcion, canal }
// Nace "Solicitada" y crea su pendiente "Enviar al proveedor" para hoy.
router.post('/:id/peticiones', async (req, res, next) => {
  try {
    const { r } = await cargar(req, { operar: true });
    const descripcion = String(req.body?.descripcion || '').trim();
    if (!descripcion) throw errorHttp(400, 'Describe la petición del cliente.');
    const canal = String(req.body?.canal || '').trim().slice(0, 40) || undefined;
    const pendiente = await pendienteDePeticion(req, r, `Enviar al proveedor: ${descripcion}`, 0);
    r.peticiones.push({ descripcion, canal, registradoPor: usuarioDeLaSesion(req), pendiente });
    await r.save();
    await registrarEvento({
      entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa, evento: 'petición del cliente',
      detalle: `${descripcion}${canal ? ` (por ${canal})` : ''}`, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(r.peticiones.at(-1));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reservaciones/:id/peticiones/:idPeticion { estatus, motivo? }
//   Enviada    → cierra "Enviar al proveedor" y abre "Confirmar respuesta" (en 2 días).
//   Confirmada → cierra el pendiente vigente.
//   Rechazada  → cierra el vigente y abre "Avisar al cliente" (hoy). Requiere motivo.
router.patch('/:id/peticiones/:idPeticion', async (req, res, next) => {
  try {
    const { r } = await cargar(req, { operar: true });
    const pet = r.peticiones.id(req.params.idPeticion);
    if (!pet) throw errorHttp(404, 'Petición no encontrada.');
    const estatus = req.body?.estatus;
    if (!ESTATUS_PETICION.includes(estatus)) throw errorHttp(400, 'Estatus de petición inválido.');
    const motivo = String(req.body?.motivo || '').trim();
    if (estatus === 'Rechazada' && !motivo) throw errorHttp(400, 'Indica por qué se rechazó la petición.');
    if (estatus === pet.estatus) return res.json(pet);

    const anterior = pet.estatus;
    await cerrarPendiente(pet.pendiente, req);
    pet.pendiente = undefined;
    pet.estatus = estatus;
    if (estatus === 'Enviada') {
      pet.fechaEnviada = new Date();
      pet.pendiente = await pendienteDePeticion(req, r, `Confirmar respuesta del proveedor: ${pet.descripcion}`, 2);
    } else if (estatus === 'Confirmada' || estatus === 'Rechazada') {
      pet.fechaRespuesta = new Date();
      if (estatus === 'Rechazada') {
        pet.motivo = motivo;
        pet.pendiente = await pendienteDePeticion(req, r, `Avisar al cliente que no se pudo: ${pet.descripcion}`, 0);
      }
    } else if (estatus === 'Solicitada') {
      pet.pendiente = await pendienteDePeticion(req, r, `Enviar al proveedor: ${pet.descripcion}`, 0);
    }
    await r.save();
    await registrarEvento({
      entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa, evento: 'petición del cliente',
      detalle: `${pet.descripcion}: ${anterior} → ${estatus}${motivo && estatus === 'Rechazada' ? ` (${motivo})` : ''}`, usuario: usuarioDeLaSesion(req),
    });
    res.json(pet);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/peticiones/:idPeticion', async (req, res, next) => {
  try {
    const { r } = await cargar(req, { operar: true });
    const pet = r.peticiones.id(req.params.idPeticion);
    if (!pet) throw errorHttp(404, 'Petición no encontrada.');
    if (pet.pendiente) await Pendiente.deleteOne({ _id: pet.pendiente, estatus: 'pendiente' });
    const descripcion = pet.descripcion;
    pet.deleteOne();
    await r.save();
    await registrarEvento({
      entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa, evento: 'petición eliminada', detalle: descripcion, usuario: usuarioDeLaSesion(req),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// PUT /api/reservaciones/:id/documentos { documentos: [{ _id?, nombre, estatus }] }
// Reemplaza el checklist (agregar, quitar o cambiar estatus).
router.put('/:id/documentos', async (req, res, next) => {
  try {
    const { r } = await cargar(req, { operar: true });
    const lista = Array.isArray(req.body?.documentos) ? req.body.documentos : null;
    if (!lista || lista.length > 30) throw errorHttp(400, 'Lista de documentos inválida.');
    const previos = new Map((r.documentos || []).map((d) => [String(d._id), d]));
    const cambios = [];
    r.documentos = lista.map((d) => {
      const nombre = String(d?.nombre || '').trim();
      if (!nombre) throw errorHttp(400, 'Cada documento necesita un nombre.');
      if (d.estatus && !ESTATUS_DOCUMENTO.includes(d.estatus)) throw errorHttp(400, `Estatus de documento inválido: ${nombre}.`);
      const estatus = d.estatus || 'Pendiente';
      const previo = d._id && previos.get(String(d._id));
      if (!previo) cambios.push(`${nombre}: agregado`);
      else if (previo.estatus !== estatus) cambios.push(`${nombre}: ${previo.estatus} → ${estatus}`);
      return { ...(previo ? { _id: previo._id } : {}), nombre, estatus, actualizado: !previo || previo.estatus !== estatus ? new Date() : previo.actualizado };
    });
    for (const [id, d] of previos) if (!lista.some((x) => String(x?._id) === id)) cambios.push(`${d.nombre}: quitado`);
    await r.save();
    if (cambios.length) {
      await registrarEvento({
        entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa, evento: 'documentos', detalle: cambios.join(' · '), usuario: usuarioDeLaSesion(req),
      });
    }
    res.json(r.documentos);
  } catch (err) {
    next(err);
  }
});

// POST /api/reservaciones/:id/notas { texto } — nota manual en la bitácora.
router.post('/:id/notas', async (req, res, next) => {
  try {
    const { r } = await cargar(req, { operar: true });
    const texto = String(req.body?.texto || '').trim().slice(0, 1000);
    if (!texto) throw errorHttp(400, 'Escribe la nota.');
    await registrarEvento({ entidad: 'Reservacion', entidadId: r._id, empresa: r.empresa, evento: 'nota', detalle: texto, usuario: usuarioDeLaSesion(req) });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
