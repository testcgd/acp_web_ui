import { useState, useCallback, useRef, useEffect } from 'react';
import type { Session, ChatMessage, ConnectionConfig, PermissionRequest } from './types';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatPanel } from './components/ChatPanel';
import './App.css';

const STORAGE_KEY = 'acp_sessions_v1';
const DEFAULT_WS_URL = `ws://${window.location.hostname}:9315/ws`;
const DEFAULT_TOKEN = '';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sessionName(index: number) {
  return `Session ${index + 1}`;
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    // Reset status to disconnected on load (WS connections don't persist)
    return parsed.map((s) => ({ ...s, status: 'disconnected' as const }));
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

// ──────────────────────────────────────────────
// WebSocket manager (outside React to avoid re-renders)
// ──────────────────────────────────────────────
class WsManager {
  private sockets = new Map<string, WebSocket>();
  private thinkingIds = new Map<string, string>();
  private streamingIds = new Map<string, string>();
  private onSetSession: (id: string, fn: (s: Session) => Session) => void;
  private onAddMessage: (id: string, msg: ChatMessage) => void;
  private onPermission: (req: PermissionRequest, ws: WebSocket) => void;

  constructor(
    onSetSession: (id: string, fn: (s: Session) => Session) => void,
    onAddMessage: (id: string, msg: ChatMessage) => void,
    onPermission: (req: PermissionRequest, ws: WebSocket) => void
  ) {
    this.onSetSession = onSetSession;
    this.onAddMessage = onAddMessage;
    this.onPermission = onPermission;
  }

  connect(session: Session) {
    const existing = this.sockets.get(session.id);
    if (existing && existing.readyState <= WebSocket.OPEN) return;

    this.onSetSession(session.id, (s) => ({ ...s, status: 'connecting' }));
    const url = session.token
      ? `${session.wsUrl}?token=${encodeURIComponent(session.token)}`
      : session.wsUrl;

    const ws = new WebSocket(url);
    this.sockets.set(session.id, ws);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connect' }));
    };

    ws.onerror = () => {
      this.onSetSession(session.id, (s) => ({ ...s, status: 'error' }));
    };

    ws.onclose = () => {
      this.sockets.delete(session.id);
      this.onSetSession(session.id, (s) => ({
        ...s,
        status: 'disconnected',
        sessionId: undefined,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; payload?: unknown };
        this.handleMessage(session.id, msg, ws);
      } catch (e) {
        console.error('WS parse error', e);
      }
    };
  }

  disconnect(localId: string) {
    const ws = this.sockets.get(localId);
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'disconnect' })); } catch {}
      ws.close();
    }
  }

  send(localId: string, data: unknown): boolean {
    const ws = this.sockets.get(localId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(data));
    return true;
  }

  isOpen(localId: string) {
    const ws = this.sockets.get(localId);
    return ws?.readyState === WebSocket.OPEN;
  }

  private handleMessage(localId: string, msg: { type: string; payload?: unknown }, ws: WebSocket) {
    switch (msg.type) {
      case 'status': {
        const p = msg.payload as { connected: boolean; agentInfo?: { name: string; version: string } };
        if (p.connected) {
          this.onSetSession(localId, (s) => ({
            ...s,
            status: 'connected',
            agentInfo: p.agentInfo,
          }));
          ws.send(JSON.stringify({ type: 'new_session', payload: {} }));
        } else {
          this.onSetSession(localId, (s) => ({
            ...s,
            status: 'disconnected',
            sessionId: undefined,
          }));
        }
        break;
      }

      case 'session_created': {
        const p = msg.payload as { sessionId: string; models?: unknown };
        this.onSetSession(localId, (s) => ({
          ...s,
          sessionId: p.sessionId,
        }));
        break;
      }

      case 'session_update': {
        const p = msg.payload as { updates?: Array<{ type: string; [k: string]: unknown }> };
        this.handleUpdates(localId, p.updates || []);
        break;
      }

      case 'permission_request': {
        const p = msg.payload as PermissionRequest;
        this.onPermission(p, ws);
        this.onAddMessage(localId, {
          id: makeId(),
          role: 'tool',
          content: p.toolCall?.title || 'Tool call',
          timestamp: Date.now(),
          toolCall: { title: p.toolCall?.title || 'Permission Required', input: p.toolCall?.input },
          toolResult: { status: 'pending' },
        });
        break;
      }

      case 'prompt_complete': {
        // Flush any streaming message and remove thinking indicator
        const thinkId = this.thinkingIds.get(localId);
        if (thinkId) {
          this.onSetSession(localId, (s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== thinkId),
          }));
          this.thinkingIds.delete(localId);
        }
        // Mark the last streaming message as complete
        this.streamingIds.delete(localId);
        break;
      }

      case 'error': {
        const p = msg.payload as { message: string };
        this.onAddMessage(localId, {
          id: makeId(),
          role: 'system',
          content: `Error: ${p.message}`,
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private handleUpdates(localId: string, updates: Array<{ type: string; [k: string]: unknown }>) {
    for (const update of updates) {
      const t = update.type as string;

      if (t === 'text_delta' || t === 'text') {
        const delta = (update.delta as string) || (update.text as string) || '';
        if (!delta) continue;

        // Remove thinking indicator
        const thinkId = this.thinkingIds.get(localId);
        if (thinkId) {
          this.onSetSession(localId, (s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== thinkId),
          }));
          this.thinkingIds.delete(localId);
        }

        const streamId = this.streamingIds.get(localId);
        if (streamId) {
          // Append to existing streaming message
          this.onSetSession(localId, (s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === streamId ? { ...m, content: m.content + delta } : m
            ),
          }));
        } else {
          // Create new streaming message
          const id = makeId();
          this.streamingIds.set(localId, id);
          this.onAddMessage(localId, {
            id,
            role: 'assistant',
            content: delta,
            timestamp: Date.now(),
          });
        }
      } else if (t === 'thinking_start') {
        if (!this.thinkingIds.has(localId)) {
          const id = makeId();
          this.thinkingIds.set(localId, id);
          this.onAddMessage(localId, {
            id,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isThinking: true,
          });
        }
      }
    }
  }
}

