import mongoose from 'mongoose';

const { Schema } = mongoose;

const AccionNotaSchema = new Schema(
  {
    descripcion: { type: String, required: true, trim: true, maxlength: 300 },
    // Nace "En seguimiento"; la única transición esperada es marcarla "Completada".
    estatus: { type: String, enum: ['En seguimiento', 'Completada'], default: 'En seguimiento' },
    fecha: { type: Date, default: Date.now },
    // Cuándo se marcó como completada; lo mantiene el hook de abajo.
    fechaCompletada: { type: Date },
  },
  { _id: true }
);

// La fecha de completado la fija siempre el servidor según el estatus, venga
// el cambio del panel del agente o del formulario de Prospectos.
AccionNotaSchema.pre('validate', function () {
  if (this.estatus === 'Completada' && !this.fechaCompletada) this.fechaCompletada = new Date();
  if (this.estatus !== 'Completada') this.fechaCompletada = undefined;
});

const NotaProspectoSchema = new Schema(
  {
    texto: { type: String, required: true, trim: true, maxlength: 1000 },
    fecha: { type: Date, default: Date.now },
    // Nivel anidado dentro de la nota: actividades de seguimiento sobre esa nota.
    accionesNotas: { type: [AccionNotaSchema], default: [] },
  },
  { _id: true }
);

const ProspectoSchema = new Schema(
  {
    // Empresa y agente que lo registró (multi-tenant, igual que Reservacion).
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    agente: { type: Schema.Types.ObjectId, ref: 'Agente', required: true },

    nombreCompleto: { type: String, required: true, trim: true, maxlength: 120 },
    correo: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Correo electrónico inválido'],
    },
    telefono: { type: String, required: true, trim: true },
    direccion: { type: String, trim: true },
    fechaNacimiento: { type: Date },
    ciudad: { type: String, trim: true },
    pais: { type: String, required: true, default: 'México', trim: true },

    // No se expone como campo editable en el front: nace "prospecto" y solo
    // cambia a "cliente" mediante la acción de convertir.
    estatus: { type: String, enum: ['prospecto', 'cliente'], default: 'prospecto' },
    // Fecha del día en que se registró (la asigna siempre el servidor).
    fechaRegistro: { type: Date, default: Date.now },

    notas: { type: [NotaProspectoSchema], default: [] },
  },
  { timestamps: true }
);

ProspectoSchema.index({ empresa: 1, agente: 1, estatus: 1, createdAt: -1 });
ProspectoSchema.index({ empresa: 1, estatus: 1, createdAt: -1 });
ProspectoSchema.index({ empresa: 1, fechaRegistro: 1 });
ProspectoSchema.index({ nombreCompleto: 'text', ciudad: 'text' });

export default mongoose.model('Prospecto', ProspectoSchema);
