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
    codigoPostal: { type: String, trim: true, match: [/^\d{5}$/, 'El código postal debe tener 5 dígitos'] },
    direccion: { type: String, trim: true },
    colonia: { type: String, trim: true, maxlength: 100 },
    telefonoPrincipal: { type: String, required: true, trim: true },
    telefonoSecundario: { type: String, trim: true },
    rfc: { type: String, required: true, trim: true, uppercase: true, maxlength: 13 },
    ciudad: { type: String, trim: true },
    pais: { type: String, required: true, default: 'México', trim: true },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
    // Logo que se imprime en los recibos al cliente. Se guarda en Mongo (en Vercel
    // no hay disco persistente); los bytes no se cargan salvo que se pidan con
    // .select('+logo.datos'), así listar empresas no arrastra las imágenes.
    logo: {
      datos: { type: Buffer, select: false },
      tipo: String,
      tamano: Number,
      actualizado: Date,
    },
  },
  { timestamps: true }
);

EmpresaSchema.index({ nombreEmpresa: 'text', rfc: 'text' });

export default mongoose.model('Empresa', EmpresaSchema);
