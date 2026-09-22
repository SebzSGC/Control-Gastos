const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { processBillImage } = require('./services/receiptVisionService');

// Optional .env loader (zero-dependency)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  } catch (e) {
    console.error('Error reading .env file:', e);
  }
}

const app = express();
app.set('trust proxy', 1);

// Dynamic CORS configuration (production domains or open in dev)
const rawCorsOrigin = process.env.CORS_ORIGIN;
const corsOrigin = rawCorsOrigin 
  ? (rawCorsOrigin.includes(',') ? rawCorsOrigin.split(',').map(s => s.trim()) : rawCorsOrigin) 
  : true;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin === true ? '*' : corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json());

// SQLite setup with configurable persistence path (Docker volumes / Cloud Disks)
const rawDbPath = process.env.DATABASE_PATH || process.env.DB_PATH;
let dbPath = rawDbPath 
  ? path.resolve(rawDbPath)
  : path.join(__dirname, 'app_data.db');

try {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (dirErr) {
  console.warn(`⚠️ Warning: Could not create directory for DATABASE_PATH (${dbPath}): ${dirErr.message}. Falling back to local app_data.db`);
  dbPath = path.join(__dirname, 'app_data.db');
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database opening error: ', err);
  else console.log(`🗄️ SQLite database loaded from: ${dbPath}`);
});

