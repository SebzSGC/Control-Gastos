const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { preprocessImage } = require('./imagePreprocessor');

/**
 * Colombian Bank Transfer Voucher Parser Service
 * Accurately extracts transfer amounts (COP), approval/reference codes,
 * recipient identity, and bank platform from transaction receipts
 * (Nequi, Bancolombia, Bre-B, Daviplata, etc.)
 */

function cleanNumericAmount(str) {
  if (!str) return 0;
  const clean = str.replace(/[^\d.,]/g, '').trim();
  if (!clean) return 0;

  // Case with standard decimals at the end (.XX or ,XX)
  if (/[.,]\d{2}$/.test(clean)) {
    const parts = clean.split(/[.,]/);
    const decimals = parts.pop();
    const whole = parts.join('');
    return parseFloat(`${whole}.${decimals}`) || 0;
  }

  // Colombian format with dot/comma thousand separators (e.g. 50.000 or 1.200.000)
  const digitsOnly = clean.replace(/[^\d]/g, '');
  return parseInt(digitsOnly, 10) || 0;
}

function isLikelyDateOrTime(str) {
  if (!str) return false;
  // Dates: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, or time HH:MM(:SS)
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(str)) return true;
  if (/\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/.test(str)) return true;
  if (/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(str)) return true;
  return false;
}

function isColombianPhoneNumber(digits) {
  // 10 digits starting with 3 (e.g. 3001234567, 310..., 320...)
  return /^3\d{9}$/.test(digits);
}

/**
 * Parse raw OCR / Multimodal text into structured voucher data
 */
