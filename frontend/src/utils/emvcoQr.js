/**
 * EMVCo QR Code Generator and Validator (Merchant-Presented Mode)
 *
 * Implements the international standard EMVCo specification for interoperable
 * QR payments (Bre-B / ACH Colombia / Redeban / CredibanCo):
 * - Tag 00: Payload Format Indicator ('01') -> '000201'
 * - Tag 01: Point of Initiation Method ('11' for Static QR) -> '010211'
 * - Tag 26: Merchant Account Information (GUI 'CO.COM.ACH' + Key + Bank Entity)
 * - Tag 52: Merchant Category Code ('0000' General) -> '52040000'
 * - Tag 53: Transaction Currency ('170' COP) -> '5303170'
 * - Tag 58: Country Code ('CO' Colombia) -> '5802CO'
 * - Tag 59: Merchant Name (Sanitized ASCII, max 25 chars)
 * - Tag 60: Merchant City ('COLOMBIA') -> '6008COLOMBIA'
 * - Tag 62: Additional Data Template (Subtag 01 Reference / Subtag 02 Mobile Number)
 * - Tag 63: Checksum CRC-16/CCITT (ISO/IEC 13239, polynomial 0x1021, init 0xFFFF)
 */

/**
 * Format a TLV (Tag-Length-Value) entry with zero-padded 2-digit length.
 * @param {string} tag - 2-character tag identifier
 * @param {string} value - String value
 * @returns {string} Formatted TLV string
 */
export function formatTlv(tag, value) {
  const str = String(value ?? '');
  const len = String(str.length).padStart(2, '0');
  return `${tag}${len}${str}`;
}

/**
 * Computes CRC-16/CCITT (ISO/IEC 13239, poly 0x1021, init 0xFFFF, no reflection).
 * @param {string} str - Input ASCII string
 * @returns {string} 4-character uppercase hexadecimal checksum
 */
export function computeCrc16Ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) & 0xff;
    crc ^= code << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Sanitize a string to pure uppercase ASCII without diacritics or special symbols.
 * @param {string} str - Raw string
 * @param {number} maxLen - Maximum character length
 * @returns {string} Clean ASCII uppercase string
 */
export function sanitizeAscii(str, maxLen = 25) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

/**
 * Sanitize payment key according to its type.
 * @param {string} key - Raw key
 * @param {string} keyType - 'celular' | 'cedula' | 'correo' | 'alfanumerica'
 * @returns {string} Clean key string
 */
export function sanitizePaymentKey(key, keyType = 'celular') {
  if (!key) return '';
  const trimmed = String(key).trim();
  if (keyType === 'celular' || keyType === 'cedula') {
    return trimmed.replace(/\D/g, '').slice(0, 15);
  }
  return trimmed.slice(0, 50);
}

/**
 * Build a standard EMVCo Merchant-Presented Mode payload for Bre-B Colombian banking.
 *
 * @param {Object} params
 * @param {string} params.name - Account holder name
 * @param {string} params.key - Payment key (phone, document, or key string)
 * @param {string} [params.keyType='celular'] - Key type
 * @param {string} [params.bank='bre-b'] - Target bank identifier
 * @returns {string} Standard EMVCo QR payload string
 */
export function buildEmvCoPayload({ name, key, keyType = 'celular', bank = 'bre-b' } = {}) {
  const cleanKey = sanitizePaymentKey(key, keyType);
  if (!cleanKey) return '';

  const cleanName = sanitizeAscii(name, 25) || 'USUARIO BRE-B';
  const bankCode = bank ? sanitizeAscii(bank, 15) : 'BRE-B';

  // Tag 00: Payload Format Indicator ('01')
  const tag00 = formatTlv('00', '01');

  // Tag 01: Point of Initiation Method ('11' = Static QR)
  const tag01 = formatTlv('01', '11');

  // Tag 26: Merchant Account Information
  // 00: Globally Unique Identifier (ACH Colombia / Bre-B)
  // 01: Payment Key
  // 02: Bank Code
  const sub26 =
    formatTlv('00', 'CO.COM.ACH') +
    formatTlv('01', cleanKey) +
    (bankCode ? formatTlv('02', bankCode) : '');
  const tag26 = formatTlv('26', sub26);

  // Tag 52: Merchant Category Code (0000 General)
  const tag52 = formatTlv('52', '0000');

  // Tag 53: Transaction Currency (170 = COP)
  const tag53 = formatTlv('53', '170');

  // Tag 58: Country Code (CO)
  const tag58 = formatTlv('58', 'CO');

  // Tag 59: Merchant Name
  const tag59 = formatTlv('59', cleanName);

  // Tag 60: Merchant City
  const tag60 = formatTlv('60', 'COLOMBIA');

  // Tag 62: Additional Data Template
  // Subtag 02 for mobile number, Subtag 01 for reference/bill
  const sub62 = keyType === 'celular'
    ? formatTlv('02', cleanKey)
    : formatTlv('01', cleanKey);
  const tag62 = formatTlv('62', sub62);

  // Construct payload prefix ending with Tag 63 ID + Length ('6304')
  const payloadWithoutChecksum = `${tag00}${tag01}${tag26}${tag52}${tag53}${tag58}${tag59}${tag60}${tag62}6304`;

  // Compute CRC-16 Checksum
  const checksum = computeCrc16Ccitt(payloadWithoutChecksum);

  return `${payloadWithoutChecksum}${checksum}`;
}

/**
 * Validates whether a given payload conforms to the EMVCo standard and passes CRC-16 verification.
 * @param {string} payload - QR payload string
 * @returns {boolean} True if payload is a valid EMVCo string
 */
export function validateEmvCoPayload(payload) {
  if (!payload || typeof payload !== 'string') return false;
  if (!payload.startsWith('000201')) return false;
  if (payload.length < 20) return false;

  const tag63Index = payload.lastIndexOf('6304');
  if (tag63Index === -1 || tag63Index !== payload.length - 8) {
    return false;
  }

  const dataToCrc = payload.slice(0, -4);
  const providedChecksum = payload.slice(-4).toUpperCase();
  const calculatedChecksum = computeCrc16Ccitt(dataToCrc);

  if (providedChecksum !== calculatedChecksum) {
    return false;
  }

  // Validate TLV framing structure
  let idx = 0;
  while (idx < payload.length) {
    if (idx + 4 > payload.length) return false;
    const len = parseInt(payload.substring(idx + 2, idx + 4), 10);
    if (isNaN(len) || len < 0) return false;
    idx += 4 + len;
    if (idx > payload.length) return false;
  }

  return idx === payload.length;
}

export const isEmvCoPayload = validateEmvCoPayload;
