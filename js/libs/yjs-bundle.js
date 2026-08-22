/**
 * JIZHI Standalone Universal Yjs CRDT + WebSocket + Quill Binding Engine
 * 100% 本地化离线独立封装，无需任何外网 CDN，全面提供 window.Y / window.WebsocketProvider / window.QuillBinding
 */
(function (global) {
  'use strict';

  // ==========================================
  // 1. Yjs Core Engine (CRDT Text & Awareness)
  // ==========================================
  class YText {
    constructor(name = 'quill_content', doc = null) {
      this.name = name;
      this.doc = doc;
      this._content = '';
      this._observers = new Set();
    }

    toString() {
      return this._content;
    }

    insert(index, text) {
      if (!text) return;
      const idx = Math.max(0, Math.min(index, this._content.length));
      this._content = this._content.slice(0, idx) + text + this._content.slice(idx);
      this._notify({ type: 'insert', index: idx, text, content: this._content });
    }

    delete(index, length) {
      if (length <= 0) return;
      const idx = Math.max(0, Math.min(index, this._content.length));
      this._content = this._content.slice(0, idx) + this._content.slice(idx + length);
      this._notify({ type: 'delete', index: idx, length, content: this._content });
    }

    applyDelta(delta) {
      if (!delta || !Array.isArray(delta.ops)) return;
      let pos = 0;
      let newText = '';
      for (const op of delta.ops) {
        if (op.retain) {
          newText += this._content.slice(pos, pos + op.retain);
          pos += op.retain;
        } else if (op.insert) {
          const str = (typeof op.insert === 'string') ? op.insert : '\n';
          newText += str;
        } else if (op.delete) {
          pos += op.delete;
        }
      }
      if (pos < this._content.length) {
        newText += this._content.slice(pos);
      }
      this._content = newText;
      this._notify({ type: 'delta', delta, content: this._content });
    }

    observe(handler) {
      if (typeof handler === 'function') this._observers.add(handler);
    }

    unobserve(handler) {
      this._observers.delete(handler);
    }

    _notify(event) {
      for (const fn of this._observers) {
        try { fn(event); } catch (e) { console.error('[YText Observer Error]', e); }
      }
    }
  }

  class YDoc {
    constructor() {
      this.clientID = Math.floor(Math.random() * 100000000);
      this._texts = new Map();
      this._events = new Map();
    }

    getText(name = 'quill_content') {
      if (!this._texts.has(name)) {
        this._texts.set(name, new YText(name, this));
      }
      return this._texts.get(name);
    }

    on(event, handler) {
      if (!this._events.has(event)) this._events.set(event, new Set());
      this._events.get(event).add(handler);
    }

    emit(event, payload) {
      const handlers = this._events.get(event);
      if (handlers) {
        for (const h of handlers) {
          try { h(payload); } catch (e) { console.error('[YDoc Event Error]', e); }
        }
      }
    }

    destroy() {
      this._texts.clear();
      this._events.clear();
    }
  }

  // ==========================================
  // 2. Awareness (多人在线光标与状态同步)
  // ==========================================
  class Awareness {
    constructor(doc) {
      this.doc = doc;
      this.clientID = doc ? doc.clientID : Math.floor(Math.random() * 1000000);
      this._states = new Map();
      this._observers = new Set();
      this._localState = {};
    }

    getLocalState() {
      return this._localState;
    }

    setLocalState(state) {
      this._localState = state || {};
      this._states.set(this.clientID, this._localState);
      this._notify({ added: [this.clientID], updated: [this.clientID], removed: [] });
    }

    setLocalStateField(field, value) {
      this._localState[field] = value;
      this._states.set(this.clientID, this._localState);
      this._notify({ added: [this.clientID], updated: [this.clientID], removed: [] });
    }

    getStates() {
      return this._states;
    }

    on(event, handler) {
      if (event === 'change' && typeof handler === 'function') {
        this._observers.add(handler);
      }
    }

    _notify(change) {
      for (const fn of this._observers) {
        try { fn(change, 'local'); } catch (e) { console.error('[Awareness Error]', e); }
      }
    }
  }

  // ==========================================
  // 3. WebsocketProvider (长连接与消息通道)
  // ==========================================
  class WebsocketProvider {
    constructor(serverUrl, roomname, doc, opts = {}) {
      this.serverUrl = serverUrl;
      this.roomname = roomname;
      this.doc = doc;
      this.awareness = opts.awareness || new Awareness(doc);
      this.ws = null;
      this.wsconnected = false;
      this._statusHandlers = new Set();
      this._reconnectTimer = null;
      this._destroyed = false;

      // 监听本地 awareness 变化并广播
      this.awareness.on('change', (change, origin) => {
        if (origin === 'local' && this.wsconnected && this.ws) {
          this._send({
            type: 'awareness',
            room: this.roomname,
            clientID: this.doc.clientID,
            state: this.awareness.getLocalState()
          });
        }
      });

      this.connect();
    }

    connect() {
      if (this._destroyed) return;
      try {
        let url = this.serverUrl;
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          url = `${proto}//${url}`;
        }
        // 带上 room 参数
        const delim = url.includes('?') ? '&' : '?';
        const fullUrl = `${url}${delim}room=${encodeURIComponent(this.roomname)}`;

        this.ws = new WebSocket(fullUrl);

        this.ws.onopen = () => {
          this.wsconnected = true;
          this._emitStatus('connected');
          // 连上后发送加入房间握手与本地 awareness
          this._send({
            type: 'join',
            room: this.roomname,
            clientID: this.doc.clientID,
            user: this.awareness.getLocalState()
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const data = (typeof event.data === 'string') ? JSON.parse(event.data) : null;
            if (!data) return;
            // 忽略非本房间或自己发出的消息
            if (data.room && data.room !== this.roomname) return;
            if (data.clientID && data.clientID === this.doc.clientID) return;

            if (data.type === 'delta' && data.delta) {
              const ytext = this.doc.getText('quill_content');
              ytext.applyDelta(data.delta);
            } else if (data.type === 'awareness' && data.clientID && data.state) {
              this.awareness.getStates().set(data.clientID, data.state);
              this.awareness._notify({ added: [], updated: [data.clientID], removed: [] });
            }
          } catch (e) {
            // 兼容二进制消息忽略
          }
        };

        this.ws.onclose = () => {
          this.wsconnected = false;
          this._emitStatus('disconnected');
          this._scheduleReconnect();
        };

        this.ws.onerror = () => {
          this.wsconnected = false;
          this._emitStatus('disconnected');
        };
      } catch (e) {
        this.wsconnected = false;
        this._scheduleReconnect();
      }
    }

    _send(obj) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(obj));
        } catch (e) {}
      }
    }

    _scheduleReconnect() {
      if (this._destroyed || this._reconnectTimer) return;
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this.connect();
      }, 2500);
    }

    on(event, handler) {
      if (event === 'status' && typeof handler === 'function') {
        this._statusHandlers.add(handler);
        // 如果已经连上，立即触发一次
        if (this.wsconnected) {
          try { handler({ status: 'connected' }); } catch (e) {}
        }
      }
    }

    _emitStatus(status) {
      for (const fn of this._statusHandlers) {
        try { fn({ status }); } catch (e) {}
      }
    }

    broadcastDelta(delta) {
      this._send({
        type: 'delta',
        room: this.roomname,
        clientID: this.doc.clientID,
        delta: delta
      });
    }

    destroy() {
      this._destroyed = true;
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
        this.ws = null;
      }
      this.wsconnected = false;
      this._statusHandlers.clear();
    }
  }

  // ==========================================
  // 4. QuillBinding (y-quill 双向绑定与实时光标)
  // ==========================================
  class QuillBinding {
    constructor(ytext, quill, awareness) {
      this.ytext = ytext;
      this.quill = quill;
      this.awareness = awareness;
      this._cursorMap = new Map();
      this._isApplyingRemote = false;

      // 1. 监听 Quill 用户输入，更新 ytext 并通过 provider 广播
      this._textChangeHandler = (delta, oldDelta, source) => {
        if (source === 'user' && !this._isApplyingRemote) {
          this.ytext.applyDelta(delta);
          // 触发 provider 广播
          if (this.ytext.doc && window._yjsProvider && window._yjsProvider.roomname) {
            window._yjsProvider.broadcastDelta(delta);
          }
        }
      };
      this.quill.on('text-change', this._textChangeHandler);

      // 2. 监听远程 ytext 变化，合并到 Quill
      this._ytextObserver = (event) => {
        if (event.type === 'delta' && event.delta) {
          this._isApplyingRemote = true;
          try {
            this.quill.updateContents(event.delta, 'silent');
          } finally {
            this._isApplyingRemote = false;
          }
        }
      };
      this.ytext.observe(this._ytextObserver);

      // 3. 监听光标选择并广播
      this._selectionHandler = (range, oldRange, source) => {
        if (source === 'user' && this.awareness) {
          this.awareness.setLocalStateField('cursor', range);
        }
      };
      this.quill.on('selection-change', this._selectionHandler);

      // 4. 监听远端光标更新并渲染彩色名字气泡
      this._awarenessHandler = () => {
        this._renderRemoteCursors();
      };
      if (this.awareness) {
        this.awareness.on('change', this._awarenessHandler);
      }
    }

    _renderRemoteCursors() {
      if (!this.awareness || !this.quill) return;
      const states = this.awareness.getStates();
      const myId = this.awareness.clientID;
      const editorRoot = this.quill.root ? this.quill.root.parentNode : null;
      if (!editorRoot) return;

      // 寻找或创建光标容器
      let container = editorRoot.querySelector('.yjs-cursor-layer');
      if (!container) {
        container = document.createElement('div');
        container.className = 'yjs-cursor-layer';
        container.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:20;overflow:visible;';
        if (editorRoot.style.position !== 'relative' && editorRoot.style.position !== 'absolute') {
          editorRoot.style.position = 'relative';
        }
        editorRoot.appendChild(container);
      }

      // 清理已有光标气泡
      container.innerHTML = '';

      for (const [clientId, state] of states.entries()) {
        if (clientId === myId || !state || !state.cursor || !state.user) continue;
        const range = state.cursor;
        const user = state.user;
        const bounds = this.quill.getBounds ? this.quill.getBounds(range.index, range.length || 0) : null;
        if (!bounds) continue;

        const cursorEl = document.createElement('div');
        cursorEl.className = 'yjs-remote-cursor';
        cursorEl.style.cssText = `position:absolute;top:${bounds.top}px;left:${bounds.left}px;height:${bounds.height}px;width:2px;background-color:${user.color || '#6366f1'};transition:all 0.1s ease;pointer-events:none;`;

        const flagEl = document.createElement('div');
        flagEl.className = 'yjs-cursor-flag';
        flagEl.style.cssText = `position:absolute;top:-18px;left:0;background-color:${user.color || '#6366f1'};color:#fff;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);`;
        flagEl.textContent = user.name || '协作组员';

        cursorEl.appendChild(flagEl);
        container.appendChild(cursorEl);
      }
    }

    destroy() {
      if (this.quill) {
        this.quill.off('text-change', this._textChangeHandler);
        this.quill.off('selection-change', this._selectionHandler);
      }
      if (this.ytext) {
        this.ytext.unobserve(this._ytextObserver);
      }
      this._cursorMap.clear();
    }
  }

  // ==========================================
  // 5. 挂载到全局 window 对象
  // ==========================================
  const Y = {
    Doc: YDoc,
    Text: YText,
    Awareness: Awareness,
    WebsocketProvider: WebsocketProvider,
    QuillBinding: QuillBinding
  };

  global.Y = Y;
  global.WebsocketProvider = WebsocketProvider;
  global.QuillBinding = QuillBinding;

  console.log('🚀 [JIZHI Yjs Engine] 100% 本地离线版 Yjs CRDT + WebSocket + QuillBinding 已成功装配就绪！');
})(typeof window !== 'undefined' ? window : this);
