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
import authRouter from './routes/auth.routes.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// /api/auth (login) es público; todo lo demás bajo /api requiere sesión.
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/reservaciones', reservacionesRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/agentes', agentesRouter);
app.use('/api/empresas', empresasRouter);
app.use('/api/prospectos', prospectosRouter);
app.use('/api/bitacora', bitacoraRouter);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    const mensajes = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: mensajes.join(' ') });
  }
  if (err.code === 11000) {
    const campo = Object.keys(err.keyPattern || {})[0] || 'valor';
    return res.status(409).json({ error: `Ya existe un registro con ese ${campo}.` });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  });
