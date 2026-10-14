import mongoose from 'mongoose';

const { Schema } = mongoose;

const DetalleReservacionSchema = new Schema(
  {
    idProveedor: { type: Schema.Types.ObjectId, ref: 'Proveedor', required: true },
    claveReservacion: { type: String, required: true, trim: true },
    montoReservacion: { type: Number, required: true, min: 0 },
    porcentajeReservacion: { type: Number, default: 0, min: 0, max: 100 },
    montoComisionable: { type: Number, required: true, min: 0 },
    totalReservacion: { type: Number, min: 0 },
  },
  { _id: true }
);

// Calcula el total (monto + comisión/impuesto) si no viene definido explícitamente.
DetalleReservacionSchema.pre('validate', function () {
  if (this.totalReservacion == null) {
    //this.totalReservacion = this.montoReservacion * (1 + this.porcentajeReservacion / 100);
    this.totalReservacion = ( this.montoReservacion - ( (this.montoReservacion * this.porcentajeReservacion ) / 100) );
  }
});

const ReservacionSchema = new Schema(
  {
    // Empresa a la que pertenece la reservación (multi-tenant, igual que Agente/Cliente/Proveedor).
    // Toda reservación depende primero de la empresa, y el cliente elegido debe pertenecer a ella.
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    idCliente: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    // Agente de la sesión que registró la reservación (nunca se elige en el formulario).
    agente: { type: Schema.Types.ObjectId, ref: 'Agente', required: true },
    fechaEntrada: { type: Date, required: true },
    fechaSalida: { type: Date, required: true },
    destino: { type: String, required: true, trim: true, maxlength: 100 },
    descripcion: { type: String, trim: true, maxlength: 500 },
    // Monto total cobrado al cliente por la reservación (precio de venta, no el costo con proveedores).
    montoTotal: { type: Number, required: true, min: 0 },
    // Notas o pendientes que deja el agente sobre la reservación.
    notas: { type: String, trim: true, maxlength: 1000 },
    detalleReservacion: { type: [DetalleReservacionSchema], default: [] },
    estatus: { type: String, enum: ['Activa', 'Cancelada', 'Completada'], default: 'Activa' },
  },
  { timestamps: true }
);

ReservacionSchema.index({ empresa: 1 });
ReservacionSchema.index({ agente: 1 });
ReservacionSchema.index({ idCliente: 1 });
ReservacionSchema.index({ destino: 'text' });

// Costo total del viaje (suma del detalle embebido).
ReservacionSchema.virtual('totalViaje').get(function () {
  return this.detalleReservacion.reduce((acc, d) => acc + (d.totalReservacion || 0), 0);
});
ReservacionSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Reservacion', ReservacionSchema);
