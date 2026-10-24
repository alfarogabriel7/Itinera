import { ESTATUS_ACCION } from '../../database/models/notas.js';
import { errorHttp } from '../middleware/tenant.js';

// Acciones de seguimiento "aplanadas" (una fila por acción) para el panel del
// agente, a partir de prospectos o clientes con notas: las pendientes, de la más
// antigua a la más reciente, y las completadas en los últimos 7 días. Las que se
// cerraron porque su seguimiento pasó al cliente no cuentan como completadas.
export function aplanarAcciones(registros, tipo) {
  const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendientes = [];
  const completadas = [];
  for (const r of registros) {
    for (const n of r.notas) {
      for (const a of n.accionesNotas) {
        const fila = {
          tipo,
          idRegistro: r._id,
          idNota: n._id,
          idAccion: a._id,
          nombre: r.nombreCompleto,
          telefono: r.telefono,
          esCliente: tipo === 'prospecto' && r.estatus === 'cliente',
          agente: r.agente?.nombre || null,
          nota: n.texto,
          descripcion: a.descripcion,
          estatus: a.estatus,
          fecha: a.fecha,
          fechaCompletada: a.fechaCompletada || null,
        };
        if (a.estatus !== 'Completada') pendientes.push(fila);
        else if (!a.migradaACliente && a.fechaCompletada && a.fechaCompletada >= hace7Dias) completadas.push(fila);
      }
    }
  }
  pendientes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  completadas.sort((a, b) => new Date(b.fechaCompletada) - new Date(a.fechaCompletada));
  return { pendientes, completadas };
}

// Cambia solo el estatus de una acción del documento (sin reenviarlo completo).
// Devuelve la acción modificada; el llamador guarda el documento.
export function cambiarEstatusAccion(registro, idNota, idAccion, estatus) {
  if (!ESTATUS_ACCION.includes(estatus)) {
    throw errorHttp(400, 'Estatus inválido: usa "Completada" o "En seguimiento".');
  }
  const accion = registro.notas.id(idNota)?.accionesNotas.id(idAccion);
  if (!accion) throw errorHttp(404, 'Acción no encontrada');
  accion.estatus = estatus;
  return accion;
}
