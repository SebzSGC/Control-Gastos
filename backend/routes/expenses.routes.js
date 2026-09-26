const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');

// Add Expense / Transfer
router.post('/api/expenses', (req, res) => {
  const { group_id, profile_id, amount, description, category, type, to_profile_id } = req.body;

  if (!group_id || !profile_id) {
    return res.status(400).json({ error: 'group_id y profile_id son requeridos' });
  }

  const numericAmount = Number(amount);
  if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número estrictamente mayor que 0' });
  }

  if (!description || typeof description !== 'string' || !description.trim() || description.trim().length > 120) {
    return res.status(400).json({ error: 'La descripción es obligatoria y debe tener entre 1 y 120 caracteres' });
  }

  const expenseType = type || 'expense';
  if (expenseType !== 'expense' && expenseType !== 'transfer') {
    return res.status(400).json({ error: 'El tipo de transacción debe ser "expense" o "transfer"' });
  }

  if (expenseType === 'transfer') {
    if (!to_profile_id || to_profile_id === profile_id) {
      return res.status(400).json({ error: 'Para una transferencia se requiere un destinatario válido diferente al remitente' });
    }
  }

  const sanitizedCategory = (category && typeof category === 'string' && category.trim()) 
    ? category.trim().toLowerCase() 
    : 'general';

  const id = crypto.randomUUID();
  const date = new Date().toISOString();
  const trimmedDescription = description.trim();
  
  db.run(
    "INSERT INTO expenses (id, group_id, profile_id, amount, description, category, type, to_profile_id, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
    [id, group_id, profile_id, numericAmount, trimmedDescription, sanitizedCategory, expenseType, to_profile_id || null, date], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT name FROM profiles WHERE id = ?', [profile_id], (err, profile) => {
        const expense = { 
          id, 
          group_id, 
          profile_id, 
          amount: numericAmount, 
          description: trimmedDescription, 
          category: sanitizedCategory,
          type: expenseType, 
          to_profile_id: to_profile_id || null, 
          date, 
          profile_name: profile ? profile.name : 'Desconocido'
        };
        const io = req.app.get('io');
        if (io) {
          io.to(group_id).emit('expense_added', expense);
        }
        res.status(201).json(expense);
      });
    }
  );
});

// Delete Expense
router.delete('/api/expenses/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT group_id FROM expenses WHERE id = ?', [id], (err, expense) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const targetGroupId = expense.group_id;

    db.run('DELETE FROM expenses WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      const io = req.app.get('io');
      if (io) {
        io.to(targetGroupId).emit('expense_deleted', { id, group_id: targetGroupId });
      }
      res.json({ success: true, id, group_id: targetGroupId });
    });
  });
});

module.exports = router;
