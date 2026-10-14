import { Router } from 'express';
import { Proveedor, registrarCambios, registrarEvento } from '../../database/index.js';
import {
  alcanceEmpresa, perteneceAlAlcance, empresaDeLaSesion, sinSuperAdmin, soloCampos, regexBusqueda,
  usuarioDeLaSesion, errorHttp,
} from '../middleware/tenant.js';
import { paginar, ordenDe } from '../utils/paginacion.js';

const router = Router();

// Los proveedores (y sus cuentas bancarias) son datos de cada empresa: el superAdmin no los ve.
router.use(sinSuperAdmin('El rol superAdmin no puede consultar ni gestionar proveedores de las empresas.'));

const CAMPOS = ['nombreProveedor', 'telefono1', 'telefono2', 'numeroCuenta1', 'numeroCuenta2', 'estatus'];

// GET /api/proveedores?q=&estatus=Activo&orden=nombre&pagina=&porPagina=
router.get('/', async (req, res, next) => {
  try {
    const regex = regexBusqueda(req.query.q);
    const filtroBase = regex ? { nombreProveedor: regex } : {};
    if (req.query.estatus) filtroBase.estatus = String(req.query.estatus);
    const orden = ordenDe(req, { nombre: { nombreProveedor: 1 } }, { createdAt: -1 });
    res.json(await paginar(Proveedor, alcanceEmpresa(req, filtroBase), req, { orden }));
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
    const proveedor = await Proveedor.create({ ...soloCampos(req.body, CAMPOS), empresa });
    await registrarEvento({
      entidad: 'Proveedor', entidadId: proveedor._id, empresa, evento: 'alta',
      detalle: proveedor.nombreProveedor, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(proveedor);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findById(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!perteneceAlAlcance(proveedor, req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este proveedor.' });
    }

    const cambios = soloCampos(req.body, CAMPOS);
    // Un Agente puede editar proveedores de su empresa, pero no darlos de baja.
    if (cambios.estatus === 'Baja' && proveedor.estatus !== 'Baja' && req.agente.rol === 'Agente') {
      throw errorHttp(403, 'No tienes permiso para dar de baja proveedores.');
    }

    const anterior = proveedor.toObject();
    proveedor.set(cambios);
    await proveedor.save();

    await registrarCambios({
      entidad: 'Proveedor', entidadId: proveedor._id, empresa: proveedor.empresa,
      anterior, nuevo: cambios, usuario: usuarioDeLaSesion(req),
    });
    res.json(proveedor);
  } catch (err) {
    next(err);
  }
});

// No hay DELETE: los proveedores se dan de baja lógicamente (estatus = Baja)
// porque las reservaciones históricas los siguen referenciando.

export default router;
