import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dinero, dineroCompacto, variacion, nombreMes } from '../../utils/formato';

// Columnas de ventas mensuales (una sola serie) con:
//  - marcador ▲/▼ bajo cada mes: ¿vendió más o menos que el mes anterior?
//    (forma + color de estado, nunca solo color),
//  - línea de promedio de los últimos 12 meses completos,
//  - el mes en curso en tono claro (va a medias) y comparado contra los mismos
//    días del mes anterior,
//  - tooltip por columna (mouse y teclado).
// Las barras usan los colores del tema de la empresa (clases fill-brand-*,
// ver database/catalogos/temas.js); los de estado son fijos: #059669 / #dc2626.

const COLOR_SUBE = '#059669';
const COLOR_BAJA = '#dc2626';
const COLOR_GRID = '#e2e8f0';
const COLOR_TEXTO = '#64748b';

const ALTO_GRAFICA = 240;
const MARGEN_BASE = { arriba: 24, derecha: 12, abajo: 52 };

// Halo del color del fondo para que las etiquetas sobre la gráfica se lean
// aunque crucen una barra o la línea de promedio.
const HALO = { paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round' };

// Escala "bonita": tope y paso redondos para los ticks del eje Y.
function escalaBonita(max, ticks = 4) {
  if (max <= 0) return { tope: 1000, paso: 250 };
  const bruto = max / ticks;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * magnitud).find((p) => p >= bruto);
  return { tope: Math.ceil(max / paso) * paso, paso };
}

// Rectángulo con las esquinas de arriba redondeadas (4px) y base recta.
function barra(x, y, ancho, alto) {
  const r = Math.min(4, ancho / 2, alto);
  return `M${x},${y + alto}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y + alto}Z`;
}

function Triangulo({ cx, cy, sube }) {
  const d = sube ? `M${cx - 4},${cy + 3}L${cx + 4},${cy + 3}L${cx},${cy - 4}Z` : `M${cx - 4},${cy - 3}L${cx + 4},${cy - 3}L${cx},${cy + 4}Z`;
  return <path d={d} fill={sube ? COLOR_SUBE : COLOR_BAJA} />;
}

function Variacion({ valor, etiqueta }) {
  if (valor === null || valor === undefined) return null;
  const sube = valor >= 0;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{etiqueta}</span>
      <span className={`font-semibold ${sube ? 'text-emerald-600' : 'text-red-600'}`}>
        {sube ? '▲' : '▼'} {Math.abs(valor).toFixed(1)}%
      </span>
    </div>
  );
}

