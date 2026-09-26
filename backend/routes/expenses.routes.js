const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const { processVoucherImage } = require('../services/voucherParserService');

// Configure upload directories for vouchers
const baseUploadDir = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR) 
  : path.join(__dirname, '..', 'uploads');
const vouchersUploadDir = path.join(baseUploadDir, 'vouchers');
const tempUploadDir = path.join(baseUploadDir, 'temp');

if (!fs.existsSync(vouchersUploadDir)) {
  fs.mkdirSync(vouchersUploadDir, { recursive: true });
}
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Multer storage for persistent vouchers
const voucherStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(vouchersUploadDir)) {
      fs.mkdirSync(vouchersUploadDir, { recursive: true });
    }
    cb(null, vouchersUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `voucher-${uniqueSuffix}${cleanExt}`);
  }
});

// Multer storage for temporary scanning
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(tempUploadDir)) {
      fs.mkdirSync(tempUploadDir, { recursive: true });
    }
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `scan-${uniqueSuffix}${cleanExt}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan imagenes JPEG, PNG y WebP.'));
  }
};

const uploadTempVoucher = multer({
  storage: tempStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter
});

const uploadPersistentVoucher = multer({
  storage: voucherStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter
});

function handleScanUpload(req, res, next) {
  uploadTempVoucher.single('voucher')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El comprobante excede el limite de 5MB' });
      }
      return res.status(400).json({ error: `Error en la subida del comprobante: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

