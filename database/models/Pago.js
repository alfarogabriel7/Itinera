import mongoose from 'mongoose';
import { campoMoneda } from '../catalogos/monedas.js';

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
    // Copiada de la reservación al registrar el abono (para totales por moneda).
    moneda: campoMoneda(),
    formaPago: {
      type: String,
      enum: ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia', 'Depósito'],
      required: true,
    },
    fecha: { type: Date, default: Date.now },
    // Número de autorización de la tarjeta o folio/clave de rastreo del SPEI (opcional).
    referencia: { type: String, trim: true, maxlength: 60 },
    // Metadatos del comprobante que mandó el cliente; el archivo vive en la colección Comprobante.
    comprobante: {
      id: { type: Schema.Types.ObjectId, ref: 'Comprobante' },
      nombreArchivo: String,
      tipo: String,
      tamano: Number,
      fechaSubida: Date,
    },
    // Los abonos nunca se borran: un abono capturado por error se cancela
    // (solo el Administrador de la empresa) y deja de contar para el saldo,
    // pero se conserva con quién, cuándo y por qué lo canceló.
    // 'Pendiente': la empresa pide autorizar los pagos (Mi agencia) y el
    // Administrador aún no lo autoriza; no cuenta para el saldo. Si lo rechaza, queda Cancelado.
    estatus: { type: String, enum: ['Aplicado', 'Pendiente', 'Cancelado'], default: 'Aplicado' },
    autorizadoPor: {
      id: { type: Schema.Types.ObjectId, ref: 'Agente' },
      userId: String,
      nombre: String,
    },
    fechaAutorizacion: { type: Date },
    motivoCancelacion: { type: String, trim: true, maxlength: 300 },
    fechaCancelacion: { type: Date },
    canceladoPor: {
      id: { type: Schema.Types.ObjectId, ref: 'Agente' },
      userId: String,
      nombre: String,
    },
  },
  { timestamps: true }
);

PagoSchema.index({ idReservacion: 1, estatus: 1 });
PagoSchema.index({ empresa: 1, fecha: -1 });
PagoSchema.index({ empresa: 1, agente: 1, fecha: -1 });
// Bandeja de Autorizaciones.
PagoSchema.index({ empresa: 1, estatus: 1, createdAt: 1 }, { partialFilterExpression: { estatus: 'Pendiente' } });

export default mongoose.model('Pago', PagoSchema);
