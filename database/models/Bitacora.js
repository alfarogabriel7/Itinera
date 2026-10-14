import mongoose from 'mongoose';

const { Schema } = mongoose;

const BitacoraSchema = new Schema({
  entidad: { type: String, required: true }, // p.ej. 'Cliente', 'Proveedor'
  entidadId: { type: Schema.Types.ObjectId, required: true },
  // Empresa del registro afectado (multi-tenant); null para entidad "Empresa",
  // donde entidadId ya identifica a la empresa en sí.
  empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', default: null },
  campo: { type: String, required: true },
  valorAnterior: { type: Schema.Types.Mixed },
  valorNuevo: { type: Schema.Types.Mixed },
  usuario: {
    id: { type: Schema.Types.ObjectId, ref: 'Agente' },
    userId: String,
    nombre: String,
  },
  fecha: { type: Date, default: Date.now },
});

// Toda consulta va acotada por empresa (salvo superAdmin), así que empresa va primero.
BitacoraSchema.index({ empresa: 1, entidad: 1, entidadId: 1, fecha: -1 });
BitacoraSchema.index({ empresa: 1, fecha: -1 });
BitacoraSchema.index({ entidad: 1, entidadId: 1, fecha: -1 });

export default mongoose.model('Bitacora', BitacoraSchema);
