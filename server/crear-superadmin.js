// Crea el usuario superAdmin en una base nueva (p.ej. producción en Atlas),
// sin los datos de ejemplo del seed:
//   npm run crear-superadmin
//
// Toma los datos de variables de entorno (o del archivo .env), para que la
// contraseña no quede en el código ni en el historial de la terminal:
//   SUPERADMIN_PASSWORD   obligatoria: 8+ caracteres, mayúscula, número y carácter especial
//   SUPERADMIN_USUARIO    opcional (por defecto "superadmin")
//   SUPERADMIN_NOMBRE     opcional (por defecto "Super Admin")
// La base destino es MONGODB_URI. Si el usuario ya existe no hace nada; con
// --cambiar-password le asigna la contraseña de SUPERADMIN_PASSWORD.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { connectDB, Agente } from '../database/index.js';

const userId = (process.env.SUPERADMIN_USUARIO || 'superadmin').trim().toLowerCase();
const nombre = process.env.SUPERADMIN_NOMBRE || 'Super Admin';
const password = process.env.SUPERADMIN_PASSWORD;
const cambiarPassword = process.argv.includes('--cambiar-password');

if (!password) {
  console.error('Falta SUPERADMIN_PASSWORD (en el archivo .env o como variable de entorno).');
  process.exit(1);
}

// En .env un "#" sin comillas inicia un comentario: "Clave#2026" se leería
// como "Clave" y el usuario quedaría con una contraseña distinta a la escrita.
const lineaEnv = existsSync('.env')
  ? readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => /^\s*SUPERADMIN_PASSWORD\s*=/.test(l))
  : null;
if (lineaEnv) {
  const escrita = lineaEnv.slice(lineaEnv.indexOf('=') + 1).trim();
  if (!/^["'`]/.test(escrita) && escrita.includes('#')) {
    console.error('SUPERADMIN_PASSWORD contiene "#": escríbela entre comillas en el .env, p.ej. SUPERADMIN_PASSWORD="Clave#2026".');
    process.exit(1);
  }
}

try {
  const conexion = await connectDB();
  console.log(`Base: ${conexion.name} en ${conexion.host}`);

  const existente = await Agente.findOne({ userId });
  if (existente && !cambiarPassword) {
    console.log(`El usuario "${userId}" ya existe (rol ${existente.rol}); no se modificó. Usa --cambiar-password para asignarle la contraseña nueva.`);
  } else if (existente) {
    existente.password = password; // el hook pre('save') la hashea
    await existente.save();
    console.log(`Contraseña de "${userId}" actualizada.`);
  } else {
    await Agente.create({ nombre, userId, rol: 'superAdmin', estatus: 'Activo', password });
    console.log(`Usuario superAdmin "${userId}" creado.`);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
