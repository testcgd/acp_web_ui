import { useState } from 'react';
import type { Session, ConnectionConfig } from '../types';

interface Props {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: (config: ConnectionConfig) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  defaultConfig: ConnectionConfig;
}

function StatusDot({ status }: { status: Session['status'] }) {
  const colors: Record<string, string> = {
    connected: 'var(--success)',
    connecting: 'var(--warning)',
    disconnected: 'var(--text-muted)',
    error: 'var(--error)',
  };
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colors[status] || 'var(--text-muted)',
        display: 'inline-block',
        flexShrink: 0,
        animation: status === 'connecting' ? 'pulse-dot 1.4s infinite' : undefined,
      }}
    />
  );
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onConnect,
  onDisconnect,
  defaultConfig,
}: Props) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [wsUrl, setWsUrl] = useState(defaultConfig.wsUrl);
  const [token, setToken] = useState(defaultConfig.token);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const handleCreate = () => {
    if (!wsUrl.trim()) return;
    onNewSession({
      wsUrl: wsUrl.trim(),
      token: token.trim(),
    });
    setShowNewForm(false);
  };

  const handleRename = (id: string) => {
    if (renameValue.trim()) {
      onRenameSession(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const startRename = (session: Session) => {
    setRenamingId(session.id);
    setRenameValue(session.name);
    setContextMenu(null);
  };

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            A
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            ACP Chat
          </span>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          title="New session"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: showNewForm ? 'var(--accent-dim)' : 'transparent',
            border: 'none',
            color: showNewForm ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
        >
          +
        </button>
      </div>

      {/* New session form */}
      {showNewForm && (
        <div
          className="px-3 py-3 space-y-2"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}
        >
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            New Session
          </div>
          <input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://localhost:9315/ws"
            className="w-full text-xs px-2 py-1.5 rounded"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token (optional)"
            type="password"
            className="w-full text-xs px-2 py-1.5 rounded"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewForm(false)}
              className="flex-1 text-xs py-1.5 rounded"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="flex-1 text-xs py-1.5 rounded"
              style={{
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <div
            className="text-center py-8 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div>No sessions yet</div>
            <div style={{ marginTop: 4 }}>Click + to start</div>
          </div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ id: session.id, x: e.clientX, y: e.clientY });
            }}
            className="relative flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors"
            style={{
              background:
                session.id === activeSessionId
                  ? 'var(--bg-hover)'
                  : 'transparent',
              border:
                session.id === activeSessionId
                  ? '1px solid var(--border)'
                  : '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              if (session.id !== activeSessionId) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)';
              }
            }}
            onMouseLeave={(e) => {
              if (session.id !== activeSessionId) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
          >
            <StatusDot status={session.status} />
            <div className="flex-1 min-w-0">
              {renamingId === session.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(session.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={() => handleRename(session.id)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="w-full text-xs bg-transparent outline-none"
                  style={{
                    color: 'var(--text-primary)',
                    borderBottom: '1px solid var(--accent)',
                  }}
                />
              ) : (
                <div
                  className="text-xs truncate"
                  style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                >
                  {session.name}
                </div>
              )}
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {session.messages.length > 0
                  ? session.messages[session.messages.length - 1].content.slice(0, 40) || 'New session'
                  : 'New session'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 py-1 rounded-lg overflow-hidden"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              minWidth: 160,
            }}
          >
            {(() => {
              const session = sessions.find((s) => s.id === contextMenu.id);
              if (!session) return null;
              return (
                <>
                  {session.status === 'disconnected' || session.status === 'error' ? (
                    <button
                      onClick={() => { onConnect(contextMenu.id); setContextMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      Reconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => { onDisconnect(contextMenu.id); setContextMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => startRename(session)}
                    className="w-full text-left px-4 py-2 text-sm"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    Rename
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    onClick={() => { onDeleteSession(contextMenu.id); setContextMenu(null); }}
                    className="w-full text-left px-4 py-2 text-sm"
                    style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}
    </aside>
  );
}
