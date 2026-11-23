// Exportación a Excel (.xlsx real, sin librerías): arma el libro como XML de
// Office Open y lo empaqueta en un ZIP sin compresión. Los montos van como
// números con formato de moneda y las fechas como fechas, para que en Excel se
// puedan sumar, filtrar y ordenar.
//
//   descargarExcel('pagos-cancun.xlsx', {
//     hoja: 'Pagos',
//     titulo: 'Historial de abonos',
//     datos: [['Cliente', 'Ana López'], ['Total', 1500, 'moneda']],   // bloque de datos generales (opcional)
//     columnas: [{ titulo: 'Fecha', tipo: 'fecha', ancho: 14 }, { titulo: 'Monto', tipo: 'moneda' }],
//     filas: [[new Date(), 500]],
//     totales: [null, 500],                                             // fila de totales (opcional)
//   });
//   tipo: 'texto' (predeterminado) | 'numero' (entero) | 'moneda' | 'fecha'
//   Las fechas se toman en hora local; para un día de viaje (medianoche UTC) usa diaDeViaje().

const enc = new TextEncoder();

// ---- ZIP (método "store") ----
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(archivos) {
  const partes = [];
  const central = [];
  let offset = 0;
  for (const { nombre, contenido } of archivos) {
    const nombreB = enc.encode(nombre);
    const datos = enc.encode(contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreB.length, true);
    partes.push(new Uint8Array(local.buffer), nombreB, datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014B50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true);
    cd.setUint32(24, datos.length, true);
    cd.setUint16(28, nombreB.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nombreB);
    offset += 30 + nombreB.length + datos.length;
  }
  const tamCentral = central.reduce((a, p) => a + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054B50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---- Hoja ----
const xml = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // Caracteres de control no válidos en XML.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const letraCol = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// Estilos (índices de cellXfs en styles.xml).
const E = { normal: 0, encabezado: 1, moneda: 2, fecha: 3, totalTexto: 4, totalMoneda: 5, titulo: 6, etiqueta: 7, numero: 8 };

// Fecha como número de serie de Excel (día local, sin hora).
function serieFecha(f) {
  const d = f instanceof Date ? f : new Date(f);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function celda(ref, valor, tipo, estilo) {
  if (valor === null || valor === undefined || valor === '') return estilo ? `<c r="${ref}" s="${estilo}"/>` : '';
  if (tipo === 'fecha') {
    const n = serieFecha(valor);
    if (n !== null) return `<c r="${ref}" s="${estilo ?? E.fecha}"><v>${n}</v></c>`;
  }
  if ((tipo === 'moneda' || tipo === 'numero') && Number.isFinite(Number(valor))) {
    return `<c r="${ref}" s="${estilo ?? (tipo === 'moneda' ? E.moneda : E.numero)}"><v>${Number(valor)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${estilo ?? E.normal}"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
}

function hojaXml({ titulo, datos = [], columnas, filas, totales }) {
  const renglones = [];
  let r = 1;
  if (titulo) renglones.push(`<row r="${r}">${celda(`A${r++}`, titulo, 'texto', E.titulo)}</row>`);
  for (const [etiqueta, valor, tipo] of datos) {
    renglones.push(`<row r="${r}">${celda(`A${r}`, etiqueta, 'texto', E.etiqueta)}${celda(`B${r}`, valor, tipo)}</row>`);
    r++;
  }
  if (titulo || datos.length) r++; // renglón en blanco antes de la tabla
  const filaEncabezado = r;
  renglones.push(`<row r="${r}">${columnas.map((c, i) => celda(`${letraCol(i)}${r}`, c.titulo, 'texto', E.encabezado)).join('')}</row>`);
  r++;
  for (const fila of filas) {
    renglones.push(`<row r="${r}">${columnas.map((c, i) => celda(`${letraCol(i)}${r}`, fila[i], c.tipo)).join('')}</row>`);
    r++;
  }
  if (totales) {
    renglones.push(`<row r="${r}">${columnas.map((c, i) => celda(`${letraCol(i)}${r}`, totales[i], c.tipo,
      c.tipo === 'moneda' || c.tipo === 'numero' ? E.totalMoneda : E.totalTexto)).join('')}</row>`);
    r++;
  }
  const anchos = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || (c.tipo === 'fecha' ? 13 : c.tipo === 'moneda' ? 15 : 18)}" customWidth="1"/>`).join('');
  const ultima = letraCol(columnas.length - 1);
  const filtro = filas.length ? `$A$${filaEncabezado}:$${ultima}$${filaEncabezado + filas.length}` : null;
  return { filtro, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${filaEncabezado}" topLeftCell="A${filaEncabezado + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${anchos}</cols>
<sheetData>${renglones.join('')}</sheetData>
${filtro ? `<autoFilter ref="${filtro.replace(/\$/g, '')}"/>` : ''}
</worksheet>` };
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0B4F5C"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B4F5C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F6F6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border/><border><top style="thin"><color rgb="FF0B4F5C"/></top></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

export function descargarExcel(nombreArchivo, { hoja = 'Hoja1', ...contenido }) {
  const limpio = String(hoja).replace(/[\\/?*[\]:']/g, ' ').slice(0, 31);
  const nombreHoja = xml(limpio);
  const { xml: hojaContenido, filtro } = hojaXml(contenido);
  // El filtro de columnas necesita su nombre definido para que Excel lo abra sin "reparar".
  const nombres = filtro ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nombreHoja}'!${filtro}</definedName></definedNames>` : '';
  const blob = zip([
    { nombre: '[Content_Types].xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
    { nombre: '_rels/.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { nombre: 'xl/workbook.xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets>
${nombres}
</workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { nombre: 'xl/styles.xml', contenido: ESTILOS },
    { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaContenido },
  ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Las fechas de viaje se guardan como medianoche UTC: en México caerían el día
// anterior, así que se pasan a un día local con los mismos año, mes y día.
export function diaDeViaje(f) {
  if (!f) return null;
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Nombre de archivo seguro: "estado-de-cuenta-ana-lopez-cancun-2026-11-22.xlsx".
export function nombreArchivo(...partes) {
  const base = partes.filter(Boolean).join('-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return `${base || 'rutana'}-${fecha}.xlsx`;
}
