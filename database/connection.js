import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/agencia_viajes';

// Una sola conexión por proceso, reutilizada entre peticiones. En Vercel cada
// instancia de la función atiende muchas peticiones: sin este caché cada una
// abriría su propio pool y se agotarían las conexiones de Atlas.
let conexion = null;

export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!conexion) {
    conexion = mongoose
      .connect(MONGODB_URI, {
        maxPoolSize: Number(process.env.MONGODB_POOL || 10),
        serverSelectionTimeoutMS: 10_000,
      })
      .then(() => {
        console.log('Conectado a MongoDB:', mongoose.connection.name);
        return mongoose.connection;
      })
      .catch((err) => {
        conexion = null; // permitir reintentar en la siguiente petición
        throw err;
      });
  }
  return conexion;
}

export default connectDB;
