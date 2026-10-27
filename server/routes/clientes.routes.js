import { Router } from 'express';
import { Cliente, Agente, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, sinSuperAdmin, asegurarMismaEmpresa,
  soloCampos, regexBusqueda, usuarioDeLaSesion, errorHttp, filtroPorAgente,
} from '../middleware/tenant.js';
import { paginar, ordenDe } from '../utils/paginacion.js';
import { aplanarAcciones, cambiarEstatusAccion } from '../utils/seguimiento.js';

const router = Router();

// Los clientes son datos de negocio de cada empresa: el superAdmin no los ve.
router.use(sinSuperAdmin('El rol superAdmin no puede consultar ni gestionar clientes de las empresas.'));

// Campos que se aceptan del formulario; empresa y agente nunca se toman tal cual del body.
const CAMPOS = ['nombreCompleto', 'tipoDocumento', 'numeroDocumento', 'correo', 'telefono', 'direccion', 'fechaNacimiento', 'ciudad', 'observaciones', 'notas', 'pais', 'estatus'];
const POPULATE_AGENTE = ['agente', 'nombre userId'];

// Agente responsable: un Agente siempre queda como responsable de lo que da de
// alta; el Administrador puede elegir a cualquier agente activo de su empresa.
async function resolverAgente(req, agenteSolicitado) {
  if (req.agente.rol !== 'Administrador' || !agenteSolicitado) return req.agente.id;
  await asegurarMismaEmpresa(Agente, agenteSolicitado, req.agente.empresa,
    'El agente seleccionado no pertenece a tu empresa o no está activo.', { estatus: 'Activo' });
  return agenteSolicitado;
}

// GET /api/clientes?q=&estatus=Activo&agente=<id>|mios=1&orden=nombre&pagina=&porPagina=
// Todo usuario de la empresa consulta a todos los clientes de la empresa (si el
// agente responsable no está, otro puede atender al cliente y registrar su pago).
router.get('/', async (req, res, next) => {
  try {
    const regex = regexBusqueda(req.query.q);
    const filtroBase = { ...filtroPorAgente(req) };
    // También busca en las observaciones (p.ej. "agosto" para armar una promoción).
    if (regex) filtroBase.$or = [{ nombreCompleto: regex }, { correo: regex }, { ciudad: regex }, { telefono: regex }, { observaciones: regex }];
    if (req.query.estatus) filtroBase.estatus = String(req.query.estatus);
    const orden = ordenDe(req, { nombre: { nombreCompleto: 1 } }, { createdAt: -1 });
    res.json(await paginar(Cliente, alcanceEmpresa(req, filtroBase), req, { orden, populate: [POPULATE_AGENTE] }));
  } catch (err) {
    next(err);
  }
});

// Acciones de seguimiento de los clientes (una fila por acción) para el panel
// del agente. Con ?mios=1 solo las de los clientes del usuario.
router.get('/acciones', async (req, res, next) => {
  try {
    const clientes = await Cliente.find(
      alcanceEmpresa(req, { 'notas.accionesNotas.0': { $exists: true }, ...filtroPorAgente(req) })
    ).populate('agente', 'nombre');
    res.json(aplanarAcciones(clientes, 'cliente'));
  } catch (err) {
    next(err);
  }
});

// Cambia solo el estatus de una acción sin reenviar el cliente completo. Igual
// que editar al cliente: cualquier usuario de su empresa.
router.patch('/:id/notas/:idNota/acciones/:idAccion', async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!perteneceAlAlcance(cliente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este cliente.' });
    }
    const accion = cambiarEstatusAccion(cliente, req.params.idNota, req.params.idAccion, req.body.estatus);
    await cliente.save();
    res.json({ idAccion: accion._id, estatus: accion.estatus, fechaCompletada: accion.fechaCompletada || null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id).populate(...POPULATE_AGENTE);
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
    // La empresa nunca se toma del body: siempre es la de la sesión de quien crea.
    const empresa = empresaDeLaSesion(req, 'Tu sesión no tiene una empresa asociada; no puedes crear clientes.');
    const agente = await resolverAgente(req, req.body.agente);
    const cliente = await Cliente.create({ ...soloCampos(req.body, CAMPOS), empresa, agente });
    await registrarEvento({
      entidad: 'Cliente', entidadId: cliente._id, empresa, evento: 'alta',
      detalle: cliente.nombreCompleto, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(await cliente.populate(...POPULATE_AGENTE));
  } catch (err) {
    next(err);
  }
});

// Cualquier usuario de la empresa puede actualizar los datos de contacto de un
// cliente (queda en la bitácora quién lo hizo). Darlo de baja o reasignarlo a
// otro agente es exclusivo del Administrador.
router.put('/:id', async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!perteneceAlAlcance(cliente, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este cliente.' });
    }

    const cambios = soloCampos(req.body, CAMPOS);
    if (cambios.estatus === 'Baja' && cliente.estatus !== 'Baja' && req.agente.rol === 'Agente') {
      throw errorHttp(403, 'No tienes permiso para dar de baja clientes.');
    }
    if (req.body.agente !== undefined && req.body.agente !== '' && String(req.body.agente) !== String(cliente.agente)) {
      if (req.agente.rol !== 'Administrador') throw errorHttp(403, 'Solo el Administrador puede reasignar clientes a otro agente.');
      cambios.agente = await resolverAgente(req, req.body.agente);
    }

    const anterior = cliente.toObject();
    cliente.set(cambios);
    await cliente.save();

    // Las notas son una lista con acciones: no se registran como cambio de campo.
    const { notas, ...cambiosSimples } = cambios;
    await registrarCambios({
      entidad: 'Cliente', entidadId: cliente._id, empresa: cliente.empresa,
      anterior, nuevo: cambiosSimples, usuario: usuarioDeLaSesion(req),
    });
    res.json(await cliente.populate(...POPULATE_AGENTE));
  } catch (err) {
    next(err);
  }
});

// No hay DELETE: los clientes se dan de baja lógicamente (estatus = Baja) para
// no dejar reservaciones ni pagos huérfanos y conservar el historial.

export default router;
