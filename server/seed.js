import 'dotenv/config';
import { connectDB, Cliente, Proveedor, Reservacion, Pago, PagoProveedor, Agente, Empresa, Prospecto, Comprobante, Bitacora, IntentoLogin, recalcularSaldos } from '../database/index.js';

// Generador pseudoaleatorio con semilla fija: el histórico de ejemplo sale
// igual en cada corrida del seed.
function mulberry32(semilla) {
  return function () {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIA = 24 * 60 * 60 * 1000;
// Más viajes en Semana Santa (mar-abr), verano (jun-jul) y fin de año (nov-dic).
const TEMPORADA = [0.8, 0.7, 1.15, 1.25, 0.85, 1.1, 1.35, 1.0, 0.7, 0.8, 1.1, 1.45];
const DESTINOS = ['Cancún, México', 'Puerto Vallarta', 'Los Cabos', 'Huatulco', 'Riviera Maya', 'Madrid, España', 'Orlando, EUA', 'Cartagena, Colombia', 'Ixtapa', 'Ciudad de México'];
const FORMAS = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'];

// Histórico de 24 meses de ventas para que el tablero del Administrador y el
// panel del agente tengan datos. Las reservaciones se insertan directo en la
// colección para poder fijar su createdAt (la fecha de venta) en el pasado.
async function sembrarHistorico({ empresa, agentes, clientes, proveedores }) {
  const azar = mulberry32(20261013);
  const entre = (min, max) => min + azar() * (max - min);
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
  const ahora = Date.now();

  const reservaciones = [];
  const pagos = [];
  const pagosProveedor = [];
  for (let k = 23; k >= 0; k--) {
    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(9, 0, 0, 0);
    inicio.setMonth(inicio.getMonth() - k);
    const diasMes = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
    // Tendencia de crecimiento suave (~15% anual) más la temporada.
    const crecimiento = 1 + (23 - k) * 0.012;
    const cantidad = Math.round(6 * TEMPORADA[inicio.getMonth()] * crecimiento + entre(-1, 1.5));

    for (let i = 0; i < cantidad; i++) {
      const creado = inicio.getTime() + Math.floor(entre(0, diasMes)) * DIA + Math.floor(entre(0, 9)) * 60 * 60 * 1000;
      if (creado >= ahora - 60 * 60 * 1000) continue; // nada en el futuro

      // Ricardo (hoy inactivo) solo vendió hasta hace 8 meses; el Admin vende poco.
      const candidatos = agentes.filter((a) => (a.userId !== 'ricardo.torres' || k >= 8) && (a.rol !== 'Administrador' || azar() < 0.25));
      const agente = elegir(candidatos.length ? candidatos : agentes);
      // Cada venta es a un cliente de la cartera de ese agente.
      const cartera = clientes.filter((c) => String(c.agente) === String(agente._id));
      const montoTotal = Math.round(entre(9000, 62000) / 100) * 100;
      const entrada = new Date(creado + Math.floor(entre(20, 130)) * DIA);
      entrada.setUTCHours(0, 0, 0, 0);
      const salida = new Date(entrada.getTime() + Math.floor(entre(3, 9)) * DIA);
      const cancelada = azar() < 0.06;
      const estatus = cancelada ? 'Cancelada' : salida.getTime() < ahora ? 'Completada' : 'Activa';

      const doc = new Reservacion({
        empresa,
        agente: agente._id,
        idCliente: elegir(cartera.length ? cartera : clientes)._id,
        fechaEntrada: entrada,
        fechaSalida: salida,
        destino: elegir(DESTINOS),
        montoTotal,
        estatus,
        detalleReservacion: [
          {
            idProveedor: elegir(proveedores)._id,
            claveReservacion: `HIS-${reservaciones.length + 1}`,
            montoReservacion: Math.round(montoTotal * 0.82),
            porcentajeReservacion: 10,
            montoComisionable: Math.round(montoTotal * 0.82),
          },
        ],
      });
      await doc.validate();
      const obj = doc.toObject({ virtuals: false });
      obj.createdAt = obj.updatedAt = new Date(creado);
      reservaciones.push(obj);

      // Pagos al proveedor: liquidado en viajes terminados, parcial o pendiente en los activos.
      if (estatus !== 'Cancelada') {
        const d = obj.detalleReservacion[0];
        const parte = estatus === 'Completada' ? 1 : azar() < 0.5 ? 0 : 0.5;
        if (parte > 0) {
          pagosProveedor.push({
            empresa, idReservacion: obj._id, idDetalle: d._id, idProveedor: d.idProveedor,
            monto: Math.round(d.totalReservacion * parte * 100) / 100, formaPago: 'Transferencia',
            fecha: new Date(Math.min(ahora - 60 * 60 * 1000, creado + 5 * DIA)), agente: agente._id,
          });
        }
      }

      // Abonos: las completadas quedaron liquidadas; las activas van a medias.
      if (estatus === 'Cancelada') continue;
      const porcentaje = estatus === 'Completada' ? 1 : entre(0, 0.85);
      const totalAbonado = Math.round(montoTotal * porcentaje);
      const nAbonos = totalAbonado === 0 ? 0 : 1 + Math.floor(entre(0, 3));
      const limite = Math.min(ahora - 60 * 60 * 1000, entrada.getTime());
      let restante = totalAbonado;
      for (let j = 0; j < nAbonos; j++) {
        const monto = j === nAbonos - 1 ? restante : Math.round(restante * entre(0.3, 0.6));
        restante -= monto;
        if (monto <= 0) continue;
        pagos.push({
          empresa,
          agente: agente._id,
          idReservacion: obj._id,
          monto,
          formaPago: elegir(FORMAS),
          fecha: new Date(creado + ((limite - creado) * (j + 1)) / (nAbonos + 1)),
        });
      }
    }
  }

  await Reservacion.collection.insertMany(reservaciones);
  await Pago.insertMany(pagos);
  await PagoProveedor.insertMany(pagosProveedor);
  return { reservaciones: reservaciones.length, pagos: pagos.length, pagosProveedor: pagosProveedor.length };
}

async function seed() {
  await connectDB();

  await Promise.all([
    Cliente.deleteMany({}),
    Proveedor.deleteMany({}),
    Reservacion.deleteMany({}),
    Pago.deleteMany({}),
    Agente.deleteMany({}),
    Empresa.deleteMany({}),
    Prospecto.deleteMany({}),
    Comprobante.deleteMany({}),
    Bitacora.deleteMany({}),
    PagoProveedor.deleteMany({}),
    IntentoLogin.deleteMany({}),
  ]);

  const empresas = await Empresa.insertMany([
    { nombreEmpresa: 'Feliz Viaje Villa Insurgentes', correo: 'contacto@felizviaje.mx', nombreTitular: 'Ana Torres', telefonoPrincipal: '4775551234', rfc: 'FVI850101AB1', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { nombreEmpresa: 'Rutas del Bajío', correo: 'contacto@rutasdelbajio.mx', nombreTitular: 'Marco Vidal', telefonoPrincipal: '4775559876', rfc: 'RBA900202CD2', ciudad: 'León', pais: 'México', estatus: 'Activo' },
  ]);

  // Se usa create() (no insertMany) para que corra el hook pre('save') que hashea la contraseña.
  const agentes = await Agente.create([
    { nombre: 'Super Admin', userId: 'superadmin', rol: 'superAdmin', estatus: 'Activo', password: 'SuperAdmin#1' },
    { nombre: 'Admin General', userId: 'admin', rol: 'Administrador', estatus: 'Activo', password: 'Admin!234', empresa: empresas[0]._id },
    { nombre: 'Laura Gómez', userId: 'laura.gomez', rol: 'Agente', estatus: 'Activo', password: 'Laura#2024', empresa: empresas[0]._id },
    { nombre: 'Ricardo Torres', userId: 'ricardo.torres', rol: 'Agente', estatus: 'Inactivo', password: 'Ricardo$99', empresa: empresas[0]._id },
    { nombre: 'Sofía Méndez', userId: 'sofia.mendez', rol: 'Agente', estatus: 'Activo', password: 'Sofia#2025', empresa: empresas[0]._id },
    // Segunda empresa con su propio Administrador: sirve para probar el aislamiento entre empresas.
    { nombre: 'Marco Vidal', userId: 'admin.bajio', rol: 'Administrador', estatus: 'Activo', password: 'Bajio#2026', empresa: empresas[1]._id },
  ]);
  const [, adminGeneral, laura, ricardo, sofia, adminBajio] = agentes;

  const clientes = await Cliente.insertMany([
    { empresa: empresas[0]._id, agente: laura._id, nombreCompleto: 'María González', correo: 'maria.gonzalez@email.com', telefono: '477 222 3344', direccion: 'Av. Principal 123, Col. Centro', fechaNacimiento: '1990-05-15', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: laura._id, nombreCompleto: 'Juan Pérez López', correo: 'juan.perez@email.com', telefono: '477 123 4567', direccion: 'Calle Reforma 45, Col. Álamos', fechaNacimiento: '1985-10-22', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[1]._id, agente: adminBajio._id, nombreCompleto: 'Carlos Sánchez Rodríguez', correo: 'carlos.sanchez@email.com', telefono: '477 998 8776', direccion: 'Blvd. Independencia 200', fechaNacimiento: '1993-02-11', ciudad: 'Irapuato', pais: 'México', estatus: 'Baja' },
    { empresa: empresas[0]._id, agente: sofia._id, nombreCompleto: 'Fernanda Ruiz Ortega', correo: 'fernanda.ruiz@email.com', telefono: '477 310 2201', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: laura._id, nombreCompleto: 'Roberto Medina Salas', correo: 'roberto.medina@email.com', telefono: '477 415 9087', ciudad: 'Silao', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: sofia._id, nombreCompleto: 'Daniela Castro Fuentes', correo: 'daniela.castro@email.com', telefono: '477 528 6634', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: ricardo._id, nombreCompleto: 'Jorge Navarro Ibarra', correo: 'jorge.navarro@email.com', telefono: '462 133 4478', ciudad: 'Irapuato', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: sofia._id, nombreCompleto: 'Patricia Luna Herrera', correo: 'patricia.luna@email.com', telefono: '477 702 1145', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, agente: adminGeneral._id, nombreCompleto: 'Grupo Corporativo Altamira', correo: 'viajes@altamira.com.mx', telefono: '477 800 1200', ciudad: 'León', pais: 'México', estatus: 'Activo' },
  ]);

  const proveedores = await Proveedor.insertMany([
    { empresa: empresas[0]._id, nombreProveedor: 'Aeroméxico', telefono1: '5551334000', telefono2: '5551334001', numeroCuenta1: '123456789012345678' },
    { empresa: empresas[0]._id, nombreProveedor: 'Hotel Hilton Cancún', telefono1: '9988914000', numeroCuenta1: '987654321098765432', numeroCuenta2: '112233445566778899' },
    { empresa: empresas[1]._id, nombreProveedor: 'Viajes Interjet Regional', telefono1: '4775550001', numeroCuenta1: '112233445566778800' },
  ]);

  const historico = await sembrarHistorico({
    empresa: empresas[0]._id,
    agentes: agentes.filter((a) => a.rol !== 'superAdmin' && String(a.empresa) === String(empresas[0]._id)),
    clientes: clientes.filter((c) => String(c.empresa) === String(empresas[0]._id)),
    proveedores: proveedores.filter((p) => String(p.empresa) === String(empresas[0]._id)),
  });

  // Prospectos con acciones de seguimiento (pendientes y completadas) para el panel del agente.
  const haceDias = (n) => new Date(Date.now() - n * DIA);
  await Prospecto.create([
    {
      empresa: empresas[0]._id, agente: laura._id, nombreCompleto: 'Alejandra Vega Torres', telefono: '477 611 2390', correo: 'alejandra.vega@email.com', ciudad: 'León',
      notas: [{
        texto: 'Interesada en viaje de bodas a Riviera Maya para mayo.', fecha: haceDias(9),
        accionesNotas: [
          { descripcion: 'Enviar cotización de 3 hoteles todo incluido', estatus: 'Completada', fecha: haceDias(9), fechaCompletada: haceDias(3) },
          { descripcion: 'Llamar para confirmar fechas y presupuesto', fecha: haceDias(6) },
        ],
      }],
    },
    {
      empresa: empresas[0]._id, agente: laura._id, nombreCompleto: 'Miguel Ángel Rosas', telefono: '477 823 5541', ciudad: 'León',
      notas: [{
        texto: 'Grupo de 8 personas, quieren Madrid en temporada baja.', fecha: haceDias(4),
        accionesNotas: [
          { descripcion: 'Pedir tarifa de grupo a la aerolínea', fecha: haceDias(4) },
          { descripcion: 'Mandar opciones de itinerario por WhatsApp', fecha: haceDias(2) },
        ],
      }],
    },
    {
      empresa: empresas[0]._id, agente: sofia._id, nombreCompleto: 'Lucía Paredes Gil', telefono: '462 297 3310', ciudad: 'Irapuato',
      notas: [{
        texto: 'Pregunta por paquete familiar a Orlando en verano.', fecha: haceDias(5),
        accionesNotas: [{ descripcion: 'Cotizar boletos de parques', fecha: haceDias(5) }],
      }],
    },
  ]);

  const reservacion = await Reservacion.create({
    empresa: empresas[0]._id,
    agente: laura._id,
    idCliente: clientes[0]._id,
    fechaEntrada: '2026-12-15',
    fechaSalida: '2026-12-22',
    destino: 'Cancún, México',
    descripcion: 'Viaje familiar todo incluido, vuelo redondo + hotel.',
    montoTotal: 39900,
    notas: 'Cliente pidió habitación con vista al mar; confirmar con el hotel una semana antes.',
    detalleReservacion: [
      { idProveedor: proveedores[0]._id, claveReservacion: 'AMX-9921X', montoReservacion: 10000, porcentajeReservacion: 16, montoComisionable: 8400 },
      { idProveedor: proveedores[1]._id, claveReservacion: 'HIL-CUN-44', montoReservacion: 25000, porcentajeReservacion: 0, montoComisionable: 25000 },
    ],
  });

  await Pago.create({
    empresa: empresas[0]._id,
    agente: laura._id,
    idReservacion: reservacion._id,
    monto: 14240,
    formaPago: 'Transferencia',
  });

  // Acumulados de cobros y pagos a proveedores en cada reservación.
  await recalcularSaldos();

  console.log(`Base de datos poblada con datos de ejemplo (histórico: ${historico.reservaciones} reservaciones, ${historico.pagos} abonos de clientes, ${historico.pagosProveedor} pagos a proveedores).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al poblar la base de datos:', err);
  process.exit(1);
});
