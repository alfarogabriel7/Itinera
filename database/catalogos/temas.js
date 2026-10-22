// Temas de color (look and feel) por grupo de empresas. Cada empresa elige uno
// en su ficha (campo `tema`); al iniciar sesión, sus Administradores y Agentes
// ven la app con esa paleta. El login y el superAdmin siempre usan Itinera.
// Solo cambian los colores: el logo es el de cada empresa y la tipografía es fija.
//
// Las claves de `colores` son los tokens `brand-*` de Tailwind (tailwind.config.js),
// así que un tema nuevo solo necesita su paleta aquí, sin tocar los componentes.
// Para agregar un grupo: añadir su entrada aquí; el selector de Empresas y la
// validación del servidor lo toman automáticamente.
export const TEMAS = {
  itinera: {
    nombre: 'Ninguno (Itinera)',
    colores: {
      noche: '#0B2A33', // barra lateral, encabezados de tablas, títulos
      petroleo: '#0F4C5C', // botones principales, foco, íconos
      petroleoMedio: '#3E7A88', // barras de gráficas
      coral: '#E36414', // acciones destacadas (registrar abono, guardar pago)
      coralClaro: '#F28B44', // botones de editar, trofeos
      arena: '#F4F1EA', // fondo general
    },
  },
  felizviaje: {
    nombre: 'Grupo Feliz Viaje',
    colores: {
      noche: '#00636A',
      petroleo: '#45A3A8',
      petroleoMedio: '#2F8F95',
      coral: '#B7519E',
      coralClaro: '#FEC44A',
      arena: '#F1F5F9',
    },
  },
};

export const TEMA_PREDETERMINADO = 'itinera';
export const CLAVES_TEMAS = Object.keys(TEMAS);
