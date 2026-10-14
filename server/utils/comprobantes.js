import { Comprobante, registrarCambios } from '../../database/index.js';
import { perteneceAlAlcance, usuarioDeLaSesion } from '../middleware/tenant.js';
import { detectarTipo, nombreSeguro, leerArchivo, enviarArchivo } from './archivos.js';

// Comprobantes (PDF o imagen) de cobros a clientes y de pagos a proveedores.
// Las mismas reglas para ambos:
//   - cualquier usuario de la empresa del pago puede adjuntar y ver;
//   - un pago cancelado no admite comprobante nuevo;
//   - reemplazar uno existente solo lo hace el Administrador;
//   - todo cambio queda en la bitácora.

// 4 MB: Vercel rechaza peticiones de más de 4.5 MB a una función.
const LIMITE_COMPROBANTE = 4 * 1024 * 1024;

export function rutasComprobante(router, { Modelo, entidad }) {
  // PUT /:id/comprobante — el cuerpo es el archivo tal cual (no JSON) y el
  // nombre original viaja en la cabecera X-Nombre-Archivo.
  router.put(
    '/:id/comprobante',
    leerArchivo(LIMITE_COMPROBANTE, 'El comprobante no puede pesar más de 4 MB.'),
    async (req, res, next) => {
      try {
        const pago = await Modelo.findById(req.params.id);
        if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
        if (!perteneceAlAlcance(pago, req)) {
          return res.status(403).json({ error: 'No tienes permiso para adjuntar comprobantes a este pago.' });
        }
        if (pago.estatus === 'Cancelado') {
          return res.status(400).json({ error: 'No se puede adjuntar un comprobante a un pago cancelado.' });
        }
        if (pago.comprobante?.id && req.agente.rol !== 'Administrador') {
          return res.status(403).json({ error: 'Este pago ya tiene comprobante; solo el Administrador puede reemplazarlo.' });
        }

        const datos = req.body;
        const tipo = detectarTipo(datos);
        if (!tipo) {
          return res.status(400).json({ error: 'El comprobante debe ser un PDF o una imagen (JPG, PNG o WEBP).' });
        }

        const usuario = usuarioDeLaSesion(req);
        const nombreArchivo = nombreSeguro(req.get('X-Nombre-Archivo'), 'comprobante');
        const anteriorId = pago.comprobante?.id;
        const anteriorNombre = pago.comprobante?.nombreArchivo || null;

        const comprobante = await Comprobante.create({
          empresa: pago.empresa,
          pago: pago._id,
          origen: entidad,
          nombreArchivo,
          tipo,
          tamano: datos.length,
          datos,
          subidoPor: usuario,
        });

        pago.comprobante = { id: comprobante._id, nombreArchivo, tipo, tamano: datos.length, fechaSubida: comprobante.createdAt };
        await pago.save();
        if (anteriorId) await Comprobante.deleteOne({ _id: anteriorId, empresa: pago.empresa });

        await registrarCambios({
          entidad,
          entidadId: pago._id,
          empresa: pago.empresa,
          anterior: { comprobante: anteriorNombre },
          nuevo: { comprobante: nombreArchivo },
          usuario,
        });

        res.json(pago);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/:id/comprobante', async (req, res, next) => {
    try {
      const pago = await Modelo.findById(req.params.id);
      if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
      if (!perteneceAlAlcance(pago, req)) {
        return res.status(403).json({ error: 'No tienes permiso para ver este comprobante.' });
      }
      // Se busca también por empresa: un comprobante nunca se sirve fuera de su empresa.
      const comprobante = pago.comprobante?.id && (await Comprobante.findOne({ _id: pago.comprobante.id, empresa: pago.empresa }));
      if (!comprobante) return res.status(404).json({ error: 'Este pago no tiene comprobante.' });
      enviarArchivo(res, comprobante);
    } catch (err) {
      next(err);
    }
  });
}
