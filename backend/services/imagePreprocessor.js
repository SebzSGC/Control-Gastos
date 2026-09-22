const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

/**
 * Preprocesses receipt / bill images for optical character recognition and multimodal vision models.
 * - Auto-scaling to optimal dimension (1800px max)
 * - Orientation correction / rotation
 * - Contrast enhancement and normalization for thermal paper readability
 */
async function preprocessImage(inputPathOrBuffer, options = {}) {
  const {
    rotation = 0,
    forOcr = false,
    maxDimension = 1800,
    quality = 85
  } = options;

  try {
    const image = await Jimp.read(inputPathOrBuffer);

    // 1. Manual or detected rotation (90, 180, 270)
    if (rotation && rotation % 360 !== 0) {
      image.rotate(rotation % 360);
    }

    // 2. Proportional downscale if too large (preserves clarity, prevents OOM and speeds up inference)
    const currentW = image.bitmap.width;
    const currentH = image.bitmap.height;

    if (currentW > maxDimension || currentH > maxDimension) {
      image.scaleToFit({ w: maxDimension, h: maxDimension });
    }

    // 3. For local OCR (Tesseract), apply greyscale & contrast enhancement
    if (forOcr) {
      image.greyscale();
      image.contrast(0.2);
      if (typeof image.normalize === 'function') {
        image.normalize();
      }
    }

    // 4. Export as optimized JPEG buffer
    const buffer = await image.getBuffer('image/jpeg');
    const base64 = buffer.toString('base64');

    return {
      buffer,
      base64,
      mimeType: 'image/jpeg',
      width: image.bitmap.width,
      height: image.bitmap.height
    };
  } catch (error) {
    console.error('Image Preprocessing error:', error);
    // If Jimp fails for any reason, fallback to reading raw file buffer
    if (typeof inputPathOrBuffer === 'string' && fs.existsSync(inputPathOrBuffer)) {
      const rawBuffer = fs.readFileSync(inputPathOrBuffer);
      return {
        buffer: rawBuffer,
        base64: rawBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        width: 0,
        height: 0
      };
    }
    throw error;
  }
}

module.exports = {
  preprocessImage
};
