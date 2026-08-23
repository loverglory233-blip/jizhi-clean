/**
 * JIZHI (集智) Yjs CRDT 实时协同 WebSocket 服务端 (CommonJS 版)
 * 运行方式: node server_yjs.cjs
 * 默认端口: 1234 (可在环境变量或启动参数中指定: PORT=1234)
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'JIZHI Yjs CRDT Collaboration Gateway',
      version: '2.0.0',
      activeRooms: rooms.size,
      timestamp: Date.now()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();
const roomUpdates = new Map();
const debounceTimers = new Map();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function loadRoomFromDisk(roomName) {
  if (roomUpdates.has(roomName)) return roomUpdates.get(roomName);
  const jsonFile = path.join(dataDir, `room_${roomName}.json`);
  const binFile = path.join(dataDir, `room_${roomName}.bin`);
  const updates = [];

  if (fs.existsSync(jsonFile)) {
    try {
      const raw = fs.readFileSync(jsonFile, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const b64 of list) {
          updates.push(Buffer.from(b64, 'base64'));
        }
        console.log(`[Yjs Storage] Loaded ${updates.length} independent frames for room: ${roomName}`);
      }
    } catch (e) {
      console.warn(`[Yjs Storage] Error reading ${jsonFile}:`, e.message);
    }
  } else if (fs.existsSync(binFile)) {
    try {
      const data = fs.readFileSync(binFile);
      if (data && data.length > 0) {
        updates.push(data);
      }
    } catch (e) {}
  }
  roomUpdates.set(roomName, updates);
  return updates;
}

let ywsUtils = null;
try {
  ywsUtils = require('y-websocket/bin/utils');
  console.log('✅ [Yjs Core] 已加载官方标准 y-websocket utils 权威套件');
} catch (e) {
  console.log('ℹ️ [Yjs Core] 使用内置自适应 Yjs 二进制帧协同调度器 (可运行 npm i y-websocket 激活官方原装驱动)');
}

wss.on('connection', (ws, req) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let roomName = urlObj.searchParams.get('room') || urlObj.pathname.replace(/^\/+/, '').split('?')[0];
  if (!roomName || roomName === 'ws' || roomName === '') {
    roomName = 'jizhi_default_room';
  }

  if (ywsUtils && typeof ywsUtils.setupWSConnection === 'function') {
    const doc = ywsUtils.getYDoc(roomName);
    ywsUtils.setupWSConnection(ws, req, { docName: roomName, gc: true });
    console.log(`[Yjs Official Core] Client joined room: ${roomName} (Active Docs: ${ywsUtils.docs ? ywsUtils.docs.size : 1})`);
    return;
  }

  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  const clientSet = rooms.get(roomName);
  clientSet.add(ws);
  console.log(`[Yjs Builtin Hub] Client joined room: ${roomName} (Room Peer Count: ${clientSet.size})`);

  const initialUpdates = loadRoomFromDisk(roomName);
  if (initialUpdates && initialUpdates.length > 0) {
    for (const frame of initialUpdates) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(frame, { binary: true });
        }
      } catch (e) {}
    }
  }

  ws.on('message', (message, isBinary) => {
    let updateBuffer = message;
    if (typeof message === 'string') {
      updateBuffer = Buffer.from(message);
    } else if (message instanceof ArrayBuffer) {
      updateBuffer = Buffer.from(message);
    }

    let updatesList = roomUpdates.get(roomName);
    if (!updatesList) {
      updatesList = [];
      roomUpdates.set(roomName, updatesList);
    }
    updatesList.push(updateBuffer);

    if (debounceTimers.has(roomName)) {
      clearTimeout(debounceTimers.get(roomName));
    }
    debounceTimers.set(roomName, setTimeout(() => {
      try {
        const jsonFile = path.join(dataDir, `room_${roomName}.json`);
        const b64List = updatesList.map(buf => buf.toString('base64'));
        fs.writeFile(jsonFile, JSON.stringify(b64List), () => {});
      } catch (e) {}
    }, 2000));

    for (const client of clientSet) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message, { binary: isBinary !== undefined ? isBinary : true });
        } catch (err) {
          console.warn('[Yjs Builtin Hub] Broadcast send error:', err.message);
        }
      }
    }
  });

  ws.on('close', () => {
    clientSet.delete(ws);
    console.log(`[Yjs Builtin Hub] Client left room: ${roomName} (Remaining Peers: ${clientSet.size})`);
    if (clientSet.size === 0) {
      rooms.delete(roomName);
    }
  });

  ws.on('error', (err) => {
    console.warn(`[Yjs Builtin Hub] Socket error in room ${roomName}:`, err.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 JIZHI Yjs CRDT WebSocket Server Started`);
  console.log(`📡 Listening on ws://${HOST}:${PORT}`);
  console.log(`🩺 Health check on http://${HOST}:${PORT}/health`);
  console.log(`📁 Persistence directory: ${dataDir}`);
  console.log(`====================================================`);
});
