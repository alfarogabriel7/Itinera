import mongoose from 'mongoose';

const { Schema } = mongoose;

// Notas de seguimiento con acciones anidadas. Las comparten Prospecto y Cliente:
// al convertir un prospecto, sus acciones "En seguimiento" pasan al cliente
// (ver POST /api/prospectos/:id/convertir).

export const ESTATUS_ACCION = ['En seguimiento', 'Completada'];

const AccionNotaSchema = new Schema(
  {
    descripcion: { type: String, required: true, trim: true, maxlength: 300 },
    // Nace "En seguimiento"; la única transición esperada es marcarla "Completada".
    estatus: { type: String, enum: ESTATUS_ACCION, default: 'En seguimiento' },
    fecha: { type: Date, default: Date.now },
    // Cuándo se marcó como completada; lo mantiene el hook de abajo.
    fechaCompletada: { type: Date },
    // Solo en prospectos: la acción se cerró aquí porque su seguimiento pasó al
    // cliente al convertirlo. No se lista como "completada" en el panel del agente.
    migradaACliente: { type: Boolean },
  },
  { _id: true }
);

// La fecha de completado la fija siempre el servidor según el estatus, venga
// el cambio del panel del agente o del formulario.
AccionNotaSchema.pre('validate', function () {
  if (this.estatus === 'Completada' && !this.fechaCompletada) this.fechaCompletada = new Date();
  if (this.estatus !== 'Completada') {
    this.fechaCompletada = undefined;
    this.migradaACliente = undefined;
  }
});

export const NotaSeguimientoSchema = new Schema(
  {
    texto: { type: String, required: true, trim: true, maxlength: 1000 },
    fecha: { type: Date, default: Date.now },
    // Nivel anidado dentro de la nota: actividades de seguimiento sobre esa nota.
    accionesNotas: { type: [AccionNotaSchema], default: [] },
  },
  { _id: true }
);
