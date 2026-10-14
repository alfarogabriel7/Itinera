import { Router } from 'express';
import { Prospecto, Cliente, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, bloquearSuperAdmin, sinSuperAdmin,
  soloCampos, regexBusqueda, usuarioDeLaSesion, filtroPorAgente,
} from '../middleware/tenant.js';
import { paginar } from '../utils/paginacion.js';

const router = Router();

const MSG_SUPERADMIN = 'El rol superAdmin no puede consultar ni gestionar prospectos.';
router.use(sinSuperAdmin(MSG_SUPERADMIN));

// Campos editables; empresa, agente, estatus y fechaRegistro los controla el servidor.
const CAMPOS = ['nombreCompleto', 'correo', 'telefono', 'direccion', 'fechaNacimiento', 'ciudad', 'pais', 'notas'];

// GET /api/prospectos?q=&agente=<id>|mios=1&pagina=&porPagina=
// Todo usuario de la empresa consulta todos los prospectos; editarlos y
// convertirlos es del agente responsable o del Administrador.
router.get('/', async (req, res, next) => {
  try {
    // El listado principal siempre descarta los que ya se convirtieron a cliente.
    const filtroBase = { estatus: 'prospecto', ...filtroPorAgente(req) };
    const regex = regexBusqueda(req.query.q);
    if (regex) filtroBase.$or = [{ nombreCompleto: regex }, { correo: regex }, { ciudad: regex }, { telefono: regex }];
    res.json(await paginar(Prospecto, alcanceEmpresa(req, filtroBase), req, { populate: [['agente', 'nombre']] }));
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

// Acciones de seguimiento "aplanadas" (una fila por acción) para el panel del
// agente: las pendientes, de la más antigua a la más reciente, y las que se
// completaron en los últimos 7 días. Con ?mios=1 (lo que usa el panel) solo
// las de los prospectos del usuario; sin él, las de toda la empresa.
router.get('/acciones', async (req, res, next) => {
  try {
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const prospectos = await Prospecto.find(
      alcanceEmpresa(req, { 'notas.accionesNotas.0': { $exists: true }, ...filtroPorAgente(req) })
    ).populate('agente', 'nombre');

    const pendientes = [];
    const completadas = [];
    for (const p of prospectos) {
      for (const n of p.notas) {
        for (const a of n.accionesNotas) {
          const fila = {
            idProspecto: p._id,
            idNota: n._id,
            idAccion: a._id,
            prospecto: p.nombreCompleto,
            telefono: p.telefono,
            esCliente: p.estatus === 'cliente',
            agente: p.agente?.nombre || null,
            nota: n.texto,
            descripcion: a.descripcion,
            estatus: a.estatus,
            fecha: a.fecha,
            fechaCompletada: a.fechaCompletada || null,
          };
          if (a.estatus !== 'Completada') pendientes.push(fila);
          else if (a.fechaCompletada && a.fechaCompletada >= hace7Dias) completadas.push(fila);
        }
      }
    }
    pendientes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    completadas.sort((a, b) => new Date(b.fechaCompletada) - new Date(a.fechaCompletada));

    res.json({ pendientes, completadas });
  } catch (err) {
    next(err);
  }
});

// Cambia solo el estatus de una acción (Completada / En seguimiento) sin tener
// que reenviar el prospecto completo.
router.patch('/:id/notas/:idNota/acciones/:idAccion', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const { estatus } = req.body;
    if (!['Completada', 'En seguimiento'].includes(estatus)) {
      return res.status(400).json({ error: 'Estatus inválido: usa "Completada" o "En seguimiento".' });
    }

    const prospecto = await Prospecto.findById(req.params.id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    if (!perteneceAlAlcance(prospecto, req, { porAgente: true })) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este prospecto.' });
    }
    const accion = prospecto.notas.id(req.params.idNota)?.accionesNotas.id(req.params.idAccion);
    if (!accion) return res.status(404).json({ error: 'Acción no encontrada' });

    accion.estatus = estatus;
    await prospecto.save();
    res.json({ idAccion: accion._id, estatus: accion.estatus, fechaCompletada: accion.fechaCompletada || null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (bloquearSuperAdmin(req, res, MSG_SUPERADMIN)) return;

    const prospecto = await Prospecto.findById(req.params.id).populate('agente', 'nombre');
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    // Consultar: cualquier usuario de la empresa.
    if (!perteneceAlAlcance(prospecto, req)) {
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

    // estatus y fechaRegistro los define siempre el servidor (default del esquema).
    const prospecto = await Prospecto.create({ ...soloCampos(req.body, CAMPOS), empresa, agente: req.agente.id });
    await registrarEvento({
      entidad: 'Prospecto', entidadId: prospecto._id, empresa, evento: 'alta',
      detalle: prospecto.nombreCompleto, usuario: usuarioDeLaSesion(req),
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
    // Editar: solo el agente responsable o el Administrador.
    if (!perteneceAlAlcance(prospecto, req, { porAgente: true })) {
      return res.status(403).json({ error: 'Solo el agente responsable o el Administrador pueden editar este prospecto.' });
    }

    // empresa, agente, estatus y fechaRegistro no se reasignan desde aquí.
    const cambios = soloCampos(req.body, CAMPOS);
    const anterior = prospecto.toObject();
    prospecto.set(cambios);
    await prospecto.save();

    const { notas, ...cambiosSimples } = cambios;
    await registrarCambios({
      entidad: 'Prospecto', entidadId: prospecto._id, empresa: prospecto.empresa,
      anterior, nuevo: cambiosSimples, usuario: usuarioDeLaSesion(req),
    });
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

    // El cliente queda ligado a la misma empresa y al mismo agente que el prospecto.
    const cliente = await Cliente.create({
      empresa: prospecto.empresa,
      agente: prospecto.agente,
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
    await registrarEvento({
      entidad: 'Prospecto', entidadId: prospecto._id, empresa: prospecto.empresa,
      evento: 'convertido a cliente', detalle: String(cliente._id), usuario: usuarioDeLaSesion(req),
    });

    res.json({ prospecto, cliente });
  } catch (err) {
    next(err);
  }
});

export default router;
