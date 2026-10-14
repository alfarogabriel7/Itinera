import 'dotenv/config';
import { connectDB, Cliente, Proveedor, Reservacion, Pago, Agente, Empresa } from '../database/index.js';

async function seed() {
  await connectDB();

  await Promise.all([
    Cliente.deleteMany({}),
    Proveedor.deleteMany({}),
    Reservacion.deleteMany({}),
    Pago.deleteMany({}),
    Agente.deleteMany({}),
    Empresa.deleteMany({}),
  ]);

  const empresas = await Empresa.insertMany([
    { nombreEmpresa: 'Feliz Viaje Villa Insurgentes', correo: 'contacto@felizviaje.mx', nombreTitular: 'Ana Torres', telefonoPrincipal: '4775551234', rfc: 'FVI850101AB1', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { nombreEmpresa: 'Rutas del Bajío', correo: 'contacto@rutasdelbajio.mx', nombreTitular: 'Marco Vidal', telefonoPrincipal: '4775559876', rfc: 'RBA900202CD2', ciudad: 'León', pais: 'México', estatus: 'Activo' },
  ]);

  // Se usa create() (no insertMany) para que corra el hook pre('save') que hashea la contraseña.
  const [, , laura] = await Agente.create([
    { nombre: 'Super Admin', userId: 'superadmin', rol: 'superAdmin', estatus: 'Activo', password: 'SuperAdmin#1' },
    { nombre: 'Admin General', userId: 'admin', rol: 'Administrador', estatus: 'Activo', password: 'Admin!234', empresa: empresas[0]._id },
    { nombre: 'Laura Gómez', userId: 'laura.gomez', rol: 'Agente', estatus: 'Activo', password: 'Laura#2024', empresa: empresas[0]._id },
    { nombre: 'Ricardo Torres', userId: 'ricardo.torres', rol: 'Agente', estatus: 'Inactivo', password: 'Ricardo$99', empresa: empresas[0]._id },
  ]);

  const clientes = await Cliente.insertMany([
    { empresa: empresas[0]._id, nombreCompleto: 'María González', correo: 'maria.gonzalez@email.com', telefono: '477 222 3344', direccion: 'Av. Principal 123, Col. Centro', fechaNacimiento: '1990-05-15', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[0]._id, nombreCompleto: 'Juan Pérez López', correo: 'juan.perez@email.com', telefono: '477 123 4567', direccion: 'Calle Reforma 45, Col. Álamos', fechaNacimiento: '1985-10-22', ciudad: 'León', pais: 'México', estatus: 'Activo' },
    { empresa: empresas[1]._id, nombreCompleto: 'Carlos Sánchez Rodríguez', correo: 'carlos.sanchez@email.com', telefono: '477 998 8776', direccion: 'Blvd. Independencia 200', fechaNacimiento: '1993-02-11', ciudad: 'Irapuato', pais: 'México', estatus: 'Baja' },
  ]);

  const proveedores = await Proveedor.insertMany([
    { empresa: empresas[0]._id, nombreProveedor: 'Aeroméxico', telefono1: '5551334000', telefono2: '5551334001', numeroCuenta1: '123456789012345678' },
    { empresa: empresas[0]._id, nombreProveedor: 'Hotel Hilton Cancún', telefono1: '9988914000', numeroCuenta1: '987654321098765432', numeroCuenta2: '112233445566778899' },
    { empresa: empresas[1]._id, nombreProveedor: 'Viajes Interjet Regional', telefono1: '4775550001', numeroCuenta1: '112233445566778800' },
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

  console.log('Base de datos poblada con datos de ejemplo.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al poblar la base de datos:', err);
  process.exit(1);
});
