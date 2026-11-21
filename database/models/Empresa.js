import mongoose from 'mongoose';
import { NOMBRES_ESTADOS } from '../catalogos/estados.js';
import { CLAVES_TEMAS, TEMA_PREDETERMINADO, normalizarTema } from '../catalogos/temas.js';

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
    // Entidad federativa (catálogo en database/catalogos/estados.js). Opcional.
    estado: {
      type: String,
      trim: true,
      validate: { validator: (v) => !v || NOMBRES_ESTADOS.includes(v), message: 'Estado inválido' },
    },
    pais: { type: String, required: true, default: 'México', trim: true },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
    // Grupo al que pertenece la empresa: define los colores de la app para sus
    // usuarios (catálogo en database/catalogos/temas.js).
    // 'itinera' (nombre anterior de la plataforma) se convierte al predeterminado al guardar.
    tema: { type: String, enum: { values: CLAVES_TEMAS, message: 'Grupo inválido' }, default: TEMA_PREDETERMINADO, set: normalizarTema },
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

// Empresas guardadas con el tema 'itinera' (nombre anterior): al leerlas el
// setter no corre, así que se corrige antes de validar para que puedan guardarse.
EmpresaSchema.pre('validate', function () {
  if (this.tema === 'itinera') this.tema = TEMA_PREDETERMINADO;
});

export default mongoose.model('Empresa', EmpresaSchema);
