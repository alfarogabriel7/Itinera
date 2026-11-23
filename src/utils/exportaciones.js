// Exportaciones a Excel de los pagos de una reservación. Las usan Registro de
// Pagos y la ficha de la reservación, para que el archivo sea el mismo.
import { descargarExcel, nombreArchivo } from './excel';
import { fechaViaje } from './formato';
import { folioDePago } from './recibo';

const cuenta = (p) => p.estatus !== 'Cancelado' && p.estatus !== 'Pendiente';
const r2 = (n) => Math.round(n * 100) / 100;
const textoEstatus = (p) => (p.estatus === 'Pendiente' ? 'Por autorizar' : (p.estatus || 'Aplicado'));

// Abonos del cliente. `resumen` = respuesta de GET /api/pagos/resumen/:idReservacion.
// Incluye cancelados y por autorizar (con su estatus); el total suma solo los aplicados.
export function exportarAbonosExcel(resumen) {
  const r = resumen;
  const pagos = [...r.pagos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  descargarExcel(nombreArchivo('abonos', r.cliente, r.destino), {
    hoja: 'Abonos',
    titulo: 'Historial de abonos del cliente',
    datos: [
      ['Cliente', r.cliente],
      ['Viaje', r.destino],
      ['Fechas', `${fechaViaje(r.fechaEntrada)} al ${fechaViaje(r.fechaSalida)}`],
      ['Vendió', r.vendedor || '—'],
      ['Moneda', r.moneda || 'MXN'],
      ['Total de la reservación', r.total, 'moneda'],
      ['Abonado', r.pagado, 'moneda'],
      ['Saldo pendiente', r.saldo, 'moneda'],
      ...(r.porAutorizar > 0 ? [['Por autorizar', r.porAutorizar, 'moneda']] : []),
    ],
    columnas: [
      { titulo: 'Fecha del pago', tipo: 'fecha' },
      { titulo: 'Folio', ancho: 11 },
      { titulo: 'Monto', tipo: 'moneda' },
      { titulo: 'Forma de pago', ancho: 18 },
      { titulo: 'Referencia', ancho: 20 },
      { titulo: 'Capturó', ancho: 22 },
      { titulo: 'Capturado el', tipo: 'fecha' },
      { titulo: 'Estatus', ancho: 14 },
      { titulo: 'Autorizó', ancho: 22 },
      { titulo: 'Motivo de cancelación', ancho: 36 },
    ],
    filas: pagos.map(p => [
      new Date(p.fecha), folioDePago(p), p.monto, p.formaPago, p.referencia || '', p.agente?.nombre || '',
      p.createdAt ? new Date(p.createdAt) : null, textoEstatus(p),
      p.autorizadoPor?.nombre || '', p.estatus === 'Cancelado' ? p.motivoCancelacion || '' : '',
    ]),
    totales: ['Total aplicado', null, r2(pagos.filter(cuenta).reduce((a, p) => a + p.monto, 0))],
  });
}

// Pagos a proveedores. `estado` = respuesta de GET /api/pagos-proveedor/reservacion/:id.
export function exportarPagosProveedorExcel(estado, cliente = '') {
  const claves = new Map(estado.detalles.map(d => [String(d.idDetalle), d.claveReservacion]));
  const pagos = [...estado.pagos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const porAutorizar = estado.totales.porAutorizar || 0;
  descargarExcel(nombreArchivo('pagos-proveedores', cliente, estado.destino), {
    hoja: 'Pagos a proveedores',
    titulo: 'Historial de pagos a proveedores',
    datos: [
      ...(cliente ? [['Cliente', cliente]] : []),
      ['Viaje', estado.destino],
      ['Moneda', estado.moneda || 'MXN'],
      ['Total a pagar a proveedores', estado.totales.total, 'moneda'],
      ['Pagado', estado.totales.pagado, 'moneda'],
      ['Saldo con proveedores', estado.totales.saldo, 'moneda'],
      ...(porAutorizar > 0 ? [['Por autorizar', porAutorizar, 'moneda']] : []),
    ],
    columnas: [
      { titulo: 'Fecha del pago', tipo: 'fecha' },
      { titulo: 'Proveedor', ancho: 26 },
      { titulo: 'Clave del servicio', ancho: 18 },
      { titulo: 'Monto', tipo: 'moneda' },
      { titulo: 'Forma de pago', ancho: 18 },
      { titulo: 'Referencia', ancho: 20 },
      { titulo: 'Capturó', ancho: 22 },
      { titulo: 'Capturado el', tipo: 'fecha' },
      { titulo: 'Estatus', ancho: 14 },
      { titulo: 'Autorizó', ancho: 22 },
      { titulo: 'Motivo de cancelación', ancho: 36 },
    ],
    filas: pagos.map(p => [
      new Date(p.fecha), p.idProveedor?.nombreProveedor || '', claves.get(String(p.idDetalle)) || '', p.monto, p.formaPago,
      p.referencia || '', p.agente?.nombre || '', p.createdAt ? new Date(p.createdAt) : null, textoEstatus(p),
      p.autorizadoPor?.nombre || '', p.estatus === 'Cancelado' ? p.motivoCancelacion || '' : '',
    ]),
    totales: ['Total aplicado', null, null, r2(pagos.filter(cuenta).reduce((a, p) => a + p.monto, 0))],
  });
}
