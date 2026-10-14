import mongoose from 'mongoose';

const TokenRevocadoSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  // Igual al "exp" del JWT: cuando esa fecha pasa, el token ya habría expirado
  // de todos modos, así que Mongo puede borrar el registro (TTL index).
  expiraEn: { type: Date, required: true },
});

TokenRevocadoSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('TokenRevocado', TokenRevocadoSchema);
