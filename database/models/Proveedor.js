import mongoose from 'mongoose';

const ProveedorSchema = new mongoose.Schema(
  {
    // Empresa a la que pertenece el proveedor (multi-tenant, igual que Agente/Cliente).
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    nombreProveedor: { type: String, required: true, trim: true, maxlength: 100 },
    telefono1: { type: String, required: true, trim: true },
    telefono2: { type: String, trim: true },
    // Cuenta bancaria o CLABE: solo dígitos (la CLABE tiene 18).
    numeroCuenta1: { type: String, required: true, trim: true, maxlength: 18, match: [/^\d+$/, 'La cuenta bancaria solo puede contener números'] },
    numeroCuenta2: { type: String, trim: true, maxlength: 18, match: [/^\d+$/, 'La cuenta bancaria solo puede contener números'] },
    // % de comisión que el proveedor le da a la agencia. Se precarga en el
    // "% Comisión" del servicio al elegir este proveedor en una reservación.
    porcentajeComision: { type: Number, default: 0, min: [0, 'El % de comisión no puede ser negativo'], max: [100, 'El % de comisión no puede ser mayor a 100'] },
    estatus: { type: String, enum: ['Activo', 'Baja'], default: 'Activo' },
  },
  { timestamps: true }
);

ProveedorSchema.index({ nombreProveedor: 'text' });
ProveedorSchema.index({ empresa: 1, createdAt: -1 });

export default mongoose.model('Proveedor', ProveedorSchema);