// Health check endpoint for container orchestrators (Docker, K8s, Render, Railway, Fly.io)
app.get(['/api/health', '/health'], (req, res) => {
  db.get('SELECT 1 as healthy', (err) => {
    if (err) {
      return res.status(503).json({
        status: 'unhealthy',
        error: 'Database query failed: ' + err.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    }

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'PaySync API',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
  });
});

// Initialize Database with foreign keys and performance indexes
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, group_id TEXT, name TEXT, payment_key TEXT, payment_qr TEXT)");
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, 
    group_id TEXT, 
    profile_id TEXT, 
    amount REAL, 
    description TEXT,
    category TEXT DEFAULT 'general',
    type TEXT DEFAULT 'expense',
    to_profile_id TEXT,
    date TEXT
  )`);

  // Safe migration for existing databases missing 'category' column
  db.run("ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'general'", () => {
    // Silently ignore if column already exists
  });

  // Bills tables for itemized invoice splitting
  db.run(`CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    payer_profile_id TEXT,
    total_amount REAL,
    subtotal REAL,
    tax REAL DEFAULT 0,
    tip REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    description TEXT,
    date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bill_items (
    id TEXT PRIMARY KEY,
    bill_id TEXT,
    name TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price REAL,
    subtotal REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bill_splits (
    id TEXT PRIMARY KEY,
    bill_id TEXT,
    profile_id TEXT,
    amount REAL,
    items_summary TEXT
  )`);

  // Performance indexes
  db.run("CREATE INDEX IF NOT EXISTS idx_profiles_group ON profiles(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bills_group ON bills(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bill_splits_bill ON bill_splits(bill_id)");
});

// Configure Multer for uploads (Hardened: 5MB limit, strict MIME filter, configurable volume)
const uploadDir = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR) 
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes JPEG, PNG y WebP.'));
    }
  }
});

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

// API Endpoints

// NFC Resolve: Validate and extract room details from NFC Tag payload
app.post('/api/nfc/resolve', (req, res) => {
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

// Create a group
app.post('/api/groups', (req, res) => {
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
app.get('/api/groups/:id', (req, res) => {
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
          
          res.json({ group, profiles, expenses, bills: populatedBills });
        });
      });
    });
  });
});

// Calculate settlements (Min-Cash-Flow algorithm)
app.get('/api/groups/:id/settlement', (req, res) => {
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

// Create Profile
app.post('/api/profiles', (req, res) => {
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
      io.to(group_id).emit('profile_added', { id, group_id, name: trimmedName, payment_key, payment_qr });
      res.json({ id, group_id, name: trimmedName, payment_key, payment_qr });
    }
  );
});

// Update Profile
app.put('/api/profiles/:id', (req, res) => {
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
        io.to(group_id).emit('profile_updated', { id, name: trimmedName, payment_key, payment_qr });
      }
      res.json({ success: true, id, name: trimmedName, payment_key, payment_qr });
    }
  );
});

// Add Expense / Transfer
app.post('/api/expenses', (req, res) => {
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
        io.to(group_id).emit('expense_added', expense);
        res.status(201).json(expense);
      });
    }
  );
});

// Delete Expense
app.delete('/api/expenses/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT group_id FROM expenses WHERE id = ?', [id], (err, expense) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const targetGroupId = expense.group_id;

    db.run('DELETE FROM expenses WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      io.to(targetGroupId).emit('expense_deleted', { id, group_id: targetGroupId });
      res.json({ success: true, id, group_id: targetGroupId });
    });
  });
});

// Upload receipt and process with OCR (Hardened Multer & safe file cleanup)
app.post('/api/upload-receipt', (req, res) => {
  upload.single('receipt')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido de 5 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al subir el archivo' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const imagePath = req.file.path;
    const clientKey = req.headers['x-gemini-key'] || req.body?.gemini_key || null;
    const clientOpenAiKey = req.headers['x-openai-key'] || req.body?.openai_key || null;
    const effectiveGemini = clientKey || process.env.GEMINI_API_KEY;
    const effectiveOpenAi = clientOpenAiKey || process.env.OPENAI_API_KEY;

    try {
      // 1. Try Vision Agent first if key available
      if (effectiveGemini || effectiveOpenAi) {
        try {
          const visionResult = await processBillImage(imagePath, {
            apiKey: effectiveGemini,
            openAiKey: effectiveOpenAi
          });
          if (visionResult && visionResult.total > 0) {
            return res.json({
              rawText: visionResult.store_name || 'Comprobante escaneado',
              estimatedTotal: visionResult.total,
              engineUsed: visionResult.engineUsed,
              success: true
            });
          }
        } catch (vErr) {
          console.warn('Vision receipt extraction fallback to local OCR:', vErr.message);
        }
      }

      // 2. Process image with Tesseract.js directly
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+spa', {
        logger: m => console.log(m)
      });

      console.log('--- RAW OCR TEXT ---');
      console.log(text);
      console.log('--------------------');

      // Improved regex: Find $ or S (often confused by OCR) and grab the rest of the line
      const dollarMatches = [...text.matchAll(/[\$S]\s*([^\n]+)/gi)];
      let estimatedTotal = 0;

      if (dollarMatches && dollarMatches.length > 0) {
        const parsedAmounts = dollarMatches.map(m => {
          const rawLine = m[1].trim();
          const digitsOnly = rawLine.replace(/[^\d]/g, '');
          if (!digitsOnly) return NaN;

          if (rawLine.match(/[.,]\d{2}$/)) {
            return parseFloat(digitsOnly) / 100;
          }
          return parseInt(digitsOnly, 10);
        }).filter(n => !isNaN(n));

        if (parsedAmounts.length > 0) {
          estimatedTotal = Math.max(...parsedAmounts);
        }
      }

      // Fallback if no $ or S is found: extract all numbers but ignore IDs/phone numbers (> 8 digits)
      if (estimatedTotal === 0) {
        const amounts = text.match(/[\d]+[.,\s\d]*[\d]+/g);
        if (amounts && amounts.length > 0) {
          const parsedAmounts = amounts.map(a => {
            const digitsOnly = a.replace(/[^\d]/g, '');
            if (!digitsOnly) return NaN;
            if (digitsOnly.length > 8 && !a.match(/[.,]\d{2}$/)) return NaN;

            if (a.match(/[.,]\d{2}$/)) return parseFloat(digitsOnly) / 100;
            return parseInt(digitsOnly, 10);
          }).filter(n => !isNaN(n));

          if (parsedAmounts.length > 0) {
            estimatedTotal = Math.max(...parsedAmounts);
          }
        }
      }

      res.json({
        rawText: text,
        estimatedTotal,
        success: true
      });
    } catch (error) {
      console.error('OCR Error:', error);
      res.status(500).json({ error: 'Failed to process receipt', details: error.message });
    } finally {
      // Guaranteed cleanup of uploaded temp file
      if (req.file && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (unlinkErr) {
          console.error('Error unlinking temporary file:', unlinkErr);
        }
      }
    }
  });
});

// Bill OCR Line Item Parser Helper
function parseBillText(rawText) {
  const lines = (rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let subtotal = 0;
  let tip = 0;
  let tax = 0;
  let discount = 0;
  let detectedTotal = 0;

  function parseAmount(str) {
    if (!str) return 0;
    const clean = str.replace(/[^\d.,]/g, '').trim();
    if (!clean) return 0;
    if (/[.,]\d{2}$/.test(clean)) {
      const digitsOnly = clean.replace(/[^\d]/g, '');
      return parseFloat(digitsOnly) / 100;
    }
    const digitsOnly = clean.replace(/[^\d]/g, '');
    return parseInt(digitsOnly, 10) || 0;
  }

  const ignorePatterns = /^(NIT|TEL|DIR|DIRECCION|FECHA|HORA|MESA|MESERO|CAJERO|CLIENTE|RESOLUCION|AUTORIZACION|FACTURA|TICKET|REGIMEN|GRACIAS|PROPINA\s+VOLUNTARIA\s+ACEPTADA|CAMBIO|EFECTIVO|TARJETA)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ignorePatterns.test(line)) continue;

    if (/PROPINA|VOLUNTARIA|SERVICIO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) tip = val;
      }
      continue;
    }
    if (/IMPOCONSUMO|IVA|IMPUESTO|TAX/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) tax = val;
      }
      continue;
    }
    if (/DESCUENTO|DCTO/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) discount = val;
      }
      continue;
    }
    if (/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) subtotal = val;
      }
      continue;
    }
    if (/TOTAL/i.test(line) && !/SUBTOTAL/i.test(line)) {
      const amtMatch = line.match(/(?:[\$S]?\s*)([0-9.,]+)\s*$/);
      if (amtMatch) {
        const val = parseAmount(amtMatch[1]);
        if (val > 0) detectedTotal = val;
      }
      continue;
    }

    const priceMatch = line.match(/(.*?)(?:[\$S]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7}(?:[.,]\d{2})?)\s*$/);
    if (priceMatch) {
      let descPart = priceMatch[1].trim();
      const lineTotal = parseAmount(priceMatch[2]);

      if (lineTotal <= 0) continue;

      let quantity = 1;
      const qtyMatch = descPart.match(/^(\d{1,2})\s*(?:x|X|-|\*)?\s+(.*)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10) || 1;
        descPart = qtyMatch[2].trim();
      }

      if (descPart.length >= 2 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(descPart)) {
        const unitPrice = quantity > 0 ? Math.round(lineTotal / quantity) : lineTotal;
        items.push({
          id: crypto.randomUUID(),
          name: descPart,
          quantity,
          unitPrice,
          subtotal: lineTotal
        });
      }
    }
  }

  const itemsSum = items.reduce((acc, it) => acc + it.subtotal, 0);
  if (!subtotal || subtotal === 0) {
    subtotal = itemsSum;
  }
  const calculatedTotal = subtotal + tax + tip - discount;
  const total = detectedTotal > 0 ? detectedTotal : calculatedTotal;

  if (items.length === 0) {
    items.push({
      id: crypto.randomUUID(),
      name: 'Consumo factura',
      quantity: 1,
      unitPrice: total > 0 ? total : 0,
      subtotal: total > 0 ? total : 0
    });
  }

  return {
    items,
    subtotal,
    tax,
    tip,
    discount,
    total
  };
}

// Vision AI status endpoint
app.get('/api/vision-status', (req, res) => {
  res.json({
    hasServerKey: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
    provider: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : null
  });
});

// Upload and parse full bill using Intelligent Multimodal Vision / Local Fallback
app.post('/api/upload-bill', (req, res) => {
  upload.single('bill')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 5 MB' });
      }
      return res.status(400).json({ error: err.message || 'Error al subir la factura' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo de factura' });
    }

    const imagePath = req.file.path;
    const clientKey = req.headers['x-gemini-key'] || req.body?.gemini_key || null;
    const clientOpenAiKey = req.headers['x-openai-key'] || req.body?.openai_key || null;
    const rotation = parseInt(req.body?.rotation, 10) || 0;

    try {
      const result = await processBillImage(imagePath, {
        apiKey: clientKey,
        openAiKey: clientOpenAiKey,
        rotation
      });

      console.log(`--- BILL PROCESSED (${result.engineUsed}) ---`);
      console.log(`Store: ${result.store_name}, Items: ${result.items.length}, Total: ${result.total}`);
      console.log('--------------------------------------------');

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Bill Processing Error:', error);
      res.status(500).json({ error: 'Error procesando la factura', details: error.message });
    } finally {
      if (req.file && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (unlinkErr) {
          console.error('Error unlinking temp bill file:', unlinkErr);
        }
      }
    }
  });
});

// Save complete itemized bill and register its splits
app.post('/api/bills', (req, res) => {
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

            io.to(group_id).emit('bill_added', billPayload);
            io.to(group_id).emit('expense_added', expensePayload);

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
app.get('/api/bills/:id', (req, res) => {
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

// Socket.io for Real-time
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_group', (groupId) => {
    const cleanGroupId = sanitizeGroupId(groupId);
    if (cleanGroupId) {
      socket.join(cleanGroupId);
      console.log(`User ${socket.id} joined group ${cleanGroupId}`);
    }
  });

  socket.on('nfc_joined', (data) => {
    const groupId = sanitizeGroupId(data?.groupId);
    const profileName = (data?.profileName && typeof data.profileName === 'string') 
      ? data.profileName.trim().slice(0, 50) 
      : 'Nuevo integrante';

    if (groupId) {
      socket.to(groupId).emit('peer_joined_nfc', {
        message: `¡${profileName} se ha unido mediante NFC!`,
        profileName,
        groupId,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 Peer joined via NFC in group ${groupId}: ${profileName}`);
    }
  });

  socket.on('start_bill_session', (data) => {
    const groupId = sanitizeGroupId(data?.groupId);
    if (groupId) {
      socket.to(groupId).emit('bill_session_started', data);
      console.log(`🧾 Live bill session started in group ${groupId} by ${data.hostName}`);
    }
  });

  socket.on('bill_session_started', (data) => {
    const groupId = sanitizeGroupId(data?.groupId);
    if (groupId) {
      socket.to(groupId).emit('bill_session_started', data);
      console.log(`🧾 Live bill session broadcast in group ${groupId}`);
    }
  });

  socket.on('bill_item_claimed', (data) => {
    const groupId = sanitizeGroupId(data?.groupId);
    if (groupId) {
      socket.to(groupId).emit('bill_item_claimed', data);
      console.log(`🍽️ Bill item claim relayed in group ${groupId} for item ${data.itemId}`);
    }
  });

  socket.on('bill_session_closed', (data) => {
    const groupId = sanitizeGroupId(data?.groupId);
    if (groupId) {
      socket.to(groupId).emit('bill_session_closed', data);
      console.log(`🏁 Live bill session closed in group ${groupId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve production static assets from frontend/dist if available
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
  console.log('📦 Frontend production build mounted from frontend/dist');
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling for Docker, Kubernetes, PM2, and Cloud Platforms
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('🔌 HTTP/WebSocket server closed.');
    db.close((err) => {
      if (err) {
        console.error('Error closing SQLite database:', err);
        process.exit(1);
      }
      console.log('🗄️ SQLite database connection closed cleanly.');
      process.exit(0);
    });
  });

  // Force exit after 10s if connections fail to close
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

