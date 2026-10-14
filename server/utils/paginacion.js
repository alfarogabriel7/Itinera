// Paginación del lado del servidor. Todos los listados responden con el mismo
// formato para que el frontend use un solo componente/hook:
//   { datos, total, pagina, porPagina, totalPaginas }
// Query string: ?pagina=1&porPagina=25 (porPagina máx. 100; con ?exportar=1
// se permiten hasta 5000 para descargas como el CSV de cobranza).

export const POR_PAGINA_DEFECTO = 25;
const MAXIMO = 100;
const MAXIMO_EXPORTAR = 5000;

export function leerPaginacion(req, { porPaginaDefecto = POR_PAGINA_DEFECTO } = {}) {
  const maximo = req.query.exportar === '1' ? MAXIMO_EXPORTAR : MAXIMO;
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = Math.min(maximo, Math.max(1, parseInt(req.query.porPagina, 10) || porPaginaDefecto));
  return { pagina, porPagina, saltar: (pagina - 1) * porPagina };
}

export function sobre(datos, total, { pagina, porPagina }) {
  return { datos, total, pagina, porPagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
}

// Ejecuta find + countDocuments en paralelo con el mismo filtro (que ya debe
// venir acotado por empresa con alcanceEmpresa).
//   populate: [['agente', 'nombre'], ...]
export async function paginar(Modelo, filtro, req, { orden = { createdAt: -1 }, populate = [], select } = {}) {
  const p = leerPaginacion(req);
  let consulta = Modelo.find(filtro).sort({ ...orden, _id: -1 }).skip(p.saltar).limit(p.porPagina);
  for (const args of populate) consulta = consulta.populate(...args);
  if (select) consulta = consulta.select(select);
  const [datos, total] = await Promise.all([consulta, Modelo.countDocuments(filtro)]);
  return sobre(datos, total, p);
}

// Orden pedido por query (?orden=nombre) traducido a un campo permitido.
export function ordenDe(req, opciones, porDefecto) {
  return opciones[req.query.orden] || porDefecto;
}
