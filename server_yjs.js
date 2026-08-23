/**
 * JIZHI (集智) Yjs CRDT 实时协同 WebSocket 服务端
 * 运行方式: node server_yjs.js
 * 默认端口: 1234 (可在环境变量或启动参数中指定: PORT=1234)
 */

import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // 解析 room 标识 (从 URL query 或 path 获取)
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let roomName = urlObj.searchParams.get('room') || urlObj.pathname.replace(/^\/+/, '').split('?')[0];
  if (!roomName || roomName === 'ws' || roomName === '') {
    roomName = 'jizhi_default_room';
  }

  // 🚀 优先使用官方原版 setupWSConnection (权威状态向量、Awareness、GC、SyncStep2 算法)
  if (ywsUtils && typeof ywsUtils.setupWSConnection === 'function') {
    const doc = ywsUtils.getYDoc(roomName);
    const ytext = doc.getText('quill_content');
    // 如果房间文档全新且尚无内容，由服务端单点权威初始化预置大纲模板 (彻底杜绝客户端多端并发重复粘贴)
    if (ytext.length === 0) {
      const defaultTemplate = `一、研究背景与意义\n请在此处阐述研究的现实背景、理论价值与实践意义...\n\n二、研究问题与假设\n1. 核心研究问题：\n2. 研究假设 (H1, H2)：\n\n三、文献综述\n梳理国内外相关领域的核心文献与研究现状...\n\n四、研究设计与方法\n1. 研究对象与被试选择：\n2. 实验变量与测量工具：\n3. 教学实验干预流程：\n\n五、预期结果与讨论\n对实验数据的统计分析方法与预期成效进行阐述...\n\n六、研究反思与不足\n阐述本研究的局限性与未来改进方向...\n\n七、参考文献\n[1] 作者. 论文题目[J]. 期刊名称, 年份, 卷(期): 页码.\n`;
      ytext.insert(0, defaultTemplate);
      console.log(`[Yjs Core] 🏛️ 服务端权威单点初始化房间大纲模板: ${roomName}`);
    }
    ywsUtils.setupWSConnection(ws, req, { docName: roomName, gc: true });
    return;
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
 * 房间防抖持久化至本地磁盘 (以离散帧数组格式存储，杜绝 Buffer.concat 跨帧粘包截断)
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
        const jsonFile = path.join(dataDir, `room_${roomName}.json`);
        const b64List = updates.filter(b => Buffer.isBuffer(b) && b.length > 0).map(b => b.toString('base64'));
        fs.writeFileSync(jsonFile, JSON.stringify(b64List));
        console.log(`[Yjs Auto-Save] Room ${roomName} (${b64List.length} discrete frames) persisted to disk.`);
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
