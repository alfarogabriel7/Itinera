import mongoose from 'mongoose';
import { Cliente } from '../../database/index.js';
import { alcanceEmpresa } from '../middleware/tenant.js';

// Cartera de un Agente para los módulos de seguimiento de dinero (Cobranza
// Clientes y Pago a Proveedores): las reservaciones que él vendió y las de los
// clientes que tiene asignados, aunque otro agente haya registrado la venta.
// El Administrador ve toda la empresa ({}). Registrar abonos y pagos sigue
// abierto a todos los usuarios de la empresa.
export async function filtroCartera(req) {
  if (req.agente.rol !== 'Agente') return {};
  const yo = new mongoose.Types.ObjectId(String(req.agente.id));
  const misClientes = await Cliente.distinct('_id', alcanceEmpresa(req, { agente: yo }));
  return { $or: [{ agente: yo }, { idCliente: { $in: misClientes } }] };
}
