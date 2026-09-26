const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper: Sanitize & Parse Group ID from manual input or NFC NDEF payload (URLs, slugs, raw codes)
function sanitizeGroupId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  try {
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      const parsedUrl = new URL(cleaned);
      const pathname = parsedUrl.pathname;
      if (pathname.includes('/group/')) {
        cleaned = pathname.split('/group/')[1];
      } else {
        const segments = pathname.split('/').filter(Boolean);
        if (segments.length > 0) cleaned = segments[segments.length - 1];
      }
    } else if (cleaned.includes('/group/')) {
      cleaned = cleaned.split('/group/')[1];
    }
  } catch {
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      cleaned = parts[parts.length - 1];
    }
  }
  cleaned = cleaned.split(/[?#]/)[0].trim();
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 32);
}

// NFC Resolve: Validate and extract room details from NFC Tag payload
router.post('/api/nfc/resolve', (req, res) => {
  const { payload } = req.body;
  if (!payload || typeof payload !== 'string') {
    return res.status(400).json({ valid: false, error: 'Payload de NFC requerido' });
  }

  const groupId = sanitizeGroupId(payload);
  if (!groupId) {
    return res.status(400).json({ valid: false, error: 'No se pudo extraer un código de sala válido' });
  }

  db.get('SELECT id, name FROM groups WHERE UPPER(id) = ?', [groupId], (err, group) => {
    if (err) return res.status(500).json({ valid: false, error: err.message });
    if (!group) return res.status(404).json({ valid: false, error: 'Sala no encontrada' });

    res.json({
      valid: true,
      groupId: group.id,
      groupName: group.name,
      joinUrl: `/group/${group.id}`
    });
  });
});

module.exports = router;
module.exports.sanitizeGroupId = sanitizeGroupId;