function parseVoucherText(rawText) {
  const text = rawText || '';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let detectedBank = 'other';
  const lowerText = text.toLowerCase();
  if (lowerText.includes('nequi') || lowerText.includes('enviaste') || lowerText.includes('envio exitoso') || lowerText.includes('envío exitoso')) {
    detectedBank = 'nequi';
  } else if (lowerText.includes('bancolombia') || lowerText.includes('valor transferido') || lowerText.includes('transferencia exitosa')) {
    detectedBank = 'bancolombia';
  } else if (lowerText.includes('daviplata') || lowerText.includes('pasar plata') || lowerText.includes('davivienda')) {
    detectedBank = 'daviplata';
  } else if (lowerText.includes('bre-b') || lowerText.includes('breb') || lowerText.includes('transfiya') || lowerText.includes('redeban')) {
    detectedBank = 'bre-b';
  }

  // 1. Reference / Approval Code extraction
  let detectedReference = null;

  // First check for Nequi M-code pattern (M followed by 7-9 digits)
  const nequiCodeMatch = text.match(/\b(M\d{7,9})\b/i);
  if (nequiCodeMatch) {
    detectedReference = nequiCodeMatch[1].toUpperCase();
  }

  if (!detectedReference) {
    const refHeaderRegex = /^\s*(?:comprobante(?:\s+no\.?|\s+n[uú]mero)?|referencia|ref\b|aprobaci[oó]n|autorizaci[oó]n|id\s+transacci[oó]n|c[uú]s|folio)\s*[:#\-]?\s*(.*)$/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(refHeaderRegex);
      if (match) {
        let candidate = match[1] ? match[1].trim() : '';
        // If not on same line, look at next line
        if (!candidate && i + 1 < lines.length) {
          const nextCandidate = lines[i + 1].trim();
          if (nextCandidate && !/^(?:fecha|hora|de\s+d[oó]nde|disponible|cu[aá]nto|valor)/i.test(nextCandidate)) {
            candidate = nextCandidate;
          }
        }
        if (candidate && !isColombianPhoneNumber(candidate) && !isLikelyDateOrTime(candidate) && candidate.length >= 4) {
          detectedReference = candidate;
          break;
        }
      }
    }
  }

  if (!detectedReference) {
    // Secondary fallback for inline references
    const secondaryRegex = /(?:\b(?:comprobante(?:\s+no\.?|\s+n[uú]mero)?|referencia|aprobaci[oó]n|autorizaci[oó]n|id\s+transacci[oó]n|c[uú]s))\s*[:#\-]?\s*([a-zA-Z0-9\-]+)/i;
    for (const line of lines) {
      const match = line.match(secondaryRegex);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (!isColombianPhoneNumber(candidate) && !isLikelyDateOrTime(candidate) && candidate.length >= 4) {
          detectedReference = candidate;
          break;
        }
      }
    }
  }

  // 2. Suggested Recipient extraction
  let detectedRecipient = null;
  const recipientHeaderRegex = /^\s*(?:[¿?]?\s*)(?:para(?:\s+qui[eé]n(?:\s*\?)?)?|destinatario|nombre\s+destino|titular|a\s+nombre\s+de)\s*[:#\-?]?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(recipientHeaderRegex);
    if (match) {
      let recipientText = match[1] ? match[1].trim() : '';
      if (!recipientText && i + 1 < lines.length) {
        // Recipient is on the next line
        const nextLine = lines[i + 1].trim();
        if (!nextLine.startsWith('$') && !/^(?:cu[aá]nto|disponible|fecha|valor|de\s+d[oó]nde)/i.test(nextLine)) {
          recipientText = nextLine;
        }
      }
      if (recipientText && recipientText.length >= 2 && !/^\d+$/.test(recipientText)) {
        detectedRecipient = recipientText.replace(/[^\w\sÁÉÍÓÚáéíóúñÑ]/g, '').trim();
        break;
      }
    }
  }

  // 3. Amount extraction (COP)
  // Candidate pool with priority weighting
  const candidates = [];

  // Lines to ignore completely for amount search (e.g. available balance, fees, account numbers)
  const discardLinePatterns = /costo\s+de|tarifa|comisi[oó]n|disponible|saldo|cuenta\s+origen|ahorros\s*\*|celular|tel[eé]fono|a\s+cel/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (discardLinePatterns.test(line)) {
      continue;
    }

    // Check if line contains explicit transfer keywords
    const isExplicitAmountLine = /valor\s+transferido|valor\s*:|monto\s*:|enviaste|total|pagaste|cantidad|transfiriendo|\¿cu[aá]nto\?/i.test(line);

    // Look for currency amounts with '$' or 'COP'
    const currencyMatches = [...line.matchAll(/(?:\$|COP)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]{4,9})/gi)];
    for (const match of currencyMatches) {
      const rawNum = match[1];
      const digits = rawNum.replace(/[^\d]/g, '');
      if (isColombianPhoneNumber(digits)) continue;
      if (isLikelyDateOrTime(line)) continue;

      const num = cleanNumericAmount(rawNum);
      if (num > 0) {
        candidates.push({
          amount: num,
          priority: isExplicitAmountLine ? 100 : 50,
          line
        });
      }
    }

    // If line is an explicit header without currency on the same line, check next line
    if (isExplicitAmountLine && currencyMatches.length === 0 && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (!discardLinePatterns.test(nextLine)) {
        const nextMatch = nextLine.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]{4,9})\b/);
        if (nextMatch) {
          const rawNum = nextMatch[1];
          const digits = rawNum.replace(/[^\d]/g, '');
          if (!isColombianPhoneNumber(digits) && !isLikelyDateOrTime(nextLine)) {
            const num = cleanNumericAmount(rawNum);
            if (num > 0) {
              candidates.push({
                amount: num,
                priority: 90,
                line: `${line} -> ${nextLine}`
              });
            }
          }
        }
      }
    }
  }

  // If no currency matches were found, scan for standalone numbers that fit realistic transfer amounts
  if (candidates.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (discardLinePatterns.test(line) || isLikelyDateOrTime(line)) continue;

      const standAloneMatch = line.match(/^([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})$/);
      if (standAloneMatch) {
        const digits = standAloneMatch[1].replace(/[^\d]/g, '');
        if (!isColombianPhoneNumber(digits)) {
          const num = cleanNumericAmount(standAloneMatch[1]);
          if (num >= 100) {
            candidates.push({
              amount: num,
              priority: 20,
              line
            });
          }
        }
      }
    }
  }

  // Sort candidates by priority desc, then by amount desc
  candidates.sort((a, b) => b.priority - a.priority || b.amount - a.amount);
  const detectedAmount = candidates.length > 0 ? candidates[0].amount : 0;

  return {
    amount: detectedAmount,
    reference: detectedReference,
    recipient: detectedRecipient,
    bank: detectedBank,
    rawText: text
  };
}

