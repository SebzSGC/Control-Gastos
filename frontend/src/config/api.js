// Configuración de API y WebSockets para Entornos Local y Cloud
const rawApiUrl = import.meta.env.VITE_API_URL;
const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;

/**
 * URL base para solicitudes REST API.
 * - Si VITE_API_URL está definido (ej. 'https://api.tudominio.com' o 'https://api.tudominio.com/api'),
 *   se asegura de incluir la ruta '/api'.
 * - Si no está definido, utiliza la ruta relativa '/api' (ideal para proxy de Vite, Nginx o fullstack).
 */
export const API_URL = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/$/, '')}/api`)
  : '/api';

/**
 * URL base para la conexión en tiempo real con Socket.io.
 * - Si VITE_SOCKET_URL está definido, se usa directamente.
 * - Si VITE_API_URL está definido pero no VITE_SOCKET_URL, extrae el origen (host y puerto).
 * - En caso contrario, usa '/' (mismo origen del host actual).
 */
export const SOCKET_URL = rawSocketUrl || (
  rawApiUrl 
    ? (rawApiUrl.startsWith('http') ? new URL(rawApiUrl).origin : rawApiUrl)
    : '/'
);

/**
 * Resuelve la URL absoluta o relativa para recursos subidos al servidor (QR, comprobantes, etc.)
 */
export const getUploadUrl = (filePath) => {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
    return filePath;
  }
  const base = API_URL.replace(/\/api$/, '');
  const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${base}${cleanPath}`;
};

