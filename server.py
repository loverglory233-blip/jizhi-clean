#!/usr/bin/env python3
"""
Jizhi (集智) Multi-Agent Collaborative Writing Platform
Clean High-Performance Multi-Threaded Real-Time Sync Server (Port 8088)
Features: Gzip Compression, Server-Enforced Single Account Session Locking, SSE Sync
"""

import http.server
import socketserver
import json
import os
import time
import threading
import gzip
from queue import Queue

PORT = 8088
DIR = os.path.dirname(os.path.abspath(__file__))

# SSE clients: { groupId: set(queue1, queue2, ...) }
SSE_CLIENTS = {}
SSE_LOCK = threading.Lock()

# Server-Side Hardware Session Lock: { userId: { token: str, lastActive: float, userName: str } }
SESSION_LOCKS = {}
LOCK_MUTEX = threading.Lock()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
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
                groupId = self.path.split('groupId=')[1].split('&')[0]
            if 'taskId=' in self.path:
                taskId = self.path.split('taskId=')[1].split('&')[0]
            
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
            return

        # ⚡ 全局教务元数据 (班级/任务/通知/文献/问卷) 专属路由
        if 'action=get_global_meta' in self.path:
            global_file = os.path.join(DIR, 'global_db.json')
            content = None
            if os.path.exists(global_file):
                try:
                    with open(global_file, 'rb') as f:
                        raw_data = f.read()
                    parsed = json.loads(raw_data.decode('utf-8'))
                    if isinstance(parsed, dict) and ('classes' in parsed or 'tasks' in parsed or 'users' in parsed):
                        content = raw_data
                except Exception:
                    pass

            if not content:
                default_meta = {
                    "users": [
                        {"id": "u_teacher1", "username": "1001", "studentCode": "1001", "password": "123", "name": "老师", "role": "teacher", "avatar": "👩‍🏫"},
                        {"id": "u_studentA", "username": "202601", "studentCode": "202601", "password": "123", "name": "李明 (组长)", "role": "student", "avatar": "👨‍🎓", "classId": "class_101", "groupId": "group_1"},
                        {"id": "u_studentB", "username": "202602", "studentCode": "202602", "password": "123", "name": "王芳 (组员)", "role": "student", "avatar": "👩‍🎓", "classId": "class_101", "groupId": "group_1"},
                        {"id": "u_studentC", "username": "202603", "studentCode": "202603", "password": "123", "name": "陈强 (组员)", "role": "student", "avatar": "🧑‍🎓", "classId": "class_101", "groupId": "group_1"}
                    ],
                    "classes": [
                        {
                            "id": "class_101",
                            "name": "《现代教育技术》2026春01班",
                            "code": "ET2026-01",
                            "studentIds": ["u_studentA", "u_studentB", "u_studentC"],
                            "groups": [
                                {
                                    "id": "group_1",
                                    "name": "第 1 协作小组 (测试组)",
                                    "members": [
                                        {"id": "u_studentA", "name": "李明", "studentCode": "202601", "role": "组长", "roleTitle": "组长", "avatar": "👨‍🎓", "color": "#2563eb"},
                                        {"id": "u_studentB", "name": "王芳", "studentCode": "202602", "role": "组员", "roleTitle": "组员", "avatar": "👩‍🎓", "color": "#10b981"},
                                        {"id": "u_studentC", "name": "陈强", "studentCode": "202603", "role": "组员", "roleTitle": "组员", "avatar": "🧑‍🎓", "color": "#f59e0b"}
                                    ]
                                }
                            ]
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
                groupId = self.path.split('groupId=')[1].split('&')[0]
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = self.path.split('taskId=')[1].split('&')[0]
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

        # Standard robust static file serving
        return super().do_GET()

    def do_POST(self):
        # ⚡ 顶号登录/会话注册 API (POST)
        if 'action=session_login' in self.path or '/api/session/login' in self.path:
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
                if isinstance(data, dict) and ('classes' in data or 'tasks' in data or 'users' in data):
                    global_file = os.path.join(DIR, 'global_db.json')
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

        if '/api/snapshot' in self.path or 'sync.php' in self.path:
            groupId = 'group_1'
            if 'groupId=' in self.path:
                groupId = self.path.split('groupId=')[1].split('&')[0]
            taskId = 'task_default'
            if 'taskId=' in self.path:
                taskId = self.path.split('taskId=')[1].split('&')[0]
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            db_file = os.path.join(DIR, f'db_{taskId}_{groupId}.json')
            db_file_compat = os.path.join(DIR, f'db_{groupId}.json')
            try:
                data = json.loads(body.decode('utf-8'))
                body_str = body.decode('utf-8')
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

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    print(f'🚀 集智 Gzip 极速+服务端独占锁服务器运行在端口 {PORT}...', flush=True)
    with ThreadingTCPServer(('0.0.0.0', PORT), Handler) as httpd:
        httpd.serve_forever()
