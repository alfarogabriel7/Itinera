// Helpers centralizados de aislamiento multi-tenant (multi-empresa).
// Toda ruta que opere sobre un recurso ligado a una empresa debe usar estas
// funciones en vez de reimplementar su propio filtro — la regla de "quién
// puede ver qué" vive en un solo lugar, no copiada y pegada en cada archivo
// de rutas donde se podría olvidar o escribir distinto por error.

// Agrega el filtro de empresa (y, si aplica, de agente) a una condición de
// búsqueda para listados. superAdmin no queda acotado.
export function alcanceEmpresa(req, filtroBase = {}, { porAgente = false } = {}) {
  if (req.agente.rol === 'superAdmin') return { ...filtroBase };
  const filtro = { ...filtroBase, empresa: req.agente.empresa };
  if (porAgente && req.agente.rol === 'Agente') {
    filtro.agente = req.agente.id;
  }
  return filtro;
}

// Verifica que un documento ya cargado (findById) esté dentro del alcance
// del solicitante. Se usa antes de permitir ver/editar/eliminar un registro puntual.
export function perteneceAlAlcance(doc, req, { porAgente = false } = {}) {
  if (req.agente.rol === 'superAdmin') return true;
  if (String(doc.empresa || '') !== String(req.agente.empresa || '')) return false;
  if (porAgente && req.agente.rol === 'Agente') {
    return String(doc.agente || '') === String(req.agente.id);
  }
  return true;
}

// Empresa que debe asignarse al crear un registro nuevo: siempre la de la
// sesión, nunca la que venga en el body. Lanza un 400 si la sesión no tiene
// empresa asociada (p.ej. superAdmin intentando crear algo operativo).
export function empresaDeLaSesion(req, mensaje = 'Tu sesión no tiene una empresa asociada.') {
  if (!req.agente.empresa) {
    const err = new Error(mensaje);
    err.status = 400;
    throw err;
  }
  return req.agente.empresa;
}

// Bloquea por completo el acceso a un módulo para un rol específico
// (p.ej. superAdmin en Reservaciones/Prospectos/Pagos). Devuelve true si ya
// respondió, para que la ruta corte la ejecución con `if (bloquear...) return;`.
export function bloquearSuperAdmin(req, res, mensaje = 'El rol superAdmin no puede consultar ni gestionar este recurso.') {
  if (req.agente.rol === 'superAdmin') {
    res.status(403).json({ error: mensaje });
    return true;
  }
  return false;
}
