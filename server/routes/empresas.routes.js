import { Router } from 'express';
import { Empresa, Agente, Cliente, Proveedor, Prospecto, Reservacion, registrarCambios, registrarEvento } from '../../database/index.js';
import { detectarTipo, leerArchivo, enviarArchivo, JPEG, PNG, WEBP } from '../utils/archivos.js';
import { soloCampos, regexBusqueda, usuarioDeLaSesion, idDe } from '../middleware/tenant.js';
import { paginar, ordenDe } from '../utils/paginacion.js';

const CAMPOS = ['nombreEmpresa', 'correo', 'nombreTitular', 'direccion', 'telefonoPrincipal', 'telefonoSecundario', 'rfc', 'ciudad', 'pais', 'estatus'];

const router = Router();

// El logo sí lo pueden leer los usuarios de la propia empresa (se imprime en
// sus recibos); por eso esta ruta va antes del candado de superAdmin.
router.get('/:id/logo', async (req, res, next) => {
  try {
    const esSuperAdmin = req.agente.rol === 'superAdmin';
    if (!esSuperAdmin && idDe(req.agente.empresa) !== req.params.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver el logo de esta empresa.' });
    }
    const empresa = await Empresa.findById(req.params.id).select('+logo.datos');
    if (!empresa?.logo?.datos?.length) return res.status(404).json({ error: 'La empresa no tiene logo.' });
    enviarArchivo(res, { tipo: empresa.logo.tipo, nombreArchivo: `logo-${empresa._id}`, datos: empresa.logo.datos });
  } catch (err) {
    next(err);
  }
});

// El módulo de Empresas solo lo administra el superAdmin.
router.use((req, res, next) => {
  if (req.agente?.rol !== 'superAdmin') {
    return res.status(403).json({ error: 'Solo un superAdmin puede administrar empresas.' });
  }
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const regex = regexBusqueda(req.query.q);
    const filter = regex ? { $or: [{ nombreEmpresa: regex }, { rfc: regex }, { correo: regex }] } : {};
    if (req.query.estatus) filter.estatus = String(req.query.estatus);
    const orden = ordenDe(req, { nombre: { nombreEmpresa: 1 } }, { createdAt: -1 });
    res.json(await paginar(Empresa, filter, req, { orden }));
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

// Solo campos de datos generales: el logo se cambia por sus rutas dedicadas
// (PUT/DELETE /:id/logo) y _id/fechas nunca se toman del body.
const sinLogo = (body) => soloCampos(body, CAMPOS);

router.post('/', async (req, res, next) => {
  try {
    const empresa = await Empresa.create(sinLogo(req.body));
    await registrarEvento({
      entidad: 'Empresa', entidadId: empresa._id, empresa: empresa._id, evento: 'alta',
      detalle: empresa.nombreEmpresa, usuario: usuarioDeLaSesion(req),
    });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    req.body = sinLogo(req.body);
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
      returnDocument: 'after',
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

// 1 MB es de sobra para un logo y mantiene ligero el recibo.
const LIMITE_LOGO = 1024 * 1024;

// PUT /api/empresas/:id/logo — el cuerpo es la imagen tal cual (PNG, JPG o WEBP).
// SVG no se acepta: puede llevar scripts incrustados.
router.put('/:id/logo', leerArchivo(LIMITE_LOGO, 'El logo no puede pesar más de 1 MB.'), async (req, res, next) => {
  try {
    const tipo = detectarTipo(req.body);
    if (![PNG, JPEG, WEBP].includes(tipo)) {
      return res.status(400).json({ error: 'El logo debe ser una imagen PNG, JPG o WEBP.' });
    }
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const teniaLogo = Boolean(empresa.logo?.tipo);
    empresa.logo = { datos: req.body, tipo, tamano: req.body.length, actualizado: new Date() };
    await empresa.save();

    await registrarCambios({
      entidad: 'Empresa',
      entidadId: empresa._id,
      empresa: empresa._id,
      anterior: { logo: teniaLogo ? 'logo anterior' : null },
      nuevo: { logo: `logo ${tipo} (${Math.round(req.body.length / 1024)} KB)` },
      usuario: { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre },
    });

    res.json({ logo: { tipo, tamano: req.body.length, actualizado: empresa.logo.actualizado } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/logo', async (req, res, next) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (empresa.logo?.tipo) {
      empresa.logo = undefined;
      await empresa.save();
      await registrarCambios({
        entidad: 'Empresa',
        entidadId: empresa._id,
        empresa: empresa._id,
        anterior: { logo: 'logo anterior' },
        nuevo: { logo: null },
        usuario: { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre },
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Solo se puede borrar una empresa vacía (dada de alta por error). Si ya tiene
// usuarios o datos, se da de baja (estatus = Baja), lo que corta el acceso de
// todos sus usuarios sin perder su información.
router.delete('/:id', async (req, res, next) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const conDatos = await Promise.all(
      [Agente, Cliente, Proveedor, Prospecto, Reservacion].map((M) => M.exists({ empresa: empresa._id }))
    );
    if (conDatos.some(Boolean)) {
      return res.status(409).json({ error: 'La empresa ya tiene usuarios o información registrada; no se puede eliminar. Dala de baja.' });
    }
    await empresa.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
