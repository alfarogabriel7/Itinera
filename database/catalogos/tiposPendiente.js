// Tipos de pendiente (módulo "Mi día"). Lo comparten el modelo (validación) y
// la pantalla (etiqueta y colores del chip). Para agregar un tipo, basta con
// agregarlo aquí.
export const TIPOS_PENDIENTE = {
  cotizacion: { nombre: 'Cotización', color: '#1D4ED8', fondo: '#E8EEFC' },
  pago: { nombre: 'Pago', color: '#15803D', fondo: '#E5F4EA' },
  documentos: { nombre: 'Documentos', color: '#7E22CE', fondo: '#F3E8FD' },
  peticion: { nombre: 'Petición del cliente', color: '#C2410C', fondo: '#FDEDE4' },
  proveedor: { nombre: 'Proveedor', color: '#0F766E', fondo: '#E1F3F1' },
  viaje: { nombre: 'Viaje', color: '#4B5563', fondo: '#ECEEF1' },
  otro: { nombre: 'Seguimiento', color: '#334155', fondo: '#F1F5F9' },
};

export const CLAVES_TIPO_PENDIENTE = Object.keys(TIPOS_PENDIENTE);
