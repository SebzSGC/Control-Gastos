const assert = require('assert');
const { sanitizeAndVerifyBillData } = require('../services/receiptVisionService');
const { preprocessImage } = require('../services/imagePreprocessor');
const { Jimp } = require('jimp');

async function runTests() {
  console.log('🧪 Running Vision Pipeline Tests...');

  // Test 1: Mathematical Sanitizer with Messy Colombian Receipt Data
  console.log('Test 1: Sanitizing raw messy invoice data...');
  const mockRawData = {
    store_name: 'Restaurante El Corral Gourmet',
    date: '2026-09-21',
    items: [
      { name: '2x Corralisima con Queso', quantity: 2, unit_price: 28000, subtotal: 56000 },
      { name: 'Papas Medianas', quantity: 1, unit_price: 9500, subtotal: 9500 },
      { name: 'Coca Cola Zero', quantity: 2, unit_price: 7000, subtotal: 14000 }
    ],
    subtotal: 79500,
    tip: 7950,
    tax: 6360,
    discount: 0,
    total: 93810,
    engineUsed: 'gemini-vision (gemini-2.0-flash)'
  };

  const sanitized = sanitizeAndVerifyBillData(mockRawData);
  assert.strictEqual(sanitized.items.length, 3, 'Should have 3 sanitized items');
  assert.strictEqual(sanitized.items[0].subtotal, 56000, 'Subtotal should be exactly 56000');
  assert.strictEqual(sanitized.subtotal, 79500, 'Subtotal should be 79500');
  assert.strictEqual(sanitized.tip, 7950, 'Tip should be 7950');
  assert.strictEqual(sanitized.tax, 6360, 'Tax should be 6360');
  assert.strictEqual(sanitized.total, 93810, 'Total should be 93810');
  assert.strictEqual(sanitized.mathVerified, true, 'Math should be fully verified');
  assert.strictEqual(sanitized.confidence, 'high', 'Confidence should be high for vision models');
  console.log('✅ Test 1 Passed: Exact item extraction and math verification passed');

  // Test 2: Incomplete item prices auto-calculation
  console.log('Test 2: Auto-calculation of missing quantities and prices...');
  const incompleteData = {
    items: [
      { name: 'Pizza Familiar', quantity: 0, unit_price: 45000, subtotal: 0 },
      { name: 'Cerveza Club Colombia', quantity: 3, unit_price: 0, subtotal: 24000 }
    ],
    total: 69000
  };

  const fixed = sanitizeAndVerifyBillData(incompleteData);
  assert.strictEqual(fixed.items[0].quantity, 1, 'Zero quantity should default to 1');
  assert.strictEqual(fixed.items[0].subtotal, 45000, 'Subtotal should be calculated from unit price');
  assert.strictEqual(fixed.items[1].unitPrice, 8000, 'Unit price should be 24000 / 3 = 8000');
  console.log('✅ Test 2 Passed: Incomplete prices auto-calculated correctly');

  // Test 3: Preprocessor with Jimp image buffer
  console.log('Test 3: Image preprocessor scaling and rotation...');
  const testImg = new Jimp({ width: 2400, height: 1600, color: 0xFFFFFFFF });
  const buf = await testImg.getBuffer('image/jpeg');

  const processed = await preprocessImage(buf, { rotation: 90, maxDimension: 1800 });
  assert.ok(processed.width <= 1800, 'Width should be <= 1800');
  assert.ok(processed.height <= 1800, 'Height should be <= 1800');
  assert.ok(processed.base64.length > 100, 'Base64 string should be generated');
  console.log(`✅ Test 3 Passed: Image successfully scaled and rotated (dim: ${processed.width}x${processed.height})`);

  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