function handleSettlementUpload(req, res, next) {
  uploadPersistentVoucher.single('voucher')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El comprobante excede el limite de 5MB' });
      }
      return res.status(400).json({ error: `Error en la subida del comprobante: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// Add Expense / Transfer
router.post('/api/expenses', (req, res) => {
  const { group_id, profile_id, amount, description, category, type, to_profile_id, voucher_url, voucher_ref } = req.body;

  if (!group_id || !profile_id) {
    return res.status(400).json({ error: 'group_id y profile_id son requeridos' });
  }

  const numericAmount = Number(amount);
  if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un numero estrictamente mayor que 0' });
  }

  if (!description || typeof description !== 'string' || !description.trim() || description.trim().length > 120) {
    return res.status(400).json({ error: 'La descripcion es obligatoria y debe tener entre 1 y 120 caracteres' });
  }

  const expenseType = type || 'expense';
  if (expenseType !== 'expense' && expenseType !== 'transfer') {
    return res.status(400).json({ error: 'El tipo de transaccion debe ser "expense" o "transfer"' });
  }

  if (expenseType === 'transfer') {
    if (!to_profile_id || to_profile_id === profile_id) {
      return res.status(400).json({ error: 'Para una transferencia se requiere un destinatario valido diferente al remitente' });
    }
  }

  const sanitizedCategory = (category && typeof category === 'string' && category.trim()) 
    ? category.trim().toLowerCase() 
    : (expenseType === 'transfer' ? 'transfer' : 'general');

  const id = crypto.randomUUID();
  const date = new Date().toISOString();
  const trimmedDescription = description.trim();
  
  db.run(
    "INSERT INTO expenses (id, group_id, profile_id, amount, description, category, type, to_profile_id, voucher_url, voucher_ref, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
    [id, group_id, profile_id, numericAmount, trimmedDescription, sanitizedCategory, expenseType, to_profile_id || null, voucher_url || null, voucher_ref || null, date], 
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
          voucher_url: voucher_url || null,
          voucher_ref: voucher_ref || null,
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

// Scan voucher endpoint (Tesseract local + optional Vision AI fallback)
router.post('/api/expenses/scan-voucher', handleScanUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha proporcionado ninguna imagen del comprobante' });
  }

  const filePath = req.file.path;
  try {
    const apiKey = req.headers['x-gemini-key'] || req.body?.apiKey || null;
    const rotation = parseInt(req.body?.rotation || '0', 10) || 0;

    const detected = await processVoucherImage(filePath, { apiKey, rotation });

    res.json({
      success: true,
      amount: detected.amount || 0,
      reference: detected.reference || null,
      recipient: detected.recipient || null,
      bank: detected.bank || 'other',
      rawText: detected.rawText || '',
      engineUsed: detected.engineUsed || 'local-ocr'
    });
  } catch (error) {
    res.status(500).json({ error: `Error procesando el comprobante: ${error.message}` });
  } finally {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Silently ignore unlink error in temp
      }
    }
  }
});

// Voucher settlement endpoint: registers debt settlement with instant recalculation
router.post('/api/expenses/voucher-settlement', handleSettlementUpload, async (req, res) => {
  const { group_id, debtor_id, creditor_id, amount, voucher_ref, description } = req.body;

  if (!group_id) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'group_id es requerido' });
  }

  if (!debtor_id || !creditor_id) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'debtor_id y creditor_id son requeridos' });
  }

  if (debtor_id === creditor_id) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El deudor y el acreedor deben ser perfiles diferentes' });
  }

  // Validate profiles and group membership
  db.all('SELECT * FROM profiles WHERE id IN (?, ?) AND group_id = ?', [debtor_id, creditor_id, group_id], async (err, profiles) => {
    if (err) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: err.message });
    }

    const debtor = (profiles || []).find(p => p.id === debtor_id);
    const creditor = (profiles || []).find(p => p.id === creditor_id);

    if (!debtor || !creditor) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'El deudor o acreedor no existen en el grupo especificado' });
    }

    let finalAmount = Number(amount);
    let finalVoucherRef = voucher_ref ? String(voucher_ref).trim() : null;
    let detectedInfo = { amount: 0, reference: null };

    // Auto-extract from voucher image if amount is not provided or <= 0
    if ((!finalAmount || isNaN(finalAmount) || finalAmount <= 0) && req.file) {
      try {
        const detected = await processVoucherImage(req.file.path);
        if (detected.amount > 0) {
          finalAmount = detected.amount;
        }
        if (!finalVoucherRef && detected.reference) {
          finalVoucherRef = detected.reference;
        }
        detectedInfo = {
          amount: detected.amount || 0,
          reference: detected.reference || null
        };
      } catch (ocrErr) {
        // Could not extract from OCR
      }
    }

    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'El monto debe ser un numero mayor a 0 o identificable en el comprobante subido' 
      });
    }

    const id = crypto.randomUUID();
    const date = new Date().toISOString();
    const finalDescription = (description && typeof description === 'string' && description.trim()) 
      ? description.trim() 
      : 'Pago de deuda liquidada con comprobante';
    const voucherUrl = req.file ? `/uploads/vouchers/${req.file.filename}` : null;

    db.run(
      `INSERT INTO expenses (id, group_id, profile_id, amount, description, category, type, to_profile_id, voucher_url, voucher_ref, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, group_id, debtor_id, finalAmount, finalDescription, 'transfer', 'transfer', creditor_id, voucherUrl, finalVoucherRef, date],
      function(insertErr) {
        if (insertErr) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: insertErr.message });
        }

        const expense = {
          id,
          group_id,
          profile_id: debtor_id,
          profile_name: debtor.name,
          to_profile_id: creditor_id,
          to_profile_name: creditor.name,
          amount: finalAmount,
          description: finalDescription,
          category: 'transfer',
          type: 'transfer',
          voucher_url: voucherUrl,
          voucher_ref: finalVoucherRef,
          date
        };

        const io = req.app.get('io');
        if (io) {
          io.to(group_id).emit('expense_added', expense);
        }

        res.status(201).json({
          success: true,
          expense,
          detected: {
            amount: detectedInfo.amount || finalAmount,
            reference: finalVoucherRef
          }
        });
      }
    );
  });
});

// Delete Expense
router.delete('/api/expenses/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT group_id, voucher_url FROM expenses WHERE id = ?', [id], (err, expense) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const targetGroupId = expense.group_id;

    db.run('DELETE FROM expenses WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });

      // Clean up voucher file if present
      if (expense.voucher_url && expense.voucher_url.startsWith('/uploads/vouchers/')) {
        const filePath = path.join(__dirname, '..', expense.voucher_url);
        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, () => {});
        }
      }

      const io = req.app.get('io');
      if (io) {
        io.to(targetGroupId).emit('expense_deleted', { id, group_id: targetGroupId });
      }
      res.json({ success: true, id, group_id: targetGroupId });
    });
  });
});

module.exports = router;
