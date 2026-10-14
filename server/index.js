// Servidor local (`npm run server`). En Vercel no se usa: la API corre como
// función (api/index.js) con la misma app.
import app from './app.js';
import { connectDB } from '../database/index.js';

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  });
