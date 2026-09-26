const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');

// Configure upload directory for profile QR images
const baseUploadDir = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR) 
  : path.join(__dirname, '..', 'uploads');
const qrUploadDir = path.join(baseUploadDir, 'qr');

if (!fs.existsSync(qrUploadDir)) {
  fs.mkdirSync(qrUploadDir, { recursive: true });
}

// Multer storage for QR images
const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(qrUploadDir)) {
      fs.mkdirSync(qrUploadDir, { recursive: true });
    }
    cb(null, qrUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    const profileId = req.params.id ? req.params.id.replace(/[^a-zA-Z0-9_-]/g, '') : 'profile';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `qr-${profileId}-${uniqueSuffix}${cleanExt}`);
  }
});

const uploadQr = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan imagenes JPEG, PNG y WebP.'));
    }
  }
});

// Middleware helper to handle multer errors gracefully
function handleQrUpload(req, res, next) {
  uploadQr.single('qr')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el limite maximo permitido de 5MB' });
      }
      return res.status(400).json({ error: `Error en la subida de archivo: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

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

  db.get("SELECT * FROM profiles WHERE id = ?", [id], (findErr, existingProfile) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existingProfile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    let finalName = existingProfile.name;
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre del perfil es requerido' });
      }
      finalName = name.trim();
    }

    const finalKey = payment_key !== undefined ? (payment_key || null) : existingProfile.payment_key;
    const finalQr = payment_qr !== undefined ? (payment_qr || null) : existingProfile.payment_qr;
    const targetGroupId = group_id || existingProfile.group_id;

    db.run("UPDATE profiles SET name = ?, payment_key = ?, payment_qr = ? WHERE id = ?", 
      [finalName, finalKey, finalQr, id], 
      function(updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        const updated = {
          id,
          group_id: targetGroupId,
          name: finalName,
          payment_key: finalKey,
          payment_qr: finalQr
        };

        const io = req.app.get('io');
        if (io && targetGroupId) {
          io.to(targetGroupId).emit('profile_updated', updated);
        }

        res.json({
          success: true,
          id,
          group_id: targetGroupId,
          name: finalName,
          payment_key: finalKey,
          payment_qr: finalQr,
          profile: updated
        });
      }
    );
  });
});

// Upload QR image directly for a profile
router.post('/api/profiles/:id/upload-qr', handleQrUpload, (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'No se ha subido ningun archivo de imagen' });
  }

  db.get("SELECT * FROM profiles WHERE id = ?", [id], (err, profile) => {
    if (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(500).json({ error: err.message });
    }

    if (!profile) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const qrUrl = `/uploads/qr/${req.file.filename}`;

    db.run("UPDATE profiles SET payment_qr = ? WHERE id = ?", [qrUrl, id], function(updateErr) {
      if (updateErr) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlink(req.file.path, () => {});
        }
        return res.status(500).json({ error: updateErr.message });
      }

      const updatedProfile = {
        ...profile,
        payment_qr: qrUrl
      };

      const io = req.app.get('io');
      if (io && profile.group_id) {
        io.to(profile.group_id).emit('profile_updated', updatedProfile);
      }

      res.json({
        success: true,
        id,
        payment_qr: qrUrl,
        profile: updatedProfile
      });
    });
  });
});

module.exports = router;
