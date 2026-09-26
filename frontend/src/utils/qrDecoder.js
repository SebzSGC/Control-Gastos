import jsQR from 'jsqr';

/**
 * Decodifica un código QR a partir de un archivo o blob de imagen.
 * Lee el archivo con FileReader, lo dibuja en un canvas temporal y analiza
 * los píxeles con jsQR.
 *
 * @param {File|Blob} file - Archivo de imagen seleccionado
 * @returns {Promise<{ success: boolean, payload?: string, error?: string }>}
 */
export async function decodeQrFromImage(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve({ success: false, error: 'No se proporcionó ningún archivo de imagen' });
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      resolve({ success: false, error: 'Error al leer el archivo de imagen' });
    };

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => {
        resolve({ success: false, error: 'No se pudo cargar la imagen para análisis' });
      };

      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || img.width;
          const originalHeight = img.naturalHeight || img.height;

          if (!originalWidth || !originalHeight) {
            resolve({ success: false, error: 'Dimensiones de imagen inválidas' });
            return;
          }

          // Preparamos los tamaños a intentar: nativo y, si es grande, una versión escalada
          const attempts = [{ width: originalWidth, height: originalHeight }];

          if (originalWidth > 1400 || originalHeight > 1400) {
            const scale = 1200 / Math.max(originalWidth, originalHeight);
            attempts.push({
              width: Math.round(originalWidth * scale),
              height: Math.round(originalHeight * scale),
            });
          }

          for (const size of attempts) {
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (!ctx) continue;

            ctx.drawImage(img, 0, 0, size.width, size.height);
            const imageData = ctx.getImageData(0, 0, size.width, size.height);

            const code = jsQR(imageData.data, size.width, size.height, {
              inversionAttempts: 'attemptBoth',
            });

            if (code && code.data && code.data.trim()) {
              resolve({
                success: true,
                payload: code.data.trim(),
              });
              return;
            }
          }

          resolve({
            success: false,
            error: 'No se pudo decodificar el codigo QR de la imagen',
          });
        } catch (err) {
          console.error('Error al decodificar código QR con jsQR:', err);
          resolve({
            success: false,
            error: 'Error inesperado durante el procesamiento de la imagen',
          });
        }
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Extrae la llave de pago (cédula o celular) a partir del payload decodificado de un QR Bre-B / EMVCo.
 * Detecta patrones oficiales de Redeban Bre-B (CO.COM.RBM.LLA), prefijos de cédula y números móviles.
 *
 * @param {string} payload - Cadena de texto decodificada del QR
 * @returns {string|null} Llave sugerida o null si no se detecta
 */
export function extractKeyFromPayload(payload) {
  if (!payload || typeof payload !== 'string') return null;

  // 1. Redeban Bre-B TLV: CO.COM.RBM.LLA seguido de Tag 01, longitud de 2 dígitos y número
  const rbmTlvMatch = payload.match(/CO\.COM\.RBM\.LLA01(\d{2})(\d+)/i);
  if (rbmTlvMatch) {
    const len = parseInt(rbmTlvMatch[1], 10);
    const candidate = rbmTlvMatch[2].slice(0, len);
    if (candidate && candidate.length >= 7) {
      return candidate;
    }
  }

  // 2. Patrón directo Bre-B Redeban: CO.COM.RBM.LLA0110(\d{10})
  const rbmDirectMatch = payload.match(/CO\.COM\.RBM\.LLA0110(\d{10})/i);
  if (rbmDirectMatch) {
    return rbmDirectMatch[1];
  }

  // 3. Documento de identidad explícito: CC(\d+) o similar
  const docMatch = payload.match(/(?:CC|TI|CE|NIT)[:\s-]?(\d{7,11})/i);
  if (docMatch && docMatch[1]) {
    return docMatch[1];
  }

  // 4. Llave celular explícita: CEL3001234567 o TEL3001234567
  const phoneTagMatch = payload.match(/(?:CEL|TEL|CELULAR)[:\s-]?(\d{10})/i);
  if (phoneTagMatch && phoneTagMatch[1]) {
    return phoneTagMatch[1];
  }

  // 5. Celular colombiano estándar (10 dígitos que empiezan en 3)
  const phonePatternMatch = payload.match(/(?:^|[^\d])(3\d{9})(?:[^\d]|$)/);
  if (phonePatternMatch && phonePatternMatch[1]) {
    return phonePatternMatch[1];
  }

  return null;
}

/**
 * Determina si una cadena es un payload decodificado de QR para vectorización SVG
 * (ej. estándar EMVCo Bre-B '000201...') en lugar de una URL o ruta de archivo en disco.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isVectorQrPayload(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();

  // Excluir rutas de servidor o Data URLs de imagen
  if (
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:image/')
  ) {
    return false;
  }

  // Si inicia con el indicador EMVCo oficial '000201'
  if (trimmed.startsWith('000201')) {
    return true;
  }

  // Si es un payload sin caracteres de ruta de archivo
  if (!trimmed.includes('/') && !trimmed.includes('\\') && trimmed.length >= 15) {
    return true;
  }

  return false;
}
