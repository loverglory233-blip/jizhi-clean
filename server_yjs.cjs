/**
 * JIZHI (集智) Yjs CRDT 官方标准实时协同 WebSocket 服务端
 * 100% 采用 y-websocket 官方标准架构，保障毫秒级字符协同与断线重连
 */

const http = require('http');
const WebSocket = require('ws');

let setupWSConnection = null;
try {
  setupWSConnection = require('y-websocket/bin/utils').setupWSConnection;
} catch (e) {
  console.error('❌ [Yjs Fatal] 必须安装 y-websocket 依赖: npm install y-websocket ws yjs');
}

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
      service: 'JIZHI Official Yjs CRDT Gateway',
      version: '2.0.0',
      timestamp: Date.now()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let rawPath = urlObj.pathname.replace(/^\/+/, '').split('?')[0];
    if (rawPath.startsWith('ws/')) {
      rawPath = rawPath.slice(3);
    }
    let roomName = urlObj.searchParams.get('room') || rawPath;
    if (!roomName || roomName === 'ws' || roomName === '') {
      roomName = 'jizhi_default_room';
    }

    if (setupWSConnection) {
      setupWSConnection(conn, req, { docName: roomName, gc: true });
      console.log(`[Yjs Official CRDT] 🟢 客户端已成功接入协同房间: [${roomName}]`);
    } else {
      console.error('[Yjs Error] setupWSConnection 不可用，请确保 npm install 正常完成！');
      conn.close();
    }
  } catch (err) {
    console.error('[Yjs Connection Error]:', err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 [Yjs Official Server] 权威 CRDT 协同引擎已启动在 ws://${HOST}:${PORT}`);
});
