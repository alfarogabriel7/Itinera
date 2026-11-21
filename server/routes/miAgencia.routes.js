import { Router } from 'express';
import { Empresa, registrarCambios } from '../../database/index.js';
import { detectarTipo, leerArchivo, JPEG, PNG, WEBP } from '../utils/archivos.js';
import { soloCampos, usuarioDeLaSesion } from '../middleware/tenant.js';

// "Mi agencia": el Administrador edita los datos de contacto y el logo de SU
// empresa, y sus parámetros de operación. Lo que define la cuenta (RFC, grupo
// de colores, estatus) sigue siendo exclusivo del superAdmin (módulo Empresas).
const router = Router();

router.use((req, res, next) => {
  if (req.agente?.rol !== 'Administrador' || !req.agente.empresa) {
    return res.status(403).json({ error: 'Solo el Administrador de la empresa puede editar los datos de la agencia.' });
  }
  next();
});

const CAMPOS = ['nombreEmpresa', 'correo', 'telefonoPrincipal', 'telefonoSecundario', 'codigoPostal', 'direccion', 'colonia', 'ciudad', 'estado', 'pais'];
const PARAMETROS = ['autorizarPagosClientes', 'autorizarPagosProveedores'];
const SELECCION = `${CAMPOS.join(' ')} rfc configuracion logo.tipo logo.tamano logo.actualizado`;

const deLaSesion = (req) => Empresa.findById(req.agente.empresa);

// GET /api/mi-agencia
router.get('/', async (req, res, next) => {
  try {
    const empresa = await Empresa.findById(req.agente.empresa).select(SELECCION);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

// PUT /api/mi-agencia — datos de contacto.
router.put('/', async (req, res, next) => {
  try {
    const empresa = await deLaSesion(req);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const anterior = empresa.toObject();
    // Un campo mandado en blanco se borra (los obligatorios los rechaza la validación del modelo).
    for (const [campo, valor] of Object.entries(soloCampos(req.body, CAMPOS))) {
      const texto = String(valor ?? '').trim();
      empresa.set(campo, texto === '' ? undefined : texto);
    }
    await empresa.save();
    await registrarCambios({
      entidad: 'Empresa', entidadId: empresa._id, empresa: empresa._id,
      anterior, nuevo: soloCampos(empresa.toObject(), CAMPOS), usuario: usuarioDeLaSesion(req),
    });
    res.json(await Empresa.findById(empresa._id).select(SELECCION));
  } catch (err) {
    next(err);
  }
});

// PUT /api/mi-agencia/configuracion { autorizarPagosClientes, autorizarPagosProveedores }
router.put('/configuracion', async (req, res, next) => {
  try {
    const empresa = await deLaSesion(req);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const anterior = { ...(empresa.configuracion?.toObject?.() || {}) };
    for (const p of PARAMETROS) {
      if (typeof req.body?.[p] === 'boolean') empresa.set(`configuracion.${p}`, req.body[p]);
    }
    await empresa.save();
    await registrarCambios({
      entidad: 'Empresa', entidadId: empresa._id, empresa: empresa._id,
      anterior, nuevo: soloCampos(empresa.configuracion.toObject(), PARAMETROS), usuario: usuarioDeLaSesion(req),
    });
    res.json({ configuracion: empresa.configuracion });
  } catch (err) {
    next(err);
  }
});

const LIMITE_LOGO = 1024 * 1024;

// PUT /api/mi-agencia/logo — el cuerpo es la imagen (PNG, JPG o WEBP; no SVG).
router.put('/logo', leerArchivo(LIMITE_LOGO, 'El logo no puede pesar más de 1 MB.'), async (req, res, next) => {
  try {
    const tipo = detectarTipo(req.body);
    if (![PNG, JPEG, WEBP].includes(tipo)) return res.status(400).json({ error: 'El logo debe ser una imagen PNG, JPG o WEBP.' });
    const empresa = await deLaSesion(req);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const teniaLogo = Boolean(empresa.logo?.tipo);
    empresa.logo = { datos: req.body, tipo, tamano: req.body.length, actualizado: new Date() };
    await empresa.save();
    await registrarCambios({
      entidad: 'Empresa', entidadId: empresa._id, empresa: empresa._id,
      anterior: { logo: teniaLogo ? 'logo anterior' : null },
      nuevo: { logo: `logo ${tipo} (${Math.round(req.body.length / 1024)} KB)` },
      usuario: usuarioDeLaSesion(req),
    });
    res.json({ logo: { tipo, tamano: req.body.length, actualizado: empresa.logo.actualizado } });
  } catch (err) {
    next(err);
  }
});

router.delete('/logo', async (req, res, next) => {
  try {
    const empresa = await deLaSesion(req);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (empresa.logo?.tipo) {
      empresa.logo = undefined;
      await empresa.save();
      await registrarCambios({
        entidad: 'Empresa', entidadId: empresa._id, empresa: empresa._id,
        anterior: { logo: 'logo anterior' }, nuevo: { logo: null }, usuario: usuarioDeLaSesion(req),
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