export default function GraficaVentas({ meses, variacionEnCurso, diaDelMes }) {
  const contenedor = useRef(null);
  const [ancho, setAncho] = useState(720);
  const [activo, setActivo] = useState(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entrada]) => setAncho(Math.max(240, Math.floor(entrada.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const datos = useMemo(() => {
    const completos = meses.filter((m) => !m.enCurso);
    const ultimos12 = completos.slice(-12);
    const promedio = ultimos12.length ? ultimos12.reduce((a, m) => a + m.ventas, 0) / ultimos12.length : 0;
    const mejor = completos.reduce((b, m) => (m.ventas > (b?.ventas ?? -1) ? m : b), null);
    const porClave = new Map(meses.map((m) => [m.mes, m]));
    const filas = meses.map((m, i) => {
      const anterior = i > 0 ? meses[i - 1] : null;
      const [a, mm] = m.mes.split('-');
      const haceUnAnio = porClave.get(`${Number(a) - 1}-${mm}`);
      return {
        ...m,
        vsAnterior: m.enCurso ? variacionEnCurso : anterior ? variacion(m.ventas, anterior.ventas) : null,
        vsAnioAnterior: haceUnAnio && !m.enCurso ? variacion(m.ventas, haceUnAnio.ventas) : null,
        claveAnioAnterior: haceUnAnio?.mes,
      };
    });
    return { filas, promedio, mejor };
  }, [meses, variacionEnCurso]);

  const { tope, paso } = escalaBonita(Math.max(...meses.map((m) => m.ventas), datos.promedio));
  // En celular se angosta el margen del eje Y para dejarle más espacio a las barras.
  const MARGEN = { ...MARGEN_BASE, izquierda: ancho < 480 ? 44 : 56 };
  const anchoPlot = ancho - MARGEN.izquierda - MARGEN.derecha;
  const ranura = anchoPlot / meses.length;
  const anchoBarra = Math.min(24, Math.max(6, ranura * 0.62));
  const y = (v) => MARGEN.arriba + ALTO_GRAFICA - (v / tope) * ALTO_GRAFICA;
  const base = MARGEN.arriba + ALTO_GRAFICA;
  const altoTotal = base + MARGEN.abajo;
  // En pantallas angostas se etiqueta uno de cada 2 o 3 meses para que no se encimen.
  const cadaCuantos = ranura < 14 ? 3 : ranura < 26 ? 2 : 1;
  const ticks = [];
  for (let v = 0; v <= tope + 1e-6; v += paso) ticks.push(v);

  const filaActiva = activo !== null ? datos.filas[activo] : null;
  const xCentro = (i) => MARGEN.izquierda + i * ranura + ranura / 2;

  return (
    <div ref={contenedor} className="relative w-full select-none">
      <svg width={ancho} height={altoTotal} role="img" aria-label="Ventas por mes de los últimos 24 meses" onMouseLeave={() => setActivo(null)}>
        {/* Grid y eje Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(t)} y2={y(t)} stroke={COLOR_GRID} strokeWidth="1" />
            <text x={MARGEN.izquierda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={COLOR_TEXTO} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {dineroCompacto(t)}
            </text>
          </g>
        ))}

        {/* Columnas */}
        {datos.filas.map((m, i) => {
          const x = MARGEN.izquierda + i * ranura + (ranura - anchoBarra) / 2;
          const alto = Math.max(0, base - y(m.ventas));
          const esActivo = activo === i;
          return (
            <g key={m.mes}>
              {alto > 0 && (
                <path
                  d={barra(x, y(m.ventas), anchoBarra, alto)}
                  className={esActivo ? 'fill-brand-petroleo' : 'fill-brand-petroleoMedio'}
                  fillOpacity={m.enCurso && !esActivo ? 0.4 : 1}
                />
              )}
              {m.vsAnterior !== null && m.vsAnterior !== undefined && (
                <Triangulo cx={xCentro(i)} cy={base + 12} sube={m.vsAnterior >= 0} />
              )}
              {i % cadaCuantos === 0 && (
                <text x={xCentro(i)} y={base + 30} textAnchor="middle" fontSize="11" fill={esActivo ? '#0f172a' : COLOR_TEXTO} fontWeight={esActivo ? 600 : 400}>
                  {nombreMes(m.mes)}
                </text>
              )}
              {(i === 0 || m.mes.endsWith('-01')) && (
                <text x={xCentro(i)} y={base + 44} textAnchor="middle" fontSize="10" fill="#94a3b8">{m.mes.slice(0, 4)}</text>
              )}
            </g>
          );
        })}

        {/* Promedio de los últimos 12 meses completos */}
        {datos.promedio > 0 && (
          <g pointerEvents="none">
            <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(datos.promedio)} y2={y(datos.promedio)} stroke="#475569" strokeWidth="1" />
            <text x={ancho - MARGEN.derecha} y={y(datos.promedio) - 6} textAnchor="end" fontSize="11" fill="#475569" fontWeight="600" style={HALO}>
              Promedio 12 meses · {dineroCompacto(datos.promedio)}
            </text>
          </g>
        )}

        {/* Etiqueta directa solo en el mejor mes; el resto lo cubren eje, tooltip y tabla */}
        {datos.filas.map((m, i) => {
          if (!datos.mejor || m.mes !== datos.mejor.mes) return null;
          return (
            <text key={`lbl-${m.mes}`} x={xCentro(i)} y={y(m.ventas) - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a" pointerEvents="none" style={HALO}>
              {dineroCompacto(m.ventas)}
            </text>
          );
        })}

        {/* Zonas de hover/foco: toda la ranura, más grande que la barra */}
        {datos.filas.map((m, i) => (
          <rect
            key={`hit-${m.mes}`}
            x={MARGEN.izquierda + i * ranura}
            y={MARGEN.arriba}
            width={ranura}
            height={ALTO_GRAFICA + 20}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${nombreMes(m.mes, { largo: true, conAnio: true })}: ${dinero(m.ventas)}`}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            style={{ outline: 'none', cursor: 'default' }}
          />
        ))}
      </svg>

      {filaActiva && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
          style={{
            left: Math.min(Math.max(xCentro(activo) - 120, 0), ancho - 240),
            top: Math.max(0, y(filaActiva.ventas) - 150),
          }}
        >
          <div className="mb-2 font-semibold capitalize text-slate-800">
            {nombreMes(filaActiva.mes, { largo: true, conAnio: true })}
            {filaActiva.enCurso && <span className="ml-1 font-normal normal-case text-slate-400">(al día {diaDelMes})</span>}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Ventas</span><span className="font-semibold text-slate-800">{dinero(filaActiva.ventas)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Reservaciones</span><span className="text-slate-700">{filaActiva.reservaciones}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Cobrado</span><span className="text-slate-700">{dinero(filaActiva.cobrado)}</span></div>
            <div className="my-1 border-t border-slate-100" />
            <Variacion valor={filaActiva.vsAnterior} etiqueta={filaActiva.enCurso ? 'vs. mismos días mes ant.' : 'vs. mes anterior'} />
            {filaActiva.claveAnioAnterior && (
              <Variacion valor={filaActiva.vsAnioAnterior} etiqueta={`vs. ${nombreMes(filaActiva.claveAnioAnterior, { conAnio: true })}`} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
