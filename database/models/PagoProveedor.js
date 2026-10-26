import mongoose from 'mongoose';
import { campoMoneda } from '../catalogos/monedas.js';

const { Schema } = mongoose;

// Abono de la agencia a un proveedor por un servicio de una reservación
// (cuentas por pagar). Cada abono se liga al renglón concreto del detalle de la
// reservación (idDetalle), cuyo totalReservacion es lo que se le debe al
// proveedor una vez descontada la comisión de la agencia.
const PagoProveedorSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    idReservacion: { type: Schema.Types.ObjectId, ref: 'Reservacion', required: true },
    // _id del renglón en reservacion.detalleReservacion.
    idDetalle: { type: Schema.Types.ObjectId, required: true },
    idProveedor: { type: Schema.Types.ObjectId, ref: 'Proveedor', required: true },
    monto: { type: Number, required: true, min: 0.01 },
    // Copiada de la reservación al registrar el pago (para totales por moneda).
    moneda: campoMoneda(),
    formaPago: {
      type: String,
      enum: ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'],
      required: true,
    },
    // Folio/clave de rastreo SPEI o número de autorización (opcional).
    referencia: { type: String, trim: true, maxlength: 60 },
    fecha: { type: Date, default: Date.now },
    // Capturista: quien registró el pago en el sistema.
    agente: { type: Schema.Types.ObjectId, ref: 'Agente', required: true },
    comprobante: {
      id: { type: Schema.Types.ObjectId, ref: 'Comprobante' },
      nombreArchivo: String,
      tipo: String,
      tamano: Number,
      fechaSubida: Date,
    },
    // Igual que los cobros: nunca se borran; el Administrador los cancela.
    estatus: { type: String, enum: ['Aplicado', 'Cancelado'], default: 'Aplicado' },
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

PagoProveedorSchema.index({ idReservacion: 1, idDetalle: 1, estatus: 1 });
PagoProveedorSchema.index({ empresa: 1, fecha: -1 });
PagoProveedorSchema.index({ empresa: 1, idProveedor: 1, fecha: -1 });

export default mongoose.model('PagoProveedor', PagoProveedorSchema, 'pagosproveedores');
