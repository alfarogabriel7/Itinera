import mongoose from 'mongoose';
import { CLAVES_TIPO_PENDIENTE } from '../catalogos/tiposPendiente.js';

const { Schema } = mongoose;

// Pendiente (tarea de seguimiento) de un agente: qué hacer, para cuándo y con
// quién. Reemplaza a las "acciones" de las notas de Prospectos y Clientes.
//   fecha: día de calendario (medianoche UTC, como las fechas de viaje); "vencido"
//          = día anterior a hoy en México. hora: 'HH:mm' opcional, solo informativa.
//   Ligado (opcional) a un prospecto, un cliente y/o una reservación de la misma empresa.
const PendienteSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    // Responsable: quien lo debe hacer (el Administrador puede asignarlo a un agente).
    agente: { type: Schema.Types.ObjectId, ref: 'Agente', required: true },
    creadoPor: { id: { type: Schema.Types.ObjectId, ref: 'Agente' }, userId: String, nombre: String },

    titulo: { type: String, required: [true, 'Escribe qué hay que hacer.'], trim: true, maxlength: 200 },
    detalle: { type: String, trim: true, maxlength: 1000 },
    tipo: { type: String, enum: { values: CLAVES_TIPO_PENDIENTE, message: 'Tipo de pendiente inválido.' }, default: 'otro' },
    fecha: { type: Date, required: [true, 'Indica para cuándo es el pendiente.'] },
    hora: { type: String, match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (usa HH:mm).'] },

    prospecto: { type: Schema.Types.ObjectId, ref: 'Prospecto' },
    cliente: { type: Schema.Types.ObjectId, ref: 'Cliente' },
    reservacion: { type: Schema.Types.ObjectId, ref: 'Reservacion' },

    estatus: { type: String, enum: ['pendiente', 'hecho'], default: 'pendiente' },
    completadoEn: { type: Date },
    completadoPor: { id: { type: Schema.Types.ObjectId, ref: 'Agente' }, userId: String, nombre: String },
    // Cuántas veces se ha pospuesto (señal de algo que se está atorando).
    pospuesto: { type: Number, default: 0 },

    // Si vino de una "acción" de nota (migración), de dónde salió.
    origen: { entidad: String, idRegistro: Schema.Types.ObjectId, idNota: Schema.Types.ObjectId, idAccion: Schema.Types.ObjectId },
    // Creado por una regla automática (server/utils/pendientesAutomaticos.js):
    // cobro, proveedor, documentos, regreso, prospecto, recompra o cumpleanos.
    // detalleId: servicio de la reservación (regla de proveedor).
    automatico: { regla: String, detalleId: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// Mi día: los abiertos de un responsable por fecha; equipo: los de la empresa.
PendienteSchema.index({ empresa: 1, agente: 1, estatus: 1, fecha: 1 });
PendienteSchema.index({ empresa: 1, estatus: 1, fecha: 1 });
// Pendientes de un registro (ficha de cliente, prospecto o reservación).
PendienteSchema.index({ prospecto: 1, estatus: 1 });
PendienteSchema.index({ cliente: 1, estatus: 1 });
PendienteSchema.index({ reservacion: 1, estatus: 1 });
// Cierre automático: los abiertos de cada regla.
PendienteSchema.index({ empresa: 1, 'automatico.regla': 1, estatus: 1 }, { partialFilterExpression: { 'automatico.regla': { $exists: true } } });

export default mongoose.model('Pendiente', PendienteSchema);
