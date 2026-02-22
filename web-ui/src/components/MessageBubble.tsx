import type { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
}

function renderText(text: string) {
  // Very simple markdown-like rendering (code blocks, inline code)
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <p key={lastIndex} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {renderInline(text.slice(lastIndex, match.index))}
        </p>
      );
    }
    parts.push(
      <pre key={match.index}>
        <code>{match[1]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push(
      <span key={lastIndex} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {renderInline(remaining)}
      </span>
    );
  }

  return parts;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const inlineCodeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineCodeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<code key={match.index}>{match[1]}</code>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function MessageBubble({ message }: Props) {
  if (message.isThinking) {
    return (
      <div className="flex gap-3 py-4 px-4">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          A
        </div>
        <div className="flex items-center gap-1 pt-1">
          <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
          <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
          <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-3 px-4">
        <div
          className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 prose"
          style={{
            background: 'var(--accent-dim)',
            border: '1px solid rgba(124, 106, 247, 0.3)',
          }}
        >
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderInline(message.content)}
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    const status = message.toolResult?.status || 'pending';
    const statusColors: Record<string, string> = {
      pending: 'var(--warning)',
      allowed: 'var(--success)',
      denied: 'var(--error)',
      cancelled: 'var(--text-muted)',
    };
    const statusLabels: Record<string, string> = {
      pending: 'Awaiting permission...',
      allowed: 'Allowed',
      denied: 'Denied',
      cancelled: 'Cancelled',
    };

    return (
      <div className="flex gap-3 py-3 px-4">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs"
          style={{ background: '#1a1a0a', color: 'var(--warning)' }}
        >
          ⚡
        </div>
        <div
          className="flex-1 rounded-lg px-3 py-2"
          style={{
            background: 'var(--bg-tertiary)',
            border: `1px solid ${statusColors[status]}44`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Tool Call</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${statusColors[status]}22`, color: statusColors[status] }}
            >
              {statusLabels[status]}
            </span>
          </div>
          <div className="mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>
            {message.content}
          </div>
          {message.toolCall?.input != null && (
            <pre
              className="mt-2 text-xs overflow-x-auto"
              style={{ color: 'var(--text-secondary)', maxHeight: 120 }}
            >
              {JSON.stringify(message.toolCall.input as Record<string, unknown>, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-2 px-4">
        <div
          className="text-xs px-3 py-1 rounded-full"
          style={{
            background: 'rgba(248, 113, 113, 0.1)',
            color: 'var(--error)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex gap-3 py-4 px-4">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        A
      </div>
      <div className="flex-1 prose" style={{ color: 'var(--text-primary)', paddingTop: 2 }}>
        {renderText(message.content)}
      </div>
    </div>
  );
}
