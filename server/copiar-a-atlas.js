// Copia la base local a MongoDB Atlas (u otro servidor), colección por
// colección y conservando los _id:
//   npm run copiar-a-atlas -- "mongodb+srv://USUARIO:CONTRASEÑA@cluster.xxxxx.mongodb.net/agencia_viajes"
//
// Origen: ORIGEN_URI o mongodb://localhost:27017/agencia_viajes.
// Por seguridad se detiene si alguna colección del destino ya tiene datos;
// con --reemplazar las vacía antes de copiar.
// Después conviene correr `npm run migrar` contra Atlas para crear los índices.
import mongoose from 'mongoose';

const { MongoClient } = mongoose.mongo;
const ORIGEN = process.env.ORIGEN_URI || 'mongodb://localhost:27017/agencia_viajes';
const DESTINO = process.argv.slice(2).find((a) => !a.startsWith('--'));
const reemplazar = process.argv.includes('--reemplazar');
const LOTE = 1000;

if (!DESTINO) {
  console.error('Uso: npm run copiar-a-atlas -- "<URI de Atlas con /agencia_viajes>" [--reemplazar]');
  process.exit(1);
}

const origen = new MongoClient(ORIGEN);
const destino = new MongoClient(DESTINO);

try {
  await Promise.all([origen.connect(), destino.connect()]);
  const dbOrigen = origen.db();
  const dbDestino = destino.db();
  if (dbDestino.databaseName === 'test') {
    throw new Error('La URI de destino no indica base de datos: agrega /agencia_viajes antes del "?".');
  }
  console.log(`Origen: ${dbOrigen.databaseName}  →  Destino: ${dbDestino.databaseName}`);

  const colecciones = (await dbOrigen.listCollections({ type: 'collection' }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

  if (!reemplazar) {
    for (const nombre of colecciones) {
      if (await dbDestino.collection(nombre).estimatedDocumentCount()) {
        throw new Error(`La colección "${nombre}" ya tiene datos en el destino. Usa --reemplazar para sobrescribir.`);
      }
    }
  }

  for (const nombre of colecciones) {
    const col = dbDestino.collection(nombre);
    if (reemplazar) await col.deleteMany({});
    let lote = [];
    let total = 0;
    for await (const doc of dbOrigen.collection(nombre).find()) {
      lote.push(doc);
      if (lote.length === LOTE) {
        await col.insertMany(lote, { ordered: false });
        total += lote.length;
        lote = [];
      }
    }
    if (lote.length) {
      await col.insertMany(lote, { ordered: false });
      total += lote.length;
    }
    console.log(`  ${nombre}: ${total}`);
  }
  console.log('Copia terminada. Ahora corre `npm run migrar` con MONGODB_URI apuntando a Atlas para crear los índices.');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await Promise.all([origen.close(), destino.close()]);
}
