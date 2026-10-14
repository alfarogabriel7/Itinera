import { useCallback, useEffect, useRef, useState } from 'react';

// Listado paginado del lado del servidor. `cargar(params)` debe llamar a la API
// con { pagina, porPagina, q, ...filtros } y regresar el sobre estándar
// { datos, total, pagina, porPagina, totalPaginas }.
//
// - La búsqueda espera 300 ms después de la última tecla antes de consultar.
// - Cambiar búsqueda, tamaño de página o filtros regresa a la página 1 en la
//   misma consulta (sin pedir primero la página vieja).
// - Mientras recarga se conserva el resultado anterior (sin parpadeo).
export function useListadoRemoto(cargar, { porPaginaInicial = 25, filtros = {} } = {}) {
  const filtrosClave = JSON.stringify(filtros);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState({ pagina: 1, porPagina: porPaginaInicial, q: '', filtrosClave });
  const [resultado, setResultado] = useState({ datos: [], total: 0, totalPaginas: 1 });
  const [extra, setExtra] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    const t = setTimeout(() => {
      const q = busqueda.trim();
      setConsulta((c) => (c.q === q ? c : { ...c, q, pagina: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    setConsulta((c) => (c.filtrosClave === filtrosClave ? c : { ...c, filtrosClave, pagina: 1 }));
  }, [filtrosClave]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const { pagina, porPagina, q } = consulta;
    cargarRef.current({ pagina, porPagina, ...(q ? { q } : {}), ...JSON.parse(consulta.filtrosClave) })
      .then((r) => {
        if (cancelado) return;
        const { datos, total, totalPaginas, pagina: _p, porPagina: _pp, ...resto } = r;
        setResultado({ datos, total, totalPaginas });
        setExtra(resto); // p.ej. indicadores de cobranza
        setError('');
      })
      .catch((err) => { if (!cancelado) setError(err.message || 'No se pudo cargar la información.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [consulta, version]);

  return {
    ...resultado,
    extra,
    cargando,
    error,
    busqueda,
    setBusqueda,
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
    setPagina: useCallback((p) => setConsulta((c) => ({ ...c, pagina: typeof p === 'function' ? p(c.pagina) : p })), []),
    setPorPagina: useCallback((n) => setConsulta((c) => ({ ...c, porPagina: n, pagina: 1 })), []),
    recargar: useCallback(() => setVersion((v) => v + 1), []),
  };
}
