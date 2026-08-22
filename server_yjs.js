/**
 * JIZHI (集智) Yjs CRDT 实时协同 WebSocket 服务端
 * 运行方式: node server_yjs.js
 * 默认端口: 1234 (可在环境变量或启动参数中指定: PORT=1234)
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '1234', 10);
const HOST = process.env.HOST || '0.0.0.0';

// 创建 HTTP 基础服务 (用于健康检查与状态监控)
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

// 房间状态管理 (Map<roomName, Set<WebSocket>>)
const rooms = new Map();
// 房间二进制更新缓存: Map<roomName, Buffer[]>
const roomUpdates = new Map();
const debounceTimers = new Map();

// 服务端启动时从磁盘加载已有房间二进制快照
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function loadRoomFromDisk(roomName) {
  if (roomUpdates.has(roomName)) return roomUpdates.get(roomName);
  const binFile = path.join(dataDir, `room_${roomName}.bin`);
  const updates = [];
  if (fs.existsSync(binFile)) {
    try {
      const data = fs.readFileSync(binFile);
      if (data && data.length > 0) {
        updates.push(data);
        console.log(`[Yjs Storage] Loaded persisted CRDT update for room: ${roomName} (${data.length} bytes)`);
      }
    } catch (e) {
      console.warn(`[Yjs Storage] Error reading ${binFile}:`, e.message);
    }
  }
  roomUpdates.set(roomName, updates);
  return updates;
}

wss.on('connection', (ws, req) => {
  // 解析 room 标识 (从 URL query 或 path 获取)
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let roomName = urlObj.searchParams.get('room') || urlObj.pathname.replace(/^\/+/, '').split('?')[0];
  if (!roomName || roomName === 'ws' || roomName === '') {
    roomName = 'jizhi_default_room';
  }

  ws.roomName = roomName;

  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  rooms.get(roomName).add(ws);

  console.log(`[Yjs WS] Client connected to room: ${roomName} (Room size: ${rooms.get(roomName).size})`);

  // 官方 y-websocket 客户端遵循纯二进制 CRDT 协议，无需发送文本握手，由客户端主动发起 stateVector 同步

  // 🚀 服务端权威同步：将已缓存的 CRDT 历史更新立即重放给新连入的客户端
  const cachedUpdates = loadRoomFromDisk(roomName);
  for (const updateBuf of cachedUpdates) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(updateBuf, { binary: true });
      } catch (err) {}
    }
  }

  // 接收并广播消息
  ws.on('message', (message, isBinary) => {
    const roomClients = rooms.get(roomName);
    if (!roomClients) return;

    // 🚀 核心优化：仅当消息为 Yjs 状态同步包 (Type 0 / messageSync) 时才存入持久化文档缓存；
    // 光标位置与在线状态 (Type 1 / messageAwareness) 仅在内存中即时广播，杜绝断线重连时累积重放造成卡死
    if (isBinary && Buffer.isBuffer(message) && message.length > 0 && message[0] === 0) {
      const updates = loadRoomFromDisk(roomName);
      updates.push(message);
      // 控制单个房间内存更新片断上限 (超量时保留最新)
      if (updates.length > 500) {
        updates.splice(0, updates.length - 200);
      }
      // 触发防抖持久化 (2 秒后保存)
      scheduleRoomPersistence(roomName);
    }

    // 广播给房间内的所有其他客户端
    for (const client of roomClients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message, { binary: isBinary });
        } catch (err) {
          console.error('[Yjs Broadcast Error]:', err);
        }
      }
    }

    // 触发防抖持久化 (2 秒后保存)
    scheduleRoomPersistence(roomName);
  });

  ws.on('close', () => {
    const roomClients = rooms.get(roomName);
    if (roomClients) {
      roomClients.delete(ws);
      if (roomClients.size === 0) {
        rooms.delete(roomName);
      }
    }
    console.log(`[Yjs WS] Client disconnected from room: ${roomName}`);
  });

  ws.on('error', (err) => {
    console.warn(`[Yjs WS Error] room ${roomName}:`, err.message);
  });
});

let Y = null;
try { Y = require('yjs'); } catch (e) {}

/**
 * 房间防抖持久化至本地磁盘
 */
function scheduleRoomPersistence(roomName) {
  if (debounceTimers.has(roomName)) {
    clearTimeout(debounceTimers.get(roomName));
  }

  debounceTimers.set(roomName, setTimeout(() => {
    debounceTimers.delete(roomName);
    try {
      const updates = roomUpdates.get(roomName) || [];
      if (updates.length > 0) {
        const binFile = path.join(dataDir, `room_${roomName}.bin`);
        let combined;
        if (Y && typeof Y.mergeUpdates === 'function') {
          const uint8Arrays = updates.map(b => (Buffer.isBuffer(b) ? new Uint8Array(b) : b));
          const merged = Y.mergeUpdates(uint8Arrays);
          combined = Buffer.from(merged);
        } else {
          combined = Buffer.concat(updates.filter(b => Buffer.isBuffer(b)));
        }
        fs.writeFileSync(binFile, combined);
        console.log(`[Yjs Auto-Save] Room ${roomName} (${combined.length} bytes) persisted to disk.`);
      }
    } catch (e) {
      console.error(`[Yjs Auto-Save Error] Room ${roomName}:`, e);
    }
  }, 2000));
}

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 JIZHI Yjs CRDT Collaboration Server Started`);
  console.log(`📡 WebSocket Listening on ws://${HOST}:${PORT}`);
  console.log(`🩺 Health check: http://${HOST}:${PORT}/health`);
  console.log(`====================================================`);
});
