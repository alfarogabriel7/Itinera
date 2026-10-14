import mongoose from 'mongoose';

const { Schema } = mongoose;

// Archivo del comprobante de pago que envía el cliente (PDF o imagen).
// Se guarda en Mongo y no en disco porque en Vercel el sistema de archivos no
// es persistente. Va en su propia colección para que listar pagos no cargue
// los bytes del archivo; el Pago solo guarda la referencia y los metadatos.
const ComprobanteSchema = new Schema(
  {
    empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
    // Pago al que pertenece: un cobro al cliente (Pago) o un pago a proveedor (PagoProveedor).
    pago: { type: Schema.Types.ObjectId, required: true },
    origen: { type: String, enum: ['Pago', 'PagoProveedor'], default: 'Pago' },
    nombreArchivo: { type: String, required: true, trim: true, maxlength: 200 },
    tipo: { type: String, required: true },
    tamano: { type: Number, required: true },
    datos: { type: Buffer, required: true },
    subidoPor: {
      id: { type: Schema.Types.ObjectId, ref: 'Agente' },
      userId: String,
      nombre: String,
    },
  },
  { timestamps: true }
);

ComprobanteSchema.index({ empresa: 1, pago: 1 });

export default mongoose.model('Comprobante', ComprobanteSchema);
