const express = require('express');
const router = express.Router();
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { processBillImage } = require('../services/receiptVisionService');

// Configure Multer for uploads (Hardened: 5MB limit, strict MIME filter, configurable volume)
const uploadDir = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR) 
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes JPEG, PNG y WebP.'));
    }
  }
});

// Bill OCR Line Item Parser Helper
function parseBillText(rawText) {
  const lines = (rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let subtotal = 0;
  let tip = 0;
  let tax = 0;
  let discount = 0;
  let detectedTotal = 0;

  function parseAmount(str) {
    if (!str) return 0;
    const clean = str.replace(/[^\d.,]/g, '').trim();
    if (!clean) return 0;
    if (/[.,]\d{2}$/.test(clean)) {
      const digitsOnly = clean.replace(/[^\d]/g, '');
      return parseFloat(digitsOnly) / 100;
    }
    const digitsOnly = clean.replace(/[^\d]/g, '');
    return parseInt(digitsOnly, 10) || 0;
  }

  const ignorePatterns = /^(NIT|TEL|DIR|DIRECCION|FECHA|HORA|MESA|MESERO|CAJERO|CLIENTE|RESOLUCION|AUTORIZACION|FACTURA|TICKET|REGIMEN|GRACIAS|PROPINA\s+VOLUNTARIA\s+ACEPTADA|CAMBIO|EFECTIVO|TARJETA)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ignorePatterns.test(line)) continue;

    if (/PROPINA|VOLUNTARIA|SERVICIO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) tip = val;
      }
      continue;
    }
    if (/IMPOCONSUMO|IVA|IMPUESTO|TAX/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) tax = val;
      }
      continue;
    }
    if (/DESCUENTO|DCTO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) discount = val;
      }
      continue;
    }
    if (/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) subtotal = val;
      }
      continue;
    }
    if (/TOTAL/i.test(line) && !/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) detectedTotal = val;
      }
      continue;
    }

    const priceMatch = line.match(/(.*?)(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7}(?:[.,]\d{2})?)\s*$/);
    if (priceMatch) {
      let descPart = priceMatch[1].trim();
      const lineTotal = parseAmount(priceMatch[2]);

      if (lineTotal <= 0) continue;

      let quantity = 1;
      const qtyMatch = descPart.match(/^(\d{1,2})\s*(?:x|X|-|\*)?\s+(.*)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10) || 1;
        descPart = qtyMatch[2].trim();
      }

      if (descPart.length >= 2 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(descPart)) {
        const unitPrice = quantity > 0 ? Math.round(lineTotal / quantity) : lineTotal;
        items.push({
          id: crypto.randomUUID(),
          name: descPart,
          quantity,
          unitPrice,
          subtotal: lineTotal
        });
      }
    }
  }

  const itemsSum = items.reduce((acc, it) => acc + it.subtotal, 0);
  if (!subtotal || subtotal === 0) {
    subtotal = itemsSum;
  }
  const calculatedTotal = subtotal + tax + tip - discount;
  const total = detectedTotal > 0 ? detectedTotal : calculatedTotal;

  if (items.length === 0) {
    items.push({
      id: crypto.randomUUID(),
      name: 'Consumo factura',
      quantity: 1,
      unitPrice: total > 0 ? total : 0,
      subtotal: total > 0 ? total : 0
    });
  }

  return {
    items,
    subtotal,
    tax,
    tip,
    discount,
    total
  };
}

// Vision AI status endpoint
router.get('/api/vision-status', (req, res) => {
  res.json({
    hasServerKey: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
    provider: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : null
  });
});

