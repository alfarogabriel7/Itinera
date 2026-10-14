import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from '../database/index.js';
import clientesRouter from './routes/clientes.routes.js';
import proveedoresRouter from './routes/proveedores.routes.js';
import reservacionesRouter from './routes/reservaciones.routes.js';
import pagosRouter from './routes/pagos.routes.js';
import agentesRouter from './routes/agentes.routes.js';
import empresasRouter from './routes/empresas.routes.js';
import prospectosRouter from './routes/prospectos.routes.js';
import bitacoraRouter from './routes/bitacora.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import pagosProveedorRouter from './routes/pagosProveedor.routes.js';
import authRouter from './routes/auth.routes.js';
import { requireAuth } from './middleware/auth.js';

// La app de Express sin arrancar servidor ni conexión: la usan tanto
// server/index.js (local, `npm run server`) como api/index.js (función de Vercel).
const app = express();
const enProduccion = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
// Detrás del proxy de Vercel la IP real del cliente viene en X-Forwarded-For
// (la usa el límite de intentos de inicio de sesión).
app.set('trust proxy', process.env.VERCEL ? 1 : process.env.TRUST_PROXY === '1' ? 1 : false);

// CORS: con frontend y API en el mismo dominio (el caso de Vercel) no hace falta.
// Si el frontend vive en otro dominio, se listan en CORS_ORIGENES (separados por coma).
// En desarrollo se permite localhost.
const origenes = (process.env.CORS_ORIGENES || '').split(',').map((o) => o.trim()).filter(Boolean);
if (origenes.length) {
  app.use(cors({ origin: origenes }));
} else if (!enProduccion) {
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
}

// Cabeceras de seguridad para todas las respuestas de la API.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    // Datos de negocio: que ningún proxy ni el navegador los guarde en caché.
    'Cache-Control': 'no-store',
  });
  if (enProduccion) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Conexión bajo demanda: en serverless la primera petición de cada instancia
// abre la conexión y las siguientes la reutilizan (ver database/connection.js).
app.use('/api', (req, res, next) => {
  connectDB().then(() => next(), next);
});

// /api/auth (login) es público; todo lo demás bajo /api requiere sesión.
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/reservaciones', reservacionesRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/pagos-proveedor', pagosProveedorRouter);
app.use('/api/agentes', agentesRouter);
app.use('/api/empresas', empresasRouter);
app.use('/api/prospectos', prospectosRouter);
app.use('/api/bitacora', bitacoraRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    const mensajes = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: mensajes.join(' ') });
  }
  // Alguien guardó el mismo registro mientras se editaba (optimisticConcurrency).
  if (err.name === 'VersionError') {
    return res.status(409).json({ error: 'El registro cambió mientras lo editabas (otro usuario registró un movimiento). Recarga e intenta de nuevo.' });
  }
  // Id mal formado (p.ej. /api/clientes/abc): es un error del cliente, no del servidor.
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Valor inválido para ${err.path}.` });
  }
  if (err.code === 11000) {
    // En índices compuestos (empresa + campo) el campo relevante no es la empresa.
    const campos = Object.keys(err.keyPattern || {}).filter((c) => c !== 'empresa');
    return res.status(409).json({ error: `Ya existe un registro con ese ${campos[0] || 'valor'}.` });
  }
  const status = err.status || err.statusCode || 500;
  // Los 4xx son errores esperados de validación/permisos; solo los 5xx van al log.
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

export default app;
