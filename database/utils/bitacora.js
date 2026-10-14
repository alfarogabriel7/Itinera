import Bitacora from '../models/Bitacora.js';

// Campos que nunca se registran como "cambio de negocio" en la bitácora.
const CAMPOS_IGNORADOS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'password']);

function aTexto(valor) {
  if (valor === undefined || valor === null) return '';
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

/**
 * Compara los campos presentes en `nuevo` contra los valores actuales en `anterior`
 * y guarda un registro de bitácora por cada campo que realmente cambió.
 */
export async function registrarCambios({ entidad, entidadId, anterior, nuevo, usuario, empresa }) {
  const cambios = [];

  for (const campo of Object.keys(nuevo)) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    const valorAnterior = anterior[campo];
    const valorNuevo = nuevo[campo];
    if (aTexto(valorAnterior) === aTexto(valorNuevo)) continue;

    cambios.push({
      entidad,
      entidadId,
      campo,
      valorAnterior: valorAnterior ?? null,
      valorNuevo: valorNuevo ?? null,
      usuario,
      // Se guarda para poder filtrar la bitácora por empresa (multi-tenant).
      // Para la entidad "Empresa" la propia entidadId ya identifica la empresa.
      empresa: empresa ?? null,
    });
  }

  if (cambios.length > 0) {
    await Bitacora.insertMany(cambios);
  }
}