// Upload receipt and process with OCR (Hardened Multer & safe file cleanup)
router.post('/api/upload-receipt', (req, res) => {
  upload.single('receipt')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido de 5 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al subir el archivo' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const imagePath = req.file.path;
    const clientKey = req.headers['x-gemini-key'] || req.body?.gemini_key || null;
    const clientOpenAiKey = req.headers['x-openai-key'] || req.body?.openai_key || null;
    const effectiveGemini = clientKey || process.env.GEMINI_API_KEY;
    const effectiveOpenAi = clientOpenAiKey || process.env.OPENAI_API_KEY;

    try {
      // 1. Try Vision Agent first if key available
      if (effectiveGemini || effectiveOpenAi) {
        try {
          const visionResult = await processBillImage(imagePath, {
            apiKey: effectiveGemini,
            openAiKey: effectiveOpenAi
          });
          if (visionResult && visionResult.total > 0) {
            return res.json({
              rawText: visionResult.store_name || 'Comprobante escaneado',
              estimatedTotal: visionResult.total,
              engineUsed: visionResult.engineUsed,
              success: true
            });
          }
        } catch (vErr) {
          console.warn('Vision receipt extraction fallback to local OCR:', vErr.message);
        }
      }

      // 2. Process image with Tesseract.js directly
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+spa', {
        logger: m => console.log(m)
      });

      console.log('--- RAW OCR TEXT ---');
      console.log(text);
      console.log('--------------------');

      // Improved regex: Find $ or S (often confused by OCR) and grab the rest of the line
      const dollarMatches = [...text.matchAll(/[\$S]\s*([^\n]+)/gi)];
      let estimatedTotal = 0;

      if (dollarMatches && dollarMatches.length > 0) {
        const parsedAmounts = dollarMatches.map(m => {
          const rawLine = m[1].trim();
          const digitsOnly = rawLine.replace(/[^\d]/g, '');
          if (!digitsOnly) return NaN;

          if (rawLine.match(/[.,]\d{2}$/)) {
            return parseFloat(digitsOnly) / 100;
          }
          return parseInt(digitsOnly, 10);
        }).filter(n => !isNaN(n));

        if (parsedAmounts.length > 0) {
          estimatedTotal = Math.max(...parsedAmounts);
        }
      }

      // Fallback if no $ or S is found: extract all numbers but ignore IDs/phone numbers (> 8 digits)
      if (estimatedTotal === 0) {
        const amounts = text.match(/[\d]+[.,\s\d]*[\d]+/g);
        if (amounts && amounts.length > 0) {
          const parsedAmounts = amounts.map(a => {
            const digitsOnly = a.replace(/[^\d]/g, '');
            if (!digitsOnly) return NaN;
            if (digitsOnly.length > 8 && !a.match(/[.,]\d{2}$/)) return NaN;

            if (a.match(/[.,]\d{2}$/)) return parseFloat(digitsOnly) / 100;
            return parseInt(digitsOnly, 10);
          }).filter(n => !isNaN(n));

          if (parsedAmounts.length > 0) {
            estimatedTotal = Math.max(...parsedAmounts);
          }
        }
      }

      res.json({
        rawText: text,
        estimatedTotal,
        success: true
      });
    } catch (error) {
      console.error('OCR Error:', error);
      res.status(500).json({ error: 'Failed to process receipt', details: error.message });
    } finally {
      // Guaranteed cleanup of uploaded temp file
      if (req.file && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (unlinkErr) {
          console.error('Error unlinking temporary file:', unlinkErr);
        }
      }
    }
  });
});

// Upload and parse full bill using Intelligent Multimodal Vision / Local Fallback
router.post('/api/upload-bill', (req, res) => {
  upload.single('bill')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 5 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al subir la factura' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo de factura' });
    }

    const imagePath = req.file.path;
    const clientKey = req.headers['x-gemini-key'] || req.body?.gemini_key || null;
    const clientOpenAiKey = req.headers['x-openai-key'] || req.body?.openai_key || null;
    const rotation = parseInt(req.body?.rotation, 10) || 0;

    try {
      const result = await processBillImage(imagePath, {
        apiKey: clientKey,
        openAiKey: clientOpenAiKey,
        rotation
      });

      console.log(`--- BILL PROCESSED (${result.engineUsed}) ---`);
      console.log(`Store: ${result.store_name}, Items: ${result.items.length}, Total: ${result.total}`);
      console.log('--------------------------------------------');

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Bill Processing Error:', error);
      res.status(500).json({ error: 'Error procesando la factura', details: error.message });
    } finally {
      if (req.file && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (unlinkErr) {
          console.error('Error unlinking temp bill file:', unlinkErr);
        }
      }
    }
  });
});

module.exports = router;
module.exports.parseBillText = parseBillText;
