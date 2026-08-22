#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JIZHI (集智) Yjs CRDT 实时协同 WebSocket 服务端 (Python asyncio 版)
兼容 websockets 所有版本 (包括 10.x, 13.x, 14.x, 16.x)
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

# 房间客户端集合: Map<room_name, Set<WebSocket>>
ROOMS = {}

async def universal_handler(websocket, *args):
    # 兼容 legacy 2 参数 (websocket, path) 与 modern 1 参数 (websocket)
    path = args[0] if args else getattr(websocket, 'path', None)
    if not path and hasattr(websocket, 'request'):
        path = getattr(websocket.request, 'path', None)
    if not path:
        path = '/jizhi_default_room'

    parsed = urlparse(path)
    qs = parse_qs(parsed.query)
    room_name = qs.get('room', [None])[0] or parsed.path.strip('/').split('?')[0] or 'jizhi_default_room'
    
    if room_name not in ROOMS:
        ROOMS[room_name] = set()
    ROOMS[room_name].add(websocket)
    print(f"[Yjs PyWS] Client connected to room: {room_name} (Total: {len(ROOMS[room_name])})", flush=True)

    try:
        await websocket.send(json.dumps({'type': 'connected', 'room': room_name}))
        async for message in websocket:
            peers = ROOMS.get(room_name, set())
            tasks = []
            for peer in peers:
                if peer != websocket and (getattr(peer, 'open', True) or getattr(peer, 'state', None) == 1):
                    tasks.append(peer.send(message))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
    except Exception:
        pass
    finally:
        if room_name in ROOMS:
            ROOMS[room_name].discard(websocket)
            if not ROOMS[room_name]:
                del ROOMS[room_name]
        print(f"[Yjs PyWS] Client disconnected from room: {room_name}", flush=True)

async def universal_process_request(*args, **kwargs):
    # 兼容 websockets 14+ (connection, request) 与 websockets legacy (path, request_headers)
    path = '/'
    if len(args) == 2:
        if isinstance(args[0], str):
            path = args[0]
        elif hasattr(args[1], 'path'):
            path = args[1].path
    elif len(args) == 1 and hasattr(args[0], 'path'):
        path = args[0].path

    if path == '/health' or path == '/':
        body = json.dumps({
            'status': 'ok',
            'service': 'JIZHI Yjs CRDT Python Collaboration Gateway',
            'version': '2.0.0',
            'activeRooms': len(ROOMS)
        }).encode('utf-8')
        
        # websockets 14+
        if len(args) >= 1 and hasattr(args[0], 'respond'):
            return args[0].respond(200, [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')], body)
        
        # websockets legacy
        headers = [
            ('Content-Type', 'application/json; charset=utf-8'),
            ('Access-Control-Allow-Origin', '*')
        ]
        return (200, headers, body)
    return None

async def main():
    print(f"====================================================", flush=True)
    print(f"🚀 JIZHI Yjs CRDT Python WebSocket Server Started", flush=True)
    print(f"📡 Listening on ws://{HOST}:{PORT}", flush=True)
    print(f"🩺 Health check on http://{HOST}:{PORT}/health", flush=True)
    print(f"====================================================", flush=True)
    
    try:
        async with websockets.serve(universal_handler, HOST, PORT, process_request=universal_process_request):
            await asyncio.Future()
    except TypeError:
        async with websockets.serve(universal_handler, HOST, PORT):
            await asyncio.Future()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Yjs PyWS] Server stopped.")
