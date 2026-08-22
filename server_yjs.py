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

async def universal_process_request(connection, request=None):
    try:
        req_path = '/'
        if request is not None and hasattr(request, 'path'):
            req_path = request.path
        elif isinstance(connection, str):
            req_path = connection
        elif hasattr(connection, 'path'):
            req_path = connection.path
            
        if req_path in ('/health', '/', '/ws', '/ws/health'):
            body = b'{"status":"ok","service":"JIZHI Yjs CRDT Python Collaboration Gateway","version":"2.0.0"}\n'
            if hasattr(connection, 'respond'):
                return connection.respond(200, [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')], body)
            try:
                from websockets.http11 import Response
                from websockets.datastructures import Headers
                return Response(200, "OK", Headers([('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')]), body)
            except Exception:
                pass
            return (200, [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')], body)
    except Exception:
        pass
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
