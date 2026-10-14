import mongoose from 'mongoose';

const EmpresaSchema = new mongoose.Schema(
  {
    nombreEmpresa: { type: String, required: true, trim: true, maxlength: 150 },
    correo: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Correo electrónico inválido'],
    },
    nombreTitular: { type: String, trim: true, maxlength: 120 },
    direccion: { type: String, trim: true },
    telefonoPrincipal: { type: String, required: true, trim: true },
    telefonoSecundario: { type: String, trim: true },
    rfc: { type: String, required: true, trim: true, uppercase: true, maxlength: 13 },
    ciudad: { type: String, trim: true },
    pais: { type: String, required: true, default: 'México', trim: true },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
  },
  { timestamps: true }
);

EmpresaSchema.index({ nombreEmpresa: 'text', rfc: 'text' });

export default mongoose.model('Empresa', EmpresaSchema);
