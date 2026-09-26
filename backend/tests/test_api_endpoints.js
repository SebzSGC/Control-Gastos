const assert = require('assert');
const http = require('http');

// Set in-memory or isolated test database before importing modules
process.env.DATABASE_PATH = ':memory:';
process.env.PORT = '0'; // ephemeral port

const { app, server } = require('../server');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);

    if (postData) {
      if (typeof postData === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('🧪 Running PaySync Modular API & Endpoints Integration Tests...');

  // Wait for server listening
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });

  const port = server.address().port;
  const baseUrl = { hostname: '127.0.0.1', port };

  try {
    // 1. Health Checks
    console.log('Test 1: Health check endpoints (/api/health, /health)...');
    const health1 = await makeRequest({ ...baseUrl, path: '/api/health', method: 'GET' });
    assert.strictEqual(health1.status, 200);
    assert.strictEqual(health1.body.status, 'healthy');
    assert.strictEqual(health1.body.service, 'PaySync API');

    const health2 = await makeRequest({ ...baseUrl, path: '/health', method: 'GET' });
    assert.strictEqual(health2.status, 200);
    assert.strictEqual(health2.body.status, 'healthy');
    console.log('✅ Test 1 Passed: Health endpoints healthy');

    // 2. Vision Status
    console.log('Test 2: Vision status (/api/vision-status)...');
    const visionStatus = await makeRequest({ ...baseUrl, path: '/api/vision-status', method: 'GET' });
    assert.strictEqual(visionStatus.status, 200);
    assert.ok('hasServerKey' in visionStatus.body);
    console.log('✅ Test 2 Passed: Vision status endpoint returned successfully');

    // 3. Groups CRUD & NFC Resolve
    console.log('Test 3: Group creation and NFC resolution...');
    const groupRes = await makeRequest({ ...baseUrl, path: '/api/groups', method: 'POST' }, { name: 'Viaje a Medellín' });
    assert.strictEqual(groupRes.status, 200);
    const groupId = groupRes.body.id;
    assert.ok(groupId, 'Group ID must be present');
    assert.strictEqual(groupRes.body.name, 'Viaje a Medellín');

    // NFC resolve with raw group ID
    const nfcRes = await makeRequest({ ...baseUrl, path: '/api/nfc/resolve', method: 'POST' }, { payload: groupId });
    assert.strictEqual(nfcRes.status, 200);
    assert.strictEqual(nfcRes.body.valid, true);
    assert.strictEqual(nfcRes.body.groupId, groupId);
    assert.strictEqual(nfcRes.body.groupName, 'Viaje a Medellín');

    // NFC resolve with URL
    const nfcUrlRes = await makeRequest({ ...baseUrl, path: '/api/nfc/resolve', method: 'POST' }, { payload: `https://paysync.app/group/${groupId}` });
    assert.strictEqual(nfcUrlRes.status, 200);
    assert.strictEqual(nfcUrlRes.body.valid, true);
    assert.strictEqual(nfcUrlRes.body.groupId, groupId);
    console.log('✅ Test 3 Passed: Group created and NFC resolved with raw code & URL');

    // 4. Profiles Creation & Update
    console.log('Test 4: Profile creation & update...');
    const p1Res = await makeRequest({ ...baseUrl, path: '/api/profiles', method: 'POST' }, { group_id: groupId, name: 'Alice', payment_key: 'alice@bank' });
    assert.strictEqual(p1Res.status, 200);
    const aliceId = p1Res.body.id;

    const p2Res = await makeRequest({ ...baseUrl, path: '/api/profiles', method: 'POST' }, { group_id: groupId, name: 'Bob' });
    assert.strictEqual(p2Res.status, 200);
    const bobId = p2Res.body.id;

    // Update Alice
    const updateRes = await makeRequest({ ...baseUrl, path: `/api/profiles/${aliceId}`, method: 'PUT' }, { group_id: groupId, name: 'Alice Updated', payment_key: 'alice2@bank' });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.name, 'Alice Updated');
    console.log('✅ Test 4 Passed: Profiles created and updated');

    // 5. Expenses & Transfers
    console.log('Test 5: Expense creation, transfer, and deletion...');
    const exp1 = await makeRequest({ ...baseUrl, path: '/api/expenses', method: 'POST' }, {
      group_id: groupId,
      profile_id: aliceId,
      amount: 60000,
      description: 'Cena compartida',
      category: 'comida',
      type: 'expense'
    });
    assert.strictEqual(exp1.status, 201);
    assert.strictEqual(exp1.body.amount, 60000);
    assert.strictEqual(exp1.body.category, 'comida');

    // Transfer from Bob to Alice
    const transferRes = await makeRequest({ ...baseUrl, path: '/api/expenses', method: 'POST' }, {
      group_id: groupId,
      profile_id: bobId,
      to_profile_id: aliceId,
      amount: 10000,
      description: 'Abono Bob a Alice',
      type: 'transfer'
    });
    assert.strictEqual(transferRes.status, 201);
    assert.strictEqual(transferRes.body.type, 'transfer');

    // Delete an expense test
    const expToDelete = await makeRequest({ ...baseUrl, path: '/api/expenses', method: 'POST' }, {
      group_id: groupId,
      profile_id: aliceId,
      amount: 5000,
      description: 'Gasto a borrar',
      type: 'expense'
    });
    const delRes = await makeRequest({ ...baseUrl, path: `/api/expenses/${expToDelete.body.id}`, method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.success, true);
    console.log('✅ Test 5 Passed: Expenses and transfers verified');

    // 6. Collaborative Live Bill Sessions (Comanda Viva)
    console.log('Test 6: Live bill sessions (start, query active, close)...');
    const sessionRes = await makeRequest({ ...baseUrl, path: '/api/bill-sessions', method: 'POST' }, {
      groupId,
      title: 'Cuenta Restaurante',
      storeName: 'El Corral',
      hostProfileId: aliceId,
      hostName: 'Alice Updated',
      subtotal: 40000,
      tax: 3200,
      tip: 4000,
      items: [{ id: 'item-1', name: 'Hamburguesa', quantity: 2, unitPrice: 20000, subtotal: 40000 }],
      assignments: { 'item-1': [aliceId, bobId] }
    });
    assert.strictEqual(sessionRes.status, 201);
    const sessionId = sessionRes.body.sessionId;
    assert.ok(sessionId);

    // Query active session
    const activeRes = await makeRequest({ ...baseUrl, path: `/api/bill-sessions/active/${groupId}`, method: 'GET' });
    assert.strictEqual(activeRes.status, 200);
    assert.strictEqual(activeRes.body.active, true);
    assert.strictEqual(activeRes.body.session.sessionId, sessionId);
    assert.strictEqual(activeRes.body.session.items.length, 1);

    // Close session
    const closeRes = await makeRequest({ ...baseUrl, path: `/api/bill-sessions/${sessionId}/close`, method: 'PUT' });
    assert.strictEqual(closeRes.status, 200);
    assert.strictEqual(closeRes.body.success, true);

    const activeAfterClose = await makeRequest({ ...baseUrl, path: `/api/bill-sessions/active/${groupId}`, method: 'GET' });
    assert.strictEqual(activeAfterClose.body.active, false);
    console.log('✅ Test 6 Passed: Collaborative bill session lifecycle passed');

    // 7. Itemized Bills and Splits
    console.log('Test 7: Full itemized bill creation and fetch...');
    const billRes = await makeRequest({ ...baseUrl, path: '/api/bills', method: 'POST' }, {
      group_id: groupId,
      payer_profile_id: aliceId,
      description: 'Factura Restaurante Final',
      subtotal: 40000,
      tax: 3200,
      tip: 4000,
      total_amount: 47200,
      items: [
        { name: 'Hamburguesa 1', quantity: 1, unitPrice: 20000, subtotal: 20000 },
        { name: 'Hamburguesa 2', quantity: 1, unitPrice: 20000, subtotal: 20000 }
      ],
      splits: [
        { profile_id: aliceId, amount: 23600, items_summary: 'Hamburguesa 1' },
        { profile_id: bobId, amount: 23600, items_summary: 'Hamburguesa 2' }
      ]
    });
    assert.strictEqual(billRes.status, 201);
    assert.strictEqual(billRes.body.success, true);
    const billId = billRes.body.bill.id;

    // Fetch individual bill
    const billGet = await makeRequest({ ...baseUrl, path: `/api/bills/${billId}`, method: 'GET' });
    assert.strictEqual(billGet.status, 200);
    assert.strictEqual(billGet.body.items.length, 2);
    assert.strictEqual(billGet.body.splits.length, 2);
    console.log('✅ Test 7 Passed: Itemized bill creation and retrieval passed');

    // 8. Group Summary & Greedy Settlement Algorithm
    console.log('Test 8: Group summary and Min-Cash-Flow settlement calculation...');
    const groupData = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}`, method: 'GET' });
    assert.strictEqual(groupData.status, 200);
    assert.strictEqual(groupData.body.profiles.length, 2);
    assert.ok(groupData.body.expenses.length >= 2);
    assert.strictEqual(groupData.body.bills.length, 1);

    const settlementRes = await makeRequest({ ...baseUrl, path: `/api/groups/${groupId}/settlement`, method: 'GET' });
    assert.strictEqual(settlementRes.status, 200);
    assert.ok(settlementRes.body.totalSpent > 0, 'Total spent should be positive');
    assert.ok(Array.isArray(settlementRes.body.settlements), 'Settlements should be an array');
    console.log(`✅ Test 8 Passed: Settlement algorithm produced valid result: fairShare=${settlementRes.body.fairShare}, settlements=${JSON.stringify(settlementRes.body.settlements)}`);

    console.log('\n🎉 ALL MODULAR API INTEGRATION TESTS PASSED 100%!');
    process.exit(0);
  } finally {
    server.close();
  }
}

runApiTests().catch(err => {
  console.error('❌ API Integration Test failed:', err);
  process.exit(1);
});
