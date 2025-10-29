#!/usr/bin/env node
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const NUMBERS_FILE = path.join(UPLOAD_DIR, 'numbers.txt');
const PROXY_FILE   = path.join(UPLOAD_DIR, 'proxy.txt');
const VALID_FILE   = path.join(UPLOAD_DIR, 'valid.txt');

fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(PUBLIC_DIR);

// Multer config
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.txt')) cb(null, true);
    else cb(new Error('Only .txt files allowed'));
  }
});

// Static files
app.use(express.static(PUBLIC_DIR));
app.use('/downloads', express.static(UPLOAD_DIR));
app.use('/socket.io', express.static(path.dirname(require.resolve('socket.io-client')) + '/dist'));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.post('/upload', upload.single('numbers'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    await fs.move(req.file.path, NUMBERS_FILE, { overwrite: true });
    
    // Reset valid.txt ONCE per upload
    await fs.ensureFile(VALID_FILE);
    await fs.truncate(VALID_FILE, 0);
    
    res.json({ success: true, message: `${req.file.originalname} → uploaded & valid.txt reset` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/upload-proxy', upload.single('proxy'), async (req, res) => {
  if (!req.file) return res.json({ message: 'No proxy file uploaded (optional)' });
  try {
    await fs.move(req.file.path, PROXY_FILE, { overwrite: true });
    res.json({ success: true, message: `proxy.txt uploaded` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Global state
let isRunning = false;
let stopRequested = false;
let validCount = 0;
let useProxy = false;
let proxyList = [];
let totalNumbers = 0;
let processed = 0;
let socket = null;

// Helper
const delay = ms => new Promise(r => setTimeout(r, ms));
async function log(msg) {
  console.log(msg);
  if (socket) socket.emit('log', msg);
}
function emitProgress() {
  if (socket) socket.emit('progress', { done: processed, total: totalNumbers });
}

// Search phrases
const SEARCH_PHRASES = [
  /send a login code/i,
  /receive the code/i,
  /accounts matched/i,
  /we found/i,
  /recovery/i,
];

// Worker
async function worker(id, numbers, proxyUrl = null) {
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'];
  if (proxyUrl) launchArgs.push(`--proxy-server=${proxyUrl}`);

  const browser = await puppeteer.launch({ headless: true, args: launchArgs });
  const page = await browser.newPage();

  if (proxyUrl && proxyUrl.includes('@')) {
    const [scheme, rest] = proxyUrl.split('://');
    const [auth, hostPort] = rest.split('@');
    const [user, pass] = auth.split(':');
    await page.authenticate({ username: user, password: pass });
  }

  for (const num of numbers) {
    if (stopRequested) break;

    try {
      await log(`[W${id}] Checking ${num}${proxyUrl ? ` (proxy: ${proxyUrl})` : ''}`);
      await page.goto('https://web.facebook.com/login/identify/?ctx=recover&from_login_screen=0', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await page.waitForSelector('#identify_email', { timeout: 10000 });
      await page.evaluate(() => document.querySelector('#identify_email').value = '');
      await page.type('#identify_email', num);
      await page.click('#did_submit');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});

      await delay(1500);
      const html = await page.content();
      const $ = cheerio.load(html);
      const text = $('body').text();

      const isValid = SEARCH_PHRASES.some(re => re.test(text));
      if (isValid) {
        await fs.appendFile(VALID_FILE, num + '\n');
        validCount++;
        io.emit('validCount', validCount);
        await log(`[W${id}] VALID → ${num}`);
      } else {
        await log(`[W${id}] invalid → ${num}`);
      }

      processed++;
      emitProgress();

    } catch (err) {
      await log(`[W${id}] ERROR ${num}: ${err.message}`);
      processed++;
      emitProgress();
    }

    if (!stopRequested) await delay(800 + Math.random() * 700);
  }

  await browser.close();
}

// Split array
function chunkArray(arr, n) {
  return Array.from({ length: n }, (_, i) =>
    arr.filter((_, idx) => idx % n === i)
  );
}

// Main checker
async function startChecker(opts = { useProxy: false }) {
  if (isRunning) return log('Already running');
  if (!await fs.pathExists(NUMBERS_FILE)) {
    return log('Error: numbers.txt not found. Upload first.');
  }

  isRunning = true;
  stopRequested = false;
  processed = 0;
  useProxy = opts.useProxy;

  // Load numbers
  const raw = await fs.readFile(NUMBERS_FILE, 'utf8');
  const numbers = raw.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  totalNumbers = numbers.length;

  // Load proxies
  proxyList = [];
  if (useProxy && await fs.pathExists(PROXY_FILE)) {
    const rawProxy = await fs.readFile(PROXY_FILE, 'utf8');
    proxyList = rawProxy.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    await log(`Loaded ${proxyList.length} proxies`);
  }

  await log(`Starting check on ${totalNumbers} numbers with 5 parallel workers...`);
  if (socket) socket.emit('startRun', { total: totalNumbers });

  const chunks = chunkArray(numbers, 5);
  const workers = chunks.map((chunk, i) => {
    const proxy = useProxy && proxyList.length ? proxyList[i % proxyList.length] : null;
    return worker(i + 1, chunk, proxy);
  });

  try {
    await Promise.all(workers);
  } catch (err) {
    await log('Worker crashed: ' + err.message);
  }

  await log(stopRequested ? 'Stopped by user.' : 'All done!');
  isRunning = false;
  processed = totalNumbers;
  emitProgress();
  if (socket) socket.emit('runComplete');
}

// Socket.io
io.on('connection', (sock) => {
  socket = sock;
  log('Client connected');
  sock.emit('validCount', validCount);
  emitProgress();

  sock.on('start', (data) => {
    if (!isRunning) startChecker({ useProxy: !!data.useProxy });
    else log('Already running');
  });

  sock.on('stop', () => {
    if (isRunning) {
      stopRequested = true;
      log('Stopping all workers...');
    }
  });

  sock.on('disconnect', () => { socket = null; });
});

// Start server
server.listen(PORT, () => {
  console.log(`\n FB Recovery Checker Running`);
  console.log(` http://localhost:${PORT}`);
  console.log(` Upload numbers.txt → Start\n`);
});