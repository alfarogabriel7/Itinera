// Temas de color (look and feel) por grupo de empresas. Cada empresa elige uno
// en su ficha (campo `tema`); al iniciar sesión, sus Administradores y Agentes
// ven la app con esa paleta. El login y el superAdmin siempre usan Rutana.
// Solo cambian los colores: el logo es el de cada empresa y la tipografía es fija.
//
// Las claves de `colores` son los tokens `brand-*` de Tailwind (tailwind.config.js),
// así que un tema nuevo solo necesita su paleta aquí, sin tocar los componentes.
// Para agregar un grupo: añadir su entrada aquí; el selector de Empresas y la
// validación del servidor lo toman automáticamente.
export const TEMAS = {
  rutana: {
    nombre: 'Ninguno (Rutana)',
    colores: {
      noche: '#0F2A4A', // azul marino de la marca: barra lateral, encabezados de tablas, títulos
      petroleo: '#1F4E79', // botones principales, foco, íconos
      petroleoMedio: '#5B7FA6', // barras de gráficas
      coral: '#F26B4F', // coral de la marca (punto de destino): acciones destacadas
      coralClaro: '#F79A86', // botones de editar, trofeos
      arena: '#F4F6F9', // fondo general
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

export const TEMA_PREDETERMINADO = 'rutana';
export const CLAVES_TEMAS = Object.keys(TEMAS);

// La plataforma antes se llamaba Itinera: las empresas guardadas con
// tema 'itinera' se leen como el tema predeterminado.
export const normalizarTema = (clave) => (clave === 'itinera' || !TEMAS[clave] ? TEMA_PREDETERMINADO : clave);
