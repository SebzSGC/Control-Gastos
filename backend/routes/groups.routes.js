const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { sanitizeGroupId } = require('./nfc.routes');

// Create a group
router.post('/api/groups', (req, res) => {
  const { id, name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del grupo es obligatorio' });
  }

  const groupId = (id && typeof id === 'string' && id.trim()) 
    ? sanitizeGroupId(id) 
    : crypto.randomBytes(2).toString('hex').toUpperCase();

  db.run('INSERT INTO groups (id, name) VALUES (?, ?)', [groupId, name.trim()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: groupId, name: name.trim() });
  });
});

// Get group data (chronologically ordered by date DESC)
router.get('/api/groups/:id', (req, res) => {
  const groupId = sanitizeGroupId(req.params.id);
  if (!groupId) return res.status(400).json({ error: 'Código de grupo inválido' });
  
  db.get('SELECT * FROM groups WHERE UPPER(id) = ?', [groupId], (err, group) => {
    if (err || !group) return res.status(404).json({ error: 'Group not found' });
    
    db.all('SELECT * FROM profiles WHERE group_id = ?', [groupId], (err, profiles) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.all(`SELECT expenses.*, profiles.name as profile_name 
              FROM expenses 
              JOIN profiles ON expenses.profile_id = profiles.id 
              WHERE expenses.group_id = ?
              ORDER BY expenses.date DESC`, [groupId], (err, expenses) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`SELECT bills.*, profiles.name as payer_name 
                FROM bills 
                JOIN profiles ON bills.payer_profile_id = profiles.id 
                WHERE bills.group_id = ? 
                ORDER BY bills.date DESC`, [groupId], async (billErr, bills) => {
          if (billErr) {
            return res.json({ group, profiles, expenses, bills: [] });
          }

          // Attach items and splits to each bill
          const populatedBills = await Promise.all((bills || []).map(bill => {
            return new Promise((resolve) => {
              db.all('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id], (iErr, items) => {
                db.all(`SELECT bill_splits.*, profiles.name as profile_name 
                        FROM bill_splits 
                        JOIN profiles ON bill_splits.profile_id = profiles.id 
                        WHERE bill_splits.bill_id = ?`, [bill.id], (sErr, splits) => {
                  resolve({
                    ...bill,
                    items: items || [],
                    splits: splits || []
                  });
                });
              });
            });
          }));
          
          // Query active live bill session if one exists for real-time sync across devices
          db.get("SELECT * FROM active_bill_sessions WHERE group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [groupId], (aErr, activeRow) => {
            let activeBillSession = null;
            if (activeRow) {
              let parsedItems = [];
              let parsedAssignments = {};
              try { parsedItems = JSON.parse(activeRow.items || '[]'); } catch (e) { parsedItems = []; }
              try { parsedAssignments = JSON.parse(activeRow.assignments || '{}'); } catch (e) { parsedAssignments = {}; }

              activeBillSession = {
                ...activeRow,
                sessionId: activeRow.id,
                groupId: activeRow.group_id,
                group_id: activeRow.group_id,
                storeName: activeRow.store_name,
                hostProfileId: activeRow.host_profile_id,
                hostName: activeRow.host_name,
                totalAmount: activeRow.total_amount,
                taxDistribution: activeRow.tax_distribution,
                items: parsedItems,
                assignments: parsedAssignments,
                initialClaims: parsedAssignments
              };
            }

            res.json({
              group,
              profiles,
              expenses,
              bills: populatedBills,
              activeBillSession
            });
          });
        });
      });
    });
  });
});

// Calculate settlements (Min-Cash-Flow greedy algorithm)
router.get('/api/groups/:id/settlement', (req, res) => {
  const groupId = req.params.id;
  
  db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
    if (err || !group) return res.status(404).json({ error: 'Group not found' });
    
    db.all('SELECT * FROM profiles WHERE group_id = ?', [groupId], (err, profiles) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!profiles || profiles.length === 0) {
        return res.json({ fairShare: 0, totalSpent: 0, settlements: [] });
      }
      
      db.all('SELECT * FROM expenses WHERE group_id = ?', [groupId], (err, expenses) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`SELECT bill_splits.* 
                FROM bill_splits 
                JOIN bills ON bill_splits.bill_id = bills.id 
                WHERE bills.group_id = ?`, [groupId], (sErr, allSplits) => {
          let generalSpent = 0;
          let totalSpent = 0;
          const profileMap = {};
          profiles.forEach(p => {
            profileMap[p.id] = { id: p.id, name: p.name, paid: 0, transferred: 0, received: 0, billDebt: 0 };
          });

          // Accumulate bill splits (exact itemized debts)
          (allSplits || []).forEach(sp => {
            if (profileMap[sp.profile_id]) {
              profileMap[sp.profile_id].billDebt += Number(sp.amount) || 0;
            }
          });

          (expenses || []).forEach(ex => {
            const amt = Number(ex.amount) || 0;
            if (ex.type === 'expense') {
              if (profileMap[ex.profile_id]) {
                profileMap[ex.profile_id].paid += amt;
              }
              generalSpent += amt;
              totalSpent += amt;
            } else if (ex.type === 'bill') {
              if (profileMap[ex.profile_id]) {
                profileMap[ex.profile_id].paid += amt;
              }
              totalSpent += amt;
            } else if (ex.type === 'transfer') {
              if (profileMap[ex.profile_id]) {
                profileMap[ex.profile_id].transferred += amt;
              }
              if (ex.to_profile_id && profileMap[ex.to_profile_id]) {
                profileMap[ex.to_profile_id].received += amt;
              }
            }
          });

          const numProfiles = profiles.length;
          const generalFairShare = numProfiles > 0 ? (generalSpent / numProfiles) : 0;

          // Net balance: (paid + transferred - received) - (generalFairShare + billDebt)
          const debtors = [];
          const creditors = [];

          Object.values(profileMap).forEach(p => {
            const consumed = generalFairShare + p.billDebt;
            const netBalance = Math.round(((p.paid + p.transferred - p.received) - consumed) * 100) / 100;
            if (netBalance < -0.01) {
              debtors.push({ id: p.id, name: p.name, amount: -netBalance });
            } else if (netBalance > 0.01) {
              creditors.push({ id: p.id, name: p.name, amount: netBalance });
            }
          });
        
          // Min-Cash-Flow matching
          const settlements = [];
          let i = 0;
          let j = 0;
          
          while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];
            
            const settlementAmount = Math.min(debtor.amount, creditor.amount);
            const roundedAmount = Math.round(settlementAmount * 100) / 100;
            
            if (roundedAmount > 0) {
              settlements.push({
                from: debtor.id,
                from_name: debtor.name,
                to: creditor.id,
                to_name: creditor.name,
                amount: roundedAmount
              });
            }
            
            debtor.amount = Math.round((debtor.amount - settlementAmount) * 100) / 100;
            creditor.amount = Math.round((creditor.amount - settlementAmount) * 100) / 100;
            
            if (debtor.amount <= 0.01) i++;
            if (creditor.amount <= 0.01) j++;
          }
          
          res.json({
            fairShare: Math.round(generalFairShare * 100) / 100,
            totalSpent: Math.round(totalSpent * 100) / 100,
            settlements
          });
        });
      });
    });
  });
});

module.exports = router;
