const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { sanitizeGroupId } = require('./nfc.routes');

// Live Bill Sessions: Create or start an active collaborative bill session (Comanda Viva)
router.post('/api/bill-sessions', (req, res) => {
  const {
    id,
    sessionId,
    groupId,
    group_id,
    title,
    storeName,
    store_name,
    hostProfileId,
    host_profile_id,
    hostName,
    host_name,
    subtotal,
    tax,
    tip,
    discount,
    totalAmount,
    total_amount,
    taxDistribution,
    tax_distribution,
    items,
    assignments,
    initialClaims
  } = req.body;

  const targetGroupId = sanitizeGroupId(group_id || groupId);
  if (!targetGroupId) {
    return res.status(400).json({ error: 'group_id o groupId es requerido y debe ser válido' });
  }

  const sid = (sessionId || id || `live-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`).toString();
  const cleanTitle = (title || 'Comanda en vivo').toString().trim().slice(0, 150);
  const cleanStoreName = (store_name || storeName || cleanTitle).toString().trim().slice(0, 150);
  const cleanHostProfileId = (host_profile_id || hostProfileId || '').toString();
  const cleanHostName = (host_name || hostName || 'Anfitrión').toString().trim().slice(0, 60);
  const cleanTaxDist = (tax_distribution || taxDistribution || 'proportional').toString();
  const numSubtotal = Number(subtotal) || 0;
  const numTax = Number(tax) || 0;
  const numTip = Number(tip) || 0;
  const numDiscount = Number(discount) || 0;
  const numTotal = Number(total_amount ?? totalAmount ?? (numSubtotal + numTax + numTip - numDiscount));

  const parsedItems = Array.isArray(items) ? items : [];
  const parsedAssignments = (assignments && typeof assignments === 'object') 
    ? assignments 
    : (initialClaims && typeof initialClaims === 'object' ? initialClaims : {});

  const itemsJson = JSON.stringify(parsedItems);
  const assignmentsJson = JSON.stringify(parsedAssignments);

  // Archive any previously active sessions for this room
  db.run("UPDATE active_bill_sessions SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND status = 'active'", [targetGroupId], (uErr) => {
    if (uErr) console.warn('Warning archiving previous active bill sessions:', uErr.message);

    const insertSql = `
      INSERT INTO active_bill_sessions (
        id, group_id, title, store_name, host_profile_id, host_name,
        subtotal, tax, tip, discount, total_amount, tax_distribution,
        items, assignments, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    db.run(insertSql, [
      sid, targetGroupId, cleanTitle, cleanStoreName, cleanHostProfileId, cleanHostName,
      numSubtotal, numTax, numTip, numDiscount, numTotal, cleanTaxDist,
      itemsJson, assignmentsJson
    ], function(insertErr) {
      if (insertErr) {
        return res.status(500).json({ error: 'Error al registrar sesión en vivo: ' + insertErr.message });
      }

      const sessionData = {
        id: sid,
        sessionId: sid,
        groupId: targetGroupId,
        group_id: targetGroupId,
        title: cleanTitle,
        storeName: cleanStoreName,
        store_name: cleanStoreName,
        hostProfileId: cleanHostProfileId,
        host_profile_id: cleanHostProfileId,
        hostName: cleanHostName,
        host_name: cleanHostName,
        subtotal: numSubtotal,
        tax: numTax,
        tip: numTip,
        discount: numDiscount,
        totalAmount: numTotal,
        total_amount: numTotal,
        taxDistribution: cleanTaxDist,
        tax_distribution: cleanTaxDist,
        items: parsedItems,
        assignments: parsedAssignments,
        initialClaims: parsedAssignments,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      // Emit live event to all connected devices in the group
      const io = req.app.get('io');
      if (io) {
        io.to(targetGroupId).emit('bill_session_started', sessionData);
      }
      console.log(`🧾 [LIVE BILL] Session started & emitted to group ${targetGroupId} by ${cleanHostName}`);

      res.status(201).json(sessionData);
    });
  });
});

// GET /api/bill-sessions/active/:groupId: Retrieve the currently active live bill session
router.get('/api/bill-sessions/active/:groupId', (req, res) => {
  const targetGroupId = sanitizeGroupId(req.params.groupId);
  if (!targetGroupId) return res.status(400).json({ error: 'ID de grupo inválido' });

  db.get("SELECT * FROM active_bill_sessions WHERE group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [targetGroupId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ active: false, session: null });

    let parsedItems = [];
    let parsedAssignments = {};
    try { parsedItems = JSON.parse(row.items || '[]'); } catch (e) { parsedItems = []; }
    try { parsedAssignments = JSON.parse(row.assignments || '{}'); } catch (e) { parsedAssignments = {}; }

    const sessionData = {
      ...row,
      sessionId: row.id,
      groupId: row.group_id,
      group_id: row.group_id,
      storeName: row.store_name,
      hostProfileId: row.host_profile_id,
      hostName: row.host_name,
      totalAmount: row.total_amount,
      taxDistribution: row.tax_distribution,
      items: parsedItems,
      assignments: parsedAssignments,
      initialClaims: parsedAssignments
    };

    res.json({ active: true, session: sessionData });
  });
});

// PUT /api/bill-sessions/:id/close: Finalize or cancel active live bill session
router.put('/api/bill-sessions/:id/close', (req, res) => {
  const sessionId = req.params.id;
  db.get("SELECT * FROM active_bill_sessions WHERE id = ?", [sessionId], (err, session) => {
    if (err || !session) return res.status(404).json({ error: 'Sesión no encontrada' });

    db.run("UPDATE active_bill_sessions SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sessionId], (uErr) => {
      if (uErr) return res.status(500).json({ error: uErr.message });

      const io = req.app.get('io');
      if (io) {
        io.to(session.group_id).emit('bill_session_closed', { groupId: session.group_id, sessionId });
      }
      res.json({ success: true, message: 'Sesión finalizada exitosamente' });
    });
  });
});

// Save complete itemized bill and register its splits
router.post('/api/bills', (req, res) => {
  const { group_id, payer_profile_id, description, items, splits, subtotal, tax, tip, discount, total_amount } = req.body;

  if (!group_id || !payer_profile_id) {
    return res.status(400).json({ error: 'group_id y payer_profile_id son obligatorios' });
  }

  const numericTotal = Number(total_amount);
  if (!numericTotal || isNaN(numericTotal) || numericTotal <= 0) {
    return res.status(400).json({ error: 'El total de la factura debe ser mayor que 0' });
  }

  const billId = crypto.randomUUID();
  const date = new Date().toISOString();
  const billDesc = (description && description.trim()) ? description.trim() : 'Pago de factura desglosada';

  db.run(
    `INSERT INTO bills (id, group_id, payer_profile_id, total_amount, subtotal, tax, tip, discount, description, date) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [billId, group_id, payer_profile_id, numericTotal, Number(subtotal) || numericTotal, Number(tax) || 0, Number(tip) || 0, Number(discount) || 0, billDesc, date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Insert bill items
      if (Array.isArray(items) && items.length > 0) {
        const itemStmt = db.prepare('INSERT INTO bill_items (id, bill_id, name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        items.forEach(item => {
          const itemId = item.id || crypto.randomUUID();
          itemStmt.run([itemId, billId, item.name || 'Ítem', Number(item.quantity) || 1, Number(item.unitPrice) || 0, Number(item.subtotal) || 0]);
        });
        itemStmt.finalize();
      }

      // Insert bill splits
      if (Array.isArray(splits) && splits.length > 0) {
        const splitStmt = db.prepare('INSERT INTO bill_splits (id, bill_id, profile_id, amount, items_summary) VALUES (?, ?, ?, ?, ?)');
        splits.forEach(split => {
          const splitId = crypto.randomUUID();
          splitStmt.run([splitId, billId, split.profile_id, Number(split.amount) || 0, split.items_summary || '']);
        });
        splitStmt.finalize();
      }

      // Create linked record in expenses table with type: 'bill' so it displays in feed and history
      const expenseId = crypto.randomUUID();
      db.run(
        `INSERT INTO expenses (id, group_id, profile_id, amount, description, category, type, to_profile_id, date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, group_id, payer_profile_id, numericTotal, billDesc, 'factura', 'bill', null, date],
        function(expErr) {
          db.get('SELECT name FROM profiles WHERE id = ?', [payer_profile_id], (pErr, profile) => {
            const billPayload = {
              id: billId,
              group_id,
              payer_profile_id,
              payer_name: profile ? profile.name : 'Desconocido',
              total_amount: numericTotal,
              subtotal: Number(subtotal) || numericTotal,
              tax: Number(tax) || 0,
              tip: Number(tip) || 0,
              discount: Number(discount) || 0,
              description: billDesc,
              date,
              items: items || [],
              splits: splits || []
            };

            const expensePayload = {
              id: expenseId,
              group_id,
              profile_id: payer_profile_id,
              amount: numericTotal,
              description: billDesc,
              category: 'factura',
              type: 'bill',
              to_profile_id: null,
              date,
              profile_name: profile ? profile.name : 'Desconocido',
              bill_id: billId
            };

            // Archive active live bill session for the group upon finalization
            db.run("UPDATE active_bill_sessions SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND status = 'active'", [group_id], () => {});
            
            const io = req.app.get('io');
            if (io) {
              io.to(group_id).emit('bill_session_closed', { groupId: group_id, billId });
              io.to(group_id).emit('bill_added', billPayload);
              io.to(group_id).emit('expense_added', expensePayload);
            }

            res.status(201).json({
              success: true,
              bill: billPayload,
              expense: expensePayload
            });
          });
        }
      );
    }
  );
});

// Get individual bill details
router.get('/api/bills/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT bills.*, profiles.name as payer_name 
     FROM bills 
     JOIN profiles ON bills.payer_profile_id = profiles.id 
     WHERE bills.id = ?`,
    [id],
    (err, bill) => {
      if (err || !bill) return res.status(404).json({ error: 'Factura no encontrada' });

      db.all('SELECT * FROM bill_items WHERE bill_id = ?', [id], (iErr, items) => {
        db.all(
          `SELECT bill_splits.*, profiles.name as profile_name 
           FROM bill_splits 
           JOIN profiles ON bill_splits.profile_id = profiles.id 
           WHERE bill_splits.bill_id = ?`,
          [id],
          (sErr, splits) => {
            res.json({
              ...bill,
              items: items || [],
              splits: splits || []
            });
          }
        );
      });
    }
  );
});

module.exports = router;
