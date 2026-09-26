const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');

// Create Profile
router.post('/api/profiles', (req, res) => {
  const { group_id, name, payment_key, payment_qr } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del perfil es requerido' });
  }
  if (!group_id) {
    return res.status(400).json({ error: 'group_id es requerido' });
  }

  const id = crypto.randomUUID();
  const trimmedName = name.trim();

  db.run("INSERT INTO profiles (id, group_id, name, payment_key, payment_qr) VALUES (?, ?, ?, ?, ?)", 
    [id, group_id, trimmedName, payment_key || null, payment_qr || null], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const io = req.app.get('io');
      if (io) {
        io.to(group_id).emit('profile_added', { id, group_id, name: trimmedName, payment_key, payment_qr });
      }
      res.json({ id, group_id, name: trimmedName, payment_key, payment_qr });
    }
  );
});

// Update Profile
router.put('/api/profiles/:id', (req, res) => {
  const { id } = req.params;
  const { name, payment_key, payment_qr, group_id } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del perfil es requerido' });
  }

  const trimmedName = name.trim();

  db.run("UPDATE profiles SET name = ?, payment_key = ?, payment_qr = ? WHERE id = ?", 
    [trimmedName, payment_key || null, payment_qr || null, id], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (group_id) {
        const io = req.app.get('io');
        if (io) {
          io.to(group_id).emit('profile_updated', { id, name: trimmedName, payment_key, payment_qr });
        }
      }
      res.json({ success: true, id, name: trimmedName, payment_key, payment_qr });
    }
  );
});

module.exports = router;
