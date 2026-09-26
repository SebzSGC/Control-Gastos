const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Ensure isolated in-memory database and dynamic ephemeral port
process.env.DATABASE_PATH = ':memory:';
process.env.PORT = '0';

const { app, server } = require('../server');
const { parseVoucherText, cleanNumericAmount } = require('../services/voucherParserService');

// HTTP helper for JSON and multipart requests
function makeRequest(options, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    let payload = null;

    if (data) {
      if (Buffer.isBuffer(data)) {
        payload = data;
        if (!reqHeaders['Content-Length']) {
          reqHeaders['Content-Length'] = data.length;
        }
      } else if (typeof data === 'object') {
        payload = JSON.stringify(data);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      } else {
        payload = String(data);
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }
    }

    const req = http.request({ ...options, headers: reqHeaders }, (res) => {
      let bodyData = '';
      res.on('data', chunk => { bodyData += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(bodyData);
        } catch (e) {
          parsed = bodyData;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function buildMultipartBuffer(boundary, fields = {}, file = null) {
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`)
    );
  }

  if (file) {
    const filename = file.filename || 'voucher.png';
    const fieldname = file.fieldname || 'voucher';
    const mime = file.mime || 'image/png';
    const content = file.buffer || Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // 1x1 PNG header mock
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`)
    );
    parts.push(content);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

async function runVoucherSettlementTests() {
  console.log('[TEST] Starting Bre-B QR & Voucher Settlement Comprehensive Suite...');

  // Wait for server to listen
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });

  const port = server.address().port;
  const baseUrl = { hostname: '127.0.0.1', port };

  try {
    // ----------------------------------------------------
    // TEST 1: Unit tests for Colombian Voucher OCR Parser
    // ----------------------------------------------------
    console.log('[TEST 1] Testing Colombian Bank Voucher Parser regex & heuristics...');

    // Nequi voucher sample
    const nequiSample = `
      ¡Envío exitoso!
      ¿Para quién?
      Maria Gomez
      ¿Cuánto?
      $ 45.000
      Disponible
      $ 150.000
      Fecha
      26 de septiembre de 2026 a las 14:15
      Referencia
      M9876543
      ¿De dónde salió la plata?
      Disponible
    `;
    const nequiParsed = parseVoucherText(nequiSample);
    assert.strictEqual(nequiParsed.bank, 'nequi');
    assert.strictEqual(nequiParsed.amount, 45000);
    assert.strictEqual(nequiParsed.reference, 'M9876543');
    assert.strictEqual(nequiParsed.recipient, 'Maria Gomez');

    // Bancolombia voucher sample
    const bancolombiaSample = `
      Transferencia exitosa
      Comprobante No. 8472910
      26 de sep de 2026 - 11:32 a. m.
      Valor transferido
      $ 120.000,00
      Costo de la transacción
      $ 0,00
      Cuenta origen
      Ahorros *1234
      Cuenta destino
      Ahorros *5678
      Nombre destino
      SEBASTIAN RESTREPO
      Número de autorización
      554433
    `;
    const bancolombiaParsed = parseVoucherText(bancolombiaSample);
    assert.strictEqual(bancolombiaParsed.bank, 'bancolombia');
    assert.strictEqual(bancolombiaParsed.amount, 120000);
    assert.strictEqual(bancolombiaParsed.reference, '8472910');
    assert.strictEqual(bancolombiaParsed.recipient, 'SEBASTIAN RESTREPO');

    // Daviplata voucher sample
    const daviplataSample = `
      Transacción exitosa
      Pasar plata
      Número de aprobación: 432198
      ¿Cuánto?
      $ 35.000
      A celular: 3001234567
      A nombre de: Carlos Acreedor
    `;
    const daviplataParsed = parseVoucherText(daviplataSample);
    assert.strictEqual(daviplataParsed.bank, 'daviplata');
    assert.strictEqual(daviplataParsed.amount, 35000);
    assert.strictEqual(daviplataParsed.reference, '432198');
    assert.strictEqual(daviplataParsed.recipient, 'Carlos Acreedor');

    // Bre-B voucher sample
    const brebSample = `
      Transferencia Bre-B exitosa
      ID Transacción: BREB-2026-7890
      Valor: $ 75.000
      Titular: Laura Hernandez
    `;
    const brebParsed = parseVoucherText(brebSample);
    assert.strictEqual(brebParsed.bank, 'bre-b');
    assert.strictEqual(brebParsed.amount, 75000);
    assert.strictEqual(brebParsed.reference, 'BREB-2026-7890');
    assert.strictEqual(brebParsed.recipient, 'Laura Hernandez');

    console.log('[PASSED] Test 1: Colombian voucher parser heuristics verified for Nequi, Bancolombia, Daviplata and Bre-B.');

    // ----------------------------------------------------
    // TEST 2: Group Creation and Profile Setup
    // ----------------------------------------------------
    console.log('[TEST 2] Creating group and member profiles (Creditor and Debtor)...');
    const groupRes = await makeRequest({ ...baseUrl, path: '/api/groups', method: 'POST' }, { name: 'Asado Fin de Semana' });
    assert.strictEqual(groupRes.status, 200);
    const groupId = groupRes.body.id;
    assert.ok(groupId);

    // Create Creditor Profile
    const credRes = await makeRequest({ ...baseUrl, path: '/api/profiles', method: 'POST' }, {
      group_id: groupId,
      name: 'Carlos Acreedor',
      payment_key: '3109876543'
    });
    assert.strictEqual(credRes.status, 200);
    const creditorId = credRes.body.id;

    // Create Debtor Profile
    const debtRes = await makeRequest({ ...baseUrl, path: '/api/profiles', method: 'POST' }, {
      group_id: groupId,
      name: 'Daniel Deudor',
      payment_key: '3201234567'
    });
    assert.strictEqual(debtRes.status, 200);
    const debtorId = debtRes.body.id;

    console.log('[PASSED] Test 2: Group and profiles created successfully.');

    // ----------------------------------------------------
    // TEST 3: Bre-B QR Storage (Payload & Image Upload)
    // ----------------------------------------------------
    console.log('[TEST 3] Updating creditor profile with Bre-B QR payload and file upload...');

    // 3.1 Long Bre-B payload via PUT /api/profiles/:id
    const brebPayload = '00020101021226540010COM.BRE-B.WWW0114310987654302030015204000053031705802CO5915Carlos Acreedor6006Bogota6304ABCD';
    const putRes = await makeRequest({ ...baseUrl, path: `/api/profiles/${creditorId}`, method: 'PUT' }, {
      payment_qr: brebPayload
    });
    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putRes.body.payment_qr, brebPayload);

    // 3.2 Base64 Data URL via PUT /api/profiles/:id without truncation
    const dataUrlPayload = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const putDataUrlRes = await makeRequest({ ...baseUrl, path: `/api/profiles/${creditorId}`, method: 'PUT' }, {
      payment_qr: dataUrlPayload
    });
    assert.strictEqual(putDataUrlRes.status, 200);
    assert.strictEqual(putDataUrlRes.body.payment_qr, dataUrlPayload);

    // 3.3 File upload via POST /api/profiles/:id/upload-qr
    const boundary = '----WebKitFormBoundaryQRTest' + Date.now();
    // 1x1 valid PNG buffer
    const mockPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const qrMultipart = buildMultipartBuffer(boundary, {}, {
      filename: 'bre-b-qr-carlos.png',
      fieldname: 'qr',
      mime: 'image/png',
      buffer: mockPngBuffer
    });

    const qrUploadRes = await makeRequest(
      { ...baseUrl, path: `/api/profiles/${creditorId}/upload-qr`, method: 'POST' },
      qrMultipart,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
    );
    assert.strictEqual(qrUploadRes.status, 200);
    assert.ok(qrUploadRes.body.payment_qr.startsWith('/uploads/qr/'));
    assert.strictEqual(qrUploadRes.body.success, true);
    assert.ok(qrUploadRes.body.profile);
    assert.strictEqual(qrUploadRes.body.profile.id, creditorId);
    assert.strictEqual(qrUploadRes.body.profile.payment_qr, qrUploadRes.body.payment_qr);

    // 3.4 Static serving of uploaded QR with CORS and CORP headers
    const qrStaticRes = await makeRequest({ ...baseUrl, path: qrUploadRes.body.payment_qr, method: 'GET' });
    assert.strictEqual(qrStaticRes.status, 200);
    assert.strictEqual(qrStaticRes.headers['access-control-allow-origin'], '*');
    assert.strictEqual(qrStaticRes.headers['cross-origin-resource-policy'], 'cross-origin');

    // 3.5 Updating profile with relative path via PUT
    const relativePutRes = await makeRequest({ ...baseUrl, path: `/api/profiles/${creditorId}`, method: 'PUT' }, {
      payment_qr: qrUploadRes.body.payment_qr
    });
    assert.strictEqual(relativePutRes.status, 200);
    assert.strictEqual(relativePutRes.body.payment_qr, qrUploadRes.body.payment_qr);

    console.log('[PASSED] Test 3: Bre-B QR stored and uploaded via Multer with correct path.');

    // ----------------------------------------------------
    // TEST 4: Register Shared Expense & Check Initial Debt
    // ----------------------------------------------------
    console.log('[TEST 4] Registering initial expense to generate debt...');
    // Carlos Acreedor pays 100,000 COP for meat (shared among both)
    const expenseRes = await makeRequest({ ...baseUrl, path: '/api/expenses', method: 'POST' }, {
      group_id: groupId,
      profile_id: creditorId,
      amount: 100000,
      description: 'Carne para el asado',
      category: 'food',
      type: 'expense'
    });
    assert.strictEqual(expenseRes.status, 201);

    // Verify settlement: Daniel Deudor should owe 50,000 COP to Carlos Acreedor
    const settlementRes1 = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}/settlement`, method: 'GET' });
    assert.strictEqual(settlementRes1.status, 200);
    assert.strictEqual(settlementRes1.body.fairShare, 50000);
    assert.strictEqual(settlementRes1.body.totalSpent, 100000);
    assert.strictEqual(settlementRes1.body.settlements.length, 1);
    assert.strictEqual(settlementRes1.body.settlements[0].from, debtorId);
    assert.strictEqual(settlementRes1.body.settlements[0].to, creditorId);
    assert.strictEqual(settlementRes1.body.settlements[0].amount, 50000);

    console.log('[PASSED] Test 4: Expense registered. Initial debt verified: Daniel owes Carlos 50,000 COP.');

    // ----------------------------------------------------
    // TEST 5: Voucher Settlement (JSON Mode)
    // ----------------------------------------------------
    console.log('[TEST 5] Settling debt with POST /api/expenses/voucher-settlement (JSON mode)...');
    const settlePayload = {
      group_id: groupId,
      debtor_id: debtorId,
      creditor_id: creditorId,
      amount: 50000,
      voucher_ref: 'NEQ-TRANS-98124',
      description: 'Pago total liquidacion via Bre-B / Nequi'
    };

    const settleRes = await makeRequest({ ...baseUrl, path: '/api/expenses/voucher-settlement', method: 'POST' }, settlePayload);
    assert.strictEqual(settleRes.status, 201);
    assert.strictEqual(settleRes.body.success, true);
    assert.strictEqual(settleRes.body.expense.type, 'transfer');
    assert.strictEqual(settleRes.body.expense.profile_id, debtorId);
    assert.strictEqual(settleRes.body.expense.to_profile_id, creditorId);
    assert.strictEqual(settleRes.body.expense.amount, 50000);
    assert.strictEqual(settleRes.body.expense.voucher_ref, 'NEQ-TRANS-98124');

    // ----------------------------------------------------
    // TEST 6: Recalculate Settlement - Debt Must Be 0
    // ----------------------------------------------------
    console.log('[TEST 6] Verifying debt is completely settled and balances recalculated to 0...');
    const settlementRes2 = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}/settlement`, method: 'GET' });
    assert.strictEqual(settlementRes2.status, 200);
    assert.strictEqual(settlementRes2.body.settlements.length, 0, 'All settlements must be 0 after full payment');

    // Verify group state has both transactions
    const groupDataRes = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}`, method: 'GET' });
    assert.strictEqual(groupDataRes.status, 200);
    assert.strictEqual(groupDataRes.body.expenses.length, 2);
    const transferExpense = groupDataRes.body.expenses.find(e => e.type === 'transfer');
    assert.ok(transferExpense);
    assert.strictEqual(transferExpense.profile_id, debtorId);
    assert.strictEqual(transferExpense.to_profile_id, creditorId);
    assert.strictEqual(transferExpense.profile_name, 'Daniel Deudor');
    assert.strictEqual(transferExpense.to_profile_name, 'Carlos Acreedor');

    console.log('[PASSED] Test 6: Debt perfectly settled. Settlements count is 0 and balances are balanced.');

    // ----------------------------------------------------
    // TEST 7: Voucher Settlement with Multipart File Upload
    // ----------------------------------------------------
    console.log('[TEST 7] Testing multipart voucher upload with voucher-settlement...');
    // Create new small expense of 20,000 (debt: 10,000)
    await makeRequest({ ...baseUrl, path: '/api/expenses', method: 'POST' }, {
      group_id: groupId,
      profile_id: creditorId,
      amount: 20000,
      description: 'Postre',
      category: 'food',
      type: 'expense'
    });

    const vBoundary = '----WebKitFormBoundaryVoucher' + Date.now();
    const vMultipart = buildMultipartBuffer(
      vBoundary,
      {
        group_id: groupId,
        debtor_id: debtorId,
        creditor_id: creditorId,
        amount: 10000,
        voucher_ref: 'BANCOL-889900',
        description: 'Pago postre comprobante bancario'
      },
      {
        filename: 'comprobante_bancolombia.png',
        fieldname: 'voucher',
        mime: 'image/png',
        buffer: mockPngBuffer
      }
    );

    const multipartSettleRes = await makeRequest(
      { ...baseUrl, path: '/api/expenses/voucher-settlement', method: 'POST' },
      vMultipart,
      { 'Content-Type': `multipart/form-data; boundary=${vBoundary}` }
    );

    assert.strictEqual(multipartSettleRes.status, 201);
    assert.strictEqual(multipartSettleRes.body.success, true);
    assert.ok(multipartSettleRes.body.expense.voucher_url.startsWith('/uploads/vouchers/'));
    assert.strictEqual(multipartSettleRes.body.expense.voucher_ref, 'BANCOL-889900');

    // Final settlement check
    const settlementRes3 = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}/settlement`, method: 'GET' });
    assert.strictEqual(settlementRes3.status, 200);
    assert.strictEqual(settlementRes3.body.settlements.length, 0);

    console.log('[PASSED] Test 7: Multipart voucher-settlement with file upload verified successfully.');

    // ----------------------------------------------------
    // TEST 8: Scan Voucher Endpoint Validation
    // ----------------------------------------------------
    console.log('[TEST 8] Testing POST /api/expenses/scan-voucher endpoint...');
    // Negative test: no file
    const scanNoFile = await makeRequest({ ...baseUrl, path: '/api/expenses/scan-voucher', method: 'POST' });
    assert.strictEqual(scanNoFile.status, 400);
    assert.ok(scanNoFile.body.error);

    // Positive test: mock voucher upload
    const scanBoundary = '----WebKitFormBoundaryScan' + Date.now();
    const scanMultipart = buildMultipartBuffer(
      scanBoundary,
      {},
      {
        filename: 'scan_sample.png',
        fieldname: 'voucher',
        mime: 'image/png',
        buffer: mockPngBuffer
      }
    );
    const scanRes = await makeRequest(
      { ...baseUrl, path: '/api/expenses/scan-voucher', method: 'POST' },
      scanMultipart,
      { 'Content-Type': `multipart/form-data; boundary=${scanBoundary}` }
    );
    assert.strictEqual(scanRes.status, 200);
    assert.strictEqual(scanRes.body.success, true);
    assert.ok('amount' in scanRes.body);
    assert.ok('bank' in scanRes.body);
    console.log('[PASSED] Test 8: Scan voucher endpoint verified.');

    console.log('\n[SUCCESS] ALL VOUCHER SETTLEMENT & BRE-B TESTS PASSED (100%)');
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Test failure:', err);
    process.exit(1);
  }
}

runVoucherSettlementTests();
