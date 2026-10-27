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
//    Notas de clientes: de texto libre a lista de notas con acciones.
//    Moneda: MXN explícito en reservaciones, abonos y pagos a proveedores anteriores.
//    Monto comisionable: en servicios del modo automático, de neto a comisión.
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

// Las notas de Cliente pasaron de texto libre a una lista de notas con acciones
// (como Prospecto). El texto anterior se conserva como la primera nota, con la
// fecha de alta del cliente; si estaba vacío, queda la lista vacía.
async function convertirNotasDeClientes() {
  const conTexto = await Cliente.collection.find({ notas: { $type: 'string' } }, { projection: { notas: 1, createdAt: 1 } }).toArray();
  for (const c of conTexto) {
    const texto = c.notas.trim().slice(0, 1000);
    const notas = texto
      ? [{ _id: new mongoose.Types.ObjectId(), texto, fecha: c.createdAt || new Date(), accionesNotas: [] }]
      : [];
    await Cliente.collection.updateOne({ _id: c._id }, { $set: { notas } });
  }
  console.log(`Notas de clientes convertidas al nuevo formato: ${conTexto.length}.`);
}

// Moneda explícita en reservaciones, abonos y pagos a proveedores anteriores a
// este campo (todos eran en pesos). Abonos y pagos toman la de su reservación.
async function asignarMonedas() {
  const r = await Reservacion.collection.updateMany({ moneda: { $exists: false } }, { $set: { moneda: 'MXN' } });
  let pagos = 0;
  for (const Modelo of [Pago, PagoProveedor]) {
    const sinMoneda = await Modelo.collection.distinct('idReservacion', { moneda: { $exists: false } });
    for (const idReservacion of sinMoneda) {
      const reservacion = await Reservacion.collection.findOne({ _id: idReservacion }, { projection: { moneda: 1 } });
      const u = await Modelo.collection.updateMany(
        { idReservacion, moneda: { $exists: false } },
        { $set: { moneda: reservacion?.moneda || 'MXN' } }
      );
      pagos += u.modifiedCount;
    }
  }
  console.log(`Moneda asignada: ${r.modifiedCount} reservación(es) y ${pagos} pago(s).`);
}

// En modo automático (% de comisión) el formulario guardaba en montoComisionable
// el neto al proveedor en lugar de la comisión. Se corrige a monto base - total.
// Un % mayor a 0 indica modo automático (el manual deja el % en 0); con 0 % solo
// se corrige el caso automático (comisionable = total = monto base → comisión 0).
// Los servicios del modo manual ya guardan la comisión y no se tocan.
async function corregirMontoComisionable() {
  const igual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
  const reservaciones = await Reservacion.collection
    .find({ 'detalleReservacion.0': { $exists: true } }, { projection: { detalleReservacion: 1 } })
    .toArray();
  let corregidos = 0;
  for (const r of reservaciones) {
    for (const d of r.detalleReservacion) {
      const { montoReservacion: monto, porcentajeReservacion: pct = 0, montoComisionable: com, totalReservacion: total } = d;
      const comision = Math.round((monto - total) * 100) / 100;
      const automaticoAnterior = monto > 0 && (pct > 0 ? !igual(com, comision) : igual(com, total) && igual(total, monto));
      if (!automaticoAnterior) continue;
      await Reservacion.collection.updateOne(
        { _id: r._id },
        { $set: { 'detalleReservacion.$[d].montoComisionable': comision } },
        { arrayFilters: [{ 'd._id': d._id }] }
      );
      corregidos++;
    }
  }
  console.log(`Monto comisionable corregido (modo automático) en ${corregidos} servicio(s).`);
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
  await convertirNotasDeClientes();
  await asignarMonedas();
  await corregirMontoComisionable();
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
