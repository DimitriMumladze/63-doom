// Online server for 63: Office Hell (co-op and Merge Conflict). No dependencies: `node server.js` (Node 16 or newer).
// The game page connects to it at the address the page came from, or else on port 6363 of that computer
// (see Net in the game): on the computer that serves the page on the internet, or on a LAN, where this also
// serves the page itself at http://<this computer's IP>:6363/. Behind a Cloudflare tunnel (or any proxy that
// passes WebSockets), point the tunnel here: the page and its connection (/ws) then share the one address.
// Everyone who opens the page connects and sees how many are playing; CO-OP or MERGE CONFLICT joins that room.
// The first player in a room is its host and runs the world in their browser; this only passes messages on.
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
    res.end(`63: Office Hell co-op server, ${rooms.coop.clients.size} playing, ${rooms.mc.clients.size} in Merge Conflict.\n`);
    return;
  }
  log(`game page sent to ${String(req.socket.remoteAddress).replace(/^::ffff:/, '')}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  fs.createReadStream(GAME).pipe(res);
});

// ----------------------------------------------------------------------
// conns: every open page; each room's clients: the ones in that game, id -> conn (the oldest is the host).
// coop = the campaign together, mc = Merge Conflict (team vs team)
// ----------------------------------------------------------------------
const conns = new Set();
const rooms = { coop: { name: 'co-op', clients: new Map(), hostId: 0 }, mc: { name: 'Merge Conflict', clients: new Map(), hostId: 0 } };
let nextId = 1;

function freeSlot(room) {
  const used = new Set([...room.clients.values()].map(c => c.slot));
  for (let s = 1; ; s++) if (!used.has(s)) return s;
}

function accept(sock) {
  const c = { id: 0, slot: 0, room: null, sock, seen: Date.now(), addr: String(sock.remoteAddress).replace(/^::ffff:/, '') };
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
  if (!c.id) { if (m.t === 'join') join(c, rooms[m.room] ? m.room : 'coop'); return; }
  relay(c, m);
}

function join(c, key) {
  const room = rooms[key];
  if (room.clients.size >= MAX_PLAYERS) { send(c, { t: 'full' }); return; }
  c.id = nextId++;
  c.room = room;
  c.slot = freeSlot(room);
  const others = [...room.clients.values()];
  room.clients.set(c.id, c);
  if (!room.hostId) room.hostId = c.id;
  send(c, { t: 'welcome', id: c.id, slot: c.slot, host: room.hostId, room: key, players: others.map(o => ({ id: o.id, slot: o.slot })) });
  broadcast(room, { t: 'join', id: c.id, slot: c.slot }, c.id);
  log(`${room.name}: P${c.slot} joined from ${c.addr}${c.id === room.hostId ? ' (host)' : ''}, ${room.clients.size} playing`);
  updateLobby();
}

function leave(c) {
  if (!conns.delete(c)) return;
  if (!c.id) return;
  const room = c.room;
  room.clients.delete(c.id);
  broadcast(room, { t: 'leave', id: c.id });
  if (room.hostId === c.id) {
    const next = room.clients.values().next().value;
    room.hostId = next ? next.id : 0;
    if (next) broadcast(room, { t: 'host', id: room.hostId });
  }
  log(`${room.name}: P${c.slot} left, ${room.clients.size} playing`);
  updateLobby();
}

// what the title screen shows before joining (`players` is co-op, as before)
function lobby() {
  return { t: 'lobby', players: rooms.coop.clients.size, max: MAX_PLAYERS,
    rooms: { coop: rooms.coop.clients.size, mc: rooms.mc.clients.size } };
}
function updateLobby() { const m = lobby(); for (const c of conns) if (!c.id) send(c, m); }

// `to` = one player, otherwise all the others in the room; the server stamps who sent it
function relay(c, m) {
  m.from = c.id;
  const to = m.to;
  delete m.to;
  if (to) { const d = c.room.clients.get(to); if (d) send(d, m); } else broadcast(c.room, m, c.id);
}

function send(c, m) { if (!c.sock.destroyed) c.sock.write(frame(Buffer.from(JSON.stringify(m)), 1)); }

function broadcast(room, m, except) {
  const data = frame(Buffer.from(JSON.stringify(m)), 1);
  for (const c of room.clients.values()) if (c.id !== except && !c.sock.destroyed) c.sock.write(data);
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
