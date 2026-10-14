import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/agencia_viajes';

export async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log('Conectado a MongoDB:', mongoose.connection.name);
}

export default connectDB;
