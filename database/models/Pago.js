import mongoose from 'mongoose';

const { Schema } = mongoose;

const PagoSchema = new Schema(
  {
    // Denormalizados desde la reservación al momento de crear el pago, para
    // poder filtrar por empresa/agente sin tener que ir a buscar la reservación
    // en cada consulta (multi-tenant, igual que el resto de las colecciones).
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    agente: { type: Schema.Types.ObjectId, ref: 'Agente', required: true },
    idReservacion: { type: Schema.Types.ObjectId, ref: 'Reservacion', required: true },
    monto: { type: Number, required: true, min: 0 },
    formaPago: {
      type: String,
      enum: ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'],
      required: true,
    },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PagoSchema.index({ idReservacion: 1 });
PagoSchema.index({ empresa: 1 });
PagoSchema.index({ agente: 1 });

export default mongoose.model('Pago', PagoSchema);
