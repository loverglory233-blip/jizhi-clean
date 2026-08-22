#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JIZHI (集智) Yjs CRDT 实时协同 WebSocket 服务端 (Python asyncio 版)
运行方式: python3 server_yjs.py
默认端口: 1234
"""

import asyncio
import json
import os
import sys
from urllib.parse import urlparse, parse_qs

try:
    import websockets
except ImportError:
    print("[Warning] websockets module not found. Please install via: pip install websockets")

PORT = int(os.environ.get('PORT', 1234))
HOST = os.environ.get('HOST', '0.0.0.0')

# 房间客户端集合: Map<room_name, Set<WebSocketServerProtocol>>
ROOMS = {}

async def handler(websocket, path):
    # 解析房间名
    parsed = urlparse(path)
    qs = parse_qs(parsed.query)
    room_name = qs.get('room', [None])[0] or parsed.path.strip('/').split('?')[0] or 'jizhi_default_room'
    
    if room_name not in ROOMS:
        ROOMS[room_name] = set()
    ROOMS[room_name].add(websocket)
    print(f"[Yjs PyWS] Client connected to room: {room_name} (Total: {len(ROOMS[room_name])})")

    try:
        # 发送连接确认
        await websocket.send(json.dumps({'type': 'connected', 'room': room_name}))
        
        async for message in websocket:
            # 广播给房间内的所有其他客户端
            peers = ROOMS.get(room_name, set())
            tasks = []
            for peer in peers:
                if peer != websocket and peer.open:
                    tasks.append(peer.send(message))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        pass
    finally:
        if room_name in ROOMS:
            ROOMS[room_name].discard(websocket)
            if not ROOMS[room_name]:
                del ROOMS[room_name]
        print(f"[Yjs PyWS] Client disconnected from room: {room_name}")

async def process_request(path, request_headers):
    # 处理 HTTP 健康检查与普通探针
    if path == '/health' or path == '/':
        headers = [
            ('Content-Type', 'application/json; charset=utf-8'),
            ('Access-Control-Allow-Origin', '*'),
            ('Access-Control-Allow-Methods', 'GET, OPTIONS')
        ]
        body = json.dumps({
            'status': 'ok',
            'service': 'JIZHI Yjs CRDT Python Collaboration Gateway',
            'version': '2.0.0',
            'activeRooms': len(ROOMS)
        }).encode('utf-8')
        return (200, headers, body)
    return None

async def main():
    print(f"====================================================")
    print(f"🚀 JIZHI Yjs CRDT Python WebSocket Server Started")
    print(f"📡 Listening on ws://{HOST}:{PORT}")
    print(f"🩺 Health check on http://{HOST}:{PORT}/health")
    print(f"====================================================")
    async with websockets.serve(handler, HOST, PORT, process_request=process_request):
        await asyncio.Future()  # run forever

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Yjs PyWS] Server stopped.")
