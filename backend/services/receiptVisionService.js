const crypto = require('crypto');
const Tesseract = require('tesseract.js');
const { preprocessImage } = require('./imagePreprocessor');

/**
 * Intelligent Receipt & Invoice Vision Agent
 * Coordinates multimodal vision models (Gemini 2.0 / 1.5 Flash, GPT-4o) with
 * high-precision spatial preprocessing and mathematical consistency checks.
 */

const RECEIPT_PROMPT = `Eres un Agente Experto en Inteligencia Documental y Extracción de Facturas/Recibos comerciales (restaurantes, supermercados, tiendas y servicios).
Analiza detalladamente la imagen de la factura adjunta y extrae la información con máxima precisión en formato JSON estricto.

REGLAS DE EXTRACCIÓN:
1. VALORES MONETARIOS:
   - Los valores suelen estar en pesos colombianos (COP) u otra divisa local.
   - En Latinoamérica, el punto (.) suele separar miles (ej. 25.000 = veinticinco mil) y la coma (,) o punto (.) los centavos.
   - Devuelve todos los montos monetarios como números limpios enteros o decimales estándar (ej. 25000, no 25).
   - NUNCA confundas 25.000 con 25. Si una hamburguesa cuesta 25.000, su precio es 25000.

2. PRODUCTOS / ÍTEMS:
   - Identifica cada producto o servicio individualmente en la lista "items".
   - "name": Nombre legible, descriptivo y limpio del producto (corrige abreviaturas evidentes de POS como "HAMB CORR" -> "Hamburguesa Corral", "COCA COL ZER" -> "Coca Cola Zero").
   - "quantity": Cantidad consumida (número entero >= 1). Si no aparece explícita, asume 1.
   - "unit_price": Precio unitario en número. Si no está discriminado, calcula subtotal / quantity.
   - "subtotal": Valor total de esa línea (quantity * unit_price).
   - EXCLUYE de los ítems las líneas que sean propina, IVA, impoconsumo o totales generales.

3. CARGOS ADICIONALES:
   - "tip": Valor de la propina voluntaria o cargo por servicio (en Colombia suele ser 10% voluntario si fue aceptado). Si no hay o fue 0, coloca 0.
   - "tax": Impuestos discriminados explícitamente (Impoconsumo 8%, IVA 19%, etc.). Si los precios ya incluyen impuestos y no hay desglose aparte, coloca 0.
   - "discount": Descuentos aplicados (número positivo que resta al total). Si no hay, coloca 0.

4. TOTALES & CONSISTENCIA:
   - "subtotal": Suma de los subtotales de todos los productos consumidos.
   - "total": Valor final neto pagado o a pagar. Debe concordar con: subtotal + tip + tax - discount = total.
   - "store_name": Nombre o razón social del establecimiento comercial si es legible (ej. "El Corral", "Crepes & Waffles", "Éxito"), o null.
   - "date": Fecha en formato YYYY-MM-DD si es identificable, o null.

Devuelve EXCLUSIVAMENTE el JSON estructurado según este esquema sin ningún texto introductorio ni bloques markdown:
{
  "store_name": "Nombre del Comercio",
  "date": "2026-09-21",
  "items": [
    {
      "name": "Nombre del Producto",
      "quantity": 1,
      "unit_price": 10000,
      "subtotal": 10000
    }
  ],
  "subtotal": 10000,
  "tip": 1000,
  "tax": 800,
  "discount": 0,
  "total": 11800
}`;

/**
 * Execute a single Gemini generateContent request
 */
