import mongoose from 'mongoose';

// Helpers centralizados de aislamiento multi-tenant (multi-empresa).
// Toda ruta que opere sobre un recurso ligado a una empresa debe usar estas
// funciones en vez de reimplementar su propio filtro — la regla de "quién
// puede ver qué" vive en un solo lugar, no copiada y pegada en cada archivo
// de rutas donde se podría olvidar o escribir distinto por error.
//
// Jerarquía de pertenencia:
//   Empresa ─┬─ Administrador (uno por empresa) y Agentes
//            ├─ Proveedores
//            ├─ Prospectos ── agente
//            ├─ Clientes ──── agente
//            ├─ Reservaciones ── cliente, agente y proveedores (todos de la misma empresa)
//            ├─ Pagos ── reservación (+ comprobante)
//            └─ Bitácora

// Error con código HTTP, para lanzarlo desde helpers y que el manejador global lo responda.
export function errorHttp(status, mensaje) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}

// Agrega el filtro de empresa (y, si aplica, de agente) a una condición de
// búsqueda para listados. superAdmin no queda acotado.
// Regla de operación: para CONSULTAR, todo usuario ve lo de su empresa (sin
// porAgente). `porAgente` se usa solo donde la acción es exclusiva del agente
// responsable o del Administrador (editar reservaciones/prospectos).
export function alcanceEmpresa(req, filtroBase = {}, { porAgente = false } = {}) {
  if (req.agente.rol === 'superAdmin') return { ...filtroBase };
  const filtro = { ...filtroBase, empresa: new mongoose.Types.ObjectId(String(req.agente.empresa)) };
  if (porAgente && req.agente.rol === 'Agente') {
    filtro.agente = new mongoose.Types.ObjectId(String(req.agente.id));
  }
  return filtro;
}

// Filtro opcional por agente responsable, pedido por query string:
//   ?mios=1          -> los del usuario de la sesión (p.ej. el panel del agente)
//   ?agente=<id>     -> los de un agente en particular (filtro de los listados)
// No es una restricción de acceso: en la operación diaria cualquier agente de la
// empresa puede consultar clientes, prospectos y reservaciones de sus compañeros.
export function filtroPorAgente(req, campo = 'agente') {
  if (req.query.mios === '1') return { [campo]: new mongoose.Types.ObjectId(String(req.agente.id)) };
  if (req.query.agente) {
    if (!mongoose.isValidObjectId(req.query.agente)) throw errorHttp(400, 'Agente inválido.');
    return { [campo]: new mongoose.Types.ObjectId(String(req.query.agente)) };
  }
  return {};
}

// Verifica que un documento ya cargado (findById) esté dentro del alcance
// del solicitante. Se usa antes de permitir ver/editar/eliminar un registro puntual.
export function perteneceAlAlcance(doc, req, { porAgente = false } = {}) {
  if (req.agente.rol === 'superAdmin') return true;
  if (idDe(doc.empresa) !== String(req.agente.empresa || '')) return false;
  if (porAgente && req.agente.rol === 'Agente') {
    return idDe(doc.agente) === String(req.agente.id);
  }
  return true;
}

// Id como texto, tanto si el campo es un ObjectId como si ya viene poblado
// (.populate('agente', 'nombre') lo convierte en objeto con _id).
export function idDe(valor) {
  return String(valor?._id ?? valor ?? '');
}

// Empresa que debe asignarse al crear un registro nuevo: siempre la de la
// sesión, nunca la que venga en el body. Lanza un 400 si la sesión no tiene
// empresa asociada (p.ej. superAdmin intentando crear algo operativo).
export function empresaDeLaSesion(req, mensaje = 'Tu sesión no tiene una empresa asociada.') {
  if (!req.agente.empresa) throw errorHttp(400, mensaje);
  return req.agente.empresa;
}

// Bloquea por completo el acceso a un módulo para un rol específico
// (p.ej. superAdmin en datos operativos de las empresas). Devuelve true si ya
// respondió, para que la ruta corte la ejecución con `if (bloquear...) return;`.
export function bloquearSuperAdmin(req, res, mensaje = 'El rol superAdmin no puede consultar ni gestionar este recurso.') {
  if (req.agente.rol === 'superAdmin') {
    res.status(403).json({ error: mensaje });
    return true;
  }
  return false;
}

// Middleware: el superAdmin administra la plataforma (empresas y sus
// administradores), pero no ve los datos de negocio de las empresas.
export function sinSuperAdmin(mensaje) {
  return (req, res, next) => (bloquearSuperAdmin(req, res, mensaje) ? undefined : next());
}

// Integridad referencial entre empresas: todos los ids deben existir en `Modelo`
// y pertenecer a `empresa`. Evita, por ejemplo, ligar una reservación a un
// cliente o proveedor de otra empresa. `extra` agrega condiciones (p.ej. agente).
export async function asegurarMismaEmpresa(Modelo, ids, empresa, mensaje, extra = {}) {
  const unicos = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String))];
  if (unicos.length === 0) return;
  if (!unicos.every((id) => mongoose.isValidObjectId(id))) throw errorHttp(400, mensaje);
  const encontrados = await Modelo.countDocuments({ _id: { $in: unicos }, empresa, ...extra });
  if (encontrados !== unicos.length) throw errorHttp(400, mensaje);
}

// Solo deja pasar los campos permitidos del body (evita asignación masiva de
// _id, empresa, agente, createdAt, contadores, etc.).
export function soloCampos(body, campos) {
  const limpio = {};
  for (const campo of campos) {
    if (body?.[campo] !== undefined) limpio[campo] = body[campo];
  }
  return limpio;
}

// Texto de búsqueda del usuario convertido en expresión regular segura
// (escapa caracteres especiales y limita el largo para evitar ReDoS) e
// insensible a acentos: "cancun" encuentra "Cancún" y "pena" encuentra "Peña".
const EQUIVALENTES = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû', n: 'nñ', c: 'cç' };
const CLASES = Object.fromEntries(
  Object.values(EQUIVALENTES).flatMap((grupo) => [...grupo].map((letra) => [letra, `[${grupo}]`]))
);
export function regexBusqueda(q) {
  const texto = String(q || '').trim().slice(0, 100);
  if (!texto) return null;
  const patron = [...texto.toLowerCase()]
    .map((ch) => CLASES[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return new RegExp(patron, 'i');
}

// Usuario de la sesión en el formato que guarda la bitácora.
export function usuarioDeLaSesion(req) {
  return { id: req.agente.id, userId: req.agente.userId, nombre: req.agente.nombre };
}
