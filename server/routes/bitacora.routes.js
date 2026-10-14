import { Router } from 'express';
import mongoose from 'mongoose';
import { Bitacora } from '../../database/index.js';
import { alcanceEmpresa, errorHttp } from '../middleware/tenant.js';
import { paginar } from '../utils/paginacion.js';

const router = Router();

// GET /api/bitacora?entidad=Cliente&entidadId=...&pagina=&porPagina=
// Historial de cambios. Es información de auditoría: la consulta el
// Administrador (solo de su empresa) o el superAdmin; un Agente no.
// El filtro de empresa se agrega siempre, sin importar lo que pida el query string.
router.get('/', async (req, res, next) => {
  try {
    if (req.agente.rol === 'Agente') {
      throw errorHttp(403, 'Solo el Administrador puede consultar la bitácora.');
    }
    const { entidad, entidadId } = req.query;
    const filtroBase = {};
    if (entidad) filtroBase.entidad = String(entidad);
    if (entidadId) {
      if (!mongoose.isValidObjectId(entidadId)) throw errorHttp(400, 'entidadId inválido.');
      filtroBase.entidadId = entidadId;
    }
    res.json(await paginar(Bitacora, alcanceEmpresa(req, filtroBase), req, { orden: { fecha: -1 } }));
  } catch (err) {
    next(err);
  }
});

export default router;