async function executeGeminiRequest(base64Image, apiKey, model, retryCount = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: RECEIPT_PROMPT
          }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();

    // If 503 (temporary high demand), retry once after a short backoff
    if (response.status === 503 && retryCount > 0) {
      console.log(`⏳ Model ${model} is experiencing temporary high demand (503). Retrying in 1s...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return executeGeminiRequest(base64Image, apiKey, model, retryCount - 1);
    }

    const error = new Error(`Gemini API (${model}) error [${response.status}]: ${errText}`);
    error.status = response.status;
    error.rawResponse = errText;

    // Check if Google provided a replacement recommendation in the error text
    const match = errText.match(/use models\/([a-zA-Z0-9\.\-_]+)/i);
    if (match && match[1]) {
      // Only queue if not a 'pro' model to avoid free-tier quota 429 exhaustion
      if (!match[1].toLowerCase().includes('pro')) {
        error.suggestedModel = match[1];
      }
    }
    throw error;
  }

  const data = await response.json();
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    throw new Error(`Respuesta vacía de Gemini (${model})`);
  }

  const cleaned = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return { ...parsed, engineUsed: `gemini-vision (${model})` };
}

/**
 * Call Google Gemini Multimodal Vision API with adaptive model fallback
 */
async function callGeminiVision(base64Image, apiKey) {
  const customModel = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL.trim()] : [];
  // Prioritize lightweight flash models (highest quota & availability), followed by standard flash
  const initialModels = [
    ...customModel,
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.6-flash',
    'gemini-2.5-flash-lite'
  ];

  const modelsQueue = [...new Set(initialModels)];
  const triedModels = new Set();
  let lastError = null;

  while (modelsQueue.length > 0) {
    const model = modelsQueue.shift();
    if (triedModels.has(model)) continue;
    triedModels.add(model);

    try {
      console.log(`📡 Trying Gemini Vision with model: ${model}...`);
      return await executeGeminiRequest(base64Image, apiKey, model);
    } catch (err) {
      console.warn(`Attempt with ${model} failed:`, err.message);
      lastError = err;

      // If Google explicitly recommended a model in the error message, queue it up with top priority
      if (err.suggestedModel && !triedModels.has(err.suggestedModel) && !modelsQueue.includes(err.suggestedModel)) {
        console.log(`💡 Google recommended model: ${err.suggestedModel}. Queuing immediately.`);
        modelsQueue.unshift(err.suggestedModel);
      }
    }
  }

  // Dynamic discovery fallback: query ListModels from Google API to find currently supported models
  try {
    console.log('🔄 Querying Gemini ListModels for active models...');
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData?.models)) {
        const nonVisionKeywords = ['tts', 'audio', 'embed', 'bison', 'imagen', 'aqa'];
        const available = listData.models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace(/^models\//, ''))
          .filter(name => {
            const lower = name.toLowerCase();
            if (!lower.includes('gemini')) return false;
            if (triedModels.has(name)) return false;
            if (nonVisionKeywords.some(kw => lower.includes(kw))) return false;
            return true;
          });

        // Prioritize lite models, then flash models, deprioritize pro models (quota heavy)
        available.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aScore = (aLower.includes('lite') ? 10 : 0) + (aLower.includes('flash') ? 5 : 0) - (aLower.includes('pro') ? 5 : 0);
          const bScore = (bLower.includes('lite') ? 10 : 0) + (bLower.includes('flash') ? 5 : 0) - (bLower.includes('pro') ? 5 : 0);
          return bScore - aScore;
        });

        for (const discoveredModel of available) {
          try {
            console.log(`📡 Trying dynamically discovered model: ${discoveredModel}...`);
            return await executeGeminiRequest(base64Image, apiKey, discoveredModel);
          } catch (discErr) {
            console.warn(`Attempt with ${discoveredModel} failed:`, discErr.message);
            lastError = discErr;
          }
        }
      }
    }
  } catch (discoveryErr) {
    console.warn('Could not complete dynamic ListModels query:', discoveryErr.message);
  }

  throw lastError || new Error('No se pudo procesar la imagen con ningún modelo de Gemini');
}

/**
 * Call OpenAI Vision API (if OPENAI_API_KEY is provided)
 */
async function callOpenAIVision(base64Image, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: RECEIPT_PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    temperature: 0.1
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const textOutput = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(textOutput);
  return { ...parsed, engineUsed: 'openai-vision (gpt-4o-mini)' };
}

/**
 * Enhanced Local OCR with multi-line spatial analysis and mathematical verification
 */
async function parseLocalOcrFallback(preprocessedBuffer) {
  const { data: { text } } = await Tesseract.recognize(preprocessedBuffer, 'spa+eng', {
    logger: m => {
      if (m.status === 'recognizing text' && m.progress % 0.2 < 0.05) {
        console.log(`Tesseract OCR: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rawItems = [];
  let tip = 0;
  let tax = 0;
  let discount = 0;
  let explicitSubtotal = 0;
  let explicitTotal = 0;

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

  const headerIgnore = /^(NIT|TEL|DIREC|FECHA|HORA|MESA|MESER|CAJ|RESOLU|AUTORIZA|FACTURA|TICKET|REGIMEN|GRACIAS|PAG|CAMBIO|EFECTIVO|TARJETA)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headerIgnore.test(line)) continue;

    // Detect Tip
    if (/PROPINA|VOLUNTARIA|SERVICIO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})\b/i);
      if (amtMatch) tip = parseAmount(amtMatch[1]);
      continue;
    }

    // Detect Tax / Impoconsumo / IVA
    if (/IMPOCONSUMO|IVA|IMPUESTO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})\b/i);
      if (amtMatch) tax = parseAmount(amtMatch[1]);
      continue;
    }

    // Detect Discount
    if (/DESCUENTO|DCTO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})\b/i);
      if (amtMatch) discount = parseAmount(amtMatch[1]);
      continue;
    }

    // Detect Subtotal
    if (/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})\b/i);
      if (amtMatch) explicitSubtotal = parseAmount(amtMatch[1]);
      continue;
    }

    // Detect Total
    if (/TOTAL/i.test(line) && !/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})\b/i);
      if (amtMatch) explicitTotal = parseAmount(amtMatch[1]);
      continue;
    }

    // Match product line
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
        rawItems.push({
          name: descPart,
          quantity,
          unit_price: unitPrice,
          subtotal: lineTotal
        });
      }
    }
  }

  const itemsSum = rawItems.reduce((acc, it) => acc + it.subtotal, 0);
  const subtotal = explicitSubtotal > 0 ? explicitSubtotal : itemsSum;
  const calculatedTotal = subtotal + tip + tax - discount;
  const total = explicitTotal > 0 ? explicitTotal : calculatedTotal;

  return {
    store_name: 'Comercio Local',
    date: null,
    items: rawItems,
    subtotal,
    tip,
    tax,
    discount,
    total,
    rawText: text,
    engineUsed: 'local-ocr (tesseract-enhanced)'
  };
}

