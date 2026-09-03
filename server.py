#!/usr/bin/env python3
"""
Jizhi (集智) 离线单机沙盒与快速演示服务器 (Port 8088)
【重要部署说明 / Architecture Note】:
- 本文件用于没有安装 PHP/MySQL 运行环境的个人电脑进行本地纯单机测试与快速演示。
- 生产环境（阿里云/腾讯云/宝塔面板）标准部署架构为：
  Nginx (Web服务) + PHP (sync.php 业务与数据持久化) + MySQL (关系数据库) + Node.js (server_yjs.js 协同 1234 端口)。
  线上正式运行完全无需启动本 server.py 脚本。
"""

import http.server
import socketserver
import json
import os
import time
import threading
import gzip
import hashlib
import base64
import struct
import urllib.parse
from queue import Queue

PORT = 8088
DIR = os.path.dirname(os.path.abspath(__file__))

def _safe_id(value, fallback='default'):
    """🛡️ 路径遍历防护：过滤 taskId/groupId 中的危险字符"""
    if not value or not isinstance(value, str):
        return fallback
    # 仅允许字母、数字、下划线、短横线
    import re
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '', value.strip())
    return clean if clean else fallback

# 🤖 Coze API Python Client (OAuth 2.0 Auto Refresh & Chat Proxy)
import urllib.request
import subprocess
import ssl

COZE_SSL_CTX = ssl.create_default_context()
COZE_APP_ID = '117674722513984684072'
COZE_KEY_ID = 'EdvxCTETZES-C-m32CsULVkKR_psKeP-J7HwpQnANuk'
COZE_TOKEN_CACHE = {'token': None, 'expires_at': 0}
COZE_TOKEN_LOCK = threading.Lock()

COZE_BOTS_MAP = {
    'auctioneer': '7673571806476828713',
    'managingEditor': '7673934462736138294',
    'reviewingEditor': '7673943522542141476',
    'proponent': '7673951703640899627',
    'opponent': '7673956980344160307',
    'neutral': '7673955430510870580'
}

