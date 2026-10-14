import { Router } from 'express';
import { Bitacora } from '../../database/index.js';
import { alcanceEmpresa } from '../middleware/tenant.js';

const router = Router();

// GET /api/bitacora?entidad=Cliente&entidadId=... -> historial de cambios de un registro.
// Nunca se puede ver la bitácora de otra empresa: el filtro de empresa se
// agrega siempre (salvo superAdmin), independientemente de lo que pida el query string.
router.get('/', async (req, res, next) => {
  try {
    const { entidad, entidadId } = req.query;
    const filtroBase = {};
    if (entidad) filtroBase.entidad = entidad;
    if (entidadId) filtroBase.entidadId = entidadId;
    const filter = alcanceEmpresa(req, filtroBase);

    const registros = await Bitacora.find(filter).sort({ fecha: -1 }).limit(200);
    res.json(registros);
  } catch (err) {
    next(err);
  }
});

export default router;
