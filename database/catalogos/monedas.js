// Monedas en que se puede vender una reservación. La moneda vive en la
// reservación y se copia a cada abono del cliente y pago a proveedor al
// registrarlo, para que los totales se agrupen por moneda sin cruzar colecciones.
// Los totales nunca se convierten: se muestran por separado.
export const MONEDAS = ['MXN', 'USD'];
export const MONEDA_PREDETERMINADA = 'MXN';

// Definición del campo para los esquemas de Mongoose.
export const campoMoneda = () => ({
  type: String,
  enum: { values: MONEDAS, message: 'Moneda inválida: usa MXN o USD.' },
  default: MONEDA_PREDETERMINADA,
});

// Moneda pedida por query string, o la predeterminada si no es válida.
export const monedaDe = (valor) => (MONEDAS.includes(valor) ? valor : MONEDA_PREDETERMINADA);

// Filtro de consulta por moneda. Los registros anteriores a este campo no lo
// tienen y cuentan como MXN (`npm run migrar` lo deja explícito).
export const filtroMoneda = (moneda) =>
  moneda === MONEDA_PREDETERMINADA ? { moneda: { $nin: MONEDAS.filter((m) => m !== moneda) } } : { moneda };
