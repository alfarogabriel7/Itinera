import mongoose from 'mongoose';
import { NotaSeguimientoSchema } from './notas.js';

const ClienteSchema = new mongoose.Schema(
  {
    // Empresa a la que pertenece el cliente (multi-tenant, igual que Agente).
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    // Agente responsable del cliente (de la misma empresa). Un Agente solo ve a
    // sus clientes; el Administrador ve todos y puede reasignarlos.
    agente: { type: mongoose.Schema.Types.ObjectId, ref: 'Agente', required: true },
    nombreCompleto: { type: String, required: true, trim: true, maxlength: 120 },
    tipoDocumento: { type: String, enum: ['INE', 'Pasaporte', 'Cédula'] },
    numeroDocumento: { type: String, trim: true },
    correo: {
      type: String,
      trim: true,
      lowercase: true,
      // El formulario manda '' cuando no hay correo: se guarda como "sin correo".
      set: (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      match: [/^\S+@\S+\.\S+$/, 'Correo electrónico inválido'],
    },
    telefono: { type: String, required: true, trim: true },
    direccion: { type: String, trim: true },
    fechaNacimiento: { type: Date },
    ciudad: { type: String, trim: true },
    // Datos de interés del cliente para ofrecerle promociones con anticipación
    // (p.ej. "Viaja en agosto, 5 habitaciones dobles"). Se puede buscar desde el listado.
    observaciones: { type: String, trim: true, maxlength: 1000 },
    // Notas de seguimiento con acciones (mismo esquema que Prospecto). Antes era
    // un texto libre; `npm run migrar` convierte ese texto en la primera nota.
    notas: { type: [NotaSeguimientoSchema], default: [] },
    pais: { type: String, required: true, default: 'México', trim: true },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
  },
  { timestamps: true }
);

// Único por empresa, no global: dos empresas distintas sí pueden tener
// cada una un cliente con el mismo correo.
// Correo único por empresa, solo entre clientes que sí tienen correo. (Con
// `sparse` en un índice compuesto no bastaba: como empresa siempre existe, dos
// clientes sin correo de la misma empresa chocaban.)
ClienteSchema.index({ empresa: 1, correo: 1 }, { unique: true, partialFilterExpression: { correo: { $gt: '' } } });
// Listados por empresa y por agente, más recientes primero.
ClienteSchema.index({ empresa: 1, agente: 1, createdAt: -1 });
ClienteSchema.index({ empresa: 1, createdAt: -1 });
ClienteSchema.index({ nombreCompleto: 'text', ciudad: 'text' });

export default mongoose.model('Cliente', ClienteSchema);
