import mongoose from 'mongoose';

const ClienteSchema = new mongoose.Schema(
  {
    // Empresa a la que pertenece el cliente (multi-tenant, igual que Agente).
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    nombreCompleto: { type: String, required: true, trim: true, maxlength: 120 },
    tipoDocumento: { type: String, enum: ['INE', 'Pasaporte', 'Cédula'] },
    numeroDocumento: { type: String, trim: true },
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
    notas: { type: String, trim: true },
    pais: { type: String, required: true, default: 'México', trim: true },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
  },
  { timestamps: true }
);

// Único por empresa, no global: dos empresas distintas sí pueden tener
// cada una un cliente con el mismo correo.
ClienteSchema.index({ empresa: 1, correo: 1 }, { unique: true, sparse: true });
ClienteSchema.index({ nombreCompleto: 'text', ciudad: 'text' });

export default mongoose.model('Cliente', ClienteSchema);