/**
 * Prompt for Vision AI (Gemini / OpenAI) when available
 */
const VOUCHER_PROMPT = `Eres un auditor financiero especializado en lectura de comprobantes de pago bancarios en Colombia (Nequi, Bancolombia, Bre-B, Daviplata, Dale).
Analiza el comprobante adjunto y extrae estrictamente en formato JSON:
{
  "bank": "nequi|bancolombia|daviplata|bre-b|other",
  "amount": 50000,
  "reference": "Codigo o numero de aprobacion/comprobante o null",
  "recipient": "Nombre de quien recibio el dinero o null"
}
REGLAS:
1. amount debe ser un numero positivo en Pesos Colombianos (COP).
2. Ignora saldos disponibles, costos de transaccion o telefonos celulares para el monto.
3. Devuelve EXCLUSIVAMENTE el JSON valido sin markdown.`;

async function callGeminiVoucher(base64Image, apiKey) {
  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
            { text: VOUCHER_PROMPT }
          ]
        }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) continue;

      const data = await res.json();
      const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textOutput) continue;

      const cleaned = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        amount: Number(parsed.amount) || 0,
        reference: parsed.reference ? String(parsed.reference).trim() : null,
        recipient: parsed.recipient ? String(parsed.recipient).trim() : null,
        bank: parsed.bank || 'other',
        rawText: textOutput,
        engineUsed: `gemini-vision (${model})`
      };
    } catch (e) {
      // Continue to next model or fallback
    }
  }
  throw new Error('No se pudo procesar el comprobante con Gemini Vision');
}

/**
 * Process voucher image with multimodal vision or local Tesseract OCR fallback
 */
async function processVoucherImage(filePathOrBuffer, options = {}) {
  const { apiKey = null, openAiKey = null, rotation = 0 } = options;

  const effectiveGeminiKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || null;

  // 1. Try Gemini Vision if API key is present
  if (effectiveGeminiKey) {
    try {
      const preprocessed = await preprocessImage(filePathOrBuffer, {
        rotation,
        forOcr: false,
        maxDimension: 1800
      });
      const geminiResult = await callGeminiVoucher(preprocessed.base64, effectiveGeminiKey);
      if (geminiResult && geminiResult.amount > 0) {
        return geminiResult;
      }
    } catch (err) {
      // Fallback silently to local OCR
    }
  }

  // 2. Enhanced Local OCR Pipeline with Tesseract.js
  let ocrBuffer = filePathOrBuffer;
  try {
    const ocrPreprocessed = await preprocessImage(filePathOrBuffer, {
      rotation,
      forOcr: true,
      maxDimension: 1800
    });
    ocrBuffer = ocrPreprocessed.buffer;
  } catch (prepErr) {
    // If Jimp fails, use filePathOrBuffer directly
  }

  const { data: { text } } = await Tesseract.recognize(ocrBuffer, 'spa+eng', {
    logger: () => {}
  });

  const parsed = parseVoucherText(text);

  return {
    ...parsed,
    engineUsed: 'local-ocr (tesseract)'
  };
}

module.exports = {
  cleanNumericAmount,
  parseVoucherText,
  processVoucherImage
};
