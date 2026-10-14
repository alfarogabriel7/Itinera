import mongoose from 'mongoose';

// Intentos fallidos de inicio de sesión, para limitar ataques de fuerza bruta.
// Se guarda en Mongo (no en memoria) porque en Vercel cada petición puede caer
// en una instancia distinta. Cada registro expira solo (TTL) al cerrar su ventana.
const IntentoLoginSchema = new mongoose.Schema({
  // 'usuario:<userId>|<ip>' o 'ip:<ip>'
  clave: { type: String, required: true, unique: true },
  intentos: { type: Number, default: 0 },
  expiraEn: { type: Date, required: true },
});

IntentoLoginSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('IntentoLogin', IntentoLoginSchema, 'intentoslogin');
