import mongoose from 'mongoose';

const { Schema } = mongoose;

// Registro de cada pendiente automático generado: una entrada por "ocurrencia"
// (p.ej. 'cobro20:<reservación>' o 'cumpleanos:<cliente>:2026'). El índice único
// impide duplicados aunque dos instancias del servidor revisen al mismo tiempo,
// y si alguien elimina el pendiente, la entrada se queda: no se vuelve a crear.
const PendienteAutomaticoSchema = new Schema({
  empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
  clave: { type: String, required: true },
  regla: { type: String, required: true },
  registro: { type: Schema.Types.ObjectId }, // reservación, prospecto o cliente
  pendiente: { type: Schema.Types.ObjectId, ref: 'Pendiente' },
  creadoEn: { type: Date, default: Date.now },
});

PendienteAutomaticoSchema.index({ empresa: 1, clave: 1 }, { unique: true });
PendienteAutomaticoSchema.index({ empresa: 1, regla: 1, registro: 1, creadoEn: -1 });

export default mongoose.model('PendienteAutomatico', PendienteAutomaticoSchema);