/**
 * Post-processes and sanitizes extracted items, applying mathematical auto-correction
 */
function sanitizeAndVerifyBillData(data) {
  const sanitizedItems = [];
  const rawItems = Array.isArray(data.items) ? data.items : [];

  for (const item of rawItems) {
    if (!item) continue;
    const name = (item.name || 'Producto').toString().trim();
    if (!name) continue;

    let quantity = parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0) quantity = 1;

    let unitPrice = Number(item.unit_price || item.unitPrice || 0);
    let subtotal = Number(item.subtotal || 0);

    // Auto-calculate missing price
    if (subtotal <= 0 && unitPrice > 0) {
      subtotal = unitPrice * quantity;
    } else if (unitPrice <= 0 && subtotal > 0) {
      unitPrice = Math.round(subtotal / quantity);
    } else if (unitPrice > 0 && subtotal > 0) {
      // Check consistency (e.g. if unitPrice was 25000 and quantity 2, subtotal should be 50000)
      if (Math.abs(unitPrice * quantity - subtotal) > 1) {
        subtotal = unitPrice * quantity;
      }
    }

    sanitizedItems.push({
      id: crypto.randomUUID(),
      name,
      quantity,
      unitPrice,
      subtotal
    });
  }

  const itemsSubtotal = sanitizedItems.reduce((sum, it) => sum + it.subtotal, 0);
  let subtotal = Number(data.subtotal) || itemsSubtotal;
  if (subtotal <= 0) subtotal = itemsSubtotal;

  const tip = Math.max(0, Number(data.tip) || 0);
  const tax = Math.max(0, Number(data.tax) || 0);
  const discount = Math.max(0, Number(data.discount) || 0);

  let total = Number(data.total) || (subtotal + tip + tax - discount);
  if (total <= 0) {
    total = Math.max(0, subtotal + tip + tax - discount);
  }

  // Fallback single item if no items were extracted
  if (sanitizedItems.length === 0) {
    sanitizedItems.push({
      id: crypto.randomUUID(),
      name: 'Consumo Factura',
      quantity: 1,
      unitPrice: total > 0 ? total : 10000,
      subtotal: total > 0 ? total : 10000
    });
    subtotal = total > 0 ? total : 10000;
  }

  // Math consistency flag
  const mathSum = subtotal + tip + tax - discount;
  const mathVerified = Math.abs(mathSum - total) <= 1;

  return {
    store_name: data.store_name || null,
    date: data.date || null,
    items: sanitizedItems,
    subtotal,
    tip,
    tax,
    discount,
    total,
    mathVerified,
    engineUsed: data.engineUsed || 'unknown',
    confidence: data.engineUsed?.includes('vision') ? 'high' : 'medium'
  };
}

/**
 * Main Orchestrator for Bill Vision Processing
 */
async function processBillImage(filePathOrBuffer, options = {}) {
  const {
    apiKey = null,          // Custom user Gemini API key from request
    openAiKey = null,       // Custom user OpenAI key
    rotation = 0
  } = options;

  // 1. Preprocess image
  const preprocessed = await preprocessImage(filePathOrBuffer, {
    rotation,
    forOcr: false,
    maxDimension: 1800
  });

  // Effective API Keys
  const effectiveGeminiKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || null;
  const effectiveOpenAiKey = (openAiKey && openAiKey.trim()) || process.env.OPENAI_API_KEY || null;

  // 2. Primary Route: Gemini Multimodal Vision
  if (effectiveGeminiKey) {
    try {
      console.log('⚡ Processing receipt with Multimodal Gemini Vision Agent...');
      const geminiResult = await callGeminiVision(preprocessed.base64, effectiveGeminiKey);
      return sanitizeAndVerifyBillData(geminiResult);
    } catch (geminiErr) {
      console.error('Gemini Vision failed, attempting secondary fallback:', geminiErr.message);
    }
  }

  // 3. Secondary Route: OpenAI Vision
  if (effectiveOpenAiKey) {
    try {
      console.log('⚡ Processing receipt with OpenAI Vision Agent...');
      const openAiResult = await callOpenAIVision(preprocessed.base64, effectiveOpenAiKey);
      return sanitizeAndVerifyBillData(openAiResult);
    } catch (openAiErr) {
      console.error('OpenAI Vision failed, falling back to local OCR:', openAiErr.message);
    }
  }

  // 4. Offline / Local Fallback Route: Tesseract with image normalization
  console.log('⚙️ Processing receipt with Enhanced Local OCR Pipeline...');
  const ocrPreprocessed = await preprocessImage(filePathOrBuffer, {
    rotation,
    forOcr: true,
    maxDimension: 1800
  });

  const localResult = await parseLocalOcrFallback(ocrPreprocessed.buffer);
  return sanitizeAndVerifyBillData(localResult);
}

module.exports = {
  processBillImage,
  sanitizeAndVerifyBillData
};
