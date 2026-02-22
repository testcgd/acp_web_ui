import { useRef, useEffect, useState, useCallback } from 'react';
import type { Session, PermissionRequest } from '../types';
import { MessageBubble } from './MessageBubble';
import { PermissionDialog } from './PermissionDialog';

interface Props {
  session: Session;
  onSendPrompt: (text: string) => void;
  onCancel: () => void;
  onClearMessages: () => void;
  pendingPermission: { request: PermissionRequest; ws: WebSocket } | null;
  onPermissionAllow: () => void;
  onPermissionDeny: () => void;
  isConnected: boolean;
}

export function ChatPanel({
  session,
  onSendPrompt,
  onCancel,
  onClearMessages,
  pendingPermission,
  onPermissionAllow,
  onPermissionDeny,
  isConnected,
}: Props) {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect generating state from messages
  useEffect(() => {
    const lastMsg = session.messages[session.messages.length - 1];
    setIsGenerating(!!lastMsg?.isThinking);
  }, [session.messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !isConnected) return;
    onSendPrompt(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isConnected, onSendPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  const statusColors: Record<string, string> = {
    connected: 'var(--success)',
    connecting: 'var(--warning)',
    disconnected: 'var(--text-muted)',
    error: 'var(--error)',
  };
  const statusLabels: Record<string, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Connection Error',
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {session.name}
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: statusColors[session.status],
                  display: 'inline-block',
                }}
              />
              <span>{statusLabels[session.status]}</span>
              {session.agentInfo && (
                <span style={{ color: 'var(--text-muted)' }}>
                  · {session.agentInfo.name} v{session.agentInfo.version}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.messages.length > 0 && (
            <button
              onClick={onClearMessages}
              title="Clear messages"
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
          {session.wsUrl && (
            <div
              className="text-xs px-2 py-1 rounded"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.wsUrl}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: 'var(--bg-primary)' }}
      >
        {session.messages.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center px-8"
            style={{ color: 'var(--text-muted)' }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <div className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              {session.status === 'connected'
                ? 'Ready to chat'
                : session.status === 'connecting'
                ? 'Connecting to agent...'
                : 'Not connected'}
            </div>
            <div className="text-sm">
              {session.status === 'connected'
                ? 'Type a message below to start'
                : session.status === 'connecting'
                ? 'Please wait...'
                : 'Check your connection settings'}
            </div>
          </div>
        ) : (
          <div className="py-2">
            {session.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="px-4 py-3"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            transition: 'border-color 0.2s',
          }}
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,106,247,0.5)';
          }}
          onBlurCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected ? 'Type a message... (Enter to send, Shift+Enter for newline)' : 'Not connected'
            }
            disabled={!isConnected}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text-primary)',
              fontSize: 14,
              lineHeight: '1.6',
              maxHeight: 160,
              overflowY: 'auto',
              paddingTop: 4,
              paddingBottom: 4,
            }}
          />
          <div className="flex items-center gap-1.5" style={{ paddingBottom: 2 }}>
            {isGenerating ? (
              <button
                onClick={onCancel}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(248,113,113,0.15)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  color: 'var(--error)',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
                title="Stop generating"
              >
                ■
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || !isConnected}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    input.trim() && isConnected ? 'var(--accent)' : 'var(--bg-hover)',
                  border: 'none',
                  color: input.trim() && isConnected ? '#fff' : 'var(--text-muted)',
                  cursor: input.trim() && isConnected ? 'pointer' : 'not-allowed',
                  fontSize: 16,
                  transition: 'all 0.15s',
                }}
                title="Send (Enter)"
              >
                ↑
              </button>
            )}
          </div>
        </div>
        <div
          className="mt-1.5 text-xs text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          ACP Chat · {session.status === 'connected' ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Permission dialog */}
      {pendingPermission && (
        <PermissionDialog
          request={pendingPermission.request}
          onAllow={onPermissionAllow}
          onDeny={onPermissionDeny}
        />
      )}
    </div>
  );
}
