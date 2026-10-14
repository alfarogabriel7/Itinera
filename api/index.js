// Función serverless de Vercel: todas las rutas /api/* llegan aquí (ver la
// regla de reescritura en vercel.json) y las atiende la misma app de Express
// que se usa en local. La conexión a MongoDB se abre bajo demanda y se
// reutiliza entre peticiones de la misma instancia.
import app from '../server/app.js';

export default app;
