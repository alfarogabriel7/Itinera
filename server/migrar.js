// Migración de datos existentes al modelo multi-empresa reforzado.
// Se puede correr varias veces sin efectos secundarios (idempotente):
//   npm run migrar
//
// 1. Clientes sin agente responsable: se les asigna el agente de su
//    reservación más reciente; si no tienen, el Administrador de su empresa
//    (que después puede reasignarlos desde Clientes).
// 2. Índices: crea los nuevos índices compuestos por empresa y elimina los que
//    ya no están declarados en los modelos (syncIndexes).
// 0. Estatus de agentes: "Inactivo" → "Baja" (homologado con Empresas).
// 3. Saldos: recalcula en cada reservación el acumulado abonado por el cliente
//    y lo pagado a cada proveedor, a partir de los pagos aplicados (necesario
//    para la aplicación atómica de pagos; también sirve para reconciliar).
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  connectDB, Cliente, Agente, Reservacion, Empresa, Proveedor, Prospecto, Pago, PagoProveedor, Bitacora, Comprobante, TokenRevocado,
  IntentoLogin, recalcularSaldos,
} from '../database/index.js';

async function asignarAgenteAClientes() {
  const sinAgente = await Cliente.find({ agente: { $exists: false } }).select('_id empresa nombreCompleto').lean();
  let porReservacion = 0;
  let porAdministrador = 0;
  const sinResolver = [];

  for (const c of sinAgente) {
    const ultima = await Reservacion.findOne({ idCliente: c._id, empresa: c.empresa }).sort({ createdAt: -1 }).select('agente').lean();
    let agente = ultima?.agente;
    if (agente) porReservacion++;
    else {
      const admin = await Agente.findOne({ empresa: c.empresa, rol: 'Administrador' }).select('_id').lean();
      agente = admin?._id;
      if (agente) porAdministrador++;
    }
    if (!agente) {
      sinResolver.push(c);
      continue;
    }
    // updateOne directo: el cliente aún no cumple el esquema (le falta agente).
    await Cliente.collection.updateOne({ _id: c._id }, { $set: { agente } });
  }
  console.log(`Clientes sin agente: ${sinAgente.length} → ${porReservacion} por su última reservación, ${porAdministrador} al Administrador.`);
  if (sinResolver.length) {
    console.warn(`  ${sinResolver.length} cliente(s) quedaron sin agente porque su empresa no tiene Administrador:`);
    sinResolver.forEach((c) => console.warn(`   - ${c.nombreCompleto} (${c._id})`));
  }
}

// Estatus de agentes homologado con Empresas: "Inactivo" pasó a llamarse "Baja".
async function homologarEstatusAgentes() {
  const r = await Agente.collection.updateMany({ estatus: 'Inactivo' }, { $set: { estatus: 'Baja' } });
  console.log(`Agentes con estatus "Inactivo" cambiados a "Baja": ${r.modifiedCount}.`);
}

async function sincronizarIndices() {
  for (const Modelo of [Empresa, Agente, Cliente, Proveedor, Prospecto, Reservacion, Pago, PagoProveedor, Bitacora, Comprobante, TokenRevocado, IntentoLogin]) {
    const eliminados = await Modelo.syncIndexes();
    console.log(`Índices de ${Modelo.modelName} sincronizados${eliminados.length ? ` (eliminados: ${eliminados.join(', ')})` : ''}.`);
  }
}

try {
  await connectDB();
  await homologarEstatusAgentes();
  await asignarAgenteAClientes();
  await sincronizarIndices();
  console.log(`Saldos recalculados en ${await recalcularSaldos()} reservación(es).`);
  console.log('Migración terminada.');
} catch (err) {
  console.error('Error en la migración:', err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