// ──────────────────────────────────────────────
// Main App
// ──────────────────────────────────────────────
export default function App() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const loaded = loadSessions();
    return loaded.length > 0 ? loaded[0].id : null;
  });
  const [pendingPermission, setPendingPermission] = useState<{
    request: PermissionRequest;
    ws: WebSocket;
  } | null>(null);

  // Persist sessions whenever they change
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const setSession = useCallback((id: string, fn: (s: Session) => Session) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  }, []);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, messages: [...s.messages, msg] } : s
      )
    );
  }, []);

  const showPermission = useCallback((req: PermissionRequest, ws: WebSocket) => {
    setPendingPermission({ request: req, ws });
  }, []);

  const wsManagerRef = useRef<WsManager | null>(null);
  if (!wsManagerRef.current) {
    wsManagerRef.current = new WsManager(setSession, addMessage, showPermission);
  }
  const wsManager = wsManagerRef.current;

  // ── Session CRUD ──
  const handleNewSession = useCallback(
    (config: ConnectionConfig) => {
      const id = makeId();
      const newSession: Session = {
        id,
        name: sessionName(sessions.length),
        wsUrl: config.wsUrl,
        token: config.token,
        messages: [],
        status: 'disconnected',
        createdAt: Date.now(),
      };
      setSessions((prev) => [...prev, newSession]);
      setActiveId(id);
      // Auto-connect
      setTimeout(() => wsManager.connect(newSession), 50);
    },
    [sessions.length, wsManager]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      wsManager.disconnect(id);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (activeId === id) {
          setActiveId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
        }
        return remaining;
      });
    },
    [activeId, wsManager]
  );

  const handleRenameSession = useCallback((id: string, name: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleConnect = useCallback(
    (id: string) => {
      const session = sessions.find((s) => s.id === id);
      if (session) wsManager.connect(session);
    },
    [sessions, wsManager]
  );

  const handleDisconnect = useCallback(
    (id: string) => {
      wsManager.disconnect(id);
    },
    [wsManager]
  );

  // ── Chat actions ──
  const handleSendPrompt = useCallback(
    (text: string) => {
      if (!activeId) return;
      // Add user message
      addMessage(activeId, {
        id: makeId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      });
      // Send to WS
      wsManager.send(activeId, {
        type: 'prompt',
        payload: { content: [{ type: 'text', text }] },
      });
    },
    [activeId, addMessage, wsManager]
  );

  const handleCancel = useCallback(() => {
    if (!activeId) return;
    wsManager.send(activeId, { type: 'cancel' });
  }, [activeId, wsManager]);

  const handleClearMessages = useCallback(() => {
    if (!activeId) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, messages: [] } : s))
    );
  }, [activeId]);

  // ── Permission ──
  const handlePermissionAllow = useCallback(() => {
    if (!pendingPermission) return;
    pendingPermission.ws.send(
      JSON.stringify({
        type: 'permission_response',
        payload: { requestId: pendingPermission.request.requestId, outcome: { outcome: 'allow' } },
      })
    );
    // Update the tool message status
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.toolResult?.status === 'pending' &&
          m.toolCall?.title === pendingPermission.request.toolCall?.title
            ? { ...m, toolResult: { ...m.toolResult, status: 'allowed' as const } }
            : m
        ),
      }))
    );
    setPendingPermission(null);
  }, [pendingPermission]);

  const handlePermissionDeny = useCallback(() => {
    if (!pendingPermission) return;
    pendingPermission.ws.send(
      JSON.stringify({
        type: 'permission_response',
        payload: { requestId: pendingPermission.request.requestId, outcome: { outcome: 'deny' } },
      })
    );
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.toolResult?.status === 'pending'
            ? { ...m, toolResult: { ...m.toolResult, status: 'denied' as const } }
            : m
        ),
      }))
    );
    setPendingPermission(null);
  }, [pendingPermission]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const defaultConfig: ConnectionConfig = {
    wsUrl: DEFAULT_WS_URL,
    token: DEFAULT_TOKEN,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        defaultConfig={defaultConfig}
      />

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activeSession ? (
          <ChatPanel
            session={activeSession}
            onSendPrompt={handleSendPrompt}
            onCancel={handleCancel}
            onClearMessages={handleClearMessages}
            pendingPermission={pendingPermission}
            onPermissionAllow={handlePermissionAllow}
            onPermissionDeny={handlePermissionDeny}
            isConnected={wsManager.isOpen(activeSession.id)}
          />
        ) : (
          <EmptyState onNewSession={() => {
            const id = makeId();
            const s: Session = {
              id,
              name: 'Session 1',
              wsUrl: defaultConfig.wsUrl,
              token: defaultConfig.token,
              messages: [],
              status: 'disconnected',
              createdAt: Date.now(),
            };
            setSessions([s]);
            setActiveId(id);
            setTimeout(() => wsManager.connect(s), 50);
          }} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ color: 'var(--text-muted)', background: 'var(--bg-primary)' }}
    >
      <div style={{ fontSize: 64, marginBottom: 20 }}>🤖</div>
      <h1 className="text-2xl font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
        ACP Chat
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        Chat with ACP agents via WebSocket
      </p>
      <button
        onClick={onNewSession}
        className="px-6 py-3 rounded-xl font-medium"
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        Start New Session
      </button>
    </div>
  );
}
