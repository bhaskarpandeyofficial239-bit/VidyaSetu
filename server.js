const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'students.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'bhaskarpandey895623@gmail.com';
const sessions = new Map();

function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

function readStudents() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function saveStudents(students) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(students, null, 2));
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
  });
}
async function notifyAdmin(student) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { delivered: false, reason: 'Email provider not configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'VidyaSetu <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject: `New VidyaSetu student: ${student.name}`,
      html: `<h2>New student registration</h2><p><strong>Name:</strong> ${escapeHtml(student.name)}</p><p><strong>Email:</strong> ${escapeHtml(student.email)}</p><p><strong>Class:</strong> ${escapeHtml(student.grade)}</p>`
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { delivered: true };
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }
function createSession(student) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { studentId: student.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  return token;
}
function publicStudent(student) { return { id: student.id, name: student.name, email: student.email, grade: student.grade, createdAt: student.createdAt }; }

const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const { name, email, password, grade } = await readBody(req);
      const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanGrade = String(grade || '').trim();
      if (cleanName.length < 2 || cleanName.length > 80) return send(res, 400, { error: 'Enter a valid full name.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return send(res, 400, { error: 'Enter a valid email address.' });
      if (String(password || '').length < 8) return send(res, 400, { error: 'Password must contain at least 8 characters.' });
      if (!cleanGrade) return send(res, 400, { error: 'Select your class.' });
      const students = readStudents();
      if (students.some(student => student.email === cleanEmail)) return send(res, 409, { error: 'An account with this email already exists.' });
      const student = { id: crypto.randomUUID(), name: cleanName, email: cleanEmail, grade: cleanGrade, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      students.push(student); saveStudents(students);
      let emailStatus = 'Notification queued.';
      try { const result = await notifyAdmin(student); if (!result.delivered) emailStatus = 'Registration saved; email notifications are not configured yet.'; }
      catch { emailStatus = 'Registration saved, but the notification email could not be sent.'; }
      return send(res, 201, { message: 'Registration successful.', emailStatus, token: createSession(student), student: publicStudent(student) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = await readBody(req);
      const student = readStudents().find(item => item.email === String(email || '').trim().toLowerCase());
      if (!student || !verifyPassword(String(password || ''), student.passwordHash)) return send(res, 401, { error: 'Incorrect email or password.' });
      return send(res, 200, { message: 'Welcome back!', token: createSession(student), student: publicStudent(student) });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const session = sessions.get(token);
      if (!session || session.expiresAt < Date.now()) return send(res, 401, { error: 'Please sign in again.' });
      const student = readStudents().find(item => item.id === session.studentId);
      if (!student) return send(res, 401, { error: 'Account not found.' });
      return send(res, 200, { student: publicStudent(student) });
    }
    const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(ROOT, `.${relativePath}`);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, { error: 'Page not found.' });
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) { send(res, 400, { error: error.message || 'Something went wrong.' }); }
});
server.listen(PORT, () => console.log(`VidyaSetu is running at http://localhost:${PORT}`));
