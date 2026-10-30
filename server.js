// Co-op server for 63: Office Hell. No dependencies: `node server.js` (Node 16 or newer).
// The game page connects to it on port 6363 of the computer it was loaded from (see Net in the game):
// on the computer that serves the page on the internet, or on a LAN, where this also serves the page
// itself at http://<this computer's IP>:6363/.
// Everyone who opens the page connects and sees how many are playing; PLAY ONLINE joins the game.
// The first player in is the host and runs the world in their browser; this only passes messages on.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 6363;
const GAME = path.join(__dirname, '63_ Office Hell.html');
const MAX_PLAYERS = 8;
const MAX_MESSAGE = 1 << 20;       // a snapshot is a few KB; anything this big is not from the game

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url !== '/' && url !== '/index.html') { res.writeHead(404); res.end('not found'); return; }
  // next to the game file this serves it too (LAN play); on a web server the page comes from there
  if (!fs.existsSync(GAME)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`63: Office Hell co-op server, ${clients.size} playing.\n`);
    return;
  }
  log(`game page sent to ${String(req.socket.remoteAddress).replace(/^::ffff:/, '')}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  fs.createReadStream(GAME).pipe(res);
});

// ----------------------------------------------------------------------
// conns: every open page; clients: the ones in the game, id -> conn (the oldest is the host)
// ----------------------------------------------------------------------
const conns = new Set();
const clients = new Map();
let nextId = 1, hostId = 0;

function freeSlot() {
  const used = new Set([...clients.values()].map(c => c.slot));
  for (let s = 1; ; s++) if (!used.has(s)) return s;
}

function accept(sock) {
  const c = { id: 0, slot: 0, sock, seen: Date.now(), addr: String(sock.remoteAddress).replace(/^::ffff:/, '') };
  conns.add(c);
  send(c, lobby());

  let buf = Buffer.alloc(0), parts = [], size = 0;
  sock.on('data', chunk => {
    c.seen = Date.now();
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const f = parse(buf);
      if (!f) break;
      if (f.size > MAX_MESSAGE) { sock.destroy(); return; }
      if (f.data === null) break;
      buf = buf.subarray(f.size);
      if (f.op === 8) { sock.end(frame(Buffer.alloc(0), 8)); return; }
      if (f.op === 9) { sock.write(frame(f.data, 10)); continue; }
      if (f.op === 10) continue;
      parts.push(f.data);
      size += f.data.length;
      if (size > MAX_MESSAGE) { sock.destroy(); return; }
      if (!f.fin) continue;
      const text = Buffer.concat(parts).toString('utf8');
      parts = []; size = 0;
      receive(c, text);
    }
  });
  sock.on('close', () => leave(c));
  sock.on('error', () => leave(c));
}

function receive(c, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (!c.id) { if (m.t === 'join') join(c); return; }
  relay(c, m);
}

function join(c) {
  if (clients.size >= MAX_PLAYERS) { send(c, { t: 'full' }); return; }
  c.id = nextId++;
  c.slot = freeSlot();
  const others = [...clients.values()];
  clients.set(c.id, c);
  if (!hostId) hostId = c.id;
  send(c, { t: 'welcome', id: c.id, slot: c.slot, host: hostId, players: others.map(o => ({ id: o.id, slot: o.slot })) });
  broadcast({ t: 'join', id: c.id, slot: c.slot }, c.id);
  log(`P${c.slot} joined from ${c.addr}${c.id === hostId ? ' (host)' : ''}, ${clients.size} playing`);
  updateLobby();
}

function leave(c) {
  if (!conns.delete(c)) return;
  if (!c.id) return;
  clients.delete(c.id);
  broadcast({ t: 'leave', id: c.id });
  if (hostId === c.id) {
    const next = clients.values().next().value;
    hostId = next ? next.id : 0;
    if (next) broadcast({ t: 'host', id: hostId });
  }
  log(`P${c.slot} left, ${clients.size} playing`);
  updateLobby();
}

// what the title screen shows before joining
function lobby() { return { t: 'lobby', players: clients.size, max: MAX_PLAYERS }; }
function updateLobby() { const m = lobby(); for (const c of conns) if (!c.id) send(c, m); }

// `to` = one player, otherwise all the others; the server stamps who sent it
function relay(c, m) {
  m.from = c.id;
  const to = m.to;
  delete m.to;
  if (to) { const d = clients.get(to); if (d) send(d, m); } else broadcast(m, c.id);
}

function send(c, m) { if (!c.sock.destroyed) c.sock.write(frame(Buffer.from(JSON.stringify(m)), 1)); }

function broadcast(m, except) {
  const data = frame(Buffer.from(JSON.stringify(m)), 1);
  for (const c of clients.values()) if (c.id !== except && !c.sock.destroyed) c.sock.write(data);
}

// over the internet idle connections get cut: ping everyone, and drop the ones that stopped answering
setInterval(() => {
  const now = Date.now(), ping = frame(Buffer.alloc(0), 9);
  for (const c of conns) {
    if (now - c.seen > 75000) c.sock.destroy();
    else if (!c.sock.destroyed) c.sock.write(ping);
  }
}, 25000);

// ----------------------------------------------------------------------
// just enough WebSocket (RFC 6455) for this
// ----------------------------------------------------------------------
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key) { sock.destroy(); return; }
  const accept64 = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept64 + '\r\n\r\n');
  sock.setNoDelay(true);
  accept(sock);
});

// one frame from the front of buf, or null if its header hasn't all arrived yet
// (data null: the header has, the payload not yet; size tells how big it will be)
function parse(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, at = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); at = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); at = 10; }
  const mask = masked ? buf.subarray(at, at + 4) : null;
  if (masked) at += 4;
  if (buf.length < at + len) return { size: at + len, data: null };
  const data = Buffer.from(buf.subarray(at, at + len));
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
  return { fin, op, data, size: at + len };
}

function frame(data, op) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}

function log(s) { console.log(new Date().toTimeString().slice(0, 8) + '  ' + s); }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`63: Office Hell co-op server on port ${PORT}.`);
  if (fs.existsSync(GAME)) {
    console.log('Players on this network can open:');
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}/`);
    }
    console.log(`  http://localhost:${PORT}/   (this computer)`);
  }
  console.log('Keep this running while people play (Ctrl+C stops it).');
});