def get_coze_access_token():
    now = int(time.time())
    with COZE_TOKEN_LOCK:
        if COZE_TOKEN_CACHE['token'] and now < (COZE_TOKEN_CACHE['expires_at'] - 300):
            return COZE_TOKEN_CACHE['token']

        pem_path = os.path.join(DIR, 'api', 'private_key.pem')
        if not os.path.exists(pem_path):
            return None

        payload = {'iss': COZE_APP_ID, 'aud': 'api.coze.cn', 'iat': now, 'exp': now + 3600, 'jti': f'{now}_{os.urandom(4).hex()}'}
        header_b64 = base64.urlsafe_b64encode(json.dumps({'alg': 'RS256', 'typ': 'JWT', 'kid': COZE_KEY_ID}).encode()).decode().rstrip('=')
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
        to_sign = f'{header_b64}.{payload_b64}'.encode()

        try:
            p = subprocess.Popen(['openssl', 'dgst', '-sha256', '-sign', pem_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            sig, err = p.communicate(input=to_sign)
            sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip('=')
            jwt_token = f'{header_b64}.{payload_b64}.{sig_b64}'

            req = urllib.request.Request('https://api.coze.cn/api/permission/oauth2/token', data=json.dumps({
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'duration_seconds': 86399
            }).encode(), headers={
                'Authorization': f'Bearer {jwt_token}',
                'Content-Type': 'application/json'
            })
            with urllib.request.urlopen(req, context=COZE_SSL_CTX, timeout=15) as resp:
                res = json.loads(resp.read().decode())
                token = res.get('access_token')
                expires_in = res.get('expires_in', 86400)
                COZE_TOKEN_CACHE['token'] = token
                COZE_TOKEN_CACHE['expires_at'] = now + expires_in
                return token
        except Exception as e:
            print(f"[Coze Token Error]: {e}")
            return None

def call_coze_chat_py(bot_id, user_id, query):
    token = get_coze_access_token()
    if not token:
        return None
    try:
        chat_url = 'https://api.coze.cn/v3/chat'
        req_data = {
            'bot_id': bot_id,
            'user_id': user_id or 'student_user',
            'stream': False,
            'auto_save_history': True,
            'additional_messages': [{'role': 'user', 'content': query, 'content_type': 'text'}]
        }
        r = urllib.request.Request(chat_url, data=json.dumps(req_data).encode(), headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        })
        with urllib.request.urlopen(r, context=COZE_SSL_CTX, timeout=20) as resp:
            res = json.loads(resp.read().decode())
            chat_id = res['data']['id']
            conv_id = res['data']['conversation_id']

        for i in range(25):
            time.sleep(0.3 if i < 10 else 0.5)
            poll_url = f'https://api.coze.cn/v3/chat/retrieve?chat_id={chat_id}&conversation_id={conv_id}'
            pr = urllib.request.Request(poll_url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(pr, context=COZE_SSL_CTX, timeout=10) as presp:
                pdata = json.loads(presp.read().decode())
                status = pdata['data']['status']
                if status == 'completed':
                    msg_url = f'https://api.coze.cn/v3/chat/message/list?chat_id={chat_id}&conversation_id={conv_id}'
                    mr = urllib.request.Request(msg_url, headers={'Authorization': f'Bearer {token}'})
                    with urllib.request.urlopen(mr, context=COZE_SSL_CTX, timeout=10) as mresp:
                        mdata = json.loads(mresp.read().decode())
                        for m in mdata.get('data', []):
                            if m.get('type') == 'answer':
                                return m.get('content')
                elif status in ['failed', 'canceled']:
                    return None
        return None
    except Exception as e:
        print(f"[Coze Chat Error]: {e}")
        return None

# SSE clients: { groupId: set(queue1, queue2, ...) }
SSE_CLIENTS = {}
SSE_LOCK = threading.Lock()

# WebSocket rooms: { roomKey: set(socket1, socket2, ...) }
WS_ROOMS = {}
WS_UPDATES = {} # roomKey: [bytes, ...]
WS_LOCK = threading.Lock()

# 🛡️ 单帧长度上限与读超时：杜绝慢连接 (slow-loris) 声明超大帧或逐字节滴灌拖垮线程/内存
MAX_WS_FRAME = 16 * 1024 * 1024   # 16MB
WS_READ_TIMEOUT = 300            # 300s 读超时，Yjs 客户端心跳 ~30s，足够安全

# 🚀 每连接独立发送锁：杜绝同一 socket 的并发帧撕裂，同时避免全局 WS_LOCK 持有期间做阻塞 IO（头阻塞）
_SEND_LOCKS = {}
_SEND_LOCKS_GUARD = threading.Lock()

# 🛡️ JSON 文件读写互斥锁：序列化所有 JSON 文件的读-改-写，避免并发覆盖/读到半写入文件
JSON_FILE_LOCK = threading.Lock()

def _send_lock_for(sock):
    with _SEND_LOCKS_GUARD:
        lk = _SEND_LOCKS.get(sock)
        if lk is None:
            lk = threading.Lock()
            _SEND_LOCKS[sock] = lk
        return lk

def _drop_send_lock(sock):
    with _SEND_LOCKS_GUARD:
        _SEND_LOCKS.pop(sock, None)

def make_ws_frame(data, is_binary=False):
    if isinstance(data, str):
        data = data.encode('utf-8')
    length = len(data)
    if length <= 125:
        header = struct.pack('!BB', 0x82 if is_binary else 0x81, length)
    elif length <= 65535:
        header = struct.pack('!BBH', 0x82 if is_binary else 0x81, 126, length)
    else:
        header = struct.pack('!BBQ', 0x82 if is_binary else 0x81, 127, length)
    return header + data

def read_ws_frame(sock):
    try:
        header = sock.recv(2)
        if not header or len(header) < 2:
            return None, None
        b1, b2 = header[0], header[1]
        opcode = b1 & 0x0f
        is_masked = bool(b2 & 0x80)
        length = b2 & 0x7f

        if length == 126:
            ext = sock.recv(2)
            if len(ext) < 2: return None, None
            length = struct.unpack('!H', ext)[0]
        elif length == 127:
            ext = sock.recv(8)
            if len(ext) < 8: return None, None
            length = struct.unpack('!Q', ext)[0]

        # 🛡️ 长度上限：拒绝异常超大帧，防止内存耗尽
        if length > MAX_WS_FRAME:
            return None, None

        mask = sock.recv(4) if is_masked else b''
        if is_masked and len(mask) < 4:
            return None, None

        payload = bytearray()
        while len(payload) < length:
            chunk = sock.recv(min(4096, length - len(payload)))
            if not chunk:
                break
            payload.extend(chunk)

        if is_masked:
            for i in range(len(payload)):
                payload[i] ^= mask[i % 4]

        return opcode, bytes(payload)
    except Exception:
        return None, None

# Server-Side Hardware Session Lock: { userId: { token: str, lastActive: float, userName: str } }
SESSION_LOCKS = {}
LOCK_MUTEX = threading.Lock()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Upgrade, Sec-WebSocket-Key, Sec-WebSocket-Version')
        # 🛡️ 静态资源与页面一律禁缓存，杜绝“改了不生效”的浏览器陈旧缓存（API/SSE/WebSocket 已各自设置）
        if not any(p in self.path for p in ('/api', '/health', '/ws', 'action=', '/stream')):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health') or self.path.startswith('/api/health'):
            resp = json.dumps({
                'status': 'ok',
                'service': 'JIZHI Yjs CRDT & Multi-Agent Gateway',
                'version': '2.0.0',
                'port': PORT,
                'activeRooms': len(WS_ROOMS),
                'timestamp': int(time.time() * 1000)
            }, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            self.wfile.flush()
            return

        # ⚡ 工业级 WebSocket 集中式长连接协同通道 (复用 8088 端口，零额外端口与 NAT 穿透隐患)
        if self.headers.get('Upgrade', '').lower() == 'websocket' or '/ws' in self.path:
            key = self.headers.get('Sec-WebSocket-Key', '')
            if key:
                accept_val = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode('utf-8')).digest()).decode('utf-8')
                self.send_response(101, 'Switching Protocols')
                self.send_header('Upgrade', 'websocket')
                self.send_header('Connection', 'Upgrade')
                self.send_header('Sec-WebSocket-Accept', accept_val)
                self.end_headers()

                parsed = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed.query)
                room = params.get('room', ['default'])[0]
                if not room or room == 'default':
                    room = self.path.split('/')[-1] or 'default'

                sock = self.request
                # 🛡️ 读超时：防止慢连接 (slow-loris) 永久占用线程
                try:
                    sock.settimeout(WS_READ_TIMEOUT)
                except Exception:
                    pass
                with WS_LOCK:
                    if room not in WS_ROOMS:
                        WS_ROOMS[room] = set()
                    WS_ROOMS[room].add(sock)
                    if room not in WS_UPDATES:
                        WS_UPDATES[room] = []
                    hist_copies = list(WS_UPDATES[room])

                # 🚀 历史增量重放：将已有 CRDT 文档更新帧立即回放给新接入的客户端（走独立发送锁，杜绝与广播帧交错）
                for hdata in hist_copies:
                    try:
                        with _send_lock_for(sock):
                            sock.sendall(make_ws_frame(hdata, is_binary=True))
                    except Exception:
                        pass

                try:
                    while True:
                        opcode, data = read_ws_frame(sock)
                        if opcode is None or opcode == 8:
                            break
                        if opcode == 9:
                            sock.sendall(struct.pack('!BB', 0x8a, 0))
                            continue
                        if opcode in (1, 2) and data:
                            is_bin = (opcode == 2)
                            # 🚀 如果是 Yjs 二进制更新 (messageType === 0 即 messageSync)，存入房间历史缓存
                            if is_bin and len(data) > 0 and data[0] == 0:
                                with WS_LOCK:
                                    if room not in WS_UPDATES:
                                        WS_UPDATES[room] = []
                                    WS_UPDATES[room].append(data)

                            out_frame = make_ws_frame(data, is_bin)
                            with WS_LOCK:
                                targets = list(WS_ROOMS.get(room, set()))
                            dead = set()
                            for s in targets:
                                if s != sock:
                                    try:
                                        # 🚀 每连接独立互斥写入：仅锁住目标 socket，避免阻塞其它连接 (彻底消除并发帧撕裂，且无头阻塞)
                                        with _send_lock_for(s):
                                            s.sendall(out_frame)
                                    except Exception:
                                        dead.add(s)
                            if dead:
                                with WS_LOCK:
                                    if room in WS_ROOMS:
                                        WS_ROOMS[room].difference_update(dead)
                                # 🛡️ 及时回收死连接的独立发送锁，杜绝 _SEND_LOCKS 缓慢泄漏
                                for dead_sock in dead:
                                    _drop_send_lock(dead_sock)
                except Exception:
                    pass
                finally:
                    with WS_LOCK:
                        if room in WS_ROOMS:
                            WS_ROOMS[room].discard(sock)
                    _drop_send_lock(sock)
                return

        # ⚡ 顶号检测 API (客户端轮询检查自己是否被踢下线)
        if 'action=session_check' in self.path or '/api/session/check' in self.path:
            import urllib.parse
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            user_id = params.get('userId', [''])[0]
            token = params.get('token', [''])[0]
            
            kicked = False
            if user_id:
                with LOCK_MUTEX:
                    active = SESSION_LOCKS.get(user_id)
                    if active:
                        if token and active.get('token') != token:
                            # Token 不一致，说明已被新设备顶号！
                            kicked = True
                        else:
                            active['lastActive'] = time.time()
            
            resp = json.dumps({'kicked': kicked, 'success': True}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Content-Length', str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            self.wfile.flush()
            return

        # ⚡ 登出释放锁 API (GET)
        if 'action=session_logout' in self.path or '/api/session/logout' in self.path:
            import urllib.parse
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            user_id = params.get('userId', [''])[0]
            if user_id:
                with LOCK_MUTEX:
                    if user_id in SESSION_LOCKS:
                        del SESSION_LOCKS[user_id]
            resp = b'{"success":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            self.wfile.flush()
            return

        # ⚡ SSE 毫秒级长连接推送通道 (支持 taskId + groupId 隔离)
        if '/api/stream' in self.path:
            groupId = 'group_1'
            taskId = 'task_default'
            if 'groupId=' in self.path:
                groupId = _safe_id(self.path.split('groupId=')[1].split('&')[0], 'group_1')
            if 'taskId=' in self.path:
                taskId = _safe_id(self.path.split('taskId=')[1].split('&')[0], 'task_default')
            
            channel_key = f"{taskId}_{groupId}"

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'close')
            self.end_headers()

            q = Queue()
            with SSE_LOCK:
                if channel_key not in SSE_CLIENTS:
                    SSE_CLIENTS[channel_key] = set()
                SSE_CLIENTS[channel_key].add(q)
                # 兼容旧版本 group 订阅
                if groupId not in SSE_CLIENTS:
                    SSE_CLIENTS[groupId] = set()
                SSE_CLIENTS[groupId].add(q)

            import queue
            try:
                self.wfile.write(b': ping\n\n')
                self.wfile.flush()

                while True:
                    try:
                        msg = q.get(timeout=15)
                        self.wfile.write(f'data: {msg}\n\n'.encode('utf-8'))
                        self.wfile.flush()
                    except queue.Empty:
                        try:
                            self.wfile.write(b': ping\n\n')
                            self.wfile.flush()
                        except Exception:
                            break
                    except (ConnectionResetError, BrokenPipeError, Exception):
                        break
            except Exception:
                pass
            finally:
                with SSE_LOCK:
                    if groupId in SSE_CLIENTS:
                        SSE_CLIENTS[groupId].discard(q)
                        if not SSE_CLIENTS[groupId]:
                            del SSE_CLIENTS[groupId]
                    if channel_key in SSE_CLIENTS:
                        SSE_CLIENTS[channel_key].discard(q)
                        if not SSE_CLIENTS[channel_key]:
                            del SSE_CLIENTS[channel_key]
            return

        # ⚡ 全局教务元数据 (班级/任务/通知/文献/问卷) 专属路由
        if 'action=get_global_meta' in self.path:
            global_file = os.path.join(DIR, 'global_db.json')
            content = None
            if os.path.exists(global_file):
                try:
                    with JSON_FILE_LOCK:
                        with open(global_file, 'rb') as f:
                            raw_data = f.read()
                    parsed = json.loads(raw_data.decode('utf-8'))
                    if isinstance(parsed, dict) and ('classes' in parsed or 'tasks' in parsed or 'users' in parsed):
                        # 🛡️ 脱敏：下发前剔除所有用户的 password 字段，防止明文/哈希口令泄露
                        if isinstance(parsed.get('users'), list):
                            for u in parsed['users']:
                                if isinstance(u, dict):
                                    u.pop('password', None)
                        content = json.dumps(parsed, ensure_ascii=False).encode('utf-8')
                except Exception:
                    pass

            if not content:
                default_meta = {
                    "users": [
                        {
                            "id": "1001",
                            "username": "1001",
                            "studentCode": "1001",
                            "password": "123",
                            "name": "老师",
                            "role": "teacher",
                            "avatar": "👩‍🏫"
                        }
                    ],
                    "classes": [
                        {
                            "id": "class_101",
                            "name": "《现代教育技术》2026春01班",
                            "code": "ET2026-01",
                            "studentIds": [],
                            "groups": []
                        }
                    ],
                    "tasks": [
                        {
                            "id": "task_default",
                            "title": "期末协作写作 (默认测试任务)",
                            "classId": "class_101",
                            "className": "《现代教育技术》2026春01班",
                            "durationMinutes": 150,
                            "startTime": "2026/08/01 08:00",
                            "deadline": "2026/08/30 23:59",
                            "status": "in_progress",
                            "createdAt": "2026/08/01",
                            "instructions": "请各小组成员协同完成多智能体学术论文研讨与写作。",
                            "resources": []
                        }
                    ],
                    "announcements": [],
                    "referencePapers": [],
                    "surveys": []
                }
                content = json.dumps(default_meta, ensure_ascii=False).encode('utf-8')
                with JSON_FILE_LOCK:
                    with open(global_file, 'wb') as f:
                        f.write(content)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            self.wfile.flush()
            return

        if '/api/snapshot' in self.path or 'sync.php' in self.path:
            groupId = 'group_1'
            if 'groupId=' in self.path:
                groupId = _safe_id(self.path.split('groupId=')[1].split('&')[0], 'group_1')
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = _safe_id(self.path.split('taskId=')[1].split('&')[0], 'task_default')
            db_file = os.path.join(DIR, f'db_{taskId}_{groupId}.json')
            if not os.path.exists(db_file):
                db_file_fallback = os.path.join(DIR, f'db_{groupId}.json')
                if os.path.exists(db_file_fallback):
                    db_file = db_file_fallback
            if os.path.exists(db_file):
                with open(db_file, 'rb') as f:
                    content = f.read()
            else:
                content = b'{"timestamp":0}'

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            self.wfile.flush()
            return

        # Security protection: prevent direct downloading of sensitive source/config/data files
        clean_path = self.path.split('?')[0].lower()
        blocked_ext = ('.pem', '.key', '.env', '.php', '.py', '.json')
        if any(clean_path.endswith(ext) for ext in blocked_ext):
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'403 Forbidden: Direct access to security credentials is prohibited.')
            return

        # Standard robust static file serving
        return super().do_GET()

    def do_POST(self):
        # 🤖 扣子 (Coze) 智能体 API 代理 (POST)
        if 'action=coze_chat' in self.path or '/api/coze_chat' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                # 🛡️ 会话鉴权 Fail-Closed：调用扣子代理必须持有有效会话，杜绝匿名刷 Coze 配额
                coze_uid = req.get('userId') or req.get('user_id') or ''
                coze_token = req.get('token') or ''
                with LOCK_MUTEX:
                    coze_active = SESSION_LOCKS.get(coze_uid) if coze_uid else None
                if not coze_uid or not coze_token or not coze_active or coze_active.get('token') != coze_token:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(b'{"success":false,"message":"session_required"}')
                    return
                bot_key = req.get('bot_key', '')
                bot_id = req.get('bot_id', '')
                if not bot_id and bot_key in COZE_BOTS_MAP:
                    bot_id = COZE_BOTS_MAP[bot_key]
                if not bot_id:
                    bot_id = '7673571806476828713'
                user_id = req.get('user_id', 'student_user')
                query = req.get('query', '')
                
                reply = call_coze_chat_py(bot_id, user_id, query)
                if reply:
                    resp_data = json.dumps({'success': True, 'reply': reply, 'bot_id': bot_id}).encode('utf-8')
                else:
                    resp_data = json.dumps({'success': False, 'message': 'No reply from Coze API'}).encode('utf-8')
            except Exception as e:
                resp_data = json.dumps({'success': False, 'message': str(e)}).encode('utf-8')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(resp_data)))
            self.end_headers()
            self.wfile.write(resp_data)
            self.wfile.flush()
            return

        # ⚡ 顶号登录/会话注册 API (POST)
        if 'action=session_login' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                user_id = req.get('userId')
                token = req.get('token')
                user_name = req.get('userName', user_id)
                now = time.time()

                with LOCK_MUTEX:
                    # 🚀 顶号逻辑：后登录者的 token 直接覆盖，成为唯一有效 token
                    SESSION_LOCKS[user_id] = {'token': token, 'lastActive': now, 'userName': user_name}

                resp = b'{"success":true}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                self.wfile.flush()
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        # ⚡ 登出释放锁 API (POST)
        if 'action=session_logout' in self.path or '/api/session/logout' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                user_id = req.get('userId')
                with LOCK_MUTEX:
                    if user_id in SESSION_LOCKS:
                        del SESSION_LOCKS[user_id]
            except Exception:
                pass
            resp = b'{"success":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        # ⚡ 多角色编辑光标与位置广播 API
        if '/api/presence' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                group_id = req.get('groupId', 'group_1')
                payload = json.dumps({'type': 'presence_update', 'presence': req})
                with SSE_LOCK:
                    clients = list(SSE_CLIENTS.get(group_id, []))
                for q in clients:
                    try:
                        q.put_nowait(payload)
                    except Exception:
                        pass
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"success":true}')
                return
            except Exception:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'{"success":false}')
                return

        # ⚡ 物理级账号独占互斥锁 API
        if '/api/session/login' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                user_id = req.get('userId')
                token = req.get('token')
                user_name = req.get('userName', user_id)
                now = time.time()

                with LOCK_MUTEX:
                    active = SESSION_LOCKS.get(user_id)
                    if active and active.get('token') != token and (now - active.get('lastActive', 0)) < 180:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        msg = f"⚠️ 账号 [{user_name}] 此时正在其他设备或浏览器上登录使用中！\n为避免两人同时操作同一个账号产生冲突，请使用您个人的独立账号登录。"
                        self.wfile.write(json.dumps({'success': False, 'message': msg}).encode('utf-8'))
                        return

                    SESSION_LOCKS[user_id] = {'token': token, 'lastActive': now, 'userName': user_name}

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        if '/api/session/heartbeat' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                user_id = req.get('userId')
                token = req.get('token')
                user_name = req.get('userName', user_id)
                now = time.time()

                with LOCK_MUTEX:
                    active = SESSION_LOCKS.get(user_id)
                    if active and active.get('token') == token:
                        active['lastActive'] = now
                    else:
                        SESSION_LOCKS[user_id] = {'token': token, 'lastActive': now, 'userName': user_name}

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            except Exception:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":true}')
            return

        if '/api/session/logout' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                user_id = req.get('userId')
                with LOCK_MUTEX:
                    if user_id in SESSION_LOCKS:
                        del SESSION_LOCKS[user_id]
            except Exception:
                pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success":true}')
            return

        # ⚡ 全局教务元数据 (班级/任务/通知/文献/问卷) 专属保存路由
        if 'action=save_global_meta' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode('utf-8'))
                # 🛡️ 强制鉴权 Fail-Closed：缺失凭证或会话不匹配一律拒绝，绝不无凭据放行
                req_user_id = data.get('userId') or data.get('_userId')
                req_token = data.get('token') or data.get('_token')
                if not req_user_id or not req_token:
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b'{"success":false,"error":"session_required"}')
                    return
                with LOCK_MUTEX:
                    active = SESSION_LOCKS.get(req_user_id)
                if not active or active.get('token') != req_token:
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b'{"success":false,"error":"session_invalid"}')
                    return
                if isinstance(data, dict) and ('classes' in data or 'tasks' in data or 'users' in data):
                    global_file = os.path.join(DIR, 'global_db.json')
                    with JSON_FILE_LOCK:
                        with open(global_file, 'wb') as f:
                            f.write(body)
                resp = json.dumps({'success': True, 'timestamp': int(time.time() * 1000)}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                self.wfile.flush()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        # ⚡ 学生已读确认通知专属轻量路由 (支持个人独立已读 + 小组聚合确认)
        if 'action=update_read_status' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                ann_id = req.get('annId')
                group_id = req.get('groupId')
                user_id = req.get('userId')
                user_code = req.get('userCode')
                user_name = req.get('userName')

                if ann_id:
                    global_file = os.path.join(DIR, 'global_db.json')
                    if os.path.exists(global_file):
                        with JSON_FILE_LOCK:
                            with open(global_file, 'r', encoding='utf-8') as f:
                                meta = json.load(f)
                            if isinstance(meta, dict) and 'announcements' in meta and isinstance(meta['announcements'], list):
                                for ann in meta['announcements']:
                                    if ann.get('id') == ann_id:
                                        if 'readStatus' not in ann or not isinstance(ann['readStatus'], dict):
                                            ann['readStatus'] = {}
                                        if 'readGroupStatus' not in ann or not isinstance(ann['readGroupStatus'], dict):
                                            ann['readGroupStatus'] = {}
                                        if 'confirmedMembers' not in ann or not isinstance(ann['confirmedMembers'], list):
                                            ann['confirmedMembers'] = []

                                        if user_id:
                                            ann['readStatus'][user_id] = True
                                        if user_code:
                                            ann['readStatus'][user_code] = True
                                        if group_id:
                                            ann['readGroupStatus'][group_id] = True

                                        if user_id and not any(m.get('id') == user_id for m in ann['confirmedMembers'] if isinstance(m, dict)):
                                            ann['confirmedMembers'].append({
                                                'id': user_id,
                                                'name': user_name or user_code or '学生',
                                                'studentCode': user_code or '',
                                                'groupId': group_id or ''
                                            })
                                        break
                                with open(global_file, 'w', encoding='utf-8') as f:
                                    json.dump(meta, f, ensure_ascii=False)

                resp = b'{"success":true}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                self.wfile.flush()
            except Exception as e:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":false}')
            return

        # ⚡ 登录鉴权路由 (镜像生产 sync.php：账号/密码校验 + 会话 token 下发)
        if 'action=login' in self.path:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                account = (req.get('account') or '').strip()
                password = (req.get('password') or '').strip()
                role = (req.get('role') or '').strip()
                if not account or not password:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'message': '请输入账号和密码'}, ensure_ascii=False).encode('utf-8'))
                    return

                found_user = None
                user_exists = False
                user_list = []
                global_file = os.path.join(DIR, 'global_db.json')
                if os.path.exists(global_file):
                    try:
                        with JSON_FILE_LOCK:
                            with open(global_file, 'r', encoding='utf-8') as f:
                                meta = json.load(f)
                        if isinstance(meta, dict):
                            user_list = meta.get('users', []) or []
                    except Exception:
                        user_list = []
                for u in user_list:
                    if not isinstance(u, dict):
                        continue
                    u_acc = u.get('username') or u.get('studentCode') or u.get('id') or ''
                    if u_acc == account:
                        user_exists = True
                        db_pwd = u.get('password') or ''
                        if password == db_pwd or (not db_pwd and password == '123'):
                            found_user = u
                        break

                if found_user:
                    # 🔐 多重认证：登录界面所选身份必须与账号实际角色一致，防止跨身份误登录
                    u_role = (found_user.get('role') or '').strip()
                    role_mismatch = (role == 'teacher' and u_role != 'teacher') or (role == 'student' and u_role == 'teacher')
                    if role_mismatch:
                        self.send_response(401)
                        self.send_header('Content-Type', 'application/json; charset=utf-8')
                        self.end_headers()
                        self.wfile.write(json.dumps({'success': False, 'message': '所选登录身份与账号角色不匹配，请核对身份选项'}, ensure_ascii=False).encode('utf-8'))
                        return
                    token = 'jwt_jizhi_' + os.urandom(16).hex() + '_' + str(int(time.time()))
                    # 🚀 同步注册会话锁，使后续 save_global_meta 等教师鉴权路由能凭该 token 通过校验
                    now = time.time()
                    with LOCK_MUTEX:
                        for _k in (found_user.get('id'), found_user.get('username'), found_user.get('studentCode')):
                            if _k:
                                SESSION_LOCKS[_k] = {'token': token, 'lastActive': now, 'userName': found_user.get('name', account)}
                    user_out = dict(found_user)
                    user_out.pop('password', None)
                    resp_bytes = json.dumps({'success': True, 'token': token, 'user': user_out}, ensure_ascii=False).encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Content-Length', str(len(resp_bytes)))
                    self.end_headers()
                    self.wfile.write(resp_bytes)
                elif not user_exists:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'message': '账号不存在，请检查工号或学号是否输入正确'}, ensure_ascii=False).encode('utf-8'))
                else:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'message': '密码错误，默认密码为 123'}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False).encode('utf-8'))
            return

        # ⚡ 研讨区独立轻量发信路由 (解耦大快照)
        if 'action=send_chat' in self.path:
            groupId = 'group_1'
            if 'groupId=' in self.path:
                groupId = _safe_id(self.path.split('groupId=')[1].split('&')[0], 'group_1')
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = _safe_id(self.path.split('taskId=')[1].split('&')[0], 'task_default')
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                msgItem = req.get('message', req)
                stage = req.get('stage', msgItem.get('stage', 'stage1'))
                db_file = os.path.join(DIR, f'db_{taskId}_{groupId}.json')
                db_file_compat = os.path.join(DIR, f'db_{groupId}.json')
                
                target_file = db_file if os.path.exists(db_file) else (db_file_compat if os.path.exists(db_file_compat) else db_file)
                with JSON_FILE_LOCK:
                    data = {}
                    if os.path.exists(target_file):
                        try:
                            with open(target_file, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                        except Exception:
                            data = {}

                    if 'chatLogs' not in data or not isinstance(data['chatLogs'], dict):
                        data['chatLogs'] = {'stage1': [], 'stage2': [], 'stage3': []}
                    if stage not in data['chatLogs'] or not isinstance(data['chatLogs'][stage], list):
                        data['chatLogs'][stage] = []

                    # 检查去重
                    mId = msgItem.get('id')
                    exists = any(m.get('id') == mId for m in data['chatLogs'][stage] if isinstance(m, dict))
                    if not exists:
                        data['chatLogs'][stage].append(msgItem)
                        with open(db_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False)
                        with open(db_file_compat, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False)
                
                # SSE 广播
                payload = json.dumps({'type': 'chat_update', 'stage': stage, 'message': msgItem})
                with SSE_LOCK:
                    channel_key = f"{taskId}_{groupId}"
                    target_queues = list(SSE_CLIENTS.get(channel_key, set())) + list(SSE_CLIENTS.get(groupId, set()))
                    for q in set(target_queues):
                        try:
                            q.put_nowait(payload)
                        except Exception:
                            pass

                resp_bytes = json.dumps({'success': True, 'message': msgItem, 'timestamp': int(time.time() * 1000)}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                self.wfile.flush()
                return
            except Exception as e:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":false}')
                return

        # ⚡ 独立轻量在线心跳路由
        if 'action=presence_ping' in self.path:
            groupId = 'group_1'
            if 'groupId=' in self.path:
                groupId = _safe_id(self.path.split('groupId=')[1].split('&')[0], 'group_1')
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = _safe_id(self.path.split('taskId=')[1].split('&')[0], 'task_default')
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                req = json.loads(body.decode('utf-8'))
                userKey = str(req.get('userId') or req.get('studentCode') or '').strip()
                nowMs = int(time.time() * 1000)
                db_file = os.path.join(DIR, f'db_{taskId}_{groupId}.json')
                db_file_compat = os.path.join(DIR, f'db_{groupId}.json')
                target_file = db_file if os.path.exists(db_file) else (db_file_compat if os.path.exists(db_file_compat) else db_file)
                
                with JSON_FILE_LOCK:
                    data = {}
                    if os.path.exists(target_file):
                        try:
                            with open(target_file, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                        except Exception:
                            data = {}
                    if 'presence' not in data or not isinstance(data['presence'], dict):
                        data['presence'] = {}
                    
                    if userKey:
                        data['presence'][userKey] = {'lastSeen': nowMs, 'updatedAt': nowMs, 'name': req.get('name', userKey)}
                        if req.get('studentCode'):
                            data['presence'][str(req.get('studentCode'))] = {'lastSeen': nowMs, 'updatedAt': nowMs, 'name': req.get('name', userKey)}
                        
                        with open(db_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False)
                        with open(db_file_compat, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False)

                resp_bytes = json.dumps({'success': True, 'timestamp': nowMs, 'presence': data.get('presence', {})}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                self.wfile.flush()
                return
            except Exception:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":true}')
                return

        if '/api/snapshot' in self.path or 'sync.php' in self.path:
            groupId = 'group_1'
            if 'groupId=' in self.path:
                groupId = _safe_id(self.path.split('groupId=')[1].split('&')[0], 'group_1')
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = _safe_id(self.path.split('taskId=')[1].split('&')[0], 'task_default')
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            db_file = os.path.join(DIR, f'db_{taskId}_{groupId}.json')
            db_file_compat = os.path.join(DIR, f'db_{groupId}.json')
            try:
                data = json.loads(body.decode('utf-8'))
                body_str = body.decode('utf-8')
                with JSON_FILE_LOCK:
                    with open(db_file, 'w', encoding='utf-8') as f:
                        f.write(body_str)
                    with open(db_file_compat, 'w', encoding='utf-8') as f:
                        f.write(body_str)

                with SSE_LOCK:
                    channel_key = f"{taskId}_{groupId}"
                    target_queues = list(SSE_CLIENTS.get(channel_key, set())) + list(SSE_CLIENTS.get(groupId, set()))
                    dead_queues = set()
                    for q in set(target_queues):
                        try:
                            q.put_nowait(body_str)
                        except Exception:
                            dead_queues.add(q)
                    if channel_key in SSE_CLIENTS:
                        SSE_CLIENTS[channel_key].difference_update(dead_queues)
                    if groupId in SSE_CLIENTS:
                        SSE_CLIENTS[groupId].difference_update(dead_queues)

                resp_bytes = json.dumps({'success': True, 'timestamp': data.get('timestamp', int(time.time() * 1000))}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                self.wfile.flush()
            except Exception as e:
                resp_bytes = json.dumps({'error': str(e)}).encode('utf-8')
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                self.wfile.flush()
            return
            return
        super().do_POST()

    def log_message(self, format, *args):
        pass

import asyncio

def start_yjs_background_service():
    try:
        import server_yjs
        print("[Yjs Auto-Launcher] Starting Yjs WebSocket Service on Port 1234...", flush=True)
        asyncio.run(server_yjs.main())
    except Exception as e:
        print(f"[Yjs Auto-Launcher Error] {e}", flush=True)

if __name__ == '__main__':
    yjs_thread = threading.Thread(target=start_yjs_background_service, daemon=True)
    yjs_thread.start()
    print(f'🚀 集智 Gzip 极速+服务端独占锁服务器运行在端口 {PORT}...', flush=True)
    with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), Handler) as httpd:
        httpd.serve_forever()
